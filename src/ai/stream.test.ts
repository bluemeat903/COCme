import { describe, it, expect, vi } from 'vitest';
import type OpenAI from 'openai';
import { streamCallKp } from './stream.js';

/**
 * Tests for the transient-error retry behaviour on the streaming KP path.
 *
 * We stub the OpenAI client's chat.completions.create so we can inject
 * failures and then a good async-iterable stream on the second attempt.
 * The real SDK returns a `Stream<T>` — for `for await (...)` purposes an
 * async generator is indistinguishable.
 */

function validKpOutputJson(): string {
  return JSON.stringify({
    scene_id: 'scene_1',
    visible_narration: 'hello world',
    player_options: [],
    required_check: null,
    state_ops: [],
    hidden_notes: [],
  });
}

async function* makeStream(chunks: string[]): AsyncGenerator<unknown, void, unknown> {
  for (const c of chunks) {
    yield { choices: [{ delta: { content: c } }] };
  }
}

describe('streamCallKp transient-error retry', () => {
  it('retries after a connection-class failure and succeeds', async () => {
    const payload = validKpOutputJson();
    const chunks = [payload.slice(0, 12), payload.slice(12)];

    let attempt = 0;
    const create = vi.fn().mockImplementation(async () => {
      attempt++;
      if (attempt === 1) {
        const err = new Error('connection reset') as Error & { code?: string };
        err.code = 'ECONNRESET';
        throw err;
      }
      return makeStream(chunks);
    });

    const client = { chat: { completions: { create } } } as unknown as OpenAI;

    const narrations: string[] = [];
    const result = await streamCallKp(
      { ctx: 'demo' },
      { client, model: 'test-model' },
      { onNarrationChange: t => narrations.push(t) },
    );

    expect(result.visible_narration).toBe('hello world');
    expect(attempt).toBe(2);
    // onRetry should have emitted at least one clearing pulse ('') before the
    // second attempt re-streamed the real narration.
    expect(narrations.some(n => n === '')).toBe(true);
    // Final narration state should be the full text.
    expect(narrations[narrations.length - 1]).toBe('hello world');
  }, 10_000);

  it('does not retry on a 401-class (non-retryable) error', async () => {
    const create = vi.fn().mockImplementation(async () => {
      const err = new Error('unauthorized') as Error & { status?: number };
      err.status = 401;
      throw err;
    });

    const client = { chat: { completions: { create } } } as unknown as OpenAI;

    await expect(
      streamCallKp({ ctx: 'demo' }, { client, model: 'test-model' }),
    ).rejects.toMatchObject({ status: 401 });

    expect(create).toHaveBeenCalledTimes(1);
  });
});
