'use server';

import { redirect } from 'next/navigation';
import { verifyLogin } from '@/lib/localdb/users';
import { setSessionCookie } from '@/lib/auth';

export async function signInAction(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/investigators');

  const result = await verifyLogin({ email, password });
  if ('error' in result) {
    redirect(`/sign-in?error=${encodeURIComponent(result.error)}`);
  }
  await setSessionCookie(result.user.id);
  redirect(next);
}
