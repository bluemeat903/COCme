import type { KpOutput, CheckRequest } from '../schemas/index.js';
import type { CheckResolution, SessionState } from './state.js';

/**
 * What the player actually sees after a turn.  Explicitly strips hidden_notes
 * and anything else the KP considered internal.
 */
export interface PlayerView {
  session_id: string;
  scene_id: string;
  turn_index: number;
  narration: string;
  options: string[];
  /** If the KP asked for a check this turn, this describes the next-action prompt. */
  pending_check: PlayerCheckPrompt | null;
  /** If the current turn RESOLVED a previously pending check, its summary. */
  resolved_check: {
    summary: string;
    outcome: CheckResolution['outcome'];
    /** d100 final value, 1-100.  Present for skill/char/luck/san checks. */
    roll: number;
    /** Target the roll was compared against (skill value, or current SAN). */
    target: number | null;
    /** What kind of check this was -- drives badge phrasing on the UI. */
    kind: 'skill_like' | 'san';
  } | null;
  /** Effects applied this turn, already in human-readable form. */
  effects: string[];
  /** Quick investigator snapshot for HUD. */
  hud: HudSnapshot;
  /** All clues discovered so far this session, for the clue board sidebar. */
  discovered_clues: DiscoveredClueView[];
  /** Full investigator sheet for the in-game sidebar. */
  investigator_sheet: InvestigatorSheet;
  status: SessionState['status'];
  ending?: string;
}

export interface HudSnapshot {
  hp: { current: number; max: number };
  mp: { current: number; max: number };
  san: { current: number; max: number };
  luck: number;
  conditions: string[];
}

/**
 * Full investigator sheet for the in-game sidebar.  Static-ish data
 * (stats + derived) and evolving data (skills.used_this_session) all travel
 * with each PlayerView so the UI stays in sync without a second fetch.
 */
export interface InvestigatorSheet {
  name: string;
  era: string;
  occupation: string | null;
  age: number | null;
  stats: { str: number; con: number; siz: number; dex: number; app: number; int: number; pow: number; edu: number };
  derived: { mov: number; damage_bonus: string; build: number };
  /** Skill name -> current value (include base for UI highlighting) + whether used this session. */
  skills: Record<string, { base: number; value: number; used_this_session: boolean }>;
  inventory: Array<{ item: string; qty: number; notes?: string }>;
}

export interface DiscoveredClueView {
  key: string;
  name: string;
  text: string;
  context?: string;
  discovered_at?: string;
}

export function buildInvestigatorSheet(state: SessionState): InvestigatorSheet {
  const base = state.investigator.base;
  const cur = state.investigator.current;
  const skills: InvestigatorSheet['skills'] = {};
  for (const [key, sk] of Object.entries(cur.skills)) {
    skills[key] = { base: sk.base, value: sk.value, used_this_session: sk.used_this_session };
  }
  return {
    name: base.name,
    era: base.era,
    occupation: base.occupation,
    age: base.age,
    stats: { ...base.stats },
    derived: { mov: base.mov, damage_bonus: base.damage_bonus, build: base.build },
    skills,
    inventory: cur.inventory.map(i => {
      const x: { item: string; qty: number; notes?: string } = { item: i.item, qty: i.qty };
      if (i.notes !== undefined) x.notes = i.notes;
      return x;
    }),
  };
}

export function buildDiscoveredClues(state: SessionState): DiscoveredClueView[] {
  const defs = new Map(state.module.clues.map(c => [c.key, c]));
  const out: DiscoveredClueView[] = [];
  for (const [key, st] of Object.entries(state.clues)) {
    if (!st.discovered) continue;
    const def = defs.get(key);
    if (!def) continue;
    const entry: DiscoveredClueView = { key, name: def.name, text: def.text };
    if (st.discovery_context !== undefined) entry.context = st.discovery_context;
    if (st.discovered_at !== undefined) entry.discovered_at = st.discovered_at;
    out.push(entry);
  }
  return out.sort((a, b) => (a.discovered_at ?? '').localeCompare(b.discovered_at ?? ''));
}

export interface PlayerCheckPrompt {
  kind: CheckRequest['kind'];
  skill_or_stat: string | null;
  difficulty: CheckRequest['difficulty'];
  bonus_dice: number;
  penalty_dice: number;
  allow_push: boolean;
  note?: string;
}

/** HUD snapshot from current session state.  Shared by toPlayerView / buildResumeView. */
export function buildHud(state: SessionState): HudSnapshot {
  return {
    hp: { current: state.investigator.current.hp_current, max: state.investigator.base.hp_max },
    mp: { current: state.investigator.current.mp_current, max: state.investigator.base.mp_max },
    san: { current: state.investigator.current.san_current, max: state.investigator.base.san_max },
    luck: state.investigator.current.luck,
    conditions: [...state.investigator.current.conditions],
  };
}

export function toPlayerView(
  state: SessionState,
  turn: { index: number; kp_output: KpOutput },
  resolvedCheck: CheckResolution | null,
  effects: string[],
): PlayerView {
  const out = turn.kp_output;
  return {
    session_id: state.session_id,
    scene_id: out.scene_id,
    turn_index: turn.index,
    narration: out.visible_narration,
    options: out.player_options,
    pending_check: out.required_check ? toPrompt(out.required_check) : null,
    resolved_check: resolvedCheck ? toResolvedCheckProjection(resolvedCheck) : null,
    effects,
    hud: buildHud(state),
    discovered_clues: buildDiscoveredClues(state),
    investigator_sheet: buildInvestigatorSheet(state),
    status: state.status,
    ...(state.ending !== undefined ? { ending: state.ending } : {}),
  };
}

/**
 * Build a "resume" view from the persisted session.  Used when the user lands
 * mid-session: we can't recover the ephemeral `resolved_check` / `effects` of
 * the last turn, but we can show the last narration, options, pending check,
 * and HUD.
 */
export function buildResumeView(state: SessionState): PlayerView {
  const lastKpTurn = [...state.turns].reverse().find(t => t.actor === 'kp');
  const narration = lastKpTurn?.visible_narration ?? state.module.premise;
  const options = lastKpTurn?.kp_output?.player_options ?? [];

  return {
    session_id: state.session_id,
    scene_id: state.current_scene_id,
    turn_index: state.turns.length,
    narration,
    options,
    pending_check: state.pending_check ? toPrompt(state.pending_check) : null,
    resolved_check: null,
    effects: [],
    hud: buildHud(state),
    discovered_clues: buildDiscoveredClues(state),
    investigator_sheet: buildInvestigatorSheet(state),
    status: state.status,
    ...(state.ending !== undefined ? { ending: state.ending } : {}),
  };
}

function toResolvedCheckProjection(r: CheckResolution): NonNullable<PlayerView['resolved_check']> {
  if (r.kind === 'san' && r.san_result) {
    return {
      summary: r.summary,
      outcome: r.outcome,
      roll: r.san_result.d100,
      target: r.san_result.current_san,
      kind: 'san',
    };
  }
  if (r.kind === 'skill_like' && r.skill_result) {
    return {
      summary: r.summary,
      outcome: r.outcome,
      roll: r.skill_result.roll.chosen,
      target: r.skill_result.target,
      kind: 'skill_like',
    };
  }
  // shouldn't happen, but keep the type honest
  return { summary: r.summary, outcome: r.outcome, roll: 0, target: null, kind: r.kind };
}

export function toPrompt(req: CheckRequest): PlayerCheckPrompt {
  return {
    kind: req.kind,
    skill_or_stat: req.skill_or_stat,
    difficulty: req.difficulty,
    bonus_dice: req.bonus_dice,
    penalty_dice: req.penalty_dice,
    allow_push: req.allow_push,
    ...(req.note !== undefined ? { note: req.note } : {}),
  };
}
