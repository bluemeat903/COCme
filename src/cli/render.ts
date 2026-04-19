import type { PlayerView } from '../engine/index.js';

/** Width for separator bars. */
const BAR = '─'.repeat(78);
const HR  = '═'.repeat(78);

export function renderPlayerView(view: PlayerView): string {
  const lines: string[] = [];
  lines.push(HR);
  lines.push(renderHeader(view));
  lines.push(HR);
  lines.push('');

  if (view.resolved_check) {
    lines.push(`[检定] ${view.resolved_check.summary}`);
    lines.push('');
  }

  lines.push(indent(view.narration, 2));
  lines.push('');

  if (view.effects.length > 0) {
    lines.push(`[效果] ${view.effects.join(' · ')}`);
    lines.push('');
  }

  if (view.options.length > 0) {
    lines.push('可选行动：');
    view.options.forEach((o, i) => lines.push(`  ${i + 1}) ${o}`));
    lines.push('');
  }

  if (view.pending_check) {
    const c = view.pending_check;
    const skill = c.skill_or_stat ?? c.kind;
    const bonuses = [
      c.bonus_dice > 0 ? `+${c.bonus_dice} 奖励骰` : null,
      c.penalty_dice > 0 ? `${c.penalty_dice} 惩罚骰` : null,
    ].filter(Boolean).join('，');
    lines.push(`[需要检定] ${skill} (${c.difficulty})${bonuses ? '，' + bonuses : ''}`);
    if (c.note) lines.push(`           ${c.note}`);
    if (c.allow_push) lines.push(`           失败后可输入 "push" 推动。`);
    lines.push('');
  }

  if (view.status !== 'active') {
    lines.push(BAR);
    lines.push(`[局已结束] 状态=${view.status}${view.ending ? `，结局=${view.ending}` : ''}`);
    lines.push(BAR);
  }

  return lines.join('\n');
}

function renderHeader(v: PlayerView): string {
  const hp = `HP ${v.hud.hp.current}/${v.hud.hp.max}`;
  const mp = `MP ${v.hud.mp.current}/${v.hud.mp.max}`;
  const san = `SAN ${v.hud.san.current}/${v.hud.san.max}`;
  const luck = `Luck ${v.hud.luck}`;
  const condStr = v.hud.conditions.length > 0 ? ` · 状态: ${v.hud.conditions.join(',')}` : '';
  return `[场景 ${v.scene_id}] 回合 ${v.turn_index}   ${hp}  ${mp}  ${san}  ${luck}${condStr}`;
}

function indent(s: string, n: number): string {
  const pad = ' '.repeat(n);
  return s.split('\n').map(l => pad + l).join('\n');
}

export function renderHelp(): string {
  return [
    '输入说明：',
    '  - 直接输入文字 = 你的行动/对话',
    '  - 输入 1/2/3... = 选择对应可选行动',
    '  - push          = 推动上一个失败的检定',
    '  - q 或 exit     = 退出',
    '',
  ].join('\n');
}

export function renderBanner(mode: 'dry-run' | 'live', sessionId: string): string {
  return [
    HR,
    `COC 单人跑团 CLI   模式: ${mode}   会话: ${sessionId}`,
    HR,
    '',
  ].join('\n');
}
