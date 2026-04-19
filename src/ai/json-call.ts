import type { z } from 'zod';
import type { ChatCompletion, ChatMessage } from './provider.js';

export interface CallJsonOptions {
  model: string;
  temperature?: number;
  maxTokens?: number;
  /** How many times to re-ask the model with the validation error if JSON/schema fails.  Default 1. */
  maxRepairAttempts?: number;
  signal?: AbortSignal;
}

/**
 * Ask the model for JSON matching a Zod schema.  On parse or schema failure,
 * re-prompt up to maxRepairAttempts with the validation error so the model
 * can self-correct.
 *
 * Returns the PARSED (output) type of the schema, which matters when the
 * schema uses `.default()` or `.transform()`.
 */
export async function callJsonWithSchema<S extends z.ZodTypeAny>(
  schema: S,
  messages: ChatMessage[],
  opts: CallJsonOptions,
  chat: ChatCompletion,
): Promise<z.infer<S>> {
  const maxRepairs = opts.maxRepairAttempts ?? 1;
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRepairs; attempt++) {
    const msgs: ChatMessage[] =
      attempt === 0
        ? messages
        : [
            ...messages,
            {
              role: 'user',
              content:
                `上次输出不符合 schema。错误：${errorSummary(lastError)}。` +
                `请重新输出一个合法的 JSON 对象，严格符合前面指定的字段要求。不要加任何解释或 Markdown，只输出 JSON。`,
            },
          ];

    const reqFormat: { type: 'json_object' } = { type: 'json_object' };
    const req: Parameters<ChatCompletion>[0] = {
      model: opts.model,
      messages: msgs,
      response_format: reqFormat,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.maxTokens !== undefined ? { max_tokens: opts.maxTokens } : {}),
      ...(opts.signal !== undefined ? { signal: opts.signal } : {}),
    };
    const res = await chat(req);

    const content = res.content;
    if (!content) {
      lastError = new Error('empty content');
      continue;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (err) {
      lastError = new Error(`JSON parse failed: ${(err as Error).message}`);
      continue;
    }

    const r = schema.safeParse(parsed);
    if (r.success) return r.data as z.infer<S>;
    lastError = r.error;
  }

  throw new Error(
    `callJsonWithSchema: failed after ${maxRepairs + 1} attempts. Last error: ${errorSummary(lastError)}`,
  );
}

function errorSummary(err: unknown): string {
  if (!err) return 'unknown';
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
