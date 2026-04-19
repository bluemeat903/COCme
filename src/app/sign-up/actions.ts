'use server';

import { redirect } from 'next/navigation';
import { registerUser } from '@/lib/localdb/users';
import { setSessionCookie } from '@/lib/auth';

export async function signUpAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/investigators');

  const result = await registerUser({ email, password });
  if ('error' in result) {
    redirect(`/sign-up?error=${encodeURIComponent(result.error)}`);
  }
  await setSessionCookie(result.user.id);
  redirect(next);
}
