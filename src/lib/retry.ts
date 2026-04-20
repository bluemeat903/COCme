/**
 * Generic API retry helpers with exponential backoff + jitter.
 *
 * Used to silently recover from transient DeepSeek failures (429/5xx/connection
 * drops/timeouts) during a KP turn so the player never sees a red error banner
 * for a blip.  Only cataloged-transient errors are retried; auth/bad-request
 * class errors fail fast.
 *
 * The error-classification avoids a hard dependency on specific openai SDK
 * subclasses so it stays robust across minor SDK version drift — we inspect
 * `err.status`, `err.constructor.name`, `err.code`, and `err.message`.
 */

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error('aborted'));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(handle);
      reject(signal?.reason ?? new Error('aborted'));
    };
    const handle = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Returns true for errors we want to silently retry (transient upstream issues).
 * Returns false for auth / client-logic / user-abort errors that won't get
 * better with a retry.
 */
export function isRetryableApiError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    status?: unknown;
    code?: unknown;
    name?: unknown;
    message?: unknown;
    cause?: unknown;
    constructor?: { name?: unknown };
  };
  const ctorName = typeof e.constructor?.name === 'string' ? e.constructor.name : '';

  // Explicit user-abort should never retry.
  if (ctorName === 'APIUserAbortError') return false;

  // HTTP status is authoritative when present (openai SDK attaches it).
  const status = typeof e.status === 'number' ? e.status : undefined;
  if (status !== undefined) {
    if (status === 408 || status === 425 || status === 429) return true;
    if (status >= 500 && status < 600) return true;
    return false;
  }

  // openai SDK transient subclasses (by name, to avoid import coupling).
  if (
    ctorName === 'APIConnectionError' ||
    ctorName === 'APIConnectionTimeoutError' ||
    ctorName === 'InternalServerError' ||
    ctorName === 'RateLimitError'
  ) {
    return true;
  }

  // Native node/undici network codes.
  const code = typeof e.code === 'string' ? e.code : undefined;
  if (
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'EAI_AGAIN' ||
    code === 'ECONNREFUSED' ||
    code === 'ENETUNREACH' ||
    code === 'UND_ERR_SOCKET' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_BODY_TIMEOUT'
  ) {
    return true;
  }

  // AbortError *not* triggered by our own user-abort (already handled above).
  if (e.name === 'AbortError') return true;

  // Message-level fallback for `TypeError: fetch failed` and friends.
  const msg = typeof e.message === 'string' ? e.message : '';
  if (/fetch failed|network|socket hang up|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(msg)) {
    return true;
  }

  // Sometimes the real network error is wrapped under `cause`.
  if (e.cause && e.cause !== err) {
    return isRetryableApiError(e.cause);
  }

  return false;
}

export interface WithApiRetryOptions {
  /** Total attempts including the first one. Default 3. */
  retries?: number;
  /** Base backoff before each retry (ms). Length may be < retries-1; last value repeats. */
  delays?: readonly number[];
  /** Relative jitter applied to each delay, 0..1. Default 0.2 (±20%). */
  jitter?: number;
  /** Fires right before we sleep+retry. attempt is 1-indexed (1 = first retry). */
  onRetry?: (attempt: number, err: unknown) => void;
  /** If aborted during sleep, rejects immediately. Does NOT cancel in-flight fn(). */
  signal?: AbortSignal;
}

/**
 * Runs `fn`, retrying on retryable errors with exponential backoff + jitter.
 * Non-retryable errors propagate immediately.  If all attempts fail, the last
 * error is rethrown.
 */
export async function withApiRetry<T>(
  fn: () => Promise<T>,
  opts: WithApiRetryOptions = {},
): Promise<T> {
  const retries = Math.max(1, opts.retries ?? 3);
  const delays = opts.delays ?? [500, 1500, 4000];
  const jitter = opts.jitter ?? 0.2;

  let lastErr: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryableApiError(err)) throw err;
      if (attempt === retries - 1) break;
      opts.onRetry?.(attempt + 1, err);
      const base = delays[Math.min(attempt, delays.length - 1)] ?? 0;
      const factor = 1 + (Math.random() * 2 - 1) * jitter;
      const wait = Math.max(0, Math.floor(base * factor));
      if (opts.signal !== undefined) {
        await sleep(wait, opts.signal);
      } else {
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}
