import Link from 'next/link';
import { notFound } from 'next/navigation';
import { archiveInvestigatorAction } from '../actions';
import { SKILLS_BY_KEY, SKILL_CATEGORY_LABEL, type SkillDef } from '@/character/skills';
import { Card } from '@/app/_components/Card';
import { requireUser } from '@/lib/auth';
import { LocalDB } from '@/lib/localdb/db';

export const dynamic = 'force-dynamic';

export default async function InvestigatorDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const db = await LocalDB.get();
  const inv = db.investigators.find(i => i.id === id && i.owner_id === user.id);
  if (!inv) notFound();

  // Group the investigator's skills by SkillDef category (fall back to 'special').
  const grouped = new Map<SkillDef['category'], Array<{ key: string; base: number; value: number }>>();
  for (const [key, { base, value }] of Object.entries(inv.skills)) {
    const def = SKILLS_BY_KEY.get(key);
    const cat: SkillDef['category'] = def?.category ?? 'special';
    const arr = grouped.get(cat) ?? [];
    arr.push({ key, base, value });
    grouped.set(cat, arr);
  }

  return (
    <section className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-2xl">
          {inv.name}
          <span className="ml-3 text-sm text-ink-400">{inv.occupation} · {inv.age} 岁 · {inv.era}</span>
        </h1>
        <Link href="/investigators" className="text-sm text-ink-300 hover:text-rust-500">
          ← 返回列表
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          <Card title="属性">
            <div className="grid grid-cols-4 gap-2 text-center text-sm">
              <StatBox label="STR" value={inv.stat_str} />
              <StatBox label="CON" value={inv.stat_con} />
              <StatBox label="SIZ" value={inv.stat_siz} />
              <StatBox label="DEX" value={inv.stat_dex} />
              <StatBox label="APP" value={inv.stat_app} />
              <StatBox label="INT" value={inv.stat_int} />
              <StatBox label="POW" value={inv.stat_pow} />
              <StatBox label="EDU" value={inv.stat_edu} />
            </div>
          </Card>

          <Card title="派生值">
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <StatBox label="HP" value={`${inv.hp_current}/${inv.hp_max}`} />
              <StatBox label="MP" value={`${inv.mp_current}/${inv.mp_max}`} />
              <StatBox label="SAN" value={`${inv.san_current}/${inv.san_max}`} />
              <StatBox label="Luck" value={inv.luck} />
              <StatBox label="MOV" value={inv.mov} />
              <StatBox label="DB" value={inv.damage_bonus} />
              <StatBox label="Build" value={inv.build} />
            </div>
          </Card>

          <Card title="技能">
            <div className="space-y-4">
              {[...grouped.entries()].map(([cat, skills]) => (
                <div key={cat}>
                  <h3 className="mb-1 font-serif text-sm text-ink-300">{SKILL_CATEGORY_LABEL[cat]}</h3>
                  <div className="grid gap-1 md:grid-cols-2">
                    {skills
                      .sort((a, b) => b.value - a.value)
                      .map(s => (
                        <div
                          key={s.key}
                          className="flex items-center justify-between rounded border border-ink-800 bg-ink-950 px-3 py-1 text-sm"
                        >
                          <span>{s.key}</span>
                          <span className="font-serif">
                            <span className={s.value === s.base ? 'text-ink-400' : ''}>{s.value}</span>
                            {s.value !== s.base && (
                              <span className="ml-2 text-xs text-ink-500">(base {s.base})</span>
                            )}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {inv.inventory.length > 0 && (
            <Card title="物品">
              <ul className="space-y-1 text-sm">
                {inv.inventory.map((it, i) => (
                  <li key={i} className="flex justify-between">
                    <span>{it.item}</span>
                    <span className="text-ink-400">
                      ×{it.qty}
                      {it.notes ? ` · ${it.notes}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {inv.background && Object.keys(inv.background).length > 0 && (
            <Card title="背景">
              <dl className="space-y-2 text-sm">
                {Object.entries(inv.background).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-ink-400">{labelBackground(k)}</dt>
                    <dd className="whitespace-pre-wrap text-ink-100">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
        </div>

        <aside className="space-y-3">
          <Link
            href={`/sessions/new?investigator_id=${inv.id}`}
            className="block rounded border border-rust-600 bg-rust-700/50 px-4 py-2 text-center text-sm hover:bg-rust-600"
          >
            用这张卡开局
          </Link>
          <form action={archiveInvestigatorAction}>
            <input type="hidden" name="id" value={inv.id} />
            <button
              type="submit"
              className="w-full rounded border border-ink-700 bg-ink-900 py-2 text-center text-sm text-ink-300 hover:border-rust-500 hover:text-rust-500"
            >
              归档
            </button>
          </form>
          <div className="rounded border border-ink-700 bg-ink-900 p-3 text-xs text-ink-400">
            <p>创建：{new Date(inv.created_at).toLocaleString('zh-CN')}</p>
            <p>更新：{new Date(inv.updated_at).toLocaleString('zh-CN')}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}


function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-ink-800 bg-ink-950 px-2 py-1">
      <div className="text-xs text-ink-400">{label}</div>
      <div className="font-serif text-lg">{value}</div>
    </div>
  );
}

function labelBackground(key: string): string {
  switch (key) {
    case 'ideology_beliefs': return '信念 / 意识形态';
    case 'significant_people': return '重要之人';
    case 'meaningful_locations': return '意义地点';
    case 'treasured_possessions': return '珍视之物';
    case 'traits': return '特质';
    case 'injuries_scars': return '伤痕';
    case 'phobias_manias': return '恐惧症 / 狂躁症';
    case 'encounters_with_strange': return '奇异际遇';
    default: return key;
  }
}
