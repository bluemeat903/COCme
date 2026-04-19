import type { InvestigatorRow } from '../db/types.js';
import type { SessionState } from '../engine/state.js';

/**
 * Convert a stored InvestigatorRow into the immutable `investigator.base`
 * snapshot used by the engine at session start.  Pure; no side effects.
 */
export function investigatorToSnapshot(row: InvestigatorRow): SessionState['investigator']['base'] {
  return {
    name: row.name,
    era: row.era,
    occupation: row.occupation,
    age: row.age,
    stats: {
      str: row.stat_str, con: row.stat_con, siz: row.stat_siz, dex: row.stat_dex,
      app: row.stat_app, int: row.stat_int, pow: row.stat_pow, edu: row.stat_edu,
    },
    hp_max: row.hp_max,
    mp_max: row.mp_max,
    san_max: row.san_max,
    san_start: row.san_start,
    luck_start: row.luck,
    mov: row.mov,
    damage_bonus: row.damage_bonus,
    build: row.build,
    skills: row.skills,
    inventory: row.inventory,
    background: row.background,
  };
}

/**
 * Build the initial mutable runtime state from an immutable snapshot.
 * HP/MP/SAN start at their maxes; no conditions; no phobias.
 */
export function snapshotToRuntime(
  snap: SessionState['investigator']['base'],
): SessionState['investigator']['current'] {
  return {
    hp_current: snap.hp_max,
    mp_current: snap.mp_max,
    san_current: snap.san_start,
    luck: snap.luck_start,
    skills: Object.fromEntries(
      Object.entries(snap.skills).map(([k, v]) => [k, { ...v, used_this_session: false }]),
    ),
    inventory: snap.inventory.map(i => ({ ...i })),
    conditions: [],
    phobias_manias: [],
  };
}
