/**
 * BRP / CoC 7e derived statistics + age modifier helpers.
 *
 * These are the rules you can't skip without breaking game math.  Everything
 * here is a pure function; the builder composes them.
 */

import type { StatKey } from './occupations.js';

export type Stats = Record<StatKey, number>;

export interface DerivedStats {
  hp_max: number;
  mp_max: number;
  san_max: number;      // always 99 minus Cthulhu Mythos; for a fresh character, 99
  san_start: number;    // POW
  mov: number;
  damage_bonus: string; // '-2' | '-1' | '0' | '+1d4' | '+1d6' ...
  build: number;        // -2..+N
}

/** Derived in BRP/CoC 7e. */
export function computeDerived(stats: Stats, age: number): DerivedStats {
  const hp_max = Math.floor((stats.siz + stats.con) / 10);
  const mp_max = Math.floor(stats.pow / 5);
  const san_start = stats.pow;
  const san_max = 99;  // reduced by Cthulhu Mythos at runtime

  // MOV rules (CoC 7e):
  //   - Both STR and DEX < SIZ AND STR < SIZ: MOV 7
  //   - Both STR and DEX >= SIZ OR either > SIZ: MOV 9
  //   - Otherwise: MOV 8
  //   - Age adjustment: -1 at 40s, -2 at 50s, -3 at 60s, -4 at 70s, -5 at 80s.
  let mov: number;
  const strLt = stats.str < stats.siz;
  const dexLt = stats.dex < stats.siz;
  const strGt = stats.str > stats.siz;
  const dexGt = stats.dex > stats.siz;
  if (strLt && dexLt) mov = 7;
  else if (strGt || dexGt || (stats.str >= stats.siz && stats.dex >= stats.siz)) mov = 9;
  else mov = 8;

  if (age >= 80)      mov -= 5;
  else if (age >= 70) mov -= 4;
  else if (age >= 60) mov -= 3;
  else if (age >= 50) mov -= 2;
  else if (age >= 40) mov -= 1;

  if (mov < 1) mov = 1;

  // Damage Bonus & Build (STR+SIZ):
  //   2-64:   DB=-2, build=-2
  //   65-84:  DB=-1, build=-1
  //   85-124: DB=0,  build=0
  //  125-164: DB=+1d4, build=+1
  //  165-204: DB=+1d6, build=+2
  //  205-284: DB=+2d6, build=+3
  //  285-364: DB=+3d6, build=+4
  const strSiz = stats.str + stats.siz;
  let damage_bonus: string;
  let build: number;
  if (strSiz <= 64)        { damage_bonus = '-2';   build = -2; }
  else if (strSiz <= 84)   { damage_bonus = '-1';   build = -1; }
  else if (strSiz <= 124)  { damage_bonus = '0';    build = 0; }
  else if (strSiz <= 164)  { damage_bonus = '+1d4'; build = 1; }
  else if (strSiz <= 204)  { damage_bonus = '+1d6'; build = 2; }
  else if (strSiz <= 284)  { damage_bonus = '+2d6'; build = 3; }
  else if (strSiz <= 364)  { damage_bonus = '+3d6'; build = 4; }
  else                     { damage_bonus = '+4d6'; build = 5; }

  return { hp_max, mp_max, san_max, san_start, mov, damage_bonus, build };
}

// ---------------------------------------------------------------------------
// Age modifier
// ---------------------------------------------------------------------------
// CoC 7e age penalties applied to stats (the player decides the split).
// Our builder accepts the POST-MODIFIER stats from the draft, but also takes
// an `age_modifier_applied` record so validation can confirm the player
// actually took the required penalties.
// ---------------------------------------------------------------------------

export interface AgePenalty {
  /** Total reduction the player must distribute among STR, CON, DEX. */
  physical_penalty_total: number;
  /** Flat APP penalty. */
  app_penalty: number;
  /** Bonus EDU improvement checks (not applied automatically -- informational). */
  edu_improvement_checks: number;
  /** Luck: if true, the player gets two rolls and takes the higher (ages 15-19). */
  luck_roll_twice_take_higher: boolean;
  /** Youth EDU penalty: 15-19 reduces EDU by 5. */
  youth_edu_penalty: number;
  /** Permitted age bounds inclusive. */
  age_range: [number, number];
}

export const AGE_BANDS: AgePenalty[] = [
  { age_range: [15, 19], physical_penalty_total: 5,  app_penalty: 0,  edu_improvement_checks: 0, luck_roll_twice_take_higher: true,  youth_edu_penalty: 5 },
  { age_range: [20, 39], physical_penalty_total: 0,  app_penalty: 0,  edu_improvement_checks: 1, luck_roll_twice_take_higher: false, youth_edu_penalty: 0 },
  { age_range: [40, 49], physical_penalty_total: 5,  app_penalty: 5,  edu_improvement_checks: 2, luck_roll_twice_take_higher: false, youth_edu_penalty: 0 },
  { age_range: [50, 59], physical_penalty_total: 10, app_penalty: 10, edu_improvement_checks: 3, luck_roll_twice_take_higher: false, youth_edu_penalty: 0 },
  { age_range: [60, 69], physical_penalty_total: 20, app_penalty: 15, edu_improvement_checks: 4, luck_roll_twice_take_higher: false, youth_edu_penalty: 0 },
  { age_range: [70, 79], physical_penalty_total: 40, app_penalty: 20, edu_improvement_checks: 4, luck_roll_twice_take_higher: false, youth_edu_penalty: 0 },
  { age_range: [80, 120], physical_penalty_total: 80, app_penalty: 25, edu_improvement_checks: 4, luck_roll_twice_take_higher: false, youth_edu_penalty: 0 },
];

export function agePenaltyFor(age: number): AgePenalty {
  const band = AGE_BANDS.find(b => age >= b.age_range[0] && age <= b.age_range[1]);
  if (!band) throw new Error(`age ${age} out of supported range (15-120)`);
  return band;
}
