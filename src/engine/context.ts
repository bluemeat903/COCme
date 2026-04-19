import type { SessionState, CheckResolution } from './state.js';

/**
 * Build the context JSON passed to the KP model.  Contains everything the KP
 * needs to narrate the next turn; excludes items the KP must not see
 * (server-side identifiers, other users' data, etc.).
 */

const RECENT_TURNS = 8;

export interface KpContext {
  session: {
    scene_id: string;
    elapsed_minutes: number;
    status: SessionState['status'];
  };
  investigator: {
    name: string;
    era: string;
    occupation: string | null;
    hp: { current: number; max: number };
    mp: { current: number; max: number };
    san: { current: number; max: number };
    luck: number;
    conditions: string[];
    phobias_manias: string[];
    skills: Record<string, number>;
    inventory: Array<{ item: string; qty: number; notes?: string }>;
    background: Record<string, unknown>;
  };
  module: {
    title: string;
    era: string;
    premise: string;
    current_scene: {
      id: string;
      title: string;
      setup: string;
      on_enter: string[];
      transitions: Array<{ to: string; condition?: string }>;
    } | null;
    all_scene_ids: string[];
    npcs_active: Array<{
      key: string;
      name: string;
      role: string;
      disposition: string;
      alive: boolean;
    }>;
    clues_discovered: Array<{ key: string; name: string; text: string; context?: string }>;
    clues_undiscovered_in_scene: Array<{ key: string; name: string; requires_check?: unknown }>;
    ending_conditions: Array<{ key: string; label: string; requires: string[] }>;
  };
  flags: Record<string, string | number | boolean | null>;
  recent_turns: Array<{
    index: number;
    actor: 'player' | 'kp' | 'system';
    player_input?: string;
    visible_narration?: string;
    hidden_notes?: string[];
    check_resolution?: {
      summary: string;
      outcome: CheckResolution['outcome'];
    };
  }>;
  /** If a check was resolved by THIS turn's player input, its summary is here. */
  resolved_check_this_turn: CheckResolution | null;
  /** Effects produced by previous turn's state_ops (damage applied, clues gained, etc). */
  pending_effects_this_turn: string[];
  /** The current player input to respond to. */
  player_input: string | null;
  /** True iff no KP turn has been played yet -> this is the opening prologue. */
  is_opening: boolean;
}

export function buildKpContext(
  state: SessionState,
  opts: {
    playerInput: string | null;
    resolvedCheck?: CheckResolution | null;
    pendingEffects?: string[];
  },
): KpContext {
  const base = state.investigator.base;
  const cur = state.investigator.current;
  const currentScene = state.module.scene_nodes.find(n => n.id === state.current_scene_id) ?? null;

  const clueDefsByKey = new Map(state.module.clues.map(c => [c.key, c]));
  const discovered: KpContext['module']['clues_discovered'] = [];
  for (const [key, st] of Object.entries(state.clues)) {
    if (!st.discovered) continue;
    const def = clueDefsByKey.get(key);
    if (!def) continue;
    discovered.push({
      key,
      name: def.name,
      text: def.text,
      ...(st.discovery_context ? { context: st.discovery_context } : {}),
    });
  }
  const undiscoveredInScene: KpContext['module']['clues_undiscovered_in_scene'] = [];
  for (const c of state.module.clues) {
    if (state.clues[c.key]?.discovered) continue;
    if (c.found_at.length > 0 && !c.found_at.includes(state.current_scene_id)) continue;
    undiscoveredInScene.push({
      key: c.key,
      name: c.name,
      ...(c.requires_check ? { requires_check: c.requires_check } : {}),
    });
  }

  const npcsActive: KpContext['module']['npcs_active'] = state.module.npcs.map(def => {
    const st = state.npcs[def.key];
    return {
      key: def.key,
      name: def.name,
      role: def.role,
      disposition: st?.disposition ?? 'neutral',
      alive: st?.alive ?? true,
    };
  });

  const recent = state.turns.slice(-RECENT_TURNS).map(t => ({
    index: t.index,
    actor: t.actor,
    ...(t.player_input ? { player_input: t.player_input } : {}),
    ...(t.visible_narration ? { visible_narration: t.visible_narration } : {}),
    ...(t.kp_output?.hidden_notes?.length ? { hidden_notes: t.kp_output.hidden_notes } : {}),
    ...(t.check_resolution
      ? {
          check_resolution: {
            summary: t.check_resolution.summary,
            outcome: t.check_resolution.outcome,
          },
        }
      : {}),
  }));

  return {
    session: {
      scene_id: state.current_scene_id,
      elapsed_minutes: state.game_clock.elapsed_minutes,
      status: state.status,
    },
    investigator: {
      name: base.name,
      era: base.era,
      occupation: base.occupation,
      hp: { current: cur.hp_current, max: base.hp_max },
      mp: { current: cur.mp_current, max: base.mp_max },
      san: { current: cur.san_current, max: base.san_max },
      luck: cur.luck,
      conditions: [...cur.conditions],
      phobias_manias: [...cur.phobias_manias],
      skills: Object.fromEntries(Object.entries(cur.skills).map(([k, v]) => [k, v.value])),
      inventory: cur.inventory.map(i => ({
        item: i.item,
        qty: i.qty,
        ...(i.notes ? { notes: i.notes } : {}),
      })),
      background: base.background,
    },
    module: {
      title: state.module.meta.title,
      era: state.module.meta.era,
      premise: state.module.premise,
      current_scene: currentScene
        ? {
            id: currentScene.id,
            title: currentScene.title,
            setup: currentScene.setup,
            on_enter: currentScene.on_enter,
            transitions: currentScene.transitions.map(tr => ({
              to: tr.to,
              ...(tr.condition ? { condition: tr.condition } : {}),
            })),
          }
        : null,
      all_scene_ids: state.module.scene_nodes.map(n => n.id),
      npcs_active: npcsActive,
      clues_discovered: discovered,
      clues_undiscovered_in_scene: undiscoveredInScene,
      ending_conditions: state.module.ending_conditions.map(e => ({
        key: e.key,
        label: e.label,
        requires: e.requires,
      })),
    },
    flags: { ...state.flags },
    recent_turns: recent,
    resolved_check_this_turn: opts.resolvedCheck ?? null,
    pending_effects_this_turn: opts.pendingEffects ?? [],
    player_input: opts.playerInput,
    is_opening: !state.turns.some(t => t.actor === 'kp'),
  };
}
