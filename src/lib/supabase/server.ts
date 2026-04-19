import { cookies } from 'next/headers';
import { createServerClient, type CookieOptions } from '@supabase/ssr';

/**
 * Supabase client for server components, route handlers, and server actions.
 * Uses anon key + the user's cookie-bound session -> RLS applies.
 *
 * Do NOT import this from client components.
 */
export async function createSupabaseServerClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const anon = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  if (!url || !anon) {
    throw new Error(
      'Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local',
    );
  }

  const store = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: CookieOptions }>) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            store.set(name, value, options as CookieOptions);
          }
        } catch {
          // Called from a server component.  Mutations happen in middleware.
        }
      },
    },
  });
}

/**
 * Supabase client with the SERVICE ROLE key.  Bypasses RLS.  Use only for
 * engine-level writes (commit_turn etc.) where the code itself authorizes
 * the operation.  NEVER pass this client to user-influenced paths.
 */
export function createSupabaseAdminClient() {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    throw new Error(
      'Supabase admin not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY',
    );
  }
  return createServerClient(url, key, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
