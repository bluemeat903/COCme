import { createHmac, timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------------------
// Cookie-based session with HMAC signature.  Zero external deps.
//
// Value format:  <userId>.<issuedAtMs>.<hmac(userId + "." + issuedAtMs)>
// Lifetime: 14 days.  Verified timing-safely on each request.
// ---------------------------------------------------------------------------

export const SESSION_COOKIE_NAME = 'coc_session';
const MAX_AGE_SECONDS = 14 * 24 * 60 * 60;

function getSecret(): string {
  const s = process.env['SESSION_SECRET'];
  if (!s || s.length < 16) {
    // Dev-mode fallback; prints a warning once.
    if (!process.env['__COC_SECRET_WARNED']) {
      process.env['__COC_SECRET_WARNED'] = '1';
      // eslint-disable-next-line no-console
      console.warn(
        '[auth] SESSION_SECRET not set (or <16 chars). Using insecure dev fallback. ' +
          'Add SESSION_SECRET=... to .env.local for production.',
      );
    }
    return 'insecure-dev-secret-change-me-in-production-please';
  }
  return s;
}

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

export function createSessionValue(userId: string): string {
  const issued = Date.now().toString();
  const payload = `${userId}.${issued}`;
  return `${payload}.${sign(payload)}`;
}

export interface SessionCookieInfo {
  userId: string;
  issuedAtMs: number;
}

export function verifySessionValue(raw: string | undefined): SessionCookieInfo | null {
  if (!raw) return null;
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [userId, issuedStr, sig] = parts as [string, string, string];
  const expected = sign(`${userId}.${issuedStr}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const issued = Number(issuedStr);
  if (!Number.isFinite(issued)) return null;
  if (Date.now() - issued > MAX_AGE_SECONDS * 1000) return null;
  return { userId, issuedAtMs: issued };
}

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: MAX_AGE_SECONDS,
  secure: process.env['NODE_ENV'] === 'production',
};
