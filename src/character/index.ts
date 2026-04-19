export {
  SKILLS,
  SKILLS_BY_KEY,
  SKILL_CATEGORY_LABEL,
  resolveSkillBase,
  type SkillDef,
  type SkillCategory,
} from './skills.js';
export {
  OCCUPATIONS,
  OCCUPATIONS_BY_KEY,
  occupationSkillBudget,
  type OccupationTemplate,
  type StatKey,
} from './occupations.js';
export {
  computeDerived,
  agePenaltyFor,
  AGE_BANDS,
  type DerivedStats,
  type AgePenalty,
  type Stats,
} from './derived.js';
export {
  CharacterDraft,
  CharacterStats,
  SkillAllocation,
  BackgroundEntries,
  InventoryDraftItem,
} from './schema.js';
export {
  buildInvestigator,
  type BuildInvestigatorOptions,
  type BuildInvestigatorResult,
} from './builder.js';
export { investigatorToSnapshot, snapshotToRuntime } from './snapshot.js';
