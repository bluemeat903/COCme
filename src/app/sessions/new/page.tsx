import Link from 'next/link';
import { createSessionAction } from '../actions';
import { requireUser } from '@/lib/auth';
import { LocalDB } from '@/lib/localdb/db';

export const dynamic = 'force-dynamic';

export default async function NewSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; investigator_id?: string; module_id?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const db = await LocalDB.get();
  const investigators = db.investigators
    .filter(i => i.owner_id === user.id && !i.is_archived)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const modules = db.modules
    .filter(m => !m.is_archived && (m.owner_id === user.id || m.is_public))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <section className="mx-auto max-w-2xl space-y-6">
      <h1 className="font-serif text-2xl">开一局</h1>

      {sp.error && (
        <p className="rounded border border-rust-600/60 bg-rust-700/20 p-3 text-sm">
          {sp.error}
        </p>
      )}

      {(investigators.length === 0 || modules.length === 0) ? (
        <div className="space-y-3 rounded border border-ink-700 bg-ink-900 p-4 text-sm text-ink-300">
          {investigators.length === 0 && (
            <p>
              还没有调查员。<Link href="/investigators/new" className="underline hover:text-rust-500">新建一名</Link>。
            </p>
          )}
          {modules.length === 0 && (
            <p>
              还没有模组。<Link href="/modules/new" className="underline hover:text-rust-500">让 AI 生成一个</Link>。
            </p>
          )}
        </div>
      ) : (
        <form action={createSessionAction} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-ink-200">调查员</span>
            <select
              name="investigator_id"
              required
              defaultValue={sp.investigator_id ?? investigators[0]!.id}
              className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 outline-none focus:border-rust-500"
            >
              {investigators.map(i => (
                <option key={i.id} value={i.id}>
                  {i.name} · {i.occupation ?? '无'} · {i.age ?? '?'} 岁 · HP{i.hp_current}/{i.hp_max} SAN{i.san_current}/{i.san_max}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-ink-200">模组</span>
            <select
              name="module_id"
              required
              defaultValue={sp.module_id ?? modules[0]!.id}
              className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 outline-none focus:border-rust-500"
            >
              {modules.map(m => (
                <option key={m.id} value={m.id}>
                  {m.title} · {m.era} · {m.source_kind}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded border border-rust-600 bg-rust-700/60 px-5 py-2 hover:bg-rust-600"
          >
            开始调查
          </button>
        </form>
      )}
    </section>
  );
}
