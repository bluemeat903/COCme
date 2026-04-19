import type { Rng } from '../rules/index.js';
import { rollExpression, rollSanCheck } from '../rules/index.js';
import type { StateOp } from '../schemas/index.js';
import type { SessionEvent, SessionState, InvestigatorRuntimeState } from './state.js';

// ---------------------------------------------------------------------------
// Deep-ish clone for one turn.  SessionState is plain JSON -> structuredClone
// is safe and simpler than maintaining immutable update helpers.
// ---------------------------------------------------------------------------
export function cloneState(s: SessionState): SessionState {
  return structuredClone(s);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function now(): string {
  return new Date().toISOString();
}

function pushEvent(state: SessionState, ev: SessionEvent): void {
  state.events.push(ev);
}

// ---------------------------------------------------------------------------
// Per-op handlers.  Each mutates `state` and appends events.  Returns an
// "effect summary" string that can be surfaced to the KP next turn so the
// narrative stays coherent with what actually happened.
// ---------------------------------------------------------------------------

export interface ApplyDeps {
  rng: Rng;
}

export interface ApplyOpResult {
  /** Summary lines produced by this op (for downstream inclusion in KP context). */
  effects: string[];
}

export function applyStateOp(
  state: SessionState,
  op: StateOp,
  deps: ApplyDeps,
): ApplyOpResult {
  const cur = state.investigator.current;
  const base = state.investigator.base;
  const effects: string[] = [];

  switch (op.op) {
    case 'advance_clock': {
      state.game_clock.elapsed_minutes += op.minutes;
      pushEvent(state, {
        kind: 'clock_advance',
        minutes: op.minutes,
        ...(op.reason !== undefined ? { reason: op.reason } : {}),
        at: now(),
      });
      effects.push(`clock +${op.minutes}m`);
      break;
    }

    case 'change_scene': {
      if (!state.module.scene_nodes.find(n => n.id === op.scene_id)) {
        // KP hallucinated a scene_id not in the module.  Skip rather than
        // torpedoing the turn.  Upper layer logs; next turn's KP will see
        // current_scene_id unchanged.
        // eslint-disable-next-line no-console
        console.warn(`[ops] change_scene: unknown scene_id "${op.scene_id}" — skipped`);
        effects.push(`skipped change_scene: unknown ${op.scene_id}`);
        break;
      }
      const from = state.current_scene_id;
      if (from === op.scene_id) break;
      state.current_scene_id = op.scene_id;
      pushEvent(state, { kind: 'scene_change', from, to: op.scene_id, at: now() });
      effects.push(`scene -> ${op.scene_id}`);
      break;
    }

    case 'hp_change': {
      const newVal = clamp(cur.hp_current + op.delta, 0, base.hp_max);
      const delta = newVal - cur.hp_current;
      cur.hp_current = newVal;
      pushEvent(state, {
        kind: 'hp_change',
        delta,
        new_value: newVal,
        ...(op.reason !== undefined ? { reason: op.reason } : {}),
        at: now(),
      });
      effects.push(`HP ${delta >= 0 ? '+' : ''}${delta} -> ${newVal}`);
      checkDeathOrInsanity(state, cur);
      break;
    }

    case 'mp_change': {
      const newVal = clamp(cur.mp_current + op.delta, 0, base.mp_max);
      const delta = newVal - cur.mp_current;
      cur.mp_current = newVal;
      pushEvent(state, {
        kind: 'mp_change',
        delta,
        new_value: newVal,
        ...(op.reason !== undefined ? { reason: op.reason } : {}),
        at: now(),
      });
      effects.push(`MP ${delta >= 0 ? '+' : ''}${delta} -> ${newVal}`);
      break;
    }

    case 'san_change': {
      const newVal = clamp(cur.san_current + op.delta, 0, base.san_max);
      const delta = newVal - cur.san_current;
      cur.san_current = newVal;
      pushEvent(state, {
        kind: 'san_change',
        delta,
        new_value: newVal,
        ...(op.reason !== undefined ? { reason: op.reason } : {}),
        at: now(),
      });
      effects.push(`SAN ${delta >= 0 ? '+' : ''}${delta} -> ${newVal}`);
      checkDeathOrInsanity(state, cur);
      break;
    }

    case 'luck_change': {
      const newVal = clamp(cur.luck + op.delta, 0, 99);
      const delta = newVal - cur.luck;
      cur.luck = newVal;
      pushEvent(state, {
        kind: 'luck_change',
        delta,
        new_value: newVal,
        ...(op.reason !== undefined ? { reason: op.reason } : {}),
        at: now(),
      });
      effects.push(`Luck ${delta >= 0 ? '+' : ''}${delta} -> ${newVal}`);
      break;
    }

    case 'damage_roll': {
      const rolled = rollExpression(deps.rng, op.expression);
      const raw = Math.max(0, rolled.total);
      const applied = Math.max(0, raw - op.armor);
      pushEvent(state, {
        kind: 'damage_roll',
        expression: op.expression,
        rolled: raw,
        armor: op.armor,
        applied,
        at: now(),
      });
      effects.push(`damage ${op.expression} -> ${raw} (armor ${op.armor}) = ${applied}`);
      if (applied > 0) {
        applyStateOp(
          state,
          {
            op: 'hp_change',
            delta: -applied,
            ...(op.reason ? { reason: op.reason } : {}),
          } satisfies StateOp,
          deps,
        );
      }
      break;
    }

    case 'san_check': {
      const r = rollSanCheck(deps.rng, cur.san_current, op.loss);
      pushEvent(state, {
        kind: 'san_check',
        loss: op.loss,
        d100: r.d100,
        passed: r.passed,
        lost: r.loss,
        source: op.source,
        at: now(),
      });
      cur.san_current = r.new_san;
      pushEvent(state, {
        kind: 'san_change',
        delta: -r.loss,
        new_value: r.new_san,
        reason: `san_check: ${op.source}`,
        at: now(),
      });
      effects.push(
        `SAN check (${op.source}): d100=${r.d100} vs ${state.investigator.current.san_current + r.loss} ` +
          `${r.passed ? 'pass' : 'FAIL'}, lost ${r.loss} -> SAN ${r.new_san}`,
      );
      if (r.insanity_threshold) {
        pushEvent(state, { kind: 'temp_insanity_threshold', loss: r.loss, at: now() });
        if (!cur.conditions.includes('temp_insanity_pending')) {
          cur.conditions.push('temp_insanity_pending');
        }
        effects.push('triggered INT roll for temporary insanity');
      }
      checkDeathOrInsanity(state, cur);
      break;
    }

    case 'add_inventory': {
      const existing = cur.inventory.find(i => i.item === op.item);
      if (existing) {
        existing.qty += op.qty;
        if (op.notes) existing.notes = op.notes;
      } else {
        cur.inventory.push({ item: op.item, qty: op.qty, ...(op.notes ? { notes: op.notes } : {}) });
      }
      pushEvent(state, {
        kind: 'inventory_add',
        item: op.item,
        qty: op.qty,
        ...(op.notes ? { notes: op.notes } : {}),
        at: now(),
      });
      effects.push(`+${op.qty} ${op.item}`);
      break;
    }

    case 'remove_inventory': {
      const existing = cur.inventory.find(i => i.item === op.item);
      if (!existing || existing.qty < op.qty) {
        // eslint-disable-next-line no-console
        console.warn(
          `[ops] remove_inventory: not enough "${op.item}" (need ${op.qty}, have ${existing?.qty ?? 0}) — skipped`,
        );
        effects.push(`skipped remove_inventory: ${op.item} (insufficient)`);
        break;
      }
      existing.qty -= op.qty;
      if (existing.qty === 0) cur.inventory = cur.inventory.filter(i => i.item !== op.item);
      pushEvent(state, { kind: 'inventory_remove', item: op.item, qty: op.qty, at: now() });
      effects.push(`-${op.qty} ${op.item}`);
      break;
    }

    case 'reveal_clue': {
      const existing = state.clues[op.clue_key];
      if (existing?.discovered) break;
      const clueDef = state.module.clues.find(c => c.key === op.clue_key);
      if (!clueDef) {
        // KP invented a clue_key not in the module.  Ignore; next turn the
        // KP will see the clue wasn't actually revealed (no event) and it
        // can still reference the concept in narration if it wants.
        // eslint-disable-next-line no-console
        console.warn(`[ops] reveal_clue: unknown clue_key "${op.clue_key}" — skipped`);
        effects.push(`skipped reveal_clue: unknown ${op.clue_key}`);
        break;
      }
      state.clues[op.clue_key] = {
        clue_key: op.clue_key,
        discovered: true,
        discovered_at: now(),
        ...(op.context ? { discovery_context: op.context } : {}),
      };
      pushEvent(state, {
        kind: 'clue_found',
        clue_key: op.clue_key,
        ...(op.context ? { context: op.context } : {}),
        at: now(),
      });
      effects.push(`clue: ${op.clue_key}`);
      break;
    }

    case 'npc_disposition': {
      const npc = ensureNpc(state, op.npc_key);
      if (!npc) {
        // eslint-disable-next-line no-console
        console.warn(`[ops] npc_disposition: unknown npc_key "${op.npc_key}" — skipped`);
        effects.push(`skipped npc_disposition: unknown ${op.npc_key}`);
        break;
      }
      npc.disposition = op.disposition;
      pushEvent(state, {
        kind: 'npc_disposition',
        npc_key: op.npc_key,
        disposition: op.disposition,
        at: now(),
      });
      effects.push(`NPC ${op.npc_key} -> ${op.disposition}`);
      break;
    }

    case 'npc_dead': {
      const npc = ensureNpc(state, op.npc_key);
      if (!npc) {
        // eslint-disable-next-line no-console
        console.warn(`[ops] npc_dead: unknown npc_key "${op.npc_key}" — skipped`);
        effects.push(`skipped npc_dead: unknown ${op.npc_key}`);
        break;
      }
      npc.alive = false;
      pushEvent(state, {
        kind: 'npc_dead',
        npc_key: op.npc_key,
        ...(op.cause ? { cause: op.cause } : {}),
        at: now(),
      });
      effects.push(`NPC ${op.npc_key} dead`);
      break;
    }

    case 'flag_set': {
      state.flags[op.key] = op.value;
      pushEvent(state, { kind: 'flag_set', key: op.key, value: op.value, at: now() });
      effects.push(`flag ${op.key}=${JSON.stringify(op.value)}`);
      break;
    }
  }

  return { effects };
}

function ensureNpc(state: SessionState, key: string): import('./state.js').SessionNpcState | null {
  let npc = state.npcs[key];
  if (!npc) {
    const def = state.module.npcs.find(n => n.key === key);
    if (!def) return null;  // caller decides to skip / log
    npc = {
      npc_key: key,
      disposition: 'neutral',
      alive: true,
      hp_current: def.stats?.hp ?? null,
      san_modifier: 0,
      notes: {},
    };
    state.npcs[key] = npc;
  }
  return npc;
}

function checkDeathOrInsanity(state: SessionState, cur: InvestigatorRuntimeState): void {
  if (cur.hp_current <= 0 && !cur.conditions.includes('dead')) {
    cur.conditions.push('dead');
    pushEvent(state, { kind: 'character_dead', at: now() });
    state.status = 'failed';
    state.ending = 'dead';
  }
  if (cur.san_current <= 0 && !cur.conditions.includes('indefinite_insanity')) {
    cur.conditions.push('indefinite_insanity');
    pushEvent(state, { kind: 'character_insane', permanent: true, at: now() });
    // Don't auto-end the session; KP may play out the descent.
  }
}

export function applyStateOps(state: SessionState, ops: StateOp[], deps: ApplyDeps): string[] {
  const all: string[] = [];
  for (const op of ops) {
    const { effects } = applyStateOp(state, op, deps);
    all.push(...effects);
  }
  return all;
}
