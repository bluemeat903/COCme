'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { buildInvestigator } from '@/character/builder';
import type { CharacterDraft, SkillAllocation } from '@/character/schema';
import type { InvestigatorRow } from '@/db/types';
import { requireUser } from '@/lib/auth';
import { LocalDB } from '@/lib/localdb/db';

export async function createInvestigatorAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const str = (k: string) => String(formData.get(k) ?? '').trim();
  const num = (k: string) => {
    const raw = str(k);
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error(`invalid number for ${k}: ${raw}`);
    return n;
  };

  let skill_allocations: Record<string, SkillAllocation> = {};
  const allocRaw = str('skill_allocations');
  if (allocRaw) {
    try {
      const parsed = JSON.parse(allocRaw) as unknown;
      if (parsed && typeof parsed === 'object') {
        skill_allocations = parsed as Record<string, SkillAllocation>;
      }
    } catch (err) {
      redirect(`/investigators/new?error=${encodeURIComponent(`技能分配解析失败：${(err as Error).message}`)}`);
    }
  }

  let draft: CharacterDraft;
  try {
    draft = {
      name: str('name'),
      era: str('era') || '1920s',
      age: num('age'),
      occupation_key: str('occupation_key'),
      stats: {
        str: num('stat_str'),
        con: num('stat_con'),
        siz: num('stat_siz'),
        dex: num('stat_dex'),
        app: num('stat_app'),
        int: num('stat_int'),
        pow: num('stat_pow'),
        edu: num('stat_edu'),
      },
      luck: num('luck'),
      skill_allocations,
      background: {
        ...(str('bg_ideology') ? { ideology_beliefs: str('bg_ideology') } : {}),
        ...(str('bg_people') ? { significant_people: str('bg_people') } : {}),
        ...(str('bg_traits') ? { traits: str('bg_traits') } : {}),
      },
      inventory: [],
    };
  } catch (err) {
    redirect(`/investigators/new?error=${encodeURIComponent((err as Error).message)}`);
  }

  let investigator: InvestigatorRow;
  try {
    const result = buildInvestigator(draft, { owner_id: user.id });
    investigator = result.investigator;
  } catch (err) {
    redirect(`/investigators/new?error=${encodeURIComponent((err as Error).message)}`);
  }

  const db = await LocalDB.get();
  await db.mutate(['investigators'], d => {
    d.investigators.push(investigator);
  });

  revalidatePath('/investigators');
  redirect('/investigators');
}

export async function archiveInvestigatorAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const id = String(formData.get('id') ?? '').trim();
  if (!id) redirect('/investigators');

  const db = await LocalDB.get();
  const row = db.investigators.find(i => i.id === id);
  if (!row || row.owner_id !== user.id) {
    redirect(`/investigators/${id}?error=${encodeURIComponent('权限不足或卡不存在')}`);
  }
  await db.mutate(['investigators'], d => {
    const r = d.investigators.find(i => i.id === id);
    if (r) r.is_archived = true;
  });

  revalidatePath('/investigators');
  redirect('/investigators');
}
