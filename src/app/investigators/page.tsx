import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { LocalDB } from '@/lib/localdb/db';

export const dynamic = 'force-dynamic';

export default async function InvestigatorsPage() {
  const user = await requireUser();
  const db = await LocalDB.get();
  const list = db.investigators
    .filter(i => i.owner_id === user.id && !i.is_archived)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl">调查员</h1>
        <Link
          href="/investigators/new"
          className="rounded border border-rust-600 bg-rust-700/50 px-4 py-2 text-sm hover:bg-rust-600"
        >
          + 新建
        </Link>
      </div>

      {list.length === 0 ? (
        <p className="text-ink-300">
          还没有调查员。<Link href="/investigators/new" className="underline hover:text-rust-500">新建一名</Link>。
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.map(inv => (
            <li key={inv.id}>
              <Link
                href={`/investigators/${inv.id}`}
                className="block rounded border border-ink-700 bg-ink-900 p-4 transition hover:border-rust-500"
              >
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="font-serif text-xl">{inv.name}</h2>
                  <span className="text-xs text-ink-400">{inv.era}</span>
                </div>
                <p className="text-sm text-ink-300">
                  {inv.occupation ?? '无职业'} · {inv.age ?? '?'} 岁
                </p>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-ink-300">
                  <span>HP {inv.hp_current}/{inv.hp_max}</span>
                  <span>SAN {inv.san_current}/{inv.san_max}</span>
                  <span>Luck {inv.luck}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
