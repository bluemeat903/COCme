'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { LocalSessionRepo } from '@/db/local';
import { computeGrowth, computeSummary, formatSummaryText } from '@/engine';
import { cryptoRng } from '@/rules';
import { LocalDB } from '@/lib/localdb/db';
import { requireSessionOwner } from '@/lib/auth';

export async function applyGrowthAction(formData: FormData): Promise<void> {
  const sessionId = String(formData.get('id') ?? '').trim();
  if (!sessionId) redirect('/investigators');

  await requireSessionOwner(sessionId);

  const repo = new LocalSessionRepo();
  const state = await repo.loadSession(sessionId);

  if (state.status === 'active') {
    redirect(`/sessions/${sessionId}/summary?error=${encodeURIComponent('局未结束，无法应用成长')}`);
  }

  const db = await LocalDB.get();
  const existing = db.growth_records.find(g => g.session_id === sessionId);
  if (existing?.applied) {
    redirect(`/sessions/${sessionId}/summary?applied=1`);
  }

  const growth = computeGrowth(state, cryptoRng);
  const summary = computeSummary(state);
  const summaryText = formatSummaryText(summary);
  const now = new Date().toISOString();

  await db.mutate(['investigators', 'growth_records', 'sessions'], d => {
    // 1) write-back to investigator
    const inv = d.investigators.find(i => i.id === state.investigator_id);
    if (inv) {
      inv.skills = growth.new_skills;
      inv.hp_current = state.investigator.current.hp_current;
      inv.mp_current = state.investigator.current.mp_current;
      inv.san_current = state.investigator.current.san_current;
      inv.luck = state.investigator.current.luck;
      // accumulate new phobias/manias into background
      if (growth.new_phobias_manias.length > 0) {
        const bgPhobias = Array.isArray(inv.background['phobias_manias'])
          ? (inv.background['phobias_manias'] as unknown[]).filter((x): x is string => typeof x === 'string')
          : typeof inv.background['phobias_manias'] === 'string'
            ? [inv.background['phobias_manias'] as string]
            : [];
        inv.background = {
          ...inv.background,
          phobias_manias: [...bgPhobias, ...growth.new_phobias_manias],
        };
      }
      inv.updated_at = now;
    }

    // 2) growth_records
    if (existing) {
      existing.skill_improvements = growth.skill_improvements;
      existing.san_delta = growth.san_delta;
      existing.hp_delta = growth.hp_delta;
      existing.luck_delta = growth.luck_delta;
      existing.new_phobias_manias = growth.new_phobias_manias;
      existing.conditions_carried = growth.conditions_carried;
      existing.applied = true;
      existing.applied_at = now;
    } else {
      d.growth_records.push({
        id: randomUUID(),
        session_id: sessionId,
        investigator_id: state.investigator_id,
        skill_improvements: growth.skill_improvements,
        san_delta: growth.san_delta,
        hp_delta: growth.hp_delta,
        luck_delta: growth.luck_delta,
        new_phobias_manias: growth.new_phobias_manias,
        conditions_carried: growth.conditions_carried,
        applied: true,
        applied_at: now,
        created_at: now,
      });
    }

    // 3) session summary text
    const sess = d.sessions.find(s => s.id === sessionId);
    if (sess) {
      sess.summary = summaryText;
      sess.updated_at = now;
    }
  });

  revalidatePath(`/sessions/${sessionId}/summary`);
  revalidatePath('/investigators');
  redirect(`/sessions/${sessionId}/summary?applied=1`);
}
