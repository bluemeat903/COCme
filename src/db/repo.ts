import type { SessionState } from '../engine/state.js';
import type { TurnDelta } from '../engine/persist.js';
import type { InvestigatorRow, ModuleRow, SessionRow } from './types.js';

/**
 * SessionRepo: the persistence boundary for the engine.
 *
 *   loadSession(id)        -> hydrate the full SessionState from DB rows.
 *   commitTurn(delta)      -> atomic write of one turn's worth of changes.
 *   createSession(input)   -> start a new session row + investigator snapshot.
 *
 * Everything else (listInvestigators, createInvestigator, ...) lives on other
 * repos -- or on the surface of a Next.js Server Action -- so this interface
 * stays focused on the hot path.
 */
export interface SessionRepo {
  loadSession(sessionId: string): Promise<SessionState>;
  commitTurn(delta: TurnDelta): Promise<void>;
  createSession(input: CreateSessionInput): Promise<{ session_id: string; state: SessionState }>;
  /** Update the check row for a pushed turn + append a check_resolved event. */
  commitPush(delta: PushDelta): Promise<void>;
}

export interface PushDelta {
  session_id: string;
  turn_id: string;
  /** New roll data (identical shape to CheckRow's roll_raw/result/outcome). */
  roll_raw: unknown;
  roll_result: number;
  outcome: string;
  summary: string;
  /** Raw event payload to append (same shape as applyStateOp events). */
  event_payload: Record<string, unknown>;
  event_created_at: string;
}

export interface CreateSessionInput {
  owner_id: string;
  investigator: InvestigatorRow;
  module: ModuleRow;
  starting_scene_id?: string;
}

/** Convenience: pair of session + related rows needed to build a SessionState. */
export interface SessionLoadBundle {
  session: SessionRow;
  investigator: InvestigatorRow;
  module: ModuleRow;
  base_snapshot: unknown;
  current_state: unknown;
  clues: Array<{ clue_key: string; discovered: boolean; discovered_at: string | null; discovery_context: string | null; player_notes: string | null }>;
  npcs: Array<{ npc_key: string; disposition: string | null; alive: boolean; hp_current: number | null; san_modifier: number; notes: Record<string, unknown> }>;
  turns: Array<{
    id: string;
    turn_index: number;
    actor: 'player' | 'kp' | 'system';
    player_input: string | null;
    kp_output: unknown;
    visible_narration: string | null;
    created_at: string;
  }>;
  events: Array<{ kind: string; payload: Record<string, unknown>; created_at: string }>;
}
