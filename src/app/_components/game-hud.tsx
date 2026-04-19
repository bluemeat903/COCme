'use client';

import type { PlayerView } from '@/engine/projection';

// ---------------------------------------------------------------------------
// Shared game-UI pieces used by both /sessions/[id]/GameView and /demo/DemoGame.
// No internal state; pure presentation + callbacks.
// ---------------------------------------------------------------------------

export function HudBar({ view }: { view: PlayerView }) {
  return (
    <div className="grid grid-cols-4 gap-3 text-center text-sm">
      <Stat label="HP" cur={view.hud.hp.current} max={view.hud.hp.max} />
      <Stat label="MP" cur={view.hud.mp.current} max={view.hud.mp.max} />
      <Stat label="SAN" cur={view.hud.san.current} max={view.hud.san.max} />
      <Stat label="Luck" cur={view.hud.luck} max={99} />
      {view.hud.conditions.length > 0 && (
        <div className="col-span-4 text-xs text-rust-500">
          状态：{view.hud.conditions.join(', ')}
        </div>
      )}
    </div>
  );
}

export function Stat({ label, cur, max }: { label: string; cur: number; max: number }) {
  const ratio = max > 0 ? cur / max : 0;
  const color = ratio > 0.5 ? 'bg-ink-600' : ratio > 0.2 ? 'bg-rust-700' : 'bg-rust-500';
  return (
    <div className="rounded border border-ink-700 bg-ink-900 px-2 py-1">
      <div className="text-xs text-ink-400">{label}</div>
      <div className="font-serif text-lg">
        {cur}
        <span className="text-ink-500"> / {max}</span>
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded bg-ink-800">
        <div className={`h-full ${color}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
    </div>
  );
}

/**
 * A check-prompt panel.  Pass `onPush` only if pushing should be offered;
 * pass `pushDisabled` to grey the button while an in-flight request is running.
 */
export function CheckPrompt({
  view,
  onPush,
  pushDisabled = false,
}: {
  view: PlayerView;
  onPush?: () => void;
  pushDisabled?: boolean;
}) {
  const c = view.pending_check;
  if (!c) return null;
  const skill = c.skill_or_stat ?? c.kind;
  const bonuses = [
    c.bonus_dice > 0 ? `+${c.bonus_dice} 奖励骰` : null,
    c.penalty_dice > 0 ? `${c.penalty_dice} 惩罚骰` : null,
  ]
    .filter(Boolean)
    .join('，');
  return (
    <div className="rounded border border-rust-600/50 bg-rust-700/10 px-4 py-3 text-sm">
      <p>
        KP 等你进行：<span className="font-serif text-base">{skill}</span> ({c.difficulty})
        {bonuses ? `，${bonuses}` : ''}
      </p>
      {c.note && <p className="mt-1 text-ink-300">{c.note}</p>}
      <p className="mt-2 text-xs text-ink-400">
        提交你的下一次行动即触发检定。
        {onPush && (
          <>
            {' · '}
            <button
              type="button"
              disabled={pushDisabled}
              onClick={onPush}
              className="underline hover:text-rust-500 disabled:opacity-50"
            >
              推动上一次失败的检定
            </button>
          </>
        )}
      </p>
    </div>
  );
}

export function History({ history }: { history: PlayerView[] }) {
  const slice = history.slice(-6).reverse();
  if (slice.length === 0) return null;
  return (
    <div className="rounded border border-ink-700 bg-ink-900 p-4 text-sm">
      <h3 className="mb-2 font-serif text-lg">近 {slice.length} 回合</h3>
      <ol className="space-y-2 text-xs text-ink-300">
        {slice.map((v, i) => (
          <li key={history.length - i - 1} className="border-l border-ink-700 pl-2">
            <div className="text-ink-400">
              #{v.turn_index} · {v.scene_id}
            </div>
            <div className="line-clamp-2">{v.narration}</div>
            {v.resolved_check && (
              <div className="text-rust-500">[检定] {v.resolved_check.summary}</div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
