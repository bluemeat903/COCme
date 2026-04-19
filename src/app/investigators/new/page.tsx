import { BuilderForm } from './BuilderForm';

export const dynamic = 'force-dynamic';

export default async function NewInvestigatorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;

  return (
    <section className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-serif text-2xl">新建调查员</h1>
        <p className="mt-2 text-sm text-ink-300">
          填好属性和职业后即可分配技能点。顶端的预算会实时更新；超支按钮会灰掉。
        </p>
      </div>

      {sp.error && (
        <p className="rounded border border-rust-600/60 bg-rust-700/20 p-3 text-sm">
          {sp.error}
        </p>
      )}

      <BuilderForm />
    </section>
  );
}
