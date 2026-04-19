/**
 * BRP / CoC-compatible skill bases.  Chinese labels used as the canonical key
 * (matches fixture investigator and KP prompts).
 *
 * "base" is the starting value before any points are allocated.  Bases that
 * depend on stats (闪避 = DEX/2, 母语 = EDU) are produced by functions and
 * computed by the builder.
 */

/** Chinese labels for each skill category.  Used by both the builder form and the detail page. */
export const SKILL_CATEGORY_LABEL = {
  investigation: '调查',
  interpersonal: '人际',
  physical: '身体',
  combat: '战斗',
  knowledge: '知识',
  technical: '技术',
  language: '语言',
  special: '特殊',
} as const satisfies Record<SkillCategory, string>;

export type SkillCategory =
  | 'investigation'
  | 'interpersonal'
  | 'physical'
  | 'combat'
  | 'knowledge'
  | 'technical'
  | 'language'
  | 'special';

export type StaticSkillBase = number;
export type DynamicSkillBase = (stats: {
  str: number; con: number; siz: number; dex: number;
  app: number; int: number; pow: number; edu: number;
}) => number;

export interface SkillDef {
  /** Chinese display/key name. */
  key: string;
  /** English hint, optional, for reference. */
  en?: string;
  /** Category useful for UI grouping. */
  category: SkillCategory;
  base: StaticSkillBase | DynamicSkillBase;
  /** Modern-era only; 1920s starters should skip it. */
  modern_only?: boolean;
  /** True for obvious non-player skills (克苏鲁神话 starts at 0, never allocable pre-game). */
  locked?: boolean;
}

export const SKILLS: SkillDef[] = [
  // investigation
  { key: '侦查',     en: 'Spot Hidden',     category: 'investigation', base: 25 },
  { key: '聆听',     en: 'Listen',          category: 'investigation', base: 20 },
  { key: '追踪',     en: 'Track',           category: 'investigation', base: 10 },
  { key: '图书馆使用', en: 'Library Use',   category: 'investigation', base: 20 },
  { key: '导航',     en: 'Navigate',        category: 'investigation', base: 10 },

  // interpersonal
  { key: '话术',     en: 'Fast Talk',       category: 'interpersonal', base: 5 },
  { key: '说服',     en: 'Persuade',        category: 'interpersonal', base: 10 },
  { key: '恐吓',     en: 'Intimidate',      category: 'interpersonal', base: 15 },
  { key: '心理学',   en: 'Psychology',      category: 'interpersonal', base: 10 },
  { key: '信用评级', en: 'Credit Rating',   category: 'interpersonal', base: 0 },

  // physical
  { key: '闪避',     en: 'Dodge',           category: 'physical', base: (s) => Math.floor(s.dex / 2) },
  { key: '攀爬',     en: 'Climb',           category: 'physical', base: 20 },
  { key: '跳跃',     en: 'Jump',            category: 'physical', base: 20 },
  { key: '游泳',     en: 'Swim',            category: 'physical', base: 20 },
  { key: '潜行',     en: 'Stealth',         category: 'physical', base: 20 },
  { key: '投掷',     en: 'Throw',           category: 'physical', base: 20 },

  // combat
  { key: '斗殴',     en: 'Fighting (Brawl)', category: 'combat', base: 25 },
  { key: '手枪',     en: 'Firearms (Handgun)', category: 'combat', base: 20 },
  { key: '步枪',     en: 'Firearms (Rifle)',   category: 'combat', base: 25 },

  // knowledge
  { key: '历史',     en: 'History',         category: 'knowledge', base: 5 },
  { key: '考古学',   en: 'Archaeology',     category: 'knowledge', base: 1 },
  { key: '神秘学',   en: 'Occult',          category: 'knowledge', base: 5 },
  { key: '医学',     en: 'Medicine',        category: 'knowledge', base: 1 },
  { key: '急救',     en: 'First Aid',       category: 'knowledge', base: 30 },
  { key: '法律',     en: 'Law',             category: 'knowledge', base: 5 },
  { key: '会计',     en: 'Accounting',      category: 'knowledge', base: 5 },
  { key: '自然',     en: 'Natural World',   category: 'knowledge', base: 10 },
  { key: '科学',     en: 'Science',         category: 'knowledge', base: 1 },

  // technical
  { key: '汽车驾驶', en: 'Drive Auto',      category: 'technical', base: 20 },
  { key: '机械维修', en: 'Mechanical Repair', category: 'technical', base: 10 },
  { key: '锁匠',     en: 'Locksmith',       category: 'technical', base: 1 },
  { key: '乔装',     en: 'Disguise',        category: 'technical', base: 5 },
  { key: '妙手',     en: 'Sleight of Hand', category: 'technical', base: 10 },
  { key: '计算机使用', en: 'Computer Use',  category: 'technical', base: 5, modern_only: true },

  // language
  { key: '母语',     en: 'Language (Own)',  category: 'language', base: (s) => s.edu },
  { key: '其他语言', en: 'Language (Other)', category: 'language', base: 1 },

  // special / locked
  { key: '克苏鲁神话', en: 'Cthulhu Mythos', category: 'special', base: 0, locked: true },
];

export const SKILLS_BY_KEY: Map<string, SkillDef> = new Map(SKILLS.map(s => [s.key, s]));

export function resolveSkillBase(def: SkillDef, stats: Parameters<DynamicSkillBase>[0]): number {
  return typeof def.base === 'function' ? def.base(stats) : def.base;
}
