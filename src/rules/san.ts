import type { Rng } from './rng.js';
import { rollD100, rollExpression } from './dice.js';

/**
 * SAN check.  In BRP/CoC:
 *   - roll d100; <= current SAN succeeds.
 *   - loss is an "X/Y" expression where X is success loss, Y is failure loss.
 *     Each side can be a dice expression, e.g. "1/1d6+1", "0/1d4".
 *   - Roll 01 = auto-success (but loss still applies at success tier).
 *   - Roll 100 = auto-failure.
 *   - Losing >= 5 SAN from a single source triggers an INT roll for temporary
 *     insanity (we surface the flag, the upper layer decides how to play it).
 */

export interface SanLossExpression {
  success: string;
  failure: string;
}

export function parseSanLoss(raw: string): SanLossExpression {
  const parts = raw.split('/');
  if (parts.length !== 2) {
    throw new Error(`invalid SAN loss expression: "${raw}" (expected "X/Y")`);
  }
  return { success: parts[0]!.trim(), failure: parts[1]!.trim() };
}

export interface SanCheckResult {
  current_san: number;
  d100: number;
  passed: boolean;
  loss: number;
  new_san: number;
  /** True iff loss >= 5 from this single check -> temporary insanity threshold. */
  insanity_threshold: boolean;
  /** True iff new_san <= 0 -> permanent insanity in BRP terms. */
  permanently_insane: boolean;
}

export function rollSanCheck(
  rng: Rng,
  currentSan: number,
  lossExpr: string | SanLossExpression,
): SanCheckResult {
  const { success, failure } = typeof lossExpr === 'string' ? parseSanLoss(lossExpr) : lossExpr;
  const d100 = rollD100(rng, 0).chosen;

  let passed: boolean;
  if (d100 === 1) passed = true;
  else if (d100 === 100) passed = false;
  else passed = d100 <= currentSan;

  const lossResult = rollExpression(rng, passed ? success : failure);
  const loss = Math.max(0, lossResult.total);
  const new_san = Math.max(0, currentSan - loss);

  return {
    current_san: currentSan,
    d100,
    passed,
    loss,
    new_san,
    insanity_threshold: loss >= 5,
    permanently_insane: new_san === 0 && currentSan > 0,
  };
}
