'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth';
import { setUserDeepSeekKey, clearUserDeepSeekKey } from '@/lib/localdb/users';

export async function saveDeepSeekKeyAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const raw = String(formData.get('key') ?? '').trim();

  if (!raw) {
    redirect(`/settings?error=${encodeURIComponent('key 不能为空')}`);
  }
  if (raw.length < 10 || raw.length > 200) {
    redirect(`/settings?error=${encodeURIComponent('key 长度看起来不对（应为 10-200 字符）')}`);
  }
  if (!raw.startsWith('sk-')) {
    redirect(`/settings?error=${encodeURIComponent('DeepSeek key 通常以 sk- 开头；确认一下是否贴错了？')}`);
  }

  try {
    await setUserDeepSeekKey(user.id, raw);
  } catch (err) {
    redirect(`/settings?error=${encodeURIComponent(`保存失败：${(err as Error).message}`)}`);
  }
  revalidatePath('/settings');
  redirect('/settings?saved=1');
}

export async function clearDeepSeekKeyAction(): Promise<void> {
  const user = await requireUser();
  try {
    await clearUserDeepSeekKey(user.id);
  } catch (err) {
    redirect(`/settings?error=${encodeURIComponent(`清除失败：${(err as Error).message}`)}`);
  }
  revalidatePath('/settings');
  redirect('/settings?cleared=1');
}
