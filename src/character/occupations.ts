/**
 * Occupation templates.  Each occupation:
 *   - computes the skill-point budget from stats (most commonly EDU*N + STAT*N)
 *   - lists the skills eligible for occupation points
 *   - may grant a starting Credit Rating range
 *
 * Three MVP occupations.  Add more by appending to OCCUPATIONS.
 */

export type StatKey = 'str' | 'con' | 'siz' | 'dex' | 'app' | 'int' | 'pow' | 'edu';

export interface OccupationTemplate {
  key: string;
  name: string;
  /** Skill-point budget formula, e.g. EDU*4 + STR*2. */
  skill_points: { factors: Array<{ stat: StatKey; mult: number }> };
  /**
   * Which skills the occupation points can be spent on.
   * UIs can show this list and constrain allocations.
   */
  occupation_skills: string[];
  /** Optional: Credit Rating inclusive range. */
  credit_rating: { min: number; max: number };
  /** Short flavor blurb. */
  description: string;
}

export const OCCUPATIONS: OccupationTemplate[] = [
  {
    key: 'journalist',
    name: '记者',
    skill_points: { factors: [{ stat: 'edu', mult: 4 }] },
    occupation_skills: [
      '图书馆使用',
      '话术',
      '说服',
      '心理学',
      '侦查',
      '历史',
      '母语',
      '其他语言',
    ],
    credit_rating: { min: 9, max: 30 },
    description: '靠笔杆吃饭，追新闻也追真相。',
  },
  {
    key: 'scholar',
    name: '学者',
    skill_points: { factors: [{ stat: 'edu', mult: 4 }] },
    occupation_skills: [
      '图书馆使用',
      '历史',
      '考古学',
      '神秘学',
      '其他语言',
      '母语',
      '科学',
      '自然',
    ],
    credit_rating: { min: 9, max: 40 },
    description: '学院里的隐士，知识是他的武器与枷锁。',
  },
  {
    key: 'detective',
    name: '警探',
    skill_points: { factors: [{ stat: 'edu', mult: 2 }, { stat: 'dex', mult: 2 }] },
    occupation_skills: [
      '侦查',
      '聆听',
      '心理学',
      '说服',
      '恐吓',
      '法律',
      '手枪',
      '斗殴',
      '汽车驾驶',
      '急救',
    ],
    credit_rating: { min: 20, max: 50 },
    description: '在规矩和街头之间穿行，习惯了看到最坏的那一面。',
  },
];

export const OCCUPATIONS_BY_KEY: Map<string, OccupationTemplate> = new Map(
  OCCUPATIONS.map(o => [o.key, o]),
);

export function occupationSkillBudget(
  occ: OccupationTemplate,
  stats: Record<StatKey, number>,
): number {
  return occ.skill_points.factors.reduce((sum, f) => sum + f.mult * stats[f.stat], 0);
}
