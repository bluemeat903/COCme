import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LocalSessionRepo } from '@/db/local';
import { computeSummary } from '@/engine';
import { LocalDB } from '@/lib/localdb/db';
import { requireSessionOwner } from '@/lib/auth';
import { applyGrowthAction } from './actions';
import { Card } from '@/app/_components/Card';

export const dynamic = 'force-dynamic';

export default async function SessionSummaryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; applied?: string }>;
}) {
  const { id: sessionId } = await params;
  const sp = await searchParams;

  try {
    await requireSessionOwner(sessionId);
  } catch {
    notFound();
  }

  const repo = new LocalSessionRepo();
  const state = await repo.loadSession(sessionId);
  const summary = computeSummary(state);

  const db = await LocalDB.get();
  const growthRow = db.growth_records.find(g => g.session_id === sessionId);
  const applied = growthRow?.applied ?? false;

  return (
    <section className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-2xl">复盘</h1>
          <p className="mt-1 text-sm text-ink-400">
            {summary.investigator_name} · {summary.module_title}
          </p>
        </div>
        <Link
          href={`/sessions/${sessionId}`}
          className="text-sm text-ink-300 hover:text-rust-500"
        >
          ← 回到跑团界面
        </Link>
      </div>

      {sp.error && (
        <p className="rounded border border-rust-600/60 bg-rust-700/20 p-3 text-sm">
          {sp.error}
        </p>
      )}
      {sp.applied && (
        <p className="rounded border border-emerald-600/50 bg-emerald-700/10 p-3 text-sm text-emerald-200">
          已应用本局成长到调查员档案。
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-[1fr_18rem]">
        <div className="space-y-6">
          <Card title="状态">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <StatPair label="局状态" value={summary.status} />
              <StatPair label="结局" value={summary.ending ?? '未定'} />
              <StatPair label="回合数" value={String(summary.turn_count)} />
              <StatPair label="游戏内时长" value={`${summary.elapsed_minutes} 分钟`} />
            </div>
          </Card>

          <Card title="数值变化">
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <Delta label="HP" start={summary.hp.start} end={summary.hp.end} delta={summary.hp.delta} />
              <Delta label="MP" start={summary.mp.start} end={summary.mp.end} delta={summary.mp.delta} />
              <Delta label="SAN" start={summary.san.start} end={summary.san.end} delta={summary.san.delta} />
              <Delta label="Luck" start={summary.luck.start} end={summary.luck.end} delta={summary.luck.delta} />
            </div>
            {summary.conditions_ended_with.length > 0 && (
              <p className="mt-3 text-xs text-rust-400">
                持续状态：{summary.conditions_ended_with.join('、')}
              </p>
            )}
            {summary.phobias_gained.length > 0 && (
              <p className="mt-1 text-xs text-rust-400">
                新恐惧/躁狂：{summary.phobias_gained.join('、')}
              </p>
            )}
          </Card>

          <Card title={`线索 (${summary.clues_discovered.length})`}>
            {summary.clues_discovered.length === 0 ? (
              <p className="text-sm text-ink-400">未发现任何线索。</p>
            ) : (
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {summary.clues_discovered.map(c => (
                  <li key={c.key}>
                    <span className="font-serif">{c.name}</span>
                    <code className="ml-2 text-xs text-ink-500">{c.key}</code>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title={`检定记录 (${summary.checks.length})`}>
            {summary.checks.length === 0 ? (
              <p className="text-sm text-ink-400">本局未进行任何检定。</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {summary.checks.map((c, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between rounded border border-ink-800 bg-ink-950 px-3 py-1"
                  >
                    <span>
                      <span className="font-serif">{c.skill ?? '—'}</span>
                      {c.pushed && <span className="ml-2 text-xs text-rust-500">(推动)</span>}
                    </span>
                    <span className="text-xs text-ink-300">
                      d100={c.roll} · {c.outcome}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="事件时间线">
            {summary.events_timeline.length === 0 ? (
              <p className="text-sm text-ink-400">没有事件。</p>
            ) : (
              <ol className="space-y-1 text-xs text-ink-300">
                {summary.events_timeline.map((e, i) => (
                  <li key={i} className="border-l border-ink-700 pl-2">
                    <span className="text-ink-500">
                      {new Date(e.at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>{' '}
                    <span className="text-ink-400">{e.kind}</span> · {e.label}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <aside className="space-y-4">
          <Card title="成长">
            {summary.status === 'active' ? (
              <p className="text-sm text-ink-400">局还在进行，结束后可在此应用成长。</p>
            ) : applied ? (
              <AppliedGrowth row={growthRow!} />
            ) : (
              <form action={applyGrowthAction}>
                <input type="hidden" name="id" value={sessionId} />
                <p className="mb-3 text-sm text-ink-300">
                  根据本局用过的技能做一次成长检定，改动会写回调查员档案。
                </p>
                <button
                  type="submit"
                  className="w-full rounded border border-rust-600 bg-rust-700/60 py-2 text-sm hover:bg-rust-600"
                >
                  应用成长
                </button>
              </form>
            )}
          </Card>
        </aside>
      </div>
    </section>
  );
}

function StatPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between rounded border border-ink-800 bg-ink-950 px-3 py-1">
      <span className="text-xs text-ink-400">{label}</span>
      <span className="font-serif">{value}</span>
    </div>
  );
}

function Delta({ label, start, end, delta }: { label: string; start: number; end: number; delta: number }) {
  const color = delta < 0 ? 'text-rust-400' : delta > 0 ? 'text-emerald-300' : 'text-ink-300';
  return (
    <div className="rounded border border-ink-800 bg-ink-950 px-3 py-2">
      <div className="text-xs text-ink-400">{label}</div>
      <div className="font-serif text-lg">
        {start} → {end}
      </div>
      <div className={`text-xs ${color}`}>{delta > 0 ? `+${delta}` : delta}</div>
    </div>
  );
}

function AppliedGrowth({
  row,
}: {
  row: {
    skill_improvements: Array<{ skill: string; d100: number; pre: number; post: number; gain: number }>;
    san_delta: number;
    hp_delta: number;
    luck_delta: number;
  };
}) {
  const gained = row.skill_improvements.filter(i => i.gain > 0);
  return (
    <div className="space-y-3 text-sm">
      {gained.length === 0 ? (
        <p className="text-ink-400">没有技能获得成长。</p>
      ) : (
        <ul className="space-y-1">
          {gained.map(i => (
            <li key={i.skill} className="flex justify-between">
              <span className="font-serif">{i.skill}</span>
              <span className="text-emerald-300">
                +{i.gain} → {i.post}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="text-xs text-ink-400">
        回写：HP {row.hp_delta >= 0 ? '+' : ''}{row.hp_delta}，SAN {row.san_delta >= 0 ? '+' : ''}{row.san_delta}
        ，Luck {row.luck_delta >= 0 ? '+' : ''}{row.luck_delta}。
      </div>
    </div>
  );
}
