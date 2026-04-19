'use server';

import { redirect } from 'next/navigation';
import { LocalSessionRepo } from '@/db/local';
import { requireUser } from '@/lib/auth';
import { LocalDB } from '@/lib/localdb/db';

export async function createSessionAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const investigator_id = String(formData.get('investigator_id') ?? '').trim();
  const module_id = String(formData.get('module_id') ?? '').trim();
  if (!investigator_id || !module_id) {
    redirect(`/sessions/new?error=${encodeURIComponent('请选择调查员和模组')}`);
  }

  const db = await LocalDB.get();
  const inv = db.investigators.find(i => i.id === investigator_id && i.owner_id === user.id);
  if (!inv) redirect(`/sessions/new?error=${encodeURIComponent('调查员不存在或无权访问')}`);
  const mod = db.modules.find(m => m.id === module_id && (m.owner_id === user.id || m.is_public));
  if (!mod) redirect(`/sessions/new?error=${encodeURIComponent('模组不存在或无权访问')}`);

  const repo = new LocalSessionRepo();
  let sessionId: string;
  try {
    const { session_id } = await repo.createSession({
      owner_id: user.id,
      investigator: inv,
      module: mod,
    });
    sessionId = session_id;
  } catch (err) {
    redirect(`/sessions/new?error=${encodeURIComponent(`开局失败：${(err as Error).message}`)}`);
  }

  redirect(`/sessions/${sessionId}`);
}
