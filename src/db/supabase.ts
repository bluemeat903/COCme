import type { SupabaseClient } from '@supabase/supabase-js';
import type { SessionState, TurnRecord, SessionEvent } from '../engine/state.js';
import type { KpOutput } from '../schemas/kp-output.js';
import type { TurnDelta } from '../engine/persist.js';
import type { CreateSessionInput, PushDelta, SessionRepo } from './repo.js';
import type { InvestigatorRow, ModuleRow, SessionInvestigatorStateRow, SessionRow } from './types.js';
import { investigatorToSnapshot, snapshotToRuntime } from '../character/snapshot.js';

// ---------------------------------------------------------------------------
// Supabase-backed SessionRepo.  Uses the commit_turn(payload jsonb) RPC from
// migration 0004 for the hot path; regular selects/inserts for everything else.
//
// Construct the underlying client externally (see @/lib/supabase/server for
// the anon+cookie and service-role factories) and inject here.
// ---------------------------------------------------------------------------

export class SupabaseSessionRepo implements SessionRepo {
  constructor(private readonly db: SupabaseClient) {}

  async createSession(input: CreateSessionInput): Promise<{ session_id: string; state: SessionState }> {
    const starting = input.starting_scene_id ?? input.module.content.scene_nodes[0]?.id;
    if (!starting) throw new Error('module has no scene_nodes');

    const baseSnapshot = investigatorToSnapshot(input.investigator);
    const currentState = snapshotToRuntime(baseSnapshot);

    const { data: sessionRow, error: e1 } = await this.db
      .from('sessions')
      .insert({
        owner_id: input.owner_id,
        investigator_id: input.investigator.id,
        module_id: input.module.id,
        status: 'active',
        current_scene_id: starting,
        game_clock: { elapsed_minutes: 0 },
        pending_check: null,
        flags: {},
      })
      .select('*')
      .single();
    if (e1) throw e1;

    const { error: e2 } = await this.db.from('session_investigator_state').insert({
      session_id: (sessionRow as SessionRow).id,
      base_snapshot: baseSnapshot,
      current_state: currentState,
    });
    if (e2) {
      // best-effort cleanup -- in prod, wrap in an RPC to keep this atomic too
      await this.db.from('sessions').delete().eq('id', (sessionRow as SessionRow).id);
      throw e2;
    }

    const state = await this.loadSession((sessionRow as SessionRow).id);
    return { session_id: (sessionRow as SessionRow).id, state };
  }

  async loadSession(sessionId: string): Promise<SessionState> {
    const [sessionRes, sisRes, turnsRes, eventsRes, cluesRes, npcsRes] = await Promise.all([
      this.db.from('sessions').select('*').eq('id', sessionId).single(),
      this.db.from('session_investigator_state').select('*').eq('session_id', sessionId).single(),
      this.db.from('turns').select('*').eq('session_id', sessionId).order('turn_index', { ascending: true }),
      this.db.from('session_events').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
      this.db.from('session_clues').select('*').eq('session_id', sessionId),
      this.db.from('session_npcs').select('*').eq('session_id', sessionId),
    ]);
    for (const r of [sessionRes, sisRes, turnsRes, eventsRes, cluesRes, npcsRes]) {
      if (r.error) throw r.error;
    }
    const session = sessionRes.data as SessionRow;

    const [invRes, modRes] = await Promise.all([
      this.db.from('investigators').select('*').eq('id', session.investigator_id).single(),
      this.db.from('modules').select('*').eq('id', session.module_id).single(),
    ]);
    if (invRes.error) throw invRes.error;
    if (modRes.error) throw modRes.error;
    const investigator = invRes.data as InvestigatorRow;
    const moduleRow = modRes.data as ModuleRow;

    const sis = sisRes.data as Pick<SessionInvestigatorStateRow, 'base_snapshot' | 'current_state'>;
    const turns: TurnRecord[] = (turnsRes.data ?? []).map((t): TurnRecord => {
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
    const events: SessionEvent[] = (eventsRes.data ?? []).map(
      e => ({ kind: e.kind, at: e.created_at, ...(e.payload as object) } as SessionEvent),
    );

    const cluesMap: SessionState['clues'] = {};
    for (const c of (cluesRes.data ?? []) as Array<{
      clue_key: string;
      discovered: boolean;
      discovered_at: string | null;
      discovery_context: string | null;
      player_notes: string | null;
    }>) {
      cluesMap[c.clue_key] = {
        clue_key: c.clue_key,
        discovered: c.discovered,
        ...(c.discovered_at !== null ? { discovered_at: c.discovered_at } : {}),
        ...(c.discovery_context !== null ? { discovery_context: c.discovery_context } : {}),
        ...(c.player_notes !== null ? { player_notes: c.player_notes } : {}),
      };
    }

    const npcsMap: SessionState['npcs'] = {};
    for (const n of (npcsRes.data ?? []) as Array<{
      npc_key: string;
      disposition: string | null;
      alive: boolean;
      hp_current: number | null;
      san_modifier: number;
      notes: Record<string, unknown>;
    }>) {
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
    const payload = {
      session_id: delta.session_id,
      new_turns: delta.new_turns.map(t => ({
        id: t.id,
        turn_index: t.turn_index,
        actor: t.actor,
        player_input: t.player_input,
        kp_output: t.kp_output,
        visible_narration: t.visible_narration,
        created_at: t.created_at,
      })),
      new_checks: delta.new_checks,
      new_events: delta.new_events,
      clue_upserts: delta.clue_upserts,
      npc_upserts: delta.npc_upserts,
      investigator_current_state: delta.investigator_current_state,
      session_patch: delta.session_patch,
    };
    const { error } = await this.db.rpc('commit_turn', { payload });
    if (error) throw error;
  }

  async commitPush(delta: PushDelta): Promise<void> {
    // Updates the check row for `turn_id` + appends one session_events row.
    // Non-atomic today (two round-trips); migrate to an RPC if concurrency
    // becomes a concern.
    const { error: e1 } = await this.db
      .from('checks')
      .update({
        roll_raw: delta.roll_raw,
        roll_result: delta.roll_result,
        outcome: delta.outcome,
        pushed: true,
      })
      .eq('turn_id', delta.turn_id);
    if (e1) throw e1;

    const { error: e2 } = await this.db.from('session_events').insert({
      session_id: delta.session_id,
      turn_id: delta.turn_id,
      kind: 'check_resolved',
      payload: { ...delta.event_payload, pushed: true, summary: delta.summary },
      created_at: delta.event_created_at,
    });
    if (e2) throw e2;
  }
}

