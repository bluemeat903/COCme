/**
 * DB row types mirroring the Supabase tables.  Hand-rolled; when we wire up
 * `supabase gen types typescript` later, we can replace these with generated
 * ones and keep the repo interface unchanged.
 */

import type { KpOutput, CheckRequest, ModuleContent } from '../schemas/index.js';

export interface InvestigatorRow {
  id: string;
  owner_id: string;
  name: string;
  era: string;
  occupation: string | null;
  age: number | null;
  gender: string | null;
  residence: string | null;
  birthplace: string | null;
  stat_str: number; stat_con: number; stat_siz: number; stat_dex: number;
  stat_app: number; stat_int: number; stat_pow: number; stat_edu: number;
  luck: number;
  hp_max: number; hp_current: number;
  mp_max: number; mp_current: number;
  san_max: number; san_start: number; san_current: number;
  mov: number;
  damage_bonus: string;
  build: number;
  skills: Record<string, { base: number; value: number }>;
  inventory: Array<{ item: string; qty: number; notes?: string }>;
  background: Record<string, unknown>;
  portrait_url: string | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModuleRow {
  id: string;
  owner_id: string | null;
  source_kind: 'user_upload' | 'ai_generated' | 'preset';
  title: string;
  era: string;
  premise: string | null;
  tags: string[];
  duration_min: number | null;
  schema_version: number;
  content: ModuleContent;
  original_upload_path: string | null;
  is_public: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: string;
  owner_id: string;
  investigator_id: string;
  module_id: string;
  status: 'active' | 'completed' | 'abandoned' | 'failed';
  current_scene_id: string | null;
  game_clock: { elapsed_minutes: number };
  ending: string | null;
  summary: string | null;
  pending_check: CheckRequest | null;
  flags: Record<string, string | number | boolean | null>;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionInvestigatorStateRow {
  session_id: string;
  base_snapshot: unknown;       // InvestigatorSnapshot
  current_state: unknown;       // InvestigatorRuntimeState
  updated_at: string;
}

export interface TurnRow {
  id: string;
  session_id: string;
  turn_index: number;
  actor: 'player' | 'kp' | 'system';
  player_input: string | null;
  kp_output: KpOutput | null;
  visible_narration: string | null;
  created_at: string;
}

export interface CheckRow {
  id: string;
  session_id: string;
  turn_id: string | null;
  kind: 'skill' | 'characteristic' | 'opposed' | 'san' | 'luck' | 'damage' | 'custom';
  skill_or_stat: string | null;
  target: number | null;
  difficulty: 'regular' | 'hard' | 'extreme' | null;
  bonus_dice: number;
  penalty_dice: number;
  roll_raw: unknown;
  roll_result: number;
  outcome: string;
  pushed: boolean;
  created_at: string;
}

export interface SessionEventRow {
  id: string;
  session_id: string;
  turn_id: string | null;
  kind: string;
  payload: unknown;
  created_at: string;
}

export interface SessionClueRow {
  id: string;
  session_id: string;
  clue_key: string;
  discovered: boolean;
  discovered_at: string | null;
  discovery_context: string | null;
  player_notes: string | null;
}

export interface SessionNpcRow {
  id: string;
  session_id: string;
  npc_key: string;
  disposition: string | null;
  alive: boolean;
  hp_current: number | null;
  san_modifier: number;
  notes: Record<string, unknown>;
}
