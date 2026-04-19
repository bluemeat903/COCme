import { z } from 'zod';

/**
 * State operations the KP may PROPOSE for the server to execute.
 * The server validates and applies them; numeric outcomes (damage, loss rolls)
 * that depend on dice must be expressed as dice-roll ops so the rules engine
 * controls the RNG.
 */

export const StateOp = z.discriminatedUnion('op', [
  // time
  z.object({
    op: z.literal('advance_clock'),
    minutes: z.number().int().positive().max(24 * 60),
    reason: z.string().optional(),
  }),

  // scene navigation
  z.object({
    op: z.literal('change_scene'),
    scene_id: z.string().min(1),
  }),

  // direct stat changes (for absolute effects; prefer the roll-based variants below
  // for anything narratively uncertain)
  z.object({ op: z.literal('hp_change'),  delta: z.number().int(), reason: z.string().optional() }),
  z.object({ op: z.literal('mp_change'),  delta: z.number().int(), reason: z.string().optional() }),
  z.object({ op: z.literal('san_change'), delta: z.number().int(), reason: z.string().optional() }),
  z.object({ op: z.literal('luck_change'),delta: z.number().int(), reason: z.string().optional() }),

  // damage roll: "1d6+1" -> server rolls, applies to HP.
  z.object({
    op: z.literal('damage_roll'),
    expression: z.string().min(1),
    armor: z.number().int().min(0).default(0),
    reason: z.string().optional(),
  }),

  // SAN check: "X/Y" loss expression; server rolls + applies.
  z.object({
    op: z.literal('san_check'),
    loss: z.string().regex(/^[^/]+\/[^/]+$/, 'must be "success/failure" form'),
    source: z.string().min(1),
  }),

  // inventory
  z.object({
    op: z.literal('add_inventory'),
    item: z.string().min(1),
    qty: z.number().int().min(1).default(1),
    notes: z.string().optional(),
  }),
  z.object({
    op: z.literal('remove_inventory'),
    item: z.string().min(1),
    qty: z.number().int().min(1).default(1),
  }),

  // clues
  z.object({
    op: z.literal('reveal_clue'),
    clue_key: z.string().min(1),
    context: z.string().optional(),
  }),

  // NPCs
  z.object({
    op: z.literal('npc_disposition'),
    npc_key: z.string().min(1),
    disposition: z.enum(['hostile', 'wary', 'neutral', 'friendly', 'ally']),
  }),
  z.object({
    op: z.literal('npc_dead'),
    npc_key: z.string().min(1),
    cause: z.string().optional(),
  }),

  // generic narrative flag (truth-graph progression, campaign state, etc.)
  z.object({
    op: z.literal('flag_set'),
    key: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean(), z.null()]),
  }),
]);

export type StateOp = z.infer<typeof StateOp>;
