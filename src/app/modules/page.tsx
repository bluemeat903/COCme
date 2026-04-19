import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { LocalDB } from '@/lib/localdb/db';

export const dynamic = 'force-dynamic';

export default async function ModulesPage() {
  const user = await requireUser();
  const db = await LocalDB.get();
  const list = db.modules
    .filter(m => !m.is_archived && (m.owner_id === user.id || m.is_public))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl">模组</h1>
        <div className="flex gap-2">
          <Link
            href="/modules/import"
            className="rounded border border-ink-700 bg-ink-900 px-4 py-2 text-sm hover:border-rust-500"
          >
            粘贴导入
          </Link>
          <Link
            href="/modules/new"
            className="rounded border border-rust-600 bg-rust-700/50 px-4 py-2 text-sm hover:bg-rust-600"
          >
            + AI 生成
          </Link>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="text-ink-300">
          还没有模组。<Link href="/modules/new" className="underline hover:text-rust-500">让 AI 生成一个</Link>
          ，或 <Link href="/modules/import" className="underline hover:text-rust-500">粘贴导入一份</Link>。
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.map(m => (
            <li key={m.id}>
              <Link
                href={`/modules/${m.id}`}
                className="block rounded border border-ink-700 bg-ink-900 p-4 transition hover:border-rust-500"
              >
                <div className="mb-1 flex items-baseline justify-between">
                  <h2 className="font-serif text-lg">{m.title}</h2>
                  <span className="text-xs text-ink-400">
                    {m.era} · {m.source_kind}
                  </span>
                </div>
                {m.premise && <p className="mb-2 line-clamp-2 text-sm text-ink-300">{m.premise}</p>}
                {m.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 text-xs text-ink-400">
                    {m.tags.map(t => (
                      <span key={t} className="rounded border border-ink-700 px-2 py-0.5">#{t}</span>
                    ))}
                  </div>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
