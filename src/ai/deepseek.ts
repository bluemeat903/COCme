import OpenAI from 'openai';
import { KpOutput } from '../schemas/kp-output.js';
import { KP_SYSTEM_PROMPT } from './prompt.js';
import type { ChatCompletion } from './provider.js';
import { callJsonWithSchema } from './json-call.js';

// ---------------------------------------------------------------------------
// DeepSeek provider (OpenAI-compatible).  We expose a minimal ChatCompletion
// function; everything else in the codebase targets that abstraction so tests
// can stub it without pulling in the OpenAI SDK.
// ---------------------------------------------------------------------------

export interface DeepSeekConfig {
  apiKey: string;
  baseURL?: string;
  chatModel?: string;
  reasonModel?: string;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env var: ${name}`);
  return v;
}

export function createDeepSeek(cfg?: Partial<DeepSeekConfig>): {
  chat: ChatCompletion;
  chatModel: string;
  reasonModel: string;
  client: OpenAI;
} {
  const apiKey = cfg?.apiKey ?? requireEnv('DEEPSEEK_API_KEY');
  const baseURL = cfg?.baseURL ?? process.env['DEEPSEEK_BASE_URL'] ?? 'https://api.deepseek.com';
  const chatModel = cfg?.chatModel ?? process.env['DEEPSEEK_MODEL_CHAT'] ?? 'deepseek-chat';
  const reasonModel = cfg?.reasonModel ?? process.env['DEEPSEEK_MODEL_REASON'] ?? 'deepseek-reasoner';
  // Conservative SDK-level fallback for true 429/5xx/connect errors.
  // Application-level withApiRetry (see src/lib/retry.ts) layers on top to
  // also cover mid-stream drops that the SDK cannot itself rescue.
  const client = new OpenAI({ apiKey, baseURL, maxRetries: 2, timeout: 60_000 });

  const chat: ChatCompletion = async (req) => {
    const res = await client.chat.completions.create(
      {
        model: req.model,
        messages: req.messages,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.max_tokens !== undefined ? { max_tokens: req.max_tokens } : {}),
        ...(req.response_format ? { response_format: req.response_format } : {}),
      },
      req.signal ? { signal: req.signal } : {},
    );
    return { content: res.choices[0]?.message?.content ?? null };
  };

  return { chat, chatModel, reasonModel, client };
}

// ---------------------------------------------------------------------------
// callKp: one KP turn.  Thin wrapper around callJsonWithSchema.
// ---------------------------------------------------------------------------

export interface KpTurnContext {
  context: unknown;
}

export interface CallKpOptions {
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  maxRepairAttempts?: number;
  signal?: AbortSignal;
}

export async function callKp(
  { context }: KpTurnContext,
  opts: CallKpOptions = {},
  deps: { chat: ChatCompletion; chatModel: string } = createDeepSeek(),
): Promise<KpOutput> {
  const system = opts.systemPrompt ?? KP_SYSTEM_PROMPT;
  const model = opts.model ?? deps.chatModel;

  return callJsonWithSchema(
    KpOutput,
    [
      { role: 'system', content: system },
      { role: 'user', content: typeof context === 'string' ? context : JSON.stringify(context) },
    ],
    {
      model,
      temperature: opts.temperature ?? 0.8,
      ...(opts.maxTokens !== undefined ? { maxTokens: opts.maxTokens } : {}),
      maxRepairAttempts: opts.maxRepairAttempts ?? 1,
      ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
    },
    deps.chat,
  );
}
