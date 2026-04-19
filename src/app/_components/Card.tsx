/**
 * Bordered ink-surface card with a title.  Server Component.  Used by detail
 * pages (/investigators/[id], /modules/[id]).
 */
export function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-ink-700 bg-ink-900 p-4">
      <h2 className="mb-3 font-serif text-lg">{title}</h2>
      {children}
    </section>
  );
}
