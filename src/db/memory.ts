import { randomUUID } from 'node:crypto';
import type { SessionState, TurnRecord, SessionEvent } from '../engine/state.js';
import type { KpOutput } from '../schemas/kp-output.js';
import type { TurnDelta } from '../engine/persist.js';
import type { CreateSessionInput, PushDelta, SessionRepo } from './repo.js';
import type {
  CheckRow,
  InvestigatorRow,
  ModuleRow,
  SessionClueRow,
  SessionEventRow,
  SessionInvestigatorStateRow,
  SessionNpcRow,
  SessionRow,
  TurnRow,
} from './types.js';
import { investigatorToSnapshot, snapshotToRuntime } from '../character/snapshot.js';

/**
 * In-memory SessionRepo for tests and local dev.  Mimics the transactional
 * behavior of the Supabase RPC: commitTurn either applies all writes or
 * (conceptually) none -- if a validation fails, nothing is persisted.
 */
export class InMemorySessionRepo implements SessionRepo {
  investigators = new Map<string, InvestigatorRow>();
  modules = new Map<string, ModuleRow>();
  sessions = new Map<string, SessionRow>();
  sis = new Map<string /*session_id*/, Omit<SessionInvestigatorStateRow, 'session_id'>>();
  turns: TurnRow[] = [];
  checks: CheckRow[] = [];
  events: SessionEventRow[] = [];
  clues: SessionClueRow[] = [];
  npcs: SessionNpcRow[] = [];

  async createSession(input: CreateSessionInput): Promise<{ session_id: string; state: SessionState }> {
    const now = new Date().toISOString();
    const id = randomUUID();
    const starting = input.starting_scene_id ?? input.module.content.scene_nodes[0]?.id;
    if (!starting) throw new Error('module has no scene_nodes');

    // persist reference rows if not already
    this.investigators.set(input.investigator.id, input.investigator);
    this.modules.set(input.module.id, input.module);

    const session: SessionRow = {
      id,
      owner_id: input.owner_id,
      investigator_id: input.investigator.id,
      module_id: input.module.id,
      status: 'active',
      current_scene_id: starting,
      game_clock: { elapsed_minutes: 0 },
      ending: null,
      summary: null,
      pending_check: null,
      flags: {},
      started_at: now,
      ended_at: null,
      created_at: now,
      updated_at: now,
    };
    this.sessions.set(id, session);

    const baseSnapshot = investigatorToSnapshot(input.investigator);
    const currentState = snapshotToRuntime(baseSnapshot);
    this.sis.set(id, { base_snapshot: baseSnapshot, current_state: currentState, updated_at: now });

    return {
      session_id: id,
      state: await this.loadSession(id),
    };
  }

  async loadSession(sessionId: string): Promise<SessionState> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`session not found: ${sessionId}`);
    const investigator = this.investigators.get(session.investigator_id);
    if (!investigator) throw new Error(`investigator not found: ${session.investigator_id}`);
    const moduleRow = this.modules.get(session.module_id);
    if (!moduleRow) throw new Error(`module not found: ${session.module_id}`);
    const sisRow = this.sis.get(sessionId);
    if (!sisRow) throw new Error(`session_investigator_state not found: ${sessionId}`);

    const sessionTurns = this.turns
      .filter(t => t.session_id === sessionId)
      .sort((a, b) => a.turn_index - b.turn_index);
    const sessionEvents = this.events
      .filter(e => e.session_id === sessionId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const sessionClues = this.clues.filter(c => c.session_id === sessionId);
    const sessionNpcs = this.npcs.filter(n => n.session_id === sessionId);

    // Rebuild TurnRecord list (without check_resolution -- reconstructing the
    // richly-typed resolution from the raw CheckRow is possible but only needed
    // for deep replay; for a fresh load between turns, recent DB history is
    // enough for the KP context.)
    const turns: TurnRecord[] = sessionTurns.map(t => {
      const rec: TurnRecord = {
        id: t.id,
        index: t.turn_index,
        actor: t.actor,
        created_at: t.created_at,
      };
      if (t.player_input !== null) rec.player_input = t.player_input;
      if (t.kp_output !== null) rec.kp_output = t.kp_output as KpOutput;
      if (t.visible_narration !== null) rec.visible_narration = t.visible_narration;
      return rec;
    });

    const events: SessionEvent[] = sessionEvents.map(
      e => ({ kind: e.kind, at: e.created_at, ...(e.payload as object) } as SessionEvent),
    );

    const cluesMap: SessionState['clues'] = {};
    for (const c of sessionClues) {
      cluesMap[c.clue_key] = {
        clue_key: c.clue_key,
        discovered: c.discovered,
        ...(c.discovered_at !== null ? { discovered_at: c.discovered_at } : {}),
        ...(c.discovery_context !== null ? { discovery_context: c.discovery_context } : {}),
        ...(c.player_notes !== null ? { player_notes: c.player_notes } : {}),
      };
    }

    const npcsMap: SessionState['npcs'] = {};
    for (const n of sessionNpcs) {
      npcsMap[n.npc_key] = {
        npc_key: n.npc_key,
        disposition: (n.disposition ?? 'neutral') as SessionState['npcs'][string]['disposition'],
        alive: n.alive,
        hp_current: n.hp_current,
        san_modifier: n.san_modifier,
        notes: n.notes,
      };
    }

    return {
      session_id: session.id,
      owner_id: session.owner_id,
      investigator_id: session.investigator_id,
      module_id: session.module_id,
      investigator: {
        base: sisRow.base_snapshot as SessionState['investigator']['base'],
        current: sisRow.current_state as SessionState['investigator']['current'],
      },
      module: moduleRow.content,
      current_scene_id: session.current_scene_id ?? moduleRow.content.scene_nodes[0]!.id,
      game_clock: session.game_clock,
      turns,
      events,
      clues: cluesMap,
      npcs: npcsMap,
      flags: session.flags,
      pending_check: session.pending_check,
      status: session.status,
      ...(session.ending !== null ? { ending: session.ending } : {}),
      started_at: session.started_at,
      updated_at: session.updated_at,
    };
  }

  async commitTurn(delta: TurnDelta): Promise<void> {
    const session = this.sessions.get(delta.session_id);
    if (!session) throw new Error(`session not found: ${delta.session_id}`);

    // Stage all writes first; only mutate if every stage succeeds.
    const newTurnRows: TurnRow[] = delta.new_turns.map(t => ({
      id: t.id,
      session_id: delta.session_id,
      turn_index: t.turn_index,
      actor: t.actor,
      player_input: t.player_input,
      kp_output: (t.kp_output ?? null) as TurnRow['kp_output'],
      visible_narration: t.visible_narration,
      created_at: t.created_at,
    }));

    const newCheckRows: CheckRow[] = delta.new_checks.map(c => ({
      id: randomUUID(),
      session_id: delta.session_id,
      turn_id: c.turn_id,
      kind: c.kind,
      skill_or_stat: c.skill_or_stat,
      target: c.target,
      difficulty: c.difficulty,
      bonus_dice: c.bonus_dice,
      penalty_dice: c.penalty_dice,
      roll_raw: c.roll_raw,
      roll_result: c.roll_result,
      outcome: c.outcome,
      pushed: c.pushed,
      created_at: new Date().toISOString(),
    }));

    const newEventRows: SessionEventRow[] = delta.new_events.map(e => ({
      id: randomUUID(),
      session_id: delta.session_id,
      turn_id: null,
      kind: e.kind,
      payload: e.payload,
      created_at: e.created_at,
    }));

    // Validate turn_index monotonicity
    const existingMaxIndex = this.turns
      .filter(t => t.session_id === delta.session_id)
      .reduce((m, t) => Math.max(m, t.turn_index), 0);
    for (const t of newTurnRows) {
      if (t.turn_index <= existingMaxIndex) {
        throw new Error(`commitTurn: non-monotonic turn_index ${t.turn_index} (existing max ${existingMaxIndex})`);
      }
    }

    // commit (atomic in-memory)
    this.turns.push(...newTurnRows);
    this.checks.push(...newCheckRows);
    this.events.push(...newEventRows);

    for (const c of delta.clue_upserts) {
      const existing = this.clues.find(x => x.session_id === delta.session_id && x.clue_key === c.clue_key);
      if (existing) {
        existing.discovered = c.discovered;
        existing.discovered_at = c.discovered_at ?? null;
        existing.discovery_context = c.discovery_context ?? null;
        existing.player_notes = c.player_notes ?? null;
      } else {
        this.clues.push({
          id: randomUUID(),
          session_id: delta.session_id,
          clue_key: c.clue_key,
          discovered: c.discovered,
          discovered_at: c.discovered_at ?? null,
          discovery_context: c.discovery_context ?? null,
          player_notes: c.player_notes ?? null,
        });
      }
    }

    for (const n of delta.npc_upserts) {
      const existing = this.npcs.find(x => x.session_id === delta.session_id && x.npc_key === n.npc_key);
      if (existing) {
        existing.disposition = n.disposition;
        existing.alive = n.alive;
        existing.hp_current = n.hp_current;
        existing.san_modifier = n.san_modifier;
        existing.notes = n.notes;
      } else {
        this.npcs.push({
          id: randomUUID(),
          session_id: delta.session_id,
          npc_key: n.npc_key,
          disposition: n.disposition,
          alive: n.alive,
          hp_current: n.hp_current,
          san_modifier: n.san_modifier,
          notes: n.notes,
        });
      }
    }

    const sis = this.sis.get(delta.session_id);
    if (sis) {
      sis.current_state = delta.investigator_current_state;
      sis.updated_at = delta.session_patch.updated_at;
    }

    session.current_scene_id = delta.session_patch.current_scene_id;
    session.game_clock = delta.session_patch.game_clock;
    session.status = delta.session_patch.status;
    session.ending = delta.session_patch.ending;
    session.pending_check = delta.session_patch.pending_check as SessionRow['pending_check'];
    session.flags = delta.session_patch.flags;
    session.updated_at = delta.session_patch.updated_at;
  }

  async commitPush(delta: PushDelta): Promise<void> {
    const check = this.checks.find(
      c => c.session_id === delta.session_id && c.turn_id === delta.turn_id,
    );
    if (!check) throw new Error(`commitPush: no check row for turn ${delta.turn_id}`);
    check.roll_raw = delta.roll_raw;
    check.roll_result = delta.roll_result;
    check.outcome = delta.outcome;
    check.pushed = true;

    this.events.push({
      id: randomUUID(),
      session_id: delta.session_id,
      turn_id: delta.turn_id,
      kind: 'check_resolved',
      payload: { ...delta.event_payload, pushed: true, summary: delta.summary },
      created_at: delta.event_created_at,
    });
  }
}

