import { notFound } from 'next/navigation';
import { LocalSessionRepo } from '@/db/local';
import { buildResumeView } from '@/engine';
import { GameView } from './GameView';
import { requireSessionOwner } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: sessionId } = await params;

  try {
    await requireSessionOwner(sessionId);
  } catch {
    notFound();
  }

  const repo = new LocalSessionRepo();
  const state = await repo.loadSession(sessionId);
  const initialView = buildResumeView(state);

  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-2xl">
          {state.investigator.base.name}
          <span className="ml-3 text-sm text-ink-400">
            {state.module.meta.title}
          </span>
        </h1>
        <span className="text-xs text-ink-400">session {sessionId.slice(0, 8)}…</span>
      </div>
      <GameView sessionId={sessionId} initialView={initialView} />
    </section>
  );
}
