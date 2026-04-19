'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { generateModule } from '@/modules/generator';
import { importModule } from '@/modules/importer';
import { chunkModule } from '@/modules/chunker';
import { createDeepSeek } from '@/ai/deepseek';
import type { ModuleRow } from '@/db/types';
import { requireUser } from '@/lib/auth';
import { LocalDB, type ModuleChunkRow } from '@/lib/localdb/db';
import { resolveDeepSeekApiKey } from '@/lib/deepseek-resolver';

async function insertModuleAndChunks(moduleRow: ModuleRow): Promise<string> {
  const chunks: ModuleChunkRow[] = chunkModule(moduleRow.content).map(c => ({
    id: randomUUID(),
    module_id: moduleRow.id,
    chunk_index: c.chunk_index,
    content: c.content,
    metadata: c.metadata,
    embedding: null,
  }));
  const db = await LocalDB.get();
  await db.mutate(['modules', 'module_chunks'], d => {
    d.modules.push(moduleRow);
    d.module_chunks.push(...chunks);
  });
  return moduleRow.id;
}

export async function generateModuleAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const theme = String(formData.get('theme') ?? '').trim();
  if (!theme) redirect(`/modules/new?error=${encodeURIComponent('请输入主题')}`);

  const era = String(formData.get('era') ?? '1920s');
  const tone = String(formData.get('tone') ?? '').trim();
  const durationRaw = String(formData.get('duration_min') ?? '').trim();
  const duration_min = durationRaw ? Number(durationRaw) : undefined;
  const extra = String(formData.get('extra') ?? '').trim();

  let moduleId: string;
  try {
    const apiKey = await resolveDeepSeekApiKey(user.id);
    const ds = createDeepSeek({ apiKey });
    const { module: moduleRow } = await generateModule(
      {
        theme,
        era,
        owner_id: user.id,
        ...(tone ? { tone } : {}),
        ...(duration_min !== undefined && !Number.isNaN(duration_min) ? { duration_min } : {}),
        ...(extra ? { extra } : {}),
      },
      {},
      { chat: ds.chat, reasonModel: ds.reasonModel, chatModel: ds.chatModel },
    );
    moduleId = await insertModuleAndChunks(moduleRow);
  } catch (err) {
    redirect(`/modules/new?error=${encodeURIComponent(`生成失败：${(err as Error).message}`)}`);
  }

  revalidatePath('/modules');
  redirect(`/modules/${moduleId}`);
}

export async function importModuleAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const raw_text = String(formData.get('raw_text') ?? '');
  if (!raw_text.trim()) {
    redirect(`/modules/import?error=${encodeURIComponent('请粘贴文档内容')}`);
  }
  const title_hint = String(formData.get('title_hint') ?? '').trim();
  const era_hint = String(formData.get('era_hint') ?? '').trim();

  let moduleId: string;
  try {
    const apiKey = await resolveDeepSeekApiKey(user.id);
    const ds = createDeepSeek({ apiKey });
    const { module: moduleRow } = await importModule(
      {
        raw_text,
        owner_id: user.id,
        ...(title_hint ? { title_hint } : {}),
        ...(era_hint ? { era_hint } : {}),
      },
      {},
      { chat: ds.chat, reasonModel: ds.reasonModel, chatModel: ds.chatModel },
    );
    moduleId = await insertModuleAndChunks(moduleRow);
  } catch (err) {
    redirect(`/modules/import?error=${encodeURIComponent(`导入失败：${(err as Error).message}`)}`);
  }

  revalidatePath('/modules');
  redirect(`/modules/${moduleId}`);
}

export async function archiveModuleAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) redirect('/modules');

  const db = await LocalDB.get();
  const row = db.modules.find(m => m.id === id);
  if (!row || row.owner_id !== user.id) {
    redirect(`/modules/${id}?error=${encodeURIComponent('权限不足或模组不存在')}`);
  }
  await db.mutate(['modules'], d => {
    const r = d.modules.find(m => m.id === id);
    if (r) r.is_archived = true;
  });

  revalidatePath('/modules');
  redirect('/modules');
}
