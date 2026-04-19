import { randomUUID } from 'node:crypto';
import type { InvestigatorRow } from '../db/types.js';
import { computeDerived } from './derived.js';
import { OCCUPATIONS_BY_KEY, occupationSkillBudget, type StatKey } from './occupations.js';
import type { CharacterDraft } from './schema.js';
import { CharacterDraft as CharacterDraftSchema } from './schema.js';
import { SKILLS_BY_KEY, resolveSkillBase } from './skills.js';

// ---------------------------------------------------------------------------
// buildInvestigator: takes a CharacterDraft, applies BRP rules, returns a
// complete InvestigatorRow plus any soft warnings.  Throws on HARD rule
// violations (budget overruns, unknown skill, skill > 99).
// ---------------------------------------------------------------------------

export interface BuildInvestigatorOptions {
  owner_id: string;
  /** If provided, used as the new investigator's id; else generated. */
  investigator_id?: string;
}

export interface BuildInvestigatorResult {
  investigator: InvestigatorRow;
  /** Non-fatal issues worth surfacing in the UI (unused points, etc.). */
  warnings: string[];
}

export function buildInvestigator(
  rawDraft: unknown,
  opts: BuildInvestigatorOptions,
): BuildInvestigatorResult {
  const parsed = CharacterDraftSchema.safeParse(rawDraft);
  if (!parsed.success) {
    throw new Error(`invalid CharacterDraft: ${parsed.error.message}`);
  }
  const draft: CharacterDraft = parsed.data;

  const occ = OCCUPATIONS_BY_KEY.get(draft.occupation_key);
  if (!occ) throw new Error(`unknown occupation: ${draft.occupation_key}`);

  const warnings: string[] = [];

  // --- budgets -----------------------------------------------------------
  const statsRecord = draft.stats as Record<StatKey, number>;
  const occBudget = occupationSkillBudget(occ, statsRecord);
  const interestBudget = draft.stats.int * 2;

  let occUsed = 0;
  let interestUsed = 0;

  const allocatedSkills: Record<string, { base: number; value: number }> = {};

  // --- materialize every known skill with its base value -----------------
  for (const [key, def] of SKILLS_BY_KEY.entries()) {
    if (def.modern_only && draft.era !== 'modern') continue;
    const base = resolveSkillBase(def, draft.stats);
    allocatedSkills[key] = { base, value: base };
  }

  // --- apply allocations --------------------------------------------------
  for (const [skillKey, alloc] of Object.entries(draft.skill_allocations)) {
    const def = SKILLS_BY_KEY.get(skillKey);
    if (!def) throw new Error(`unknown skill: "${skillKey}"`);
    if (def.locked) throw new Error(`skill "${skillKey}" cannot be allocated to at character creation`);

    if (alloc.from_occupation > 0 && !occ.occupation_skills.includes(skillKey)) {
      throw new Error(`skill "${skillKey}" is not an occupation skill for ${occ.name}`);
    }

    occUsed += alloc.from_occupation;
    interestUsed += alloc.from_interest;

    const existing = allocatedSkills[skillKey]!;
    const total = existing.value + alloc.from_occupation + alloc.from_interest;
    if (total > 99) {
      throw new Error(`skill "${skillKey}" would exceed 99 (= ${total})`);
    }
    allocatedSkills[skillKey] = { base: existing.base, value: total };
  }

  if (occUsed > occBudget) {
    throw new Error(`occupation skill points overspent: used ${occUsed}, budget ${occBudget}`);
  }
  if (interestUsed > interestBudget) {
    throw new Error(`interest skill points overspent: used ${interestUsed}, budget ${interestBudget}`);
  }

  if (occUsed < occBudget) {
    warnings.push(`unused occupation skill points: ${occBudget - occUsed}`);
  }
  if (interestUsed < interestBudget) {
    warnings.push(`unused interest skill points: ${interestBudget - interestUsed}`);
  }

  // --- Credit Rating bound check -----------------------------------------
  const cr = allocatedSkills['信用评级'];
  if (cr && (cr.value < occ.credit_rating.min || cr.value > occ.credit_rating.max)) {
    warnings.push(
      `信用评级 (${cr.value}) outside ${occ.name} range ${occ.credit_rating.min}-${occ.credit_rating.max}`,
    );
  }

  // --- derived stats ------------------------------------------------------
  const derived = computeDerived(draft.stats, draft.age);

  // --- build the InvestigatorRow ------------------------------------------
  const now = new Date().toISOString();
  const inv: InvestigatorRow = {
    id: opts.investigator_id ?? randomUUID(),
    owner_id: opts.owner_id,
    name: draft.name,
    era: draft.era,
    occupation: occ.name,
    age: draft.age,
    gender: draft.gender ?? null,
    residence: draft.residence ?? null,
    birthplace: draft.birthplace ?? null,
    stat_str: draft.stats.str,
    stat_con: draft.stats.con,
    stat_siz: draft.stats.siz,
    stat_dex: draft.stats.dex,
    stat_app: draft.stats.app,
    stat_int: draft.stats.int,
    stat_pow: draft.stats.pow,
    stat_edu: draft.stats.edu,
    luck: draft.luck,
    hp_max: derived.hp_max,
    hp_current: derived.hp_max,
    mp_max: derived.mp_max,
    mp_current: derived.mp_max,
    san_max: derived.san_max,
    san_start: derived.san_start,
    san_current: derived.san_start,
    mov: derived.mov,
    damage_bonus: derived.damage_bonus,
    build: derived.build,
    skills: allocatedSkills,
    inventory: draft.inventory.map(i => {
      const base: { item: string; qty: number; notes?: string } = { item: i.item, qty: i.qty };
      if (i.notes !== undefined) base.notes = i.notes;
      return base;
    }),
    background: draft.background as Record<string, unknown>,
    portrait_url: draft.portrait_url ?? null,
    is_archived: false,
    created_at: now,
    updated_at: now,
  };

  return { investigator: inv, warnings };
}
