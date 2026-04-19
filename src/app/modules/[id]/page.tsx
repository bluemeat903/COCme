import Link from 'next/link';
import { notFound } from 'next/navigation';
import { archiveModuleAction } from '../actions';
import { Card } from '@/app/_components/Card';
import { requireUser } from '@/lib/auth';
import { LocalDB } from '@/lib/localdb/db';

export const dynamic = 'force-dynamic';

export default async function ModuleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();
  const db = await LocalDB.get();
  const row = db.modules.find(m => m.id === id && (m.owner_id === user.id || m.is_public));
  if (!row) notFound();
  const c = row.content;
  const chunkCount = db.module_chunks.filter(ch => ch.module_id === id).length;

  return (
    <section className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-2xl">{row.title}</h1>
          <p className="mt-1 text-sm text-ink-400">
            {c.meta.era} · {row.source_kind} · {row.tags.length > 0 ? row.tags.map(t => `#${t}`).join(' ') : ''}
          </p>
        </div>
        <Link href="/modules" className="text-sm text-ink-300 hover:text-rust-500">
          ← 返回列表
        </Link>
      </div>

      {c.meta.warnings.length > 0 && (
        <div className="rounded border border-rust-600/60 bg-rust-700/10 p-3 text-sm">
          <p className="mb-1 font-serif">注意</p>
          <ul className="list-disc pl-5 text-ink-200">
            {c.meta.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          <Card title="前情">
            <p className="whitespace-pre-wrap leading-relaxed text-ink-100">{c.premise}</p>
          </Card>

          {c.locations.length > 0 && (
            <Card title={`地点 (${c.locations.length})`}>
              <ul className="space-y-4">
                {c.locations.map(loc => (
                  <li key={loc.key} className="rounded border border-ink-800 bg-ink-950 p-3">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-serif">{loc.name}</h3>
                      <code className="text-xs text-ink-500">{loc.key}</code>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink-200">{loc.description}</p>
                    {loc.features.length > 0 && (
                      <ul className="mt-2 list-disc pl-5 text-xs text-ink-400">
                        {loc.features.map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {c.npcs.length > 0 && (
            <Card title={`NPC (${c.npcs.length})`}>
              <ul className="space-y-4">
                {c.npcs.map(n => (
                  <li key={n.key} className="rounded border border-ink-800 bg-ink-950 p-3">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-serif">{n.name}</h3>
                      <code className="text-xs text-ink-500">{n.key}</code>
                    </div>
                    <p className="mt-1 text-sm text-ink-300">{n.role}</p>
                    {n.motivations.length > 0 && (
                      <KV k="动机" v={n.motivations} />
                    )}
                    {n.secrets.length > 0 && (
                      <KV k="秘密" v={n.secrets} />
                    )}
                    {n.stats && (
                      <p className="mt-2 text-xs text-ink-400">
                        数据：{JSON.stringify(n.stats)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {c.clues.length > 0 && (
            <Card title={`线索 (${c.clues.length})`}>
              <ul className="space-y-3">
                {c.clues.map(clue => (
                  <li key={clue.key} className="rounded border border-ink-800 bg-ink-950 p-3">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-serif text-sm">{clue.name}</h3>
                      <code className="text-xs text-ink-500">{clue.key}</code>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink-200">{clue.text}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink-400">
                      {clue.found_at.length > 0 && (
                        <span>出现于：{clue.found_at.map(x => <code key={x} className="mx-1">{x}</code>)}</span>
                      )}
                      {clue.requires_check && (
                        <span>
                          需检定：{clue.requires_check.skill} ({clue.requires_check.difficulty})
                        </span>
                      )}
                      {clue.reveals.length > 0 && (
                        <span>引出：{clue.reveals.map(x => <code key={x} className="mx-1">{x}</code>)}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {c.scene_nodes.length > 0 && (
            <Card title={`场景 (${c.scene_nodes.length})`}>
              <ol className="space-y-3">
                {c.scene_nodes.map(s => (
                  <li key={s.id} className="rounded border border-ink-800 bg-ink-950 p-3">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-serif">{s.title}</h3>
                      <code className="text-xs text-ink-500">{s.id}</code>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink-200">{s.setup}</p>
                    {s.on_enter.length > 0 && (
                      <KV k="入场触发" v={s.on_enter} />
                    )}
                    {s.transitions.length > 0 && (
                      <p className="mt-2 text-xs text-ink-400">
                        转场：
                        {s.transitions.map((tr, i) => (
                          <span key={i} className="ml-2">
                            → <code>{tr.to}</code>
                            {tr.condition && <span className="ml-1 text-ink-500">({tr.condition})</span>}
                          </span>
                        ))}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {c.encounters.length > 0 && (
            <Card title={`遭遇 (${c.encounters.length})`}>
              <ul className="space-y-3">
                {c.encounters.map(enc => (
                  <li key={enc.key} className="rounded border border-ink-800 bg-ink-950 p-3">
                    <div className="flex items-baseline justify-between">
                      <h3 className="font-serif text-sm">{enc.key}</h3>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink-200">{enc.description}</p>
                    {enc.opponents.length > 0 && (
                      <ul className="mt-2 text-xs text-ink-400">
                        {enc.opponents.map((o, i) => (
                          <li key={i}>
                            {o.name} · HP {o.hp}
                            {o.npc_key && <code className="ml-2">{o.npc_key}</code>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title={`结局 (${c.ending_conditions.length})`}>
            <ul className="space-y-2">
              {c.ending_conditions.map(end => (
                <li key={end.key} className="rounded border border-ink-800 bg-ink-950 p-3 text-sm">
                  <div className="flex items-baseline justify-between">
                    <h3 className="font-serif">{end.label}</h3>
                    <code className="text-xs text-ink-500">{end.key}</code>
                  </div>
                  {end.requires.length > 0 && <KV k="要求" v={end.requires} />}
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <aside className="space-y-3">
          <Link
            href={`/sessions/new?module_id=${row.id}`}
            className="block rounded border border-rust-600 bg-rust-700/50 px-4 py-2 text-center text-sm hover:bg-rust-600"
          >
            用这个模组开局
          </Link>
          <form action={archiveModuleAction}>
            <input type="hidden" name="id" value={row.id} />
            <button
              type="submit"
              className="w-full rounded border border-ink-700 bg-ink-900 py-2 text-center text-sm text-ink-300 hover:border-rust-500 hover:text-rust-500"
            >
              归档
            </button>
          </form>
          <div className="rounded border border-ink-700 bg-ink-900 p-3 text-xs text-ink-400">
            <p>来源：{row.source_kind}</p>
            <p>模组 ID：<code>{row.id.slice(0, 8)}…</code></p>
            <p>分片数：{chunkCount ?? 0}</p>
            <p>创建：{new Date(row.created_at).toLocaleString('zh-CN')}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}


function KV({ k, v }: { k: string; v: string[] }) {
  return (
    <div className="mt-2 text-xs">
      <span className="text-ink-400">{k}：</span>
      <ul className="list-disc pl-5 text-ink-200">
        {v.map((s, i) => <li key={i}>{s}</li>)}
      </ul>
    </div>
  );
}
