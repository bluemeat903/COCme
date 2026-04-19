import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  createSessionValue,
  verifySessionValue,
} from './session-cookie';
import { findUserById, type PublicUser } from './localdb/users';
import { LocalDB } from './localdb/db';

/**
 * Read the current signed-in user, or null if no valid session cookie.
 * Silent -- never redirects, never throws.
 */
export async function getCurrentUser(): Promise<PublicUser | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE_NAME)?.value;
  const info = verifySessionValue(raw);
  if (!info) return null;
  const row = await findUserById(info.userId);
  if (!row) return null;
  return { id: row.id, email: row.email };
}

/**
 * Require authentication.  Redirects to /sign-in if no session.
 * Returns the user object for typed use inside server actions / pages.
 */
export async function requireUser(): Promise<PublicUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');
  return user;
}

/**
 * Require that the caller owns the given session row.  Throws on missing
 * session or owner mismatch; redirects to /sign-in if unauthenticated.
 */
export async function requireSessionOwner(sessionId: string): Promise<PublicUser> {
  const user = await requireUser();
  const db = await LocalDB.get();
  const row = db.sessions.find(s => s.id === sessionId);
  if (!row) throw new Error('session not found');
  if (row.owner_id !== user.id) throw new Error('forbidden');
  return user;
}

/** Mutations for sign-in / sign-out pages.  Use from server actions only. */
export async function setSessionCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, createSessionValue(userId), SESSION_COOKIE_OPTIONS);
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, '', { ...SESSION_COOKIE_OPTIONS, maxAge: 0 });
}
