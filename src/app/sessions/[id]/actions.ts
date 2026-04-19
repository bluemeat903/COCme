'use server';

import { redirect } from 'next/navigation';
import { LocalSessionRepo } from '@/db/local';
import {
  pushLastFailedCheck,
  buildResumeView,
  type PlayerView,
} from '@/engine';
import { cryptoRng } from '@/rules/index';
import { requireSessionOwner } from '@/lib/auth';
import { LocalDB } from '@/lib/localdb/db';

// Turn submission now lives in the streaming POST /api/sessions/[id]/turn
// route handler so the UI can render narration as DeepSeek writes it.  This
// file keeps only the non-streaming actions.

export async function pushAction(sessionId: string): Promise<PlayerView> {
  await requireSessionOwner(sessionId);

  const repo = new LocalSessionRepo();
  const state = await repo.loadSession(sessionId);
  const { state: nextState, resolution, turn_id } = pushLastFailedCheck(state, cryptoRng);

  if (resolution.kind === 'skill_like' && resolution.skill_result) {
    await repo.commitPush({
      session_id: sessionId,
      turn_id,
      roll_raw: resolution.skill_result.roll,
      roll_result: resolution.skill_result.roll.chosen,
      outcome: resolution.skill_result.outcome,
      summary: resolution.summary,
      event_payload: {
        request: resolution.request,
      },
      event_created_at: new Date().toISOString(),
    });
  }

  const base = buildResumeView(nextState);
  const rolled =
    resolution.kind === 'skill_like' && resolution.skill_result
      ? { roll: resolution.skill_result.roll.chosen, target: resolution.skill_result.target as number | null }
      : { roll: 0, target: null as number | null };
  return {
    ...base,
    narration: `[推动检定] ${resolution.summary}`,
    options: [],
    pending_check: null,
    resolved_check: {
      summary: resolution.summary,
      outcome: resolution.outcome,
      roll: rolled.roll,
      target: rolled.target,
      kind: resolution.kind,
    },
  };
}

export async function abandonAction(sessionId: string): Promise<void> {
  await requireSessionOwner(sessionId);
  const db = await LocalDB.get();
  await db.mutate(['sessions'], d => {
    const s = d.sessions.find(s => s.id === sessionId);
    if (s) {
      s.status = 'abandoned';
      s.ended_at = new Date().toISOString();
    }
  });
  redirect('/investigators');
}
