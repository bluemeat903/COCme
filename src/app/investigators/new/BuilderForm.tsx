'use client';

import { useMemo, useState } from 'react';
import {
  OCCUPATIONS,
  OCCUPATIONS_BY_KEY,
  occupationSkillBudget,
  type StatKey,
} from '@/character/occupations';
import {
  SKILLS,
  resolveSkillBase,
  SKILL_CATEGORY_LABEL,
  type SkillDef,
} from '@/character/skills';
import { createInvestigatorAction } from '../actions';

type Stats = Record<StatKey, number>;
type Alloc = Record<string, { from_occupation: number; from_interest: number }>;

const STAT_LABELS: Array<[StatKey, string]> = [
  ['str', 'STR 力量'],
  ['con', 'CON 体质'],
  ['siz', 'SIZ 体型'],
  ['dex', 'DEX 敏捷'],
  ['app', 'APP 外貌'],
  ['int', 'INT 智力'],
  ['pow', 'POW 意志'],
  ['edu', 'EDU 教育'],
];


export function BuilderForm() {
  const [name, setName] = useState('');
  const [age, setAge] = useState(28);
  const [era, setEra] = useState<'1920s' | 'modern'>('1920s');
  const [occupationKey, setOccupationKey] = useState(OCCUPATIONS[0]!.key);
  const [stats, setStats] = useState<Stats>({
    str: 50, con: 60, siz: 55, dex: 65, app: 60, int: 75, pow: 60, edu: 80,
  });
  const [luck, setLuck] = useState(55);
  const [bgIdeology, setBgIdeology] = useState('');
  const [bgPeople, setBgPeople] = useState('');
  const [bgTraits, setBgTraits] = useState('');
  const [alloc, setAlloc] = useState<Alloc>({});

  const occ = OCCUPATIONS_BY_KEY.get(occupationKey)!;
  const occBudget = useMemo(() => occupationSkillBudget(occ, stats), [occ, stats]);
  const interestBudget = stats.int * 2;

  const visibleSkills = useMemo(() => {
    const base = SKILLS.filter(s => !s.modern_only || era === 'modern');
    const byCat = new Map<SkillDef['category'], SkillDef[]>();
    for (const s of base) {
      const arr = byCat.get(s.category) ?? [];
      arr.push(s);
      byCat.set(s.category, arr);
    }
    return byCat;
  }, [era]);

  const { occUsed, interestUsed } = useMemo(() => {
    let o = 0, i = 0;
    for (const a of Object.values(alloc)) {
      o += a.from_occupation;
      i += a.from_interest;
    }
    return { occUsed: o, interestUsed: i };
  }, [alloc]);

  const occRemaining = occBudget - occUsed;
  const interestRemaining = interestBudget - interestUsed;
  const overOcc = occUsed > occBudget;
  const overInterest = interestUsed > interestBudget;

  function setAllocField(
    skillKey: string,
    field: 'from_occupation' | 'from_interest',
    raw: string,
  ) {
    const n = raw === '' ? 0 : Math.max(0, Math.min(99, Number(raw) || 0));
    setAlloc(prev => {
      const cur = prev[skillKey] ?? { from_occupation: 0, from_interest: 0 };
      const next = { ...cur, [field]: n };
      const out = { ...prev };
      if (next.from_occupation === 0 && next.from_interest === 0) {
        delete out[skillKey];
      } else {
        out[skillKey] = next;
      }
      return out;
    });
  }

  return (
    <form action={createInvestigatorAction} className="space-y-8">
      {/* hidden serialized allocations */}
      <input type="hidden" name="skill_allocations" value={JSON.stringify(alloc)} />
      <input type="hidden" name="era" value={era} />

      {/* 基础 */}
      <fieldset className="space-y-3">
        <legend className="font-serif text-lg">基础</legend>
        <Row label="姓名">
          <Input name="name" required value={name} onChange={e => setName(e.target.value)} placeholder="林夏" />
        </Row>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Row label="年龄">
            <Input
              name="age"
              type="number"
              min={15}
              max={120}
              required
              value={age}
              onChange={e => setAge(Number(e.target.value) || 0)}
            />
          </Row>
          <Row label="时代">
            <Select value={era} onChange={e => setEra(e.target.value as 'modern' | '1920s')}>
              <option value="1920s">1920s 经典</option>
              <option value="modern">现代</option>
            </Select>
          </Row>
          <Row label="职业">
            <Select
              name="occupation_key"
              required
              value={occupationKey}
              onChange={e => setOccupationKey(e.target.value)}
            >
              {OCCUPATIONS.map(o => (
                <option key={o.key} value={o.key}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Row>
        </div>
        <p className="text-xs text-ink-400">{occ.description}</p>
      </fieldset>

      {/* 属性 */}
      <fieldset className="space-y-3">
        <legend className="font-serif text-lg">属性 (15 – 99)</legend>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {STAT_LABELS.map(([k, label]) => (
            <Row key={k} label={label}>
              <Input
                name={`stat_${k}`}
                type="number"
                min={15}
                max={99}
                required
                value={stats[k]}
                onChange={e =>
                  setStats(s => ({ ...s, [k]: Math.max(15, Math.min(99, Number(e.target.value) || 0)) }))
                }
              />
            </Row>
          ))}
        </div>
        <Row label="Luck 幸运 (15 – 99)">
          <Input
            name="luck"
            type="number"
            min={15}
            max={99}
            required
            value={luck}
            onChange={e => setLuck(Number(e.target.value) || 0)}
          />
        </Row>
      </fieldset>

      {/* 技能点预算 */}
      <fieldset className="space-y-3">
        <legend className="font-serif text-lg">技能分配</legend>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Budget
            label={`职业点 (${occ.name})`}
            used={occUsed}
            total={occBudget}
            over={overOcc}
          />
          <Budget
            label="兴趣点 (INT × 2)"
            used={interestUsed}
            total={interestBudget}
            over={overInterest}
          />
        </div>
        <p className="text-xs text-ink-400">
          职业点只能投在 <span className="text-ink-200">��职业的技能</span> 上（下方标注）；
          兴趣点任意技能。单项技能总值 ≤ 99。克苏鲁神话不可分配。
        </p>

        <div className="space-y-5">
          {[...visibleSkills.entries()].map(([cat, list]) => (
            <div key={cat}>
              <h3 className="mb-2 font-serif text-sm text-ink-300">{SKILL_CATEGORY_LABEL[cat]}</h3>
              <div className="grid gap-2">
                {list.map(s => (
                  <SkillRow
                    key={s.key}
                    def={s}
                    stats={stats}
                    occupationSkills={occ.occupation_skills}
                    alloc={alloc[s.key]}
                    onChange={(field, v) => setAllocField(s.key, field, v)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </fieldset>

      {/* 背景 */}
      <fieldset className="space-y-3">
        <legend className="font-serif text-lg">背景（可选）</legend>
        <Row label="信念 / 意识形态">
          <TextArea name="bg_ideology" value={bgIdeology} onChange={e => setBgIdeology(e.target.value)} />
        </Row>
        <Row label="重要之人">
          <TextArea name="bg_people" value={bgPeople} onChange={e => setBgPeople(e.target.value)} />
        </Row>
        <Row label="特质">
          <TextArea name="bg_traits" value={bgTraits} onChange={e => setBgTraits(e.target.value)} />
        </Row>
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={overOcc || overInterest}
          className="rounded border border-rust-600 bg-rust-700/60 px-5 py-2 hover:bg-rust-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          生成调查员
        </button>
        {(overOcc || overInterest) && (
          <span className="text-sm text-rust-500">有预算超支，请先调整。</span>
        )}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SkillRow({
  def,
  stats,
  occupationSkills,
  alloc,
  onChange,
}: {
  def: SkillDef;
  stats: Stats;
  occupationSkills: string[];
  alloc: { from_occupation: number; from_interest: number } | undefined;
  onChange: (field: 'from_occupation' | 'from_interest', v: string) => void;
}) {
  const base = resolveSkillBase(def, stats);
  const occ = alloc?.from_occupation ?? 0;
  const intr = alloc?.from_interest ?? 0;
  const value = base + occ + intr;
  const isOccSkill = occupationSkills.includes(def.key);
  const locked = def.locked;
  const overflow = value > 99;

  return (
    <div
      className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 rounded border px-3 py-2 text-sm ${
        overflow ? 'border-rust-500 bg-rust-700/10' : 'border-ink-800 bg-ink-900'
      }`}
    >
      <div>
        <span className="font-serif">{def.key}</span>
        {isOccSkill && <span className="ml-2 text-xs text-rust-500">◆ 职业</span>}
        {locked && <span className="ml-2 text-xs text-ink-500">（不可分配）</span>}
        <span className="ml-2 text-xs text-ink-500">base {base}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-ink-400">职业</span>
        <input
          type="number"
          min={0}
          max={99}
          value={occ || ''}
          disabled={locked || !isOccSkill}
          onChange={e => onChange('from_occupation', e.target.value)}
          className="w-14 rounded border border-ink-700 bg-ink-950 px-2 py-1 text-center outline-none focus:border-rust-500 disabled:opacity-40"
        />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-xs text-ink-400">兴趣</span>
        <input
          type="number"
          min={0}
          max={99}
          value={intr || ''}
          disabled={locked}
          onChange={e => onChange('from_interest', e.target.value)}
          className="w-14 rounded border border-ink-700 bg-ink-950 px-2 py-1 text-center outline-none focus:border-rust-500 disabled:opacity-40"
        />
      </div>
      <div className="w-14 text-right font-serif">
        {value}
        {overflow && <span className="ml-1 text-xs text-rust-500">!</span>}
      </div>
    </div>
  );
}

function Budget({
  label,
  used,
  total,
  over,
}: {
  label: string;
  used: number;
  total: number;
  over: boolean;
}) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div
      className={`rounded border px-3 py-2 ${
        over ? 'border-rust-500 bg-rust-700/20' : 'border-ink-700 bg-ink-900'
      }`}
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-ink-300">{label}</span>
        <span className="font-serif">
          {used} / {total}
          {over && <span className="ml-1 text-rust-500">超支</span>}
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded bg-ink-800">
        <div
          className={over ? 'h-full bg-rust-500' : 'h-full bg-ink-500'}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny presentation helpers
// ---------------------------------------------------------------------------

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-ink-200">{label}</span>
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 outline-none focus:border-rust-500"
    />
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 outline-none focus:border-rust-500"
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={2}
      {...props}
      className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 outline-none focus:border-rust-500"
    />
  );
}
