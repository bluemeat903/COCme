import { describe, it, expect } from 'vitest';
import { resolveCheck, resolveOpposed, pushCheck, rollCheck } from './check.js';
import type { Rng } from './rng.js';

function fixedRng(values: number[]): Rng {
  let i = 0;
  return { int: (_a, _b) => values[i++ % values.length]! };
}

describe('resolveCheck', () => {
  it('01 is always critical', () => {
    expect(resolveCheck(1, 30, 'regular').outcome).toBe('critical');
    expect(resolveCheck(1, 30, 'extreme').outcome).toBe('critical');
  });

  it('fumble: target < 50 -> 96-100', () => {
    expect(resolveCheck(96, 40, 'regular').outcome).toBe('fumble');
    expect(resolveCheck(100, 40, 'regular').outcome).toBe('fumble');
    expect(resolveCheck(95, 40, 'regular').outcome).toBe('fail');
  });

  it('fumble: target >= 50 -> only 100', () => {
    expect(resolveCheck(100, 80, 'regular').outcome).toBe('fumble');
    expect(resolveCheck(99, 80, 'regular').outcome).toBe('fail');
    expect(resolveCheck(96, 80, 'regular').outcome).toBe('fail');
  });

  it('success tiers at target=60', () => {
    // extreme = 12, hard = 30, regular = 60
    expect(resolveCheck(10, 60, 'regular').outcome).toBe('extreme_success');
    expect(resolveCheck(20, 60, 'regular').outcome).toBe('hard_success');
    expect(resolveCheck(50, 60, 'regular').outcome).toBe('regular_success');
    expect(resolveCheck(61, 60, 'regular').outcome).toBe('fail');
  });

  it('requested hard: regular-tier roll becomes fail', () => {
    // target=80, hard threshold=40
    expect(resolveCheck(50, 80, 'hard').outcome).toBe('fail');
    expect(resolveCheck(50, 80, 'hard').tier_achieved).toBe('regular_success');
    expect(resolveCheck(30, 80, 'hard').outcome).toBe('hard_success');
    expect(resolveCheck(15, 80, 'hard').outcome).toBe('extreme_success');
  });

  it('requested extreme: only extreme tier passes', () => {
    // target=60, extreme threshold=12
    expect(resolveCheck(12, 60, 'extreme').outcome).toBe('extreme_success');
    expect(resolveCheck(13, 60, 'extreme').outcome).toBe('fail');
    expect(resolveCheck(13, 60, 'extreme').tier_achieved).toBe('hard_success');
  });
});

describe('rollCheck', () => {
  it('produces a CheckResult with roll+outcome', () => {
    // Fixed RNG: units=5, tens=3 -> 35. Target 60 regular -> hard_success (<= 30 is hard; 35 > 30, 35 <= 60, so regular_success)
    const rng = fixedRng([5, 3]);
    const r = rollCheck(rng, { target: 60, difficulty: 'regular', bonus_dice: 0, penalty_dice: 0 });
    expect(r.roll.chosen).toBe(35);
    expect(r.outcome).toBe('regular_success');
    expect(r.pushed).toBe(false);
  });
});

describe('pushCheck', () => {
  it('refuses to push a success', () => {
    const prev = { target: 60, difficulty: 'regular' as const, bonus_dice: 0, penalty_dice: 0,
      roll: { tens: [3], units: 0, chosen_tens: 3, chosen: 30 },
      outcome: 'hard_success' as const, tier_achieved: 'hard_success' as const, pushed: false };
    expect(() => pushCheck(fixedRng([0, 0]), prev)).toThrow();
  });

  it('refuses double push', () => {
    const prev = { target: 60, difficulty: 'regular' as const, bonus_dice: 0, penalty_dice: 0,
      roll: { tens: [8], units: 0, chosen_tens: 8, chosen: 80 },
      outcome: 'fail' as const, tier_achieved: 'fail' as const, pushed: true };
    expect(() => pushCheck(fixedRng([0, 0]), prev)).toThrow();
  });

  it('re-rolls and flags pushed=true', () => {
    const prev = { target: 60, difficulty: 'regular' as const, bonus_dice: 0, penalty_dice: 0,
      roll: { tens: [8], units: 0, chosen_tens: 8, chosen: 80 },
      outcome: 'fail' as const, tier_achieved: 'fail' as const, pushed: false };
    // units=2, tens=1 -> 12; target 60 -> hard_success (<=30) but 12 <=12 extreme threshold -> extreme_success
    const r = pushCheck(fixedRng([2, 1]), prev);
    expect(r.pushed).toBe(true);
    expect(r.outcome).toBe('extreme_success');
  });
});

describe('resolveOpposed', () => {
  it('higher outcome rank wins', () => {
    expect(
      resolveOpposed({ outcome: 'hard_success', skill: 50 }, { outcome: 'regular_success', skill: 80 }),
    ).toBe('a');
  });
  it('tie breaks on skill', () => {
    expect(
      resolveOpposed({ outcome: 'regular_success', skill: 60 }, { outcome: 'regular_success', skill: 40 }),
    ).toBe('a');
  });
  it('equal everything -> tie', () => {
    expect(
      resolveOpposed({ outcome: 'hard_success', skill: 50 }, { outcome: 'hard_success', skill: 50 }),
    ).toBe('tie');
  });
});
