import { randomInt as cryptoRandomInt } from 'node:crypto';

export interface Rng {
  /** Inclusive on both ends. */
  int(min: number, maxInclusive: number): number;
}

export const cryptoRng: Rng = {
  int: (min, max) => cryptoRandomInt(min, max + 1),
};

/**
 * Seeded PRNG for tests and replays.  Mulberry32.
 * Do NOT use for real gameplay: not cryptographically secure.
 */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    int: (min, max) => Math.floor(next() * (max - min + 1)) + min,
  };
}
