import { describe, it, expect } from 'vitest';
import { parseSanLoss, rollSanCheck } from './san.js';
import type { Rng } from './rng.js';

function fixedRng(values: number[]): Rng {
  let i = 0;
  return { int: (_a, _b) => values[i++ % values.length]! };
}

describe('parseSanLoss', () => {
  it('splits X/Y', () => {
    expect(parseSanLoss('0/1d4')).toEqual({ success: '0', failure: '1d4' });
    expect(parseSanLoss('1/1d6+1')).toEqual({ success: '1', failure: '1d6+1' });
  });
  it('throws on bad form', () => {
    expect(() => parseSanLoss('1d4')).toThrow();
    expect(() => parseSanLoss('1/2/3')).toThrow();
  });
});

describe('rollSanCheck', () => {
  it('passes with low d100 roll, applies success loss', () => {
    // d100: units=0, tens=2 -> 20; then constant "1" success loss
    const rng = fixedRng([0, 2]);
    const r = rollSanCheck(rng, 60, '1/1d6');
    expect(r.d100).toBe(20);
    expect(r.passed).toBe(true);
    expect(r.loss).toBe(1);
    expect(r.new_san).toBe(59);
    expect(r.insanity_threshold).toBe(false);
  });

  it('fails with high d100, applies failure dice', () => {
    // d100: units=5, tens=8 -> 85 (> SAN 60 -> fail); then 1d6 = 6
    const rng = fixedRng([5, 8, 6]);
    const r = rollSanCheck(rng, 60, '1/1d6');
    expect(r.passed).toBe(false);
    expect(r.loss).toBe(6);
    expect(r.new_san).toBe(54);
    expect(r.insanity_threshold).toBe(true);
  });

  it('01 is auto-pass', () => {
    // units=1, tens=0 -> 1; success loss "0"
    const rng = fixedRng([1, 0]);
    const r = rollSanCheck(rng, 10, '0/1d4');
    expect(r.passed).toBe(true);
    expect(r.loss).toBe(0);
    expect(r.new_san).toBe(10);
  });

  it('00 is auto-fail', () => {
    // units=0, tens=0 -> 100; failure "2"
    const rng = fixedRng([0, 0]);
    const r = rollSanCheck(rng, 99, '0/2');
    expect(r.passed).toBe(false);
    expect(r.loss).toBe(2);
  });

  it('drops to 0 -> permanently_insane', () => {
    // d100=50 (fail vs SAN 3); failure "1d10" rolls 6 -> san 3-6 clamps to 0.
    const rng = fixedRng([0, 5, 6]);
    const r = rollSanCheck(rng, 3, '1d6/1d10');
    expect(r.new_san).toBe(0);
    expect(r.permanently_insane).toBe(true);
  });
});
