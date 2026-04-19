import type { Rng } from './rng.js';
import { rollD100, type D100Roll } from './dice.js';

export type Difficulty = 'regular' | 'hard' | 'extreme';

export type Outcome =
  | 'fumble'
  | 'fail'
  | 'regular_success'
  | 'hard_success'
  | 'extreme_success'
  | 'critical';

/** Rank ordering (higher = better). Used for opposed resolution. */
export const OUTCOME_RANK: Record<Outcome, number> = {
  fumble: 0,
  fail: 1,
  regular_success: 2,
  hard_success: 3,
  extreme_success: 4,
  critical: 5,
};

export interface CheckRequest {
  target: number;                 // 0-99 skill / stat value
  difficulty: Difficulty;
  bonus_dice: number;             // 0-3
  penalty_dice: number;           // 0-3
}

export interface CheckResult {
  target: number;
  difficulty: Difficulty;
  bonus_dice: number;
  penalty_dice: number;
  roll: D100Roll;
  outcome: Outcome;
  /** The best tier the roll achieved, regardless of requested difficulty. */
  tier_achieved: Outcome;
  pushed: boolean;
}

/**
 * Core pass/fail logic.  Pure function of (roll, target, difficulty).
 * CoC 7e semantics:
 *   - 01 is always a critical.
 *   - Fumble: target < 50 fumbles on 96-100; target >= 50 fumbles on 100.
 *   - Success tiers independent of requested difficulty:
 *       extreme = roll <= floor(target/5)
 *       hard    = roll <= floor(target/2)
 *       regular = roll <= target
 *   - Requested difficulty gates whether the attained tier counts as pass or fail.
 */
export function resolveCheck(
  roll: number,
  target: number,
  difficulty: Difficulty,
): { outcome: Outcome; tier_achieved: Outcome } {
  if (!Number.isInteger(roll) || roll < 1 || roll > 100) {
    throw new Error(`invalid roll: ${roll}`);
  }
  if (!Number.isInteger(target) || target < 0 || target > 99) {
    // target can theoretically exceed 99 for supernatural stats; clamp rather than throw for robustness
    // but 99+ always succeeds (short of fumble), so allow it.
  }

  if (roll === 1) {
    return { outcome: 'critical', tier_achieved: 'critical' };
  }
  const isFumble = target < 50 ? roll >= 96 : roll === 100;
  if (isFumble) {
    return { outcome: 'fumble', tier_achieved: 'fumble' };
  }

  const hardT = Math.floor(target / 2);
  const extremeT = Math.floor(target / 5);

  let tier: Outcome;
  if (roll <= extremeT) tier = 'extreme_success';
  else if (roll <= hardT) tier = 'hard_success';
  else if (roll <= target) tier = 'regular_success';
  else tier = 'fail';

  if (tier === 'fail') return { outcome: 'fail', tier_achieved: 'fail' };

  const required: Outcome =
    difficulty === 'regular'
      ? 'regular_success'
      : difficulty === 'hard'
        ? 'hard_success'
        : 'extreme_success';

  const outcome: Outcome = OUTCOME_RANK[tier] >= OUTCOME_RANK[required] ? tier : 'fail';
  return { outcome, tier_achieved: tier };
}

export function rollCheck(rng: Rng, req: CheckRequest): CheckResult {
  const netBonus = (req.bonus_dice ?? 0) - (req.penalty_dice ?? 0);
  const roll = rollD100(rng, netBonus);
  const { outcome, tier_achieved } = resolveCheck(roll.chosen, req.target, req.difficulty);
  return {
    target: req.target,
    difficulty: req.difficulty,
    bonus_dice: req.bonus_dice,
    penalty_dice: req.penalty_dice,
    roll,
    outcome,
    tier_achieved,
    pushed: false,
  };
}

/**
 * Push an existing failed check.  In BRP/CoC, a push re-rolls once with a
 * narrative consequence on failure.  This function ONLY produces the new roll;
 * the consequence is narrative and handled by the KP layer.
 *
 * Throws if the previous check was already successful or already pushed.
 */
export function pushCheck(rng: Rng, prev: CheckResult): CheckResult {
  if (OUTCOME_RANK[prev.outcome] >= OUTCOME_RANK.regular_success) {
    throw new Error('cannot push a successful check');
  }
  if (prev.pushed) {
    throw new Error('this check has already been pushed');
  }
  const next = rollCheck(rng, {
    target: prev.target,
    difficulty: prev.difficulty,
    bonus_dice: prev.bonus_dice,
    penalty_dice: prev.penalty_dice,
  });
  next.pushed = true;
  return next;
}

// ---------------------------------------------------------------------------
// Opposed checks
// ---------------------------------------------------------------------------

export type OpposedWinner = 'a' | 'b' | 'tie';

export function resolveOpposed(
  a: { outcome: Outcome; skill: number },
  b: { outcome: Outcome; skill: number },
): OpposedWinner {
  const ra = OUTCOME_RANK[a.outcome];
  const rb = OUTCOME_RANK[b.outcome];
  if (ra > rb) return 'a';
  if (rb > ra) return 'b';
  if (a.skill > b.skill) return 'a';
  if (b.skill > a.skill) return 'b';
  return 'tie';
}
