'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Animated d100 roll.  Two dice (tens + units) cycle rapidly for ~900 ms then
 * settle on the final value.  Accessible: respects prefers-reduced-motion.
 *
 * Props:
 *   finalValue: the server-rolled result (1-100) to land on.
 *   triggerKey: a value that changes when a new roll should play.  When it
 *               changes, the animation replays from the start.
 *   outcome:    'critical' | 'extreme_success' | 'hard_success' |
 *               'regular_success' | 'fail' | 'fumble' | 'san_passed' |
 *               'san_failed' — drives the colored badge under the dice.
 *   target:     optional target value to render as "掷出 X / 目标 Y"
 */
export type DiceOutcome =
  | 'critical'
  | 'extreme_success'
  | 'hard_success'
  | 'regular_success'
  | 'fail'
  | 'fumble'
  | 'san_passed'
  | 'san_failed';

interface DiceRollProps {
  finalValue: number;
  triggerKey: string | number;
  outcome: DiceOutcome;
  target?: number | null;
  label?: string;
}

const ROLL_TOTAL_MS = 900;
const CYCLE_INTERVAL_MS = 55;

export function DiceRoll({ finalValue, triggerKey, outcome, target, label }: DiceRollProps) {
  const [displayed, setDisplayed] = useState(finalValue);
  const [rolling, setRolling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setDisplayed(finalValue);
      setRolling(false);
      return;
    }

    setRolling(true);
    if (timerRef.current) clearInterval(timerRef.current);
    if (settleRef.current) clearTimeout(settleRef.current);

    timerRef.current = setInterval(() => {
      // random 1..100
      setDisplayed(Math.floor(Math.random() * 100) + 1);
    }, CYCLE_INTERVAL_MS);

    settleRef.current = setTimeout(() => {
      if (timerRef.current) clearInterval(timerRef.current);
      setDisplayed(finalValue);
      setRolling(false);
    }, ROLL_TOTAL_MS);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (settleRef.current) clearTimeout(settleRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerKey]);

  const tens = Math.floor(displayed / 10);
  const units = displayed % 10;

  return (
    <div className="flex flex-col items-center gap-2 py-2">
      {label && <div className="text-xs text-ink-400">{label}</div>}
      <div className="flex items-center gap-3">
        <DieFace digit={tens} big label="十位" shake={rolling} />
        <DieFace digit={units} big label="个位" shake={rolling} />
        <div className="ml-3 font-serif">
          <div className="text-xs text-ink-400">掷出</div>
          <div className={`text-3xl ${outcomeNumberColor(outcome)}`}>
            {displayed}
          </div>
          {target !== null && target !== undefined && (
            <div className="text-xs text-ink-400">目标 {target}</div>
          )}
        </div>
      </div>
      {!rolling && (
        <OutcomeBadge outcome={outcome} />
      )}
    </div>
  );
}

function DieFace({ digit, big, label, shake }: { digit: number; big?: boolean; label: string; shake: boolean }) {
  return (
    <div className="relative flex flex-col items-center">
      <div
        className={[
          'flex items-center justify-center rounded border-2 border-ink-500 bg-ink-800 font-serif',
          big ? 'h-14 w-14 text-3xl' : 'h-10 w-10 text-xl',
          shake ? 'animate-die-shake' : '',
        ].join(' ')}
        aria-label={`${label} ${digit}`}
      >
        {digit}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-widest text-ink-500">{label}</div>
    </div>
  );
}

function outcomeNumberColor(o: DiceOutcome): string {
  switch (o) {
    case 'critical':
    case 'extreme_success':
      return 'text-amber-300';
    case 'hard_success':
      return 'text-emerald-300';
    case 'regular_success':
    case 'san_passed':
      return 'text-ink-100';
    case 'fumble':
      return 'text-rust-500';
    case 'fail':
    case 'san_failed':
    default:
      return 'text-rust-400';
  }
}

function OutcomeBadge({ outcome }: { outcome: DiceOutcome }) {
  const { label, cls } = outcomeMeta(outcome);
  return (
    <span className={`rounded border px-2 py-0.5 text-xs ${cls}`}>
      {label}
    </span>
  );
}

function outcomeMeta(o: DiceOutcome): { label: string; cls: string } {
  switch (o) {
    case 'critical':          return { label: '大成功 · 01',          cls: 'border-amber-400/60 bg-amber-400/10 text-amber-200' };
    case 'extreme_success':   return { label: '极限成功',              cls: 'border-amber-500/60 bg-amber-500/10 text-amber-200' };
    case 'hard_success':      return { label: '困难成功',              cls: 'border-emerald-500/60 bg-emerald-500/10 text-emerald-200' };
    case 'regular_success':   return { label: '常规成功',              cls: 'border-ink-500 bg-ink-700/40 text-ink-100' };
    case 'fail':              return { label: '失败',                  cls: 'border-rust-500/60 bg-rust-500/10 text-rust-300' };
    case 'fumble':            return { label: '大失败 · 96+',          cls: 'border-rust-700 bg-rust-700/30 text-rust-200' };
    case 'san_passed':        return { label: 'SAN 检定通过',          cls: 'border-ink-500 bg-ink-700/40 text-ink-100' };
    case 'san_failed':        return { label: 'SAN 检定失败',          cls: 'border-rust-500/60 bg-rust-500/10 text-rust-300' };
  }
}
