import { describe, it, expect } from 'vitest';
import { parseDiceExpression, rollExpression, rollD100 } from './dice.js';
import { seededRng, type Rng } from './rng.js';

// A fully deterministic mock RNG driven by a fixed sequence, used when we want
// surgical control of individual rolls.
function sequenceRng(seq: number[]): Rng {
  let i = 0;
  return {
    int: (_min, _max) => {
      if (i >= seq.length) throw new Error('sequence exhausted');
      return seq[i++]!;
    },
  };
}

describe('parseDiceExpression', () => {
  it('parses single NdM', () => {
    expect(parseDiceExpression('1d6')).toEqual([{ sign: 1, count: 1, sides: 6 }]);
  });
  it('parses NdM+K', () => {
    expect(parseDiceExpression('2d6+1')).toEqual([
      { sign: 1, count: 2, sides: 6 },
      { sign: 1, count: 1, sides: 0 },
    ]);
  });
  it('parses multi-term with minus', () => {
    expect(parseDiceExpression('3d6-1d4+2')).toEqual([
      { sign: 1, count: 3, sides: 6 },
      { sign: -1, count: 1, sides: 4 },
      { sign: 1, count: 2, sides: 0 },
    ]);
  });
  it('parses constant only', () => {
    expect(parseDiceExpression('0')).toEqual([{ sign: 1, count: 0, sides: 0 }]);
    expect(parseDiceExpression('3')).toEqual([{ sign: 1, count: 3, sides: 0 }]);
  });
  it('rejects garbage', () => {
    expect(() => parseDiceExpression('abc')).toThrow();
    expect(() => parseDiceExpression('1d')).toThrow();
    expect(() => parseDiceExpression('')).toThrow();
  });
});

describe('rollExpression', () => {
  it('rolls NdM and sums', () => {
    // 2d6: rng will be called for each die. Sequence: [4, 5].
    const rng = sequenceRng([4, 5]);
    const r = rollExpression(rng, '2d6');
    expect(r.total).toBe(9);
    expect(r.terms[0]!.rolls).toEqual([4, 5]);
  });
  it('handles negative term', () => {
    // 1d6-1d4 = 6 - 1 = 5
    const rng = sequenceRng([6, 1]);
    const r = rollExpression(rng, '1d6-1d4');
    expect(r.total).toBe(5);
  });
  it('constants just add', () => {
    const rng = sequenceRng([3]);
    expect(rollExpression(rng, '1d6+2').total).toBe(5);
  });
});

describe('rollD100', () => {
  it('00 + 0 = 100', () => {
    // tens=0, units=0 -> 100
    const rng = sequenceRng([0, 0]);
    const r = rollD100(rng, 0);
    expect(r.chosen).toBe(100);
  });
  it('bonus die picks the lower combined', () => {
    // units=5; tens candidates: 7 -> 75, 2 -> 25. Bonus should pick 25.
    // Note: rollD100 calls rng.int(0,9) first for units then tens.
    const rng = sequenceRng([/*units*/ 5, /*tens1*/ 7, /*tens2*/ 2]);
    const r = rollD100(rng, +1);
    expect(r.chosen).toBe(25);
    expect(r.tens).toEqual([7, 2]);
    expect(r.units).toBe(5);
  });
  it('penalty die picks the higher combined', () => {
    const rng = sequenceRng([/*units*/ 3, /*tens1*/ 1, /*tens2*/ 8]);
    const r = rollD100(rng, -1);
    expect(r.chosen).toBe(83);
  });
  it('penalty with 00 mapped to 100 is chosen over lower results', () => {
    // units=0; tens candidates: 5 -> 50, 0 -> 100. Highest is 100.
    const rng = sequenceRng([0, 5, 0]);
    const r = rollD100(rng, -1);
    expect(r.chosen).toBe(100);
  });
});

describe('rollD100 statistical sanity', () => {
  it('mean over many trials is near 50.5', () => {
    const rng = seededRng(42);
    let sum = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) sum += rollD100(rng, 0).chosen;
    const mean = sum / N;
    expect(mean).toBeGreaterThan(46);
    expect(mean).toBeLessThan(55);
  });
});
