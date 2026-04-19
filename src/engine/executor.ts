import { randomUUID } from 'node:crypto';
import { rollCheck, rollSanCheck, type CheckResult, type Outcome, type Rng } from '../rules/index.js';
import { pushCheck } from '../rules/check.js';
import type { KpOutput, CheckRequest } from '../schemas/index.js';
import { buildKpContext, type KpContext } from './context.js';
import { cloneState, applyStateOps } from './ops.js';
import { toPlayerView, type PlayerView } from './projection.js';
import type { CheckResolution, SessionState, TurnRecord } from './state.js';

// ---------------------------------------------------------------------------
// Turn executor: one full cycle from player input -> KP response -> state
// update -> player view.  Transactional on an in-memory clone; if anything
// throws, the caller's state is untouched.
// ---------------------------------------------------------------------------

/** Signature for calling the KP.  Injectable so tests can use a mock. */
export type KpCaller = (ctx: KpContext) => Promise<KpOutput>;

export interface ExecuteTurnInput {
  /** Raw player input.  If null, this is the initial "KP opens the scene" call. */
  player_input: string | null;
}

export interface ExecuteTurnDeps {
  rng: Rng;
  callKp: KpCaller;
}

export interface ExecuteTurnResult {
  state: SessionState;
  view: PlayerView;
  kp_context: KpContext;
}

export async function executeTurn(
  prevState: SessionState,
  input: ExecuteTurnInput,
  deps: ExecuteTurnDeps,
): Promise<ExecuteTurnResult> {
  if (prevState.status !== 'active') {
    throw new Error(`session is not active (status=${prevState.status})`);
  }

  const state = cloneState(prevState);
  const stamp = () => new Date().toISOString();

  // 1. record the player turn (if any)
  if (input.player_input !== null) {
    state.turns.push({
      id: randomUUID(),
      index: state.turns.length + 1,
      actor: 'player',
      player_input: input.player_input,
      created_at: stamp(),
    });
  }

  // 2. resolve any pending check triggered by this input
  let resolvedCheck: CheckResolution | null = null;
  if (state.pending_check && input.player_input !== null) {
    resolvedCheck = rollPendingCheck(state, state.pending_check, deps.rng);
    const lastTurn = state.turns[state.turns.length - 1]!;
    lastTurn.check_resolution = resolvedCheck;
    state.events.push({
      kind: 'check_resolved',
      request: state.pending_check,
      summary: resolvedCheck.summary,
      at: stamp(),
    });
    state.pending_check = null;
  }

  // 3. build context + call KP
  const kpContext = buildKpContext(state, {
    playerInput: input.player_input,
    resolvedCheck,
    pendingEffects: [],
  });
  const kpOutput = await deps.callKp(kpContext);

  // 4. validate scene_id references
  if (!state.module.scene_nodes.some(n => n.id === kpOutput.scene_id)) {
    throw new Error(`KP returned unknown scene_id "${kpOutput.scene_id}"`);
  }

  // 5. apply state_ops (may update current_scene_id, roll damage/SAN, etc.)
  const effects = applyStateOps(state, kpOutput.state_ops, { rng: deps.rng });

  // Sync scene_id with the KP's narrated scene (in case no explicit change_scene op).
  if (state.current_scene_id !== kpOutput.scene_id) {
    state.current_scene_id = kpOutput.scene_id;
  }

  // 6. record the KP turn
  const kpTurn: TurnRecord = {
    id: randomUUID(),
    index: state.turns.length + 1,
    actor: 'kp',
    kp_output: kpOutput,
    visible_narration: kpOutput.visible_narration,
    created_at: stamp(),
  };
  state.turns.push(kpTurn);

  // 7. set pending_check for next turn if the KP asked for one
  state.pending_check = kpOutput.required_check ?? null;

  state.updated_at = stamp();

  return {
    state,
    view: toPlayerView(state, { index: kpTurn.index, kp_output: kpOutput }, resolvedCheck, effects),
    kp_context: kpContext,
  };
}

// ---------------------------------------------------------------------------
// Explicit push: re-rolls the MOST RECENT failed check for this session.
// Does not call the KP; returns the updated state and resolution.  The caller
// can then run executeTurn(player_input=null) to get the KP's next narration.
// ---------------------------------------------------------------------------
export function pushLastFailedCheck(
  prevState: SessionState,
  rng: Rng,
): { state: SessionState; resolution: CheckResolution; turn_id: string } {
  const state = cloneState(prevState);
  // find most recent turn with a check_resolution that is a FAILURE and allow_push
  for (let i = state.turns.length - 1; i >= 0; i--) {
    const t = state.turns[i]!;
    const res = t.check_resolution;
    if (!res || !res.skill_result) continue;
    const outcome = res.skill_result.outcome;
    if (outcome !== 'fail' && outcome !== 'fumble') continue;
    if (!res.request.allow_push) throw new Error('push not allowed for this check');
    if (res.skill_result.pushed) throw new Error('this check has already been pushed');
    const pushed = pushCheck(rng, res.skill_result);
    const newRes: CheckResolution = {
      request: res.request,
      kind: 'skill_like',
      skill_result: pushed,
      summary: `${res.request.skill_or_stat ?? res.request.kind} (push): d100=${pushed.roll.chosen} -> ${pushed.outcome}`,
      outcome: pushed.outcome as Outcome,
    };
    t.check_resolution = newRes;
    state.events.push({
      kind: 'check_resolved',
      request: res.request,
      summary: newRes.summary,
      at: new Date().toISOString(),
    });
    state.updated_at = new Date().toISOString();
    return { state, resolution: newRes, turn_id: t.id };
  }
  throw new Error('no recent failed check to push');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rollPendingCheck(
  state: SessionState,
  req: CheckRequest,
  rng: Rng,
): CheckResolution {
  if (req.kind === 'san') {
    // SAN check loss expr expected in `note` as "X/Y"; default "0/1".
    const loss = req.note && /\/.+/.test(req.note) ? req.note : '0/1';
    const result = rollSanCheck(rng, state.investigator.current.san_current, loss);
    return {
      request: req,
      kind: 'san',
      san_result: result,
      summary: `SAN ${loss}: d100=${result.d100} vs ${state.investigator.current.san_current} ${
        result.passed ? 'pass' : 'FAIL'
      }, lost ${result.loss}`,
      outcome: result.passed ? 'san_passed' : 'san_failed',
    };
  }

  const target = resolveTarget(state, req);
  const result: CheckResult = rollCheck(rng, {
    target,
    difficulty: req.difficulty,
    bonus_dice: req.bonus_dice,
    penalty_dice: req.penalty_dice,
  });

  if (req.kind === 'skill' && req.skill_or_stat) {
    const sk = state.investigator.current.skills[req.skill_or_stat];
    if (sk && isSuccess(result.outcome)) sk.used_this_session = true;
  }

  return {
    request: req,
    kind: 'skill_like',
    skill_result: result,
    summary: `${req.skill_or_stat ?? req.kind} ${target} (${req.difficulty}): d100=${result.roll.chosen} -> ${result.outcome}`,
    outcome: result.outcome,
  };
}

function isSuccess(o: Outcome): boolean {
  return o === 'regular_success' || o === 'hard_success' || o === 'extreme_success' || o === 'critical';
}

function resolveTarget(state: SessionState, req: CheckRequest): number {
  const name = req.skill_or_stat;
  if (!name) throw new Error(`check of kind "${req.kind}" requires skill_or_stat`);

  const cur = state.investigator.current;
  const base = state.investigator.base;

  if (req.kind === 'luck' || name.toLowerCase() === 'luck' || name === '幸运') return cur.luck;

  const sk = cur.skills[name];
  if (sk) return sk.value;

  const lc = name.toLowerCase();
  const statKey = (['str', 'con', 'siz', 'dex', 'app', 'int', 'pow', 'edu'] as const).find(k => k === lc);
  if (statKey) return base.stats[statKey];

  throw new Error(`unknown skill or stat "${name}" for this investigator`);
}
