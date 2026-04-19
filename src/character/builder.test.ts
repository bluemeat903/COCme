import { describe, it, expect } from 'vitest';
import { buildInvestigator } from './builder.js';
import { computeDerived, agePenaltyFor } from './derived.js';
import { occupationSkillBudget, OCCUPATIONS_BY_KEY } from './occupations.js';

// A valid base draft we can mutate per-test.
function baseDraft() {
  return {
    name: '林夏',
    era: '1920s',
    age: 28,
    occupation_key: 'journalist',
    stats: { str: 50, con: 60, siz: 55, dex: 65, app: 60, int: 75, pow: 60, edu: 80 },
    luck: 55,
    skill_allocations: {},
    background: { ideology_beliefs: '真相高于一切' },
    inventory: [{ item: '怀表', qty: 1 }],
  };
}

describe('computeDerived', () => {
  it('HP = floor((SIZ+CON)/10)', () => {
    const d = computeDerived({ str: 50, con: 60, siz: 55, dex: 65, app: 50, int: 50, pow: 50, edu: 70 }, 28);
    expect(d.hp_max).toBe(11);
  });
  it('SAN starts at POW, cap 99', () => {
    const d = computeDerived({ str: 50, con: 50, siz: 50, dex: 50, app: 50, int: 50, pow: 65, edu: 70 }, 30);
    expect(d.san_start).toBe(65);
    expect(d.san_max).toBe(99);
  });
  it('MP = floor(POW/5)', () => {
    const d = computeDerived({ str: 50, con: 50, siz: 50, dex: 50, app: 50, int: 50, pow: 63, edu: 70 }, 30);
    expect(d.mp_max).toBe(12);
  });
  it('MOV: both STR and DEX below SIZ -> 7', () => {
    const d = computeDerived({ str: 40, con: 50, siz: 70, dex: 40, app: 50, int: 50, pow: 50, edu: 70 }, 30);
    expect(d.mov).toBe(7);
  });
  it('MOV: STR or DEX above SIZ -> 9', () => {
    const d = computeDerived({ str: 80, con: 50, siz: 60, dex: 50, app: 50, int: 50, pow: 50, edu: 70 }, 30);
    expect(d.mov).toBe(9);
  });
  it('MOV: age 60 subtracts 3', () => {
    const d = computeDerived({ str: 80, con: 50, siz: 60, dex: 50, app: 50, int: 50, pow: 50, edu: 70 }, 62);
    expect(d.mov).toBe(6);
  });
  it('DB/Build: STR+SIZ in 85-124 -> 0/0', () => {
    const d = computeDerived({ str: 50, con: 50, siz: 60, dex: 50, app: 50, int: 50, pow: 50, edu: 70 }, 28);
    expect(d.damage_bonus).toBe('0');
    expect(d.build).toBe(0);
  });
  it('DB/Build: 125-164 -> +1d4/+1', () => {
    const d = computeDerived({ str: 70, con: 50, siz: 70, dex: 50, app: 50, int: 50, pow: 50, edu: 70 }, 28);
    expect(d.damage_bonus).toBe('+1d4');
    expect(d.build).toBe(1);
  });
});

describe('agePenaltyFor', () => {
  it('20-39 band has no physical penalty', () => {
    const p = agePenaltyFor(28);
    expect(p.physical_penalty_total).toBe(0);
    expect(p.edu_improvement_checks).toBe(1);
  });
  it('60-69 band -> 20 physical, 15 APP, 4 EDU checks', () => {
    const p = agePenaltyFor(65);
    expect(p.physical_penalty_total).toBe(20);
    expect(p.app_penalty).toBe(15);
    expect(p.edu_improvement_checks).toBe(4);
  });
  it('throws for age out of range', () => {
    expect(() => agePenaltyFor(5)).toThrow();
    expect(() => agePenaltyFor(200)).toThrow();
  });
});

describe('buildInvestigator', () => {
  it('produces a full InvestigatorRow with derived stats', () => {
    const { investigator, warnings } = buildInvestigator(baseDraft(), { owner_id: 'u1' });
    expect(investigator.name).toBe('林夏');
    expect(investigator.occupation).toBe('记者');
    expect(investigator.hp_max).toBe(11); // (60+55)/10 = 11
    expect(investigator.san_start).toBe(60);
    expect(investigator.mp_max).toBe(12);
    expect(investigator.mov).toBe(9);     // DEX 65 > SIZ 55
    // budget not spent -> warnings
    expect(warnings.some(w => w.includes('occupation skill points'))).toBe(true);
    // known skills are materialized with bases
    expect(investigator.skills['侦查']).toEqual({ base: 25, value: 25 });
    expect(investigator.skills['母语']).toEqual({ base: 80, value: 80 });
    expect(investigator.skills['闪避']).toEqual({ base: 32, value: 32 });   // DEX 65 / 2
  });

  it('applies occupation + interest skill points within budget', () => {
    const draft = baseDraft();
    // journalist budget = EDU*4 = 320; 侦查 +50, 心理学 +40, 说服 +30 = 120 occupation
    // interest budget = INT*2 = 150; 急救 +20 (interest) = 20
    draft.skill_allocations = {
      '侦查':   { from_occupation: 50, from_interest: 0 },
      '心理学': { from_occupation: 40, from_interest: 0 },
      '说服':   { from_occupation: 30, from_interest: 0 },
      '急救':   { from_occupation: 0,  from_interest: 20 },
    };
    const { investigator, warnings } = buildInvestigator(draft, { owner_id: 'u1' });
    expect(investigator.skills['侦查']!.value).toBe(25 + 50);
    expect(investigator.skills['急救']!.value).toBe(30 + 20);
    // both budgets have remaining -> warnings present
    expect(warnings.some(w => w.includes('occupation'))).toBe(true);
    expect(warnings.some(w => w.includes('interest'))).toBe(true);
  });

  it('throws on overspent occupation points', () => {
    const draft = baseDraft();
    // journalist budget = EDU*4 = 320; try 400
    draft.skill_allocations = {
      '侦查':   { from_occupation: 70,  from_interest: 0 },
      '心理学': { from_occupation: 70,  from_interest: 0 },
      '说服':   { from_occupation: 70,  from_interest: 0 },
      '话术':   { from_occupation: 70,  from_interest: 0 },
      '图书馆使用': { from_occupation: 70, from_interest: 0 },
      '历史':   { from_occupation: 70,  from_interest: 0 },
    };
    expect(() => buildInvestigator(draft, { owner_id: 'u1' })).toThrow(/occupation skill points overspent/);
  });

  it('throws when allocating occupation points to a non-occupation skill', () => {
    const draft = baseDraft();
    // 斗殴 is NOT a journalist skill
    draft.skill_allocations = { '斗殴': { from_occupation: 30, from_interest: 0 } };
    expect(() => buildInvestigator(draft, { owner_id: 'u1' })).toThrow(/not an occupation skill/);
    // BUT allocating interest points to it is fine
    const legit = { ...baseDraft(), skill_allocations: { '斗殴': { from_occupation: 0, from_interest: 30 } } };
    expect(() => buildInvestigator(legit, { owner_id: 'u1' })).not.toThrow();
  });

  it('throws when a single skill exceeds 99', () => {
    const draft = baseDraft();
    draft.skill_allocations = { '侦查': { from_occupation: 80, from_interest: 0 } }; // 25 + 80 = 105
    expect(() => buildInvestigator(draft, { owner_id: 'u1' })).toThrow(/exceed 99/);
  });

  it('rejects unknown skill / occupation', () => {
    const bad1 = { ...baseDraft(), occupation_key: 'wizard' };
    expect(() => buildInvestigator(bad1, { owner_id: 'u1' })).toThrow(/unknown occupation/);

    const bad2 = { ...baseDraft(), skill_allocations: { '瑜伽': { from_occupation: 10, from_interest: 0 } } };
    expect(() => buildInvestigator(bad2, { owner_id: 'u1' })).toThrow(/unknown skill/);
  });

  it('cannot allocate to locked skills (克苏鲁神话)', () => {
    const draft = { ...baseDraft(), skill_allocations: { '克苏鲁神话': { from_occupation: 0, from_interest: 5 } } };
    expect(() => buildInvestigator(draft, { owner_id: 'u1' })).toThrow(/cannot be allocated/);
  });

  it('occupationSkillBudget formula uses listed factors', () => {
    const det = OCCUPATIONS_BY_KEY.get('detective')!;
    // EDU*2 + DEX*2
    const budget = occupationSkillBudget(det, { str: 50, con: 50, siz: 50, dex: 60, app: 50, int: 50, pow: 50, edu: 70 });
    expect(budget).toBe(70 * 2 + 60 * 2);
  });
});
