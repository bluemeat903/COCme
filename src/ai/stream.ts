import type OpenAI from 'openai';
import { KpOutput } from '../schemas/kp-output.js';
import type { KpOutput as KpOutputT } from '../schemas/kp-output.js';
import { KP_SYSTEM_PROMPT } from './prompt.js';

// ---------------------------------------------------------------------------
// Streaming KP call: opens a DeepSeek chat completion stream (OpenAI-compatible)
// requesting json_object format, accumulates chunks, and progressively extracts
// the `visible_narration` field so the caller can forward it to the browser
// in real time.  Returns the fully-parsed + validated KpOutput when the
// stream ends.
//
// Robustness:
//   - Unknown state_op variants (the model hallucinating new op names) are
//     logged and dropped before Zod validation, so the turn still advances
//     with whatever legit ops were present.
//   - On Zod failure we retry ONCE non-streaming with the error fed back
//     into the prompt, so the model can self-correct.
// ---------------------------------------------------------------------------

export interface StreamKpDeps {
  client: OpenAI;
  model: string;
}

export interface StreamKpCallbacks {
  /** Called with the narration text accumulated so far (cumulative, not delta). */
  onNarrationChange?: (text: string) => void;
}

export interface StreamKpOptions {
  systemPrompt?: string;
  temperature?: number;
  signal?: AbortSignal;
  /** Override the repair-retry budget.  Default 1. */
  maxRepairAttempts?: number;
}

const NARRATION_RE = /"visible_narration"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/s;

/** The 14 legitimate StateOp discriminator values.  Keep in sync with
 *  src/schemas/state-op.ts — any addition there should be added here too. */
const KNOWN_OPS: ReadonlySet<string> = new Set([
  'advance_clock',
  'change_scene',
  'hp_change',
  'mp_change',
  'san_change',
  'luck_change',
  'damage_roll',
  'san_check',
  'add_inventory',
  'remove_inventory',
  'reveal_clue',
  'npc_disposition',
  'npc_dead',
  'flag_set',
]);

export async function streamCallKp(
  context: unknown,
  deps: StreamKpDeps,
  callbacks: StreamKpCallbacks = {},
  opts: StreamKpOptions = {},
): Promise<KpOutputT> {
  const system = opts.systemPrompt ?? KP_SYSTEM_PROMPT;
  const maxRepairs = opts.maxRepairAttempts ?? 1;
  const userContent = typeof context === 'string' ? context : JSON.stringify(context);

  // ---- First pass: streaming ------------------------------------------------
  const stream = await deps.client.chat.completions.create(
    {
      model: deps.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
      stream: true,
      temperature: opts.temperature ?? 0.8,
    },
    opts.signal ? { signal: opts.signal } : {},
  );

  let accumulated = '';
  let lastNarrationLen = 0;

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (!delta) continue;
    accumulated += delta;

    const m = accumulated.match(NARRATION_RE);
    if (!m) continue;
    const matched = m[1] ?? '';
    if (matched.length <= lastNarrationLen) continue;

    let text: string | null = null;
    try {
      text = JSON.parse(`"${matched}"`) as string;
    } catch {
      text = null;
    }
    if (text !== null) {
      lastNarrationLen = matched.length;
      callbacks.onNarrationChange?.(text);
    }
  }

  // ---- First-pass validate (with lenient state_ops scrub) -------------------
  const firstParsed = tryParseJson(accumulated);
  if (firstParsed) {
    const scrub1 = scrubUnknownOps(firstParsed, 'stream');
    const r1 = KpOutput.safeParse(scrub1.value);
    if (r1.success) return r1.data;

    // ---- Repair retry (non-streaming) -------------------------------------
    let lastErr: unknown = r1.error;
    for (let attempt = 0; attempt < maxRepairs; attempt++) {
      const retry = await deps.client.chat.completions.create(
        {
          model: deps.model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: userContent },
            { role: 'assistant', content: accumulated },
            {
              role: 'user',
              content:
                `上一次输出不符合 schema。错误：${errorText(lastErr)}。\n` +
                `合法的 state_ops.op 仅有：${[...KNOWN_OPS].join(', ')}。\n` +
                `请严格按 schema 重新输出一个合法的 JSON 对象，仅使用合法的 op 枚举值，不要添加解释或 Markdown。`,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: (opts.temperature ?? 0.8) * 0.5,  // lower temp for repair
        },
        opts.signal ? { signal: opts.signal } : {},
      );
      const content = retry.choices[0]?.message?.content;
      if (!content) {
        lastErr = new Error('empty repair content');
        continue;
      }
      const retryParsed = tryParseJson(content);
      if (!retryParsed) {
        lastErr = new Error('repair JSON parse failed');
        continue;
      }
      const scrub2 = scrubUnknownOps(retryParsed, 'repair');
      const r2 = KpOutput.safeParse(scrub2.value);
      if (r2.success) {
        // Repaired narration is what the user "really" got this turn; replay it.
        const narr = (scrub2.value as { visible_narration?: unknown })?.visible_narration;
        if (typeof narr === 'string') callbacks.onNarrationChange?.(narr);
        return r2.data;
      }
      lastErr = r2.error;
    }
    throw new Error(`streamCallKp: schema mismatch after repair: ${errorText(lastErr)}`);
  }

  throw new Error('streamCallKp: could not parse final JSON from stream');
}

function tryParseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function errorText(err: unknown): string {
  if (!err) return 'unknown';
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/**
 * Drop any state_ops[] entry whose `op` isn't in KNOWN_OPS, so the KP
 * hallucinating a novel op name doesn't torpedo the whole turn.  Returns the
 * (potentially-rewritten) object and logs what got dropped.
 */
function scrubUnknownOps(root: unknown, tag: string): { value: unknown; dropped: number } {
  if (!root || typeof root !== 'object') return { value: root, dropped: 0 };
  const obj = root as { state_ops?: unknown };
  if (!Array.isArray(obj.state_ops)) return { value: root, dropped: 0 };
  const raw = obj.state_ops as Array<{ op?: unknown }>;
  const kept: unknown[] = [];
  const dropped: Array<{ op: unknown; reason: string }> = [];
  for (const entry of raw) {
    if (entry && typeof entry === 'object' && typeof entry.op === 'string' && KNOWN_OPS.has(entry.op)) {
      kept.push(entry);
    } else {
      dropped.push({ op: entry?.op, reason: 'unknown op' });
    }
  }
  if (dropped.length > 0) {
    // eslint-disable-next-line no-console
    console.warn(`[KP:${tag}] dropped ${dropped.length} unknown state_ops:`, dropped.map(d => d.op));
  }
  return { value: { ...obj, state_ops: kept }, dropped: dropped.length };
}
