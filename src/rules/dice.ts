import type { Rng } from './rng.js';

// ---------------------------------------------------------------------------
// d100 with bonus / penalty dice
// ---------------------------------------------------------------------------
// BRP / CoC 7e:
//   - bonus dice = roll extra tens dice, pick the one that gives the LOWEST
//     combined result.
//   - penalty dice = roll extra tens dice, pick the one that gives the
//     HIGHEST combined result.
//   - bonus and penalty cancel; only the NET count matters.
//   - A roll of "00" on d100 is 100 (bad); "01" is 1 (great).
// ---------------------------------------------------------------------------

export interface D100Roll {
  /** All tens results rolled (0-9). */
  tens: number[];
  /** Units digit (0-9). */
  units: number;
  /** The tens actually used after bonus/penalty resolution. */
  chosen_tens: number;
  /** Final 1-100 result. */
  chosen: number;
}

export function rollD100(rng: Rng, netBonus = 0): D100Roll {
  const units = rng.int(0, 9);
  const extraCount = Math.abs(netBonus);
  const tens: number[] = [rng.int(0, 9)];
  for (let i = 0; i < extraCount; i++) tens.push(rng.int(0, 9));

  const toResult = (t: number): number => {
    const r = t * 10 + units;
    return r === 0 ? 100 : r;
  };
  const results = tens.map(toResult);

  let chosenIdx = 0;
  if (netBonus > 0) {
    // pick lowest
    for (let i = 1; i < results.length; i++) {
      if (results[i]! < results[chosenIdx]!) chosenIdx = i;
    }
  } else if (netBonus < 0) {
    // pick highest
    for (let i = 1; i < results.length; i++) {
      if (results[i]! > results[chosenIdx]!) chosenIdx = i;
    }
  }

  return {
    tens,
    units,
    chosen_tens: tens[chosenIdx]!,
    chosen: results[chosenIdx]!,
  };
}

// ---------------------------------------------------------------------------
// Dice expression parser for damage / SAN loss: e.g. "1d6", "2d6+1", "1d4+1d6",
// "3d6-1", "0" / "1".  Whitespace ignored.  Constants allowed.
// Grammar:  term (('+'|'-') term)*  where term = N 'd' M | N
// ---------------------------------------------------------------------------

export interface DiceRollResult {
  total: number;
  /** One entry per term; constants have `sides: 0`. */
  terms: Array<{ sign: 1 | -1; count: number; sides: number; rolls: number[]; sum: number }>;
  expression: string;
}

export function parseDiceExpression(expr: string): Array<{ sign: 1 | -1; count: number; sides: number }> {
  const cleaned = expr.replace(/\s+/g, '');
  if (!cleaned) throw new Error(`empty dice expression`);
  if (!/^[+-]?(\d+(d\d+)?)([+-]\d+(d\d+)?)*$/i.test(cleaned)) {
    throw new Error(`invalid dice expression: "${expr}"`);
  }

  const terms: Array<{ sign: 1 | -1; count: number; sides: number }> = [];
  const re = /([+-]?)(\d+)(?:d(\d+))?/gi;
  let m: RegExpExecArray | null;
  let firstSignImplicit = cleaned[0] !== '+' && cleaned[0] !== '-';
  while ((m = re.exec(cleaned)) !== null) {
    const rawSign = m[1];
    const sign: 1 | -1 = rawSign === '-' ? -1 : 1;
    const count = parseInt(m[2]!, 10);
    const sides = m[3] ? parseInt(m[3], 10) : 0;
    if (sides < 0) throw new Error(`invalid die size in: "${expr}"`);
    if (sides > 0 && (count < 1 || count > 100)) {
      throw new Error(`unreasonable dice count in: "${expr}"`);
    }
    terms.push({ sign, count, sides });
    firstSignImplicit = false;
  }
  if (terms.length === 0) throw new Error(`invalid dice expression: "${expr}"`);
  return terms;
}

export function rollExpression(rng: Rng, expr: string): DiceRollResult {
  const parsed = parseDiceExpression(expr);
  let total = 0;
  const terms: DiceRollResult['terms'] = [];
  for (const t of parsed) {
    const rolls: number[] = [];
    let sum = 0;
    if (t.sides === 0) {
      sum = t.count;
    } else {
      for (let i = 0; i < t.count; i++) {
        const r = rng.int(1, t.sides);
        rolls.push(r);
        sum += r;
      }
    }
    total += t.sign * sum;
    terms.push({ sign: t.sign, count: t.count, sides: t.sides, rolls, sum });
  }
  return { total, terms, expression: expr };
}
