import { z } from 'zod';

/** Zod schema for the character draft submitted by the UI. */

const Stat = z.number().int().min(15).max(99);

export const CharacterStats = z.object({
  str: Stat, con: Stat, siz: Stat, dex: Stat,
  app: Stat, int: Stat, pow: Stat, edu: Stat,
});
export type CharacterStats = z.infer<typeof CharacterStats>;

export const SkillAllocation = z.object({
  from_occupation: z.number().int().min(0).default(0),
  from_interest: z.number().int().min(0).default(0),
});
export type SkillAllocation = z.infer<typeof SkillAllocation>;

export const BackgroundEntries = z.object({
  ideology_beliefs: z.string().optional(),
  significant_people: z.string().optional(),
  meaningful_locations: z.string().optional(),
  treasured_possessions: z.string().optional(),
  traits: z.string().optional(),
  injuries_scars: z.string().optional(),
  phobias_manias: z.string().optional(),
  encounters_with_strange: z.string().optional(),
}).partial();
export type BackgroundEntries = z.infer<typeof BackgroundEntries>;

export const InventoryDraftItem = z.object({
  item: z.string().min(1),
  qty: z.number().int().min(1).default(1),
  notes: z.string().optional(),
});
export type InventoryDraftItem = z.infer<typeof InventoryDraftItem>;

export const CharacterDraft = z.object({
  name: z.string().min(1),
  era: z.string().default('1920s'),
  age: z.number().int().min(15).max(120),
  gender: z.string().optional(),
  residence: z.string().optional(),
  birthplace: z.string().optional(),

  occupation_key: z.string().min(1),

  /** Stats AFTER the player applies age modifiers and any other adjustments. */
  stats: CharacterStats,

  /** Pre-rolled Luck (3d6×5 = 15..90, usually). */
  luck: z.number().int().min(15).max(99),

  /** Skill point allocations. */
  skill_allocations: z.record(z.string(), SkillAllocation).default({}),

  background: BackgroundEntries.default({}),
  inventory: z.array(InventoryDraftItem).default([]),

  portrait_url: z.string().url().optional(),
});
export type CharacterDraft = z.infer<typeof CharacterDraft>;
