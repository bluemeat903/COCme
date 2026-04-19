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
import { LocalDB } from '../lib/localdb/db.js';

// ---------------------------------------------------------------------------
// SessionRepo backed by the local JSON database.  Behaves the same as the
// Supabase repo from the engine's point of view: load / create / commit a
// turn atomically.
// ---------------------------------------------------------------------------

export class LocalSessionRepo implements SessionRepo {
  async createSession(input: CreateSessionInput): Promise<{ session_id: string; state: SessionState }> {
    const starting = input.starting_scene_id ?? input.module.content.scene_nodes[0]?.id;
    if (!starting) throw new Error('module has no scene_nodes');

    const baseSnapshot = investigatorToSnapshot(input.investigator);
    const currentState = snapshotToRuntime(baseSnapshot);
    const now = new Date().toISOString();

    const session: SessionRow = {
      id: randomUUID(),
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

    const db = await LocalDB.get();
    await db.mutate(['sessions', 'session_investigator_states', 'investigators', 'modules'], d => {
      // reference-row caching: make sure the investigator / module are findable.
      if (!d.investigators.find(i => i.id === input.investigator.id)) {
        d.investigators.push(input.investigator);
      }
      if (!d.modules.find(m => m.id === input.module.id)) {
        d.modules.push(input.module);
      }
      d.sessions.push(session);
      d.session_investigator_states.push({
        session_id: session.id,
        base_snapshot: baseSnapshot,
        current_state: currentState,
        updated_at: now,
      });
    });

    const state = await this.loadSession(session.id);
    return { session_id: session.id, state };
  }

  async loadSession(sessionId: string): Promise<SessionState> {
    const db = await LocalDB.get();
    const session = db.sessions.find(s => s.id === sessionId);
    if (!session) throw new Error(`session not found: ${sessionId}`);
    const investigator = db.investigators.find(i => i.id === session.investigator_id);
    if (!investigator) throw new Error(`investigator not found: ${session.investigator_id}`);
    const moduleRow = db.modules.find(m => m.id === session.module_id);
    if (!moduleRow) throw new Error(`module not found: ${session.module_id}`);
    const sis = db.session_investigator_states.find(x => x.session_id === sessionId);
    if (!sis) throw new Error(`session_investigator_state not found: ${sessionId}`);

    const turnRows = db.turns
      .filter(t => t.session_id === sessionId)
      .sort((a, b) => a.turn_index - b.turn_index);
    const eventRows = db.session_events
      .filter(e => e.session_id === sessionId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    const clueRows = db.session_clues.filter(c => c.session_id === sessionId);
    const npcRows = db.session_npcs.filter(n => n.session_id === sessionId);

    const turns: TurnRecord[] = turnRows.map(t => {
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

    const events: SessionEvent[] = eventRows.map(
      e => ({ kind: e.kind, at: e.created_at, ...(e.payload as object) } as SessionEvent),
    );

    const cluesMap: SessionState['clues'] = {};
    for (const c of clueRows) {
      cluesMap[c.clue_key] = {
        clue_key: c.clue_key,
        discovered: c.discovered,
        ...(c.discovered_at !== null ? { discovered_at: c.discovered_at } : {}),
        ...(c.discovery_context !== null ? { discovery_context: c.discovery_context } : {}),
        ...(c.player_notes !== null ? { player_notes: c.player_notes } : {}),
      };
    }

    const npcsMap: SessionState['npcs'] = {};
    for (const n of npcRows) {
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
        base: sis.base_snapshot as SessionState['investigator']['base'],
        current: sis.current_state as SessionState['investigator']['current'],
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
    const now = new Date().toISOString();
    const db = await LocalDB.get();
    await db.mutate(
      [
        'turns',
        'checks',
        'session_events',
        'session_clues',
        'session_npcs',
        'session_investigator_states',
        'sessions',
      ],
      d => {
        const session = d.sessions.find(s => s.id === delta.session_id);
        if (!session) throw new Error(`session not found: ${delta.session_id}`);

        // monotonic turn_index guard
        const existingMax = d.turns
          .filter(t => t.session_id === delta.session_id)
          .reduce((m, t) => Math.max(m, t.turn_index), 0);
        for (const t of delta.new_turns) {
          if (t.turn_index <= existingMax) {
            throw new Error(`commitTurn: non-monotonic turn_index ${t.turn_index} (existing max ${existingMax})`);
          }
        }

        // 1) insert turns
        for (const t of delta.new_turns) {
          const row: TurnRow = {
            id: t.id,
            session_id: delta.session_id,
            turn_index: t.turn_index,
            actor: t.actor,
            player_input: t.player_input,
            kp_output: (t.kp_output ?? null) as TurnRow['kp_output'],
            visible_narration: t.visible_narration,
            created_at: t.created_at,
          };
          d.turns.push(row);
        }

        // 2) insert checks
        for (const c of delta.new_checks) {
          const row: CheckRow = {
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
            created_at: now,
          };
          d.checks.push(row);
        }

        // 3) insert session events
        for (const e of delta.new_events) {
          const row: SessionEventRow = {
            id: randomUUID(),
            session_id: delta.session_id,
            turn_id: null,
            kind: e.kind,
            payload: e.payload,
            created_at: e.created_at,
          };
          d.session_events.push(row);
        }

        // 4) upsert clues
        for (const c of delta.clue_upserts) {
          const existing = d.session_clues.find(x => x.session_id === delta.session_id && x.clue_key === c.clue_key);
          if (existing) {
            existing.discovered = c.discovered;
            existing.discovered_at = c.discovered_at ?? null;
            existing.discovery_context = c.discovery_context ?? null;
            existing.player_notes = c.player_notes ?? null;
          } else {
            const row: SessionClueRow = {
              id: randomUUID(),
              session_id: delta.session_id,
              clue_key: c.clue_key,
              discovered: c.discovered,
              discovered_at: c.discovered_at ?? null,
              discovery_context: c.discovery_context ?? null,
              player_notes: c.player_notes ?? null,
            };
            d.session_clues.push(row);
          }
        }

        // 5) upsert npcs
        for (const n of delta.npc_upserts) {
          const existing = d.session_npcs.find(x => x.session_id === delta.session_id && x.npc_key === n.npc_key);
          if (existing) {
            existing.disposition = n.disposition;
            existing.alive = n.alive;
            existing.hp_current = n.hp_current;
            existing.san_modifier = n.san_modifier;
            existing.notes = n.notes;
          } else {
            const row: SessionNpcRow = {
              id: randomUUID(),
              session_id: delta.session_id,
              npc_key: n.npc_key,
              disposition: n.disposition,
              alive: n.alive,
              hp_current: n.hp_current,
              san_modifier: n.san_modifier,
              notes: n.notes,
            };
            d.session_npcs.push(row);
          }
        }

        // 6) update session_investigator_state.current_state
        const sis = d.session_investigator_states.find(x => x.session_id === delta.session_id);
        if (sis) {
          sis.current_state = delta.investigator_current_state;
          sis.updated_at = delta.session_patch.updated_at;
        }

        // 7) patch sessions
        session.current_scene_id = delta.session_patch.current_scene_id;
        session.game_clock = delta.session_patch.game_clock;
        session.status = delta.session_patch.status;
        session.ending = delta.session_patch.ending;
        session.pending_check = delta.session_patch.pending_check as SessionRow['pending_check'];
        session.flags = delta.session_patch.flags;
        session.updated_at = delta.session_patch.updated_at;
        if (session.status !== 'active' && !session.ended_at) {
          session.ended_at = now;
        }
      },
    );
  }

  async commitPush(delta: PushDelta): Promise<void> {
    const db = await LocalDB.get();
    await db.mutate(['checks', 'session_events'], d => {
      const check = d.checks.find(
        c => c.session_id === delta.session_id && c.turn_id === delta.turn_id,
      );
      if (!check) {
        throw new Error(`commitPush: no check row for turn ${delta.turn_id}`);
      }
      check.roll_raw = delta.roll_raw;
      check.roll_result = delta.roll_result;
      check.outcome = delta.outcome;
      check.pushed = true;

      d.session_events.push({
        id: randomUUID(),
        session_id: delta.session_id,
        turn_id: delta.turn_id,
        kind: 'check_resolved',
        payload: { ...delta.event_payload, pushed: true, summary: delta.summary },
        created_at: delta.event_created_at,
      });
    });
  }
}
