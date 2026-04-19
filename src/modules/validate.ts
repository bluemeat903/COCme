import type { ModuleContent } from '../schemas/module.js';

/**
 * Zod guarantees the shape is valid.  This layer checks CROSS-references:
 *   - every clue.found_at key must resolve to a location.key or scene_nodes[].id
 *   - every clue.reveals key must resolve to another clue.key
 *   - every transition.to must resolve to another scene_nodes[].id
 *   - every ending_condition.requires should not be empty string
 *
 * Returns warnings; does not throw.  Module data flagged here still loads --
 * the KP layer just gets a slightly sloppy module.  Surface the warnings in
 * the UI so users can decide.
 */

export interface ValidateResult {
  warnings: string[];
}

export function validateAndNormalizeModuleContent(m: ModuleContent): ValidateResult {
  const warnings: string[] = [];

  const locationKeys = new Set(m.locations.map(l => l.key));
  const sceneIds = new Set(m.scene_nodes.map(s => s.id));
  const clueKeys = new Set(m.clues.map(c => c.key));
  const npcKeys = new Set(m.npcs.map(n => n.key));

  if (m.scene_nodes.length < 1) {
    warnings.push('scene_nodes is empty');
  }
  if (m.ending_conditions.length < 1) {
    warnings.push('ending_conditions is empty');
  }

  for (const clue of m.clues) {
    for (const loc of clue.found_at) {
      if (!locationKeys.has(loc) && !sceneIds.has(loc)) {
        warnings.push(`clue "${clue.key}".found_at references unknown "${loc}"`);
      }
    }
    for (const rev of clue.reveals) {
      if (!clueKeys.has(rev)) {
        warnings.push(`clue "${clue.key}".reveals references unknown clue "${rev}"`);
      }
    }
  }

  for (const scene of m.scene_nodes) {
    for (const tr of scene.transitions) {
      if (!sceneIds.has(tr.to)) {
        warnings.push(`scene "${scene.id}".transitions.to unknown scene "${tr.to}"`);
      }
    }
  }

  for (const enc of m.encounters) {
    for (const opp of enc.opponents) {
      if (opp.npc_key && !npcKeys.has(opp.npc_key)) {
        warnings.push(`encounter "${enc.key}".opponent references unknown npc_key "${opp.npc_key}"`);
      }
    }
  }

  // Strip empty `requires` strings
  for (const end of m.ending_conditions) {
    end.requires = end.requires.filter(s => s.trim().length > 0);
  }

  return { warnings };
}
