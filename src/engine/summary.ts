import type { SessionState, SessionEvent } from './state.js';
import type { Rng } from '../rules/rng.js';
import { rollD100 } from '../rules/dice.js';

// ---------------------------------------------------------------------------
// Summary: aggregate a completed (or active) session into a single object the
// UI can render directly.  Pure read-only.
// ---------------------------------------------------------------------------

export interface SessionSummary {
  investigator_name: string;
  module_title: string;
  status: SessionState['status'];
  ending: string | null;
  turn_count: number;
  elapsed_minutes: number;

  hp: { start: number; end: number; delta: number };
  mp: { start: number; end: number; delta: number };
  san: { start: number; end: number; delta: number };
  luck: { start: number; end: number; delta: number };

  clues_discovered: Array<{ key: string; name: string; at: string | undefined }>;
  checks: Array<{ skill: string | null; outcome: string; roll: number | null; pushed: boolean }>;
  events_timeline: Array<{ kind: string; at: string; label: string }>;

  phobias_gained: string[];
  conditions_ended_with: string[];
}

export function computeSummary(state: SessionState): SessionSummary {
  const base = state.investigator.base;
  const cur = state.investigator.current;

  const clues = Object.values(state.clues)
    .filter(c => c.discovered)
    .map(c => {
      const def = state.module.clues.find(d => d.key === c.clue_key);
      return { key: c.clue_key, name: def?.name ?? c.clue_key, at: c.discovered_at };
    })
    .sort((a, b) => (a.at ?? '').localeCompare(b.at ?? ''));

  const checks: SessionSummary['checks'] = [];
  for (const t of state.turns) {
    const r = t.check_resolution;
    if (!r) continue;
    if (r.kind === 'skill_like' && r.skill_result) {
      checks.push({
        skill: r.request.skill_or_stat,
        outcome: r.skill_result.outcome,
        roll: r.skill_result.roll.chosen,
        pushed: r.skill_result.pushed,
      });
    } else if (r.kind === 'san' && r.san_result) {
      checks.push({
        skill: 'SAN',
        outcome: r.san_result.passed ? 'san_passed' : 'san_failed',
        roll: r.san_result.d100,
        pushed: false,
      });
    }
  }

  const events_timeline: SessionSummary['events_timeline'] = state.events.map(e => ({
    kind: e.kind,
    at: e.at,
    label: eventLabel(e),
  }));

  return {
    investigator_name: base.name,
    module_title: state.module.meta.title,
    status: state.status,
    ending: state.ending ?? null,
    turn_count: state.turns.length,
    elapsed_minutes: state.game_clock.elapsed_minutes,
    hp: { start: base.hp_max, end: cur.hp_current, delta: cur.hp_current - base.hp_max },
    mp: { start: base.mp_max, end: cur.mp_current, delta: cur.mp_current - base.mp_max },
    san: { start: base.san_start, end: cur.san_current, delta: cur.san_current - base.san_start },
    luck: { start: base.luck_start, end: cur.luck, delta: cur.luck - base.luck_start },
    clues_discovered: clues,
    checks,
    events_timeline,
    phobias_gained: [...cur.phobias_manias],
    conditions_ended_with: [...cur.conditions],
  };
}

function eventLabel(e: SessionEvent): string {
  switch (e.kind) {
    case 'clock_advance':   return `时间 +${e.minutes} 分钟`;
    case 'hp_change':       return `HP ${e.delta >= 0 ? '+' : ''}${e.delta} → ${e.new_value}${e.reason ? ` (${e.reason})` : ''}`;
    case 'mp_change':       return `MP ${e.delta >= 0 ? '+' : ''}${e.delta} → ${e.new_value}`;
    case 'san_change':      return `SAN ${e.delta >= 0 ? '+' : ''}${e.delta} → ${e.new_value}${e.reason ? ` (${e.reason})` : ''}`;
    case 'luck_change':     return `Luck ${e.delta >= 0 ? '+' : ''}${e.delta} → ${e.new_value}`;
    case 'damage_roll':     return `伤害 ${e.expression} = ${e.rolled}，实际受 ${e.applied}`;
    case 'san_check':       return `SAN 检定 ${e.loss}: d100=${e.d100} ${e.passed ? '通过' : '失败'}，扣 ${e.lost}`;
    case 'inventory_add':   return `获得 ×${e.qty} ${e.item}`;
    case 'inventory_remove':return `失去 ×${e.qty} ${e.item}`;
    case 'clue_found':      return `线索：${e.clue_key}`;
    case 'npc_disposition': return `NPC ${e.npc_key} 态度 → ${e.disposition}`;
    case 'npc_dead':        return `NPC ${e.npc_key} 死亡`;
    case 'scene_change':    return `场景：${e.from} → ${e.to}`;
    case 'flag_set':        return `旗标 ${e.key}=${JSON.stringify(e.value)}`;
    case 'check_resolved':  return `检定：${e.summary}`;
    case 'temp_insanity_threshold': return `精神冲击（一次损失 ${e.loss} ≥ 5，触发短期疯狂）`;
    case 'character_dead':  return `角色死亡`;
    case 'character_insane':return `永久疯狂`;
  }
}

// ---------------------------------------------------------------------------
// Growth: after a session ends, each skill marked used_this_session rolls an
// improvement check.  Roll > skill_value (or > 95) succeeds; gain 1d10.
// Carries HP / SAN / luck from session to investigator.
// ---------------------------------------------------------------------------

export interface GrowthOutcome {
  skill_improvements: Array<{ skill: string; d100: number; pre: number; post: number; gain: number }>;
  san_delta: number;
  hp_delta: number;
  luck_delta: number;
  new_phobias_manias: string[];
  conditions_carried: string[];
  /** The fully updated investigator skill map (to write back to the investigator row). */
  new_skills: Record<string, { base: number; value: number }>;
}

export function computeGrowth(state: SessionState, rng: Rng): GrowthOutcome {
  const cur = state.investigator.current;
  const base = state.investigator.base;

  const new_skills: Record<string, { base: number; value: number }> = {};
  const improvements: GrowthOutcome['skill_improvements'] = [];

  for (const [key, sk] of Object.entries(cur.skills)) {
    if (!sk.used_this_session || sk.value >= 99) {
      new_skills[key] = { base: sk.base, value: sk.value };
      continue;
    }
    const roll = rollD100(rng, 0).chosen;
    let gain = 0;
    if (roll > sk.value || roll > 95) {
      // CoC 7e: gain 1d10
      gain = rng.int(1, 10);
    }
    const post = Math.min(99, sk.value + gain);
    new_skills[key] = { base: sk.base, value: post };
    improvements.push({ skill: key, d100: roll, pre: sk.value, post, gain });
  }

  return {
    skill_improvements: improvements,
    san_delta: cur.san_current - base.san_start,
    hp_delta: cur.hp_current - base.hp_max,
    luck_delta: cur.luck - base.luck_start,
    new_phobias_manias: [...cur.phobias_manias],
    // 'indefinite_insanity' / 'dead' carry; transient like 'temp_insanity_pending' do not.
    conditions_carried: cur.conditions.filter(c => c === 'indefinite_insanity' || c === 'dead'),
    new_skills,
  };
}

export function formatSummaryText(s: SessionSummary): string {
  const parts: string[] = [];
  parts.push(`${s.investigator_name} 完成了《${s.module_title}》。`);
  parts.push(`回合 ${s.turn_count}，游戏时间 ${s.elapsed_minutes} 分钟。`);
  parts.push(`HP ${s.hp.start} → ${s.hp.end}，SAN ${s.san.start} → ${s.san.end}。`);
  if (s.clues_discovered.length > 0) {
    parts.push(`发现 ${s.clues_discovered.length} 条线索：${s.clues_discovered.map(c => c.name).join('、')}。`);
  }
  if (s.phobias_gained.length > 0) {
    parts.push(`新增 ${s.phobias_gained.length} 条恐惧/躁狂：${s.phobias_gained.join('、')}。`);
  }
  if (s.ending) parts.push(`结局：${s.ending}。`);
  return parts.join(' ');
}
