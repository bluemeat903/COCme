'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import type { PlayerView } from '@/engine/projection';
import { pushAction, abandonAction } from './actions';
import { HudBar, CheckPrompt, History } from '@/app/_components/game-hud';
import { DiceRoll, type DiceOutcome } from '@/app/_components/DiceRoll';
import { ClueBoard } from '@/app/_components/ClueBoard';
import { SceneVisual } from '@/app/_components/SceneVisual';
import { InvestigatorDrawer } from '@/app/_components/InvestigatorDrawer';

const HISTORY_TAIL_LENGTH = 32;

interface LiveRoll {
  summary: string;
  outcome: DiceOutcome;
  kind: 'skill_like' | 'san';
  roll: number;
  target: number | null;
  /** Monotonic id so <DiceRoll triggerKey=...> re-plays on every fresh check. */
  rollNo: number;
}

export function GameView({
  sessionId,
  initialView,
}: {
  sessionId: string;
  initialView: PlayerView;
}) {
  const [history, setHistory] = useState<PlayerView[]>([initialView]);
  const view = history[history.length - 1]!;
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [liveRoll, setLiveRoll] = useState<LiveRoll | null>(null);
  const rollCounterRef = useRef(0);
  const [pushPending, startPushTransition] = useTransition();
  const active = view.status === 'active';
  const busy = streaming || pushPending;

  // Brand-new session? Fire the opening (prologue) turn automatically.
  const autoFiredOpeningRef = useRef(false);
  useEffect(() => {
    if (autoFiredOpeningRef.current) return;
    if (initialView.turn_index !== 0) return;
    if (initialView.status !== 'active') return;
    autoFiredOpeningRef.current = true;
    void advance(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commit(next: PlayerView) {
    setHistory(h =>
      h.length >= HISTORY_TAIL_LENGTH * 2 ? [...h.slice(-HISTORY_TAIL_LENGTH), next] : [...h, next],
    );
  }

  async function runOneTurn(playerInput: string | null): Promise<void> {
    const res = await fetch(`/api/sessions/${sessionId}/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player_input: playerInput }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body?.error ?? `HTTP ${res.status}`);
    }
    if (!res.body) throw new Error('no response body');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finished = false;

    while (!finished) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);

        let event = 'message';
        let data = '';
        for (const line of raw.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) data += line.slice(5).trimStart();
        }
        if (!data) continue;
        let payload: unknown;
        try {
          payload = JSON.parse(data);
        } catch {
          continue;
        }

        if (event === 'check_resolved') {
          // Fires BEFORE the KP starts writing — kick off the dice animation.
          const p = payload as {
            summary: string;
            outcome: string;
            kind: string;
            roll: number;
            target: number | null;
          };
          rollCounterRef.current += 1;
          setLiveRoll({
            summary: p.summary,
            outcome: p.outcome as DiceOutcome,
            kind: (p.kind === 'san' ? 'san' : 'skill_like') as LiveRoll['kind'],
            roll: p.roll,
            target: p.target,
            rollNo: rollCounterRef.current,
          });
        } else if (event === 'narration') {
          const p = payload as { text?: string };
          if (typeof p.text === 'string') setStreamText(p.text);
        } else if (event === 'complete') {
          commit(payload as PlayerView);
          setStreamText('');
          setInput('');
          finished = true;
        } else if (event === 'error') {
          const p = payload as { message?: string };
          throw new Error(p.message ?? 'turn failed');
        }
      }
    }
  }

  async function advance(playerInput: string | null) {
    if (streaming) return;
    setError(null);
    setStreamText('');
    // Clear previous roll so dice disappears while we wait for this turn's
    // check_resolved event (or stays hidden if this turn has no check).
    setLiveRoll(null);
    setStreaming(true);

    const MAX_TRIES = 3;
    const BACKOFFS = [500, 1500, 4000];

    try {
      for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
        try {
          await runOneTurn(playerInput);
          return;
        } catch (e) {
          if (attempt === MAX_TRIES - 1) {
            // Exhausted retries: fall through to show the in-character error.
            console.warn('[advance] turn failed after retries:', e);
            break;
          }
          // Silent retry: reset visual turn state but DO NOT show an error.
          // The narration card will keep rendering the "KP 正在稳住思绪……"
          // placeholder while we back off and try again.
          console.warn(`[advance] turn attempt ${attempt + 1} failed, retrying:`, e);
          setStreamText('');
          setLiveRoll(null);
          await new Promise(r => setTimeout(r, BACKOFFS[attempt]!));
        }
      }
      // All attempts failed — surface a single, in-character error.
      setError('KP 一时间失了神——请再试一次你的行动。');
      setStreamText('');
    } finally {
      setStreaming(false);
    }
  }

  function doPush() {
    setError(null);
    startPushTransition(async () => {
      try {
        const next = await pushAction(sessionId);
        commit(next);
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }

  // Narration card content:
  //   - streaming with text arriving     -> the live-growing text
  //   - streaming, no text yet, turn 0   -> opening placeholder
  //   - streaming, no text yet, turn > 0 -> placeholder acknowledging KP is thinking
  //   - not streaming                    -> latest committed view's narration
  const isOpeningWait = streaming && streamText.length === 0 && view.turn_index === 0;
  const isMidTurnWait = streaming && streamText.length === 0 && view.turn_index > 0;
  const narrationShown = streaming && streamText.length > 0
    ? streamText
    : isOpeningWait
      ? '（KP 正在铺陈开场……）'
      : isMidTurnWait
        ? liveRoll
          ? '（骰子落下了。KP 正在把结果织进叙事……）'
          : '（KP 正在稳住思绪……）'
        : view.narration;

  // What roll should the dice card display?
  //   - if a fresh live roll came in this turn, show that
  //   - otherwise if the latest committed view has a resolved_check, show that
  //   - else hide the card
  const diceInfo: LiveRoll | null = liveRoll
    ? liveRoll
    : view.resolved_check
      ? {
          summary: view.resolved_check.summary,
          outcome: view.resolved_check.outcome as DiceOutcome,
          kind: view.resolved_check.kind,
          roll: view.resolved_check.roll,
          target: view.resolved_check.target,
          rollNo: view.turn_index * 10000 + view.resolved_check.roll,
        }
      : null;

  return (
    <>
      <div className="grid gap-6 md:grid-cols-[1fr_18rem]">
        <div className="space-y-4">
          <HudBar view={view} />

          {/* Pre-submit: big banner telling the player what check their next action triggers */}
          {!streaming && view.pending_check && (
            <CheckPrompt
              view={view}
              {...(view.pending_check.allow_push ? { onPush: doPush } : {})}
              pushDisabled={busy}
            />
          )}

          {/* Dice card: appears as soon as check_resolved fires, survives into the committed view */}
          {diceInfo && (
            <div className="rounded border border-rust-600/40 bg-rust-700/5 p-3">
              <DiceRoll
                finalValue={diceInfo.roll}
                target={diceInfo.target}
                outcome={diceInfo.outcome}
                triggerKey={diceInfo.rollNo}
                label={diceInfo.summary}
              />
            </div>
          )}

          {/* Per-turn scene establishing shot — new image every KP turn */}
          <SceneVisual sessionId={view.session_id} turnIndex={view.turn_index} />

          {/* Narration card */}
          <div className="rounded border border-ink-700 bg-ink-900 p-5">
            <p className="whitespace-pre-wrap leading-relaxed text-ink-100">
              {narrationShown}
              {streaming && <span className="ml-1 inline-block h-4 w-2 animate-pulse bg-rust-500 align-middle" />}
            </p>
            {!streaming && view.effects.length > 0 && (
              <p className="mt-4 text-xs text-ink-400">[效果] {view.effects.join(' · ')}</p>
            )}
          </div>

          {/* Options */}
          {!streaming && view.options.length > 0 && active && (
            <div className="space-y-2">
              <p className="text-sm text-ink-300">
                {view.pending_check
                  ? `选一项（任意一项都会触发上面那条 ${view.pending_check.skill_or_stat ?? view.pending_check.kind} 检定）：`
                  : '选项：'}
              </p>
              <ul className="space-y-1">
                {view.options.map((opt, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => advance(opt)}
                      className="w-full rounded border border-ink-700 bg-ink-900 px-3 py-2 text-left text-sm hover:border-rust-500 disabled:opacity-50"
                    >
                      <span className="text-rust-500">{i + 1}.</span> {opt}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {active && (
            <form
              onSubmit={e => {
                e.preventDefault();
                const trimmed = input.trim();
                advance(trimmed.length > 0 ? trimmed : null);
              }}
              className="flex gap-2"
            >
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                disabled={busy}
                placeholder={
                  view.pending_check
                    ? `按 Enter 触发 ${view.pending_check.skill_or_stat ?? view.pending_check.kind} 检定（可先写一句你的行动）`
                    : '自由描述你的行动或对话'
                }
                className="flex-1 rounded border border-ink-700 bg-ink-900 px-3 py-2 outline-none focus:border-rust-500 disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded border border-rust-600 bg-rust-700/60 px-4 py-2 hover:bg-rust-600 disabled:opacity-50"
              >
                {streaming ? 'KP 书写中…' : pushPending ? '推动中…' : '发送'}
              </button>
            </form>
          )}

          {!active && (
            <div className="space-y-2 rounded border border-ink-700 bg-ink-900 p-4 text-sm">
              <p>
                本局已结束：<span className="text-rust-500">{view.status}</span>
                {view.ending ? ` · 结局 ${view.ending}` : ''}
              </p>
              <div className="flex gap-4">
                <a
                  href={`/sessions/${sessionId}/summary`}
                  className="underline hover:text-rust-500"
                >
                  查看复盘并应用成长
                </a>
                <a href="/investigators" className="underline hover:text-rust-500">
                  返回人物卡列表
                </a>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded border border-rust-600/60 bg-rust-700/20 p-3 text-sm">{error}</p>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded border border-ink-700 bg-ink-900 p-4 text-sm">
            <h3 className="mb-2 font-serif text-lg">会话</h3>
            <p className="text-ink-300">场景：{view.scene_id}</p>
            <p className="text-ink-300">回合：{view.turn_index}</p>
          </div>

          {active && (
            <form
              action={() => abandonAction(sessionId)}
              className="rounded border border-ink-700 bg-ink-900 p-4"
            >
              <button
                type="submit"
                className="w-full rounded border border-ink-700 py-2 text-sm text-ink-300 hover:border-rust-500 hover:text-rust-500"
              >
                放弃本局
              </button>
            </form>
          )}

          <ClueBoard clues={view.discovered_clues} sessionId={view.session_id} />

          <History history={history} />
        </aside>
      </div>

      <InvestigatorDrawer sheet={view.investigator_sheet} />
    </>
  );
}
