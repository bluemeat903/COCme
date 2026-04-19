import { z } from 'zod';

/**
 * Canonical module schema.  Both user-uploaded scenarios and AI-generated
 * scenarios normalize to this structure before runtime.  Stored in
 * `modules.content` (JSONB) in Postgres.
 */

export const ModuleMeta = z.object({
  title: z.string().min(1),
  era: z.string().default('1920s'),
  tags: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),           // content warnings (gore, body-horror, ...)
  duration_min: z.number().int().positive().optional(),
});

export const ModuleLocation = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  features: z.array(z.string()).default([]),
});

export const ModuleNpc = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  role: z.string(),
  motivations: z.array(z.string()).default([]),
  secrets: z.array(z.string()).default([]),
  stats: z
    .object({
      hp: z.number().int().positive().optional(),
      san: z.number().int().min(0).optional(),
      skills: z.record(z.string(), z.number().int().min(0).max(99)).optional(),
    })
    .optional(),
});

export const ModuleClue = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  text: z.string(),
  found_at: z.array(z.string()).default([]),           // location keys
  requires_check: z
    .object({
      skill: z.string(),
      difficulty: z.enum(['regular', 'hard', 'extreme']).default('regular'),
    })
    .optional(),
  reveals: z.array(z.string()).default([]),            // other clue keys this unlocks
});

export const ModuleSceneTransition = z.object({
  to: z.string().min(1),                                // scene id
  condition: z.string().optional(),                     // free-form; KP interprets
});

export const ModuleSceneNode = z.object({
  id: z.string().min(1),
  title: z.string(),
  setup: z.string(),                                    // KP-facing setup text
  on_enter: z.array(z.string()).default([]),            // side effects as free-form instructions
  transitions: z.array(ModuleSceneTransition).default([]),
});

export const ModuleEncounter = z.object({
  key: z.string().min(1),
  description: z.string(),
  opponents: z
    .array(z.object({ npc_key: z.string().optional(), name: z.string(), hp: z.number().int().positive() }))
    .default([]),
});

export const ModuleEndingCondition = z.object({
  key: z.string().min(1),
  label: z.string(),                                    // 'good' | 'pyrrhic' | 'bad' | 'dead' | 'insane' | 'escaped' | custom
  requires: z.array(z.string()).default([]),            // predicate strings interpretable by KP layer
});

export const ModuleContent = z.object({
  meta: ModuleMeta,
  premise: z.string().min(1),
  locations: z.array(ModuleLocation).default([]),
  npcs: z.array(ModuleNpc).default([]),
  clues: z.array(ModuleClue).default([]),
  truth_graph: z
    .object({
      nodes: z.array(z.object({ id: z.string(), label: z.string() })).default([]),
      edges: z
        .array(z.object({ from: z.string(), to: z.string(), relation: z.string().optional() }))
        .default([]),
    })
    .default({ nodes: [], edges: [] }),
  scene_nodes: z.array(ModuleSceneNode).min(1),
  encounters: z.array(ModuleEncounter).default([]),
  ending_conditions: z.array(ModuleEndingCondition).min(1),
});
export type ModuleContent = z.infer<typeof ModuleContent>;
