'use client';

import { useEffect, useMemo, useState } from 'react';
import type { InvestigatorSheet } from '@/engine/projection';
import { SKILLS_BY_KEY, SKILL_CATEGORY_LABEL, type SkillCategory } from '@/character/skills';

/**
 * Right-side sliding drawer that shows the investigator sheet.  Closed by
 * default: only a thin vertical "人物卡" tab is visible pinned to the right
 * edge.  Clicking the tab slides the full panel in; a semi-transparent
 * backdrop + ESC key close it.
 *
 * Kept independent from the main GameView grid so the narration column can
 * still use its full width even when the drawer is open.
 */
export function InvestigatorDrawer({ sheet }: { sheet: InvestigatorSheet }) {
  const [open, setOpen] = useState(false);
  const [hideBase, setHideBase] = useState(false);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const grouped = useMemo(() => {
    const out = new Map<SkillCategory, Array<{ key: string; base: number; value: number; used: boolean }>>();
    for (const [key, sk] of Object.entries(sheet.skills)) {
      if (hideBase && sk.value === sk.base && !sk.used_this_session) continue;
      const def = SKILLS_BY_KEY.get(key);
      const cat: SkillCategory = def?.category ?? 'special';
      const arr = out.get(cat) ?? [];
      arr.push({ key, base: sk.base, value: sk.value, used: sk.used_this_session });
      out.set(cat, arr);
    }
    for (const [, arr] of out) arr.sort((a, b) => b.value - a.value || a.key.localeCompare(b.key));
    return out;
  }, [sheet.skills, hideBase]);

  return (
    <>
      {/* Vertical tab when drawer is closed. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="打开人物卡"
        className={
          'fixed right-0 top-1/2 z-30 -translate-y-1/2 rounded-l border border-r-0 ' +
          'border-ink-700 bg-ink-900 px-2 py-4 text-sm tracking-widest ' +
          'hover:border-rust-500 hover:text-rust-500 ' +
          (open ? 'pointer-events-none opacity-0' : 'opacity-100')
        }
        style={{ writingMode: 'vertical-rl' as const }}
      >
        人物卡
      </button>

      {/* Backdrop */}
      <div
        onClick={() => setOpen(false)}
        className={
          'fixed inset-0 z-40 bg-black/40 transition-opacity duration-150 ' +
          (open ? 'opacity-100' : 'pointer-events-none opacity-0')
        }
        aria-hidden="true"
      />

      {/* Drawer */}
      <aside
        className={
          'fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col ' +
          'border-l border-ink-700 bg-ink-900 shadow-xl transition-transform duration-200 ease-out ' +
          (open ? 'translate-x-0' : 'translate-x-full')
        }
        role="dialog"
        aria-label="人物卡"
        aria-hidden={!open}
      >
        <header className="flex items-baseline justify-between border-b border-ink-800 px-4 py-3">
          <div>
            <h2 className="font-serif text-xl">{sheet.name}</h2>
            <p className="text-xs text-ink-400">
              {sheet.occupation ?? '无职业'}
              {sheet.age !== null ? ` · ${sheet.age} 岁` : ''} · {sheet.era}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded border border-ink-700 px-3 py-1 text-sm text-ink-300 hover:border-rust-500 hover:text-rust-500"
            aria-label="关闭人物卡"
          >
            关闭
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-4 text-sm">
            <Stats stats={sheet.stats} />
            <Derived d={sheet.derived} />
            <SkillList grouped={grouped} hideBase={hideBase} setHideBase={setHideBase} />
            <Inventory items={sheet.inventory} />
          </div>
        </div>

        <footer className="border-t border-ink-800 px-4 py-2 text-[11px] text-ink-500">
          按 Esc、点击遮罩、或"关闭"按钮收起
        </footer>
      </aside>
    </>
  );
}

function Stats({ stats }: { stats: InvestigatorSheet['stats'] }) {
  const entries: Array<[string, number]> = [
    ['STR', stats.str], ['CON', stats.con], ['SIZ', stats.siz], ['DEX', stats.dex],
    ['APP', stats.app], ['INT', stats.int], ['POW', stats.pow], ['EDU', stats.edu],
  ];
  return (
    <section>
      <SectionHeader>属性</SectionHeader>
      <div className="grid grid-cols-4 gap-1 text-center">
        {entries.map(([k, v]) => (
          <div key={k} className="rounded border border-ink-800 bg-ink-950 px-1 py-1">
            <div className="text-[10px] text-ink-500">{k}</div>
            <div className="font-serif text-base">{v}</div>
            <div className="text-[10px] text-ink-500">
              {Math.floor(v / 2)} / {Math.floor(v / 5)}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-1 text-[10px] text-ink-500">
        每格第三行：困难目标（½）/ 极限目标（⅕）
      </p>
    </section>
  );
}

function Derived({ d }: { d: InvestigatorSheet['derived'] }) {
  return (
    <section>
      <SectionHeader>派生</SectionHeader>
      <div className="grid grid-cols-3 gap-1 text-center">
        <Kv k="MOV" v={String(d.mov)} />
        <Kv k="DB" v={d.damage_bonus} />
        <Kv k="Build" v={String(d.build)} />
      </div>
    </section>
  );
}

function SkillList({
  grouped,
  hideBase,
  setHideBase,
}: {
  grouped: Map<SkillCategory, Array<{ key: string; base: number; value: number; used: boolean }>>;
  hideBase: boolean;
  setHideBase: (v: boolean) => void;
}) {
  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <SectionHeader inline>技能</SectionHeader>
        <label className="flex items-center gap-1 text-[11px] text-ink-400">
          <input
            type="checkbox"
            checked={hideBase}
            onChange={e => setHideBase(e.target.checked)}
            className="h-3 w-3 accent-rust-500"
          />
          只看练过的
        </label>
      </div>
      <div className="space-y-2">
        {[...grouped.entries()].map(([cat, skills]) => (
          <div key={cat}>
            <div className="mb-0.5 text-[10px] uppercase tracking-widest text-ink-500">
              {SKILL_CATEGORY_LABEL[cat]}
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
              {skills.map(s => (
                <div
                  key={s.key}
                  className={
                    'flex items-center justify-between border-l pl-1 ' +
                    (s.used ? 'border-rust-500 text-ink-100' : 'border-transparent text-ink-300')
                  }
                  title={s.value !== s.base ? `base ${s.base}` : '未分配加点'}
                >
                  <span className="truncate">{s.key}</span>
                  <span className="font-serif">
                    {s.value}
                    {s.used && <span className="ml-1 text-rust-500" aria-label="本局用过">★</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Inventory({ items }: { items: InvestigatorSheet['inventory'] }) {
  return (
    <section>
      <SectionHeader>物品</SectionHeader>
      {items.length === 0 ? (
        <p className="text-xs text-ink-500">（空）</p>
      ) : (
        <ul className="space-y-0.5 text-xs">
          {items.map((it, i) => (
            <li key={i} className="flex justify-between">
              <span>{it.item}</span>
              <span className="text-ink-400">
                ×{it.qty}
                {it.notes ? ` · ${it.notes}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded border border-ink-800 bg-ink-950 px-1 py-1">
      <div className="text-[10px] text-ink-500">{k}</div>
      <div className="font-serif text-base">{v}</div>
    </div>
  );
}

function SectionHeader({ children, inline = false }: { children: React.ReactNode; inline?: boolean }) {
  return (
    <h3 className={'font-serif text-ink-200 ' + (inline ? 'text-sm' : 'mb-1 text-sm')}>
      {children}
    </h3>
  );
}
