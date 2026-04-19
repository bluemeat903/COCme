import type { CheckResolution, SessionEvent, SessionState, SessionClueState, SessionNpcState } from './state.js';

// ---------------------------------------------------------------------------
// Delta computation: given the state BEFORE executeTurn and the state AFTER,
// produce the minimal set of rows to insert/upsert to persist the turn.
// ---------------------------------------------------------------------------

export interface NewTurnRow {
  id: string;
  turn_index: number;
  actor: 'player' | 'kp' | 'system';
  player_input: string | null;
  kp_output: unknown;              // KpOutput JSON
  visible_narration: string | null;
  check_resolution: CheckResolution | null;
  created_at: string;
}

export interface NewCheckRow {
  turn_id: string;
  kind: 'skill' | 'characteristic' | 'opposed' | 'san' | 'luck' | 'damage' | 'custom';
  skill_or_stat: string | null;
  target: number | null;
  difficulty: 'regular' | 'hard' | 'extreme' | null;
  bonus_dice: number;
  penalty_dice: number;
  roll_raw: unknown;
  roll_result: number;
  outcome: string;
  pushed: boolean;
}

export interface NewEventRow {
  kind: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface TurnDelta {
  session_id: string;
  new_turns: NewTurnRow[];
  new_checks: NewCheckRow[];
  new_events: NewEventRow[];
  /** Upserted clue states, keyed by clue_key. */
  clue_upserts: SessionClueState[];
  /** Upserted npc states, keyed by npc_key. */
  npc_upserts: SessionNpcState[];
  /** Full replacement of session_investigator_state.current_state. */
  investigator_current_state: unknown;
  /** sessions.* updates. */
  session_patch: {
    current_scene_id: string;
    game_clock: { elapsed_minutes: number };
    status: SessionState['status'];
    ending: string | null;
    pending_check: unknown;
    flags: Record<string, string | number | boolean | null>;
    updated_at: string;
  };
}

export function computeTurnDelta(prev: SessionState, next: SessionState): TurnDelta {
  if (prev.session_id !== next.session_id) {
    throw new Error('computeTurnDelta: session_id mismatch');
  }

  const newTurnsSlice = next.turns.slice(prev.turns.length);
  const new_turns: NewTurnRow[] = newTurnsSlice.map(t => ({
    id: t.id,
    turn_index: t.index,
    actor: t.actor,
    player_input: t.player_input ?? null,
    kp_output: t.kp_output ?? null,
    visible_narration: t.visible_narration ?? null,
    check_resolution: t.check_resolution ?? null,
    created_at: t.created_at,
  }));

  const new_checks: NewCheckRow[] = [];
  for (const t of newTurnsSlice) {
    const res = t.check_resolution;
    if (!res) continue;
    if (res.kind === 'skill_like' && res.skill_result) {
      new_checks.push({
        turn_id: t.id,
        kind: res.request.kind,
        skill_or_stat: res.request.skill_or_stat,
        target: res.skill_result.target,
        difficulty: res.skill_result.difficulty,
        bonus_dice: res.skill_result.bonus_dice,
        penalty_dice: res.skill_result.penalty_dice,
        roll_raw: res.skill_result.roll,
        roll_result: res.skill_result.roll.chosen,
        outcome: res.skill_result.outcome,
        pushed: res.skill_result.pushed,
      });
    } else if (res.kind === 'san' && res.san_result) {
      new_checks.push({
        turn_id: t.id,
        kind: 'san',
        skill_or_stat: null,
        target: res.san_result.current_san,
        difficulty: null,
        bonus_dice: 0,
        penalty_dice: 0,
        roll_raw: { d100: res.san_result.d100, loss: res.san_result.loss },
        roll_result: res.san_result.d100,
        outcome: res.san_result.passed ? 'san_passed' : 'san_failed',
        pushed: false,
      });
    }
  }

  const new_events: NewEventRow[] = next.events.slice(prev.events.length).map(e => ({
    kind: e.kind,
    payload: toPayload(e),
    created_at: e.at,
  }));

  const clue_upserts: SessionClueState[] = [];
  for (const [k, next_state] of Object.entries(next.clues)) {
    const prev_state = prev.clues[k];
    if (!prev_state || JSON.stringify(prev_state) !== JSON.stringify(next_state)) {
      clue_upserts.push(next_state);
    }
  }

  const npc_upserts: SessionNpcState[] = [];
  for (const [k, next_state] of Object.entries(next.npcs)) {
    const prev_state = prev.npcs[k];
    if (!prev_state || JSON.stringify(prev_state) !== JSON.stringify(next_state)) {
      npc_upserts.push(next_state);
    }
  }

  return {
    session_id: next.session_id,
    new_turns,
    new_checks,
    new_events,
    clue_upserts,
    npc_upserts,
    investigator_current_state: next.investigator.current,
    session_patch: {
      current_scene_id: next.current_scene_id,
      game_clock: next.game_clock,
      status: next.status,
      ending: next.ending ?? null,
      pending_check: next.pending_check,
      flags: next.flags,
      updated_at: next.updated_at,
    },
  };
}

/** Strip the `kind` + `at` from a SessionEvent, leaving the rest as payload. */
function toPayload(e: SessionEvent): Record<string, unknown> {
  const { kind: _kind, at: _at, ...rest } = e as { kind: string; at: string } & Record<string, unknown>;
  return rest;
}
