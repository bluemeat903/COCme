-- =====================================================================
-- 0001_init.sql
-- 单人 BRP 兼容恐怖调查引擎 -- 核心表
-- 运行前提:
--   - 使用 Supabase (Postgres 15+)
--   - auth.users 已由 Supabase Auth 提供
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ---------------------------------------------------------------------
-- 通用 updated_at 触发器
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =====================================================================
-- 1. investigators -- 调查员 (出厂态)
-- =====================================================================
create table public.investigators (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,

  name         text not null,
  era          text not null default '1920s',          -- '1890s' | '1920s' | 'modern' | ...
  occupation   text,
  age          int check (age is null or age between 7 and 120),
  gender       text,
  residence    text,
  birthplace   text,

  -- BRP 8 项核心属性
  stat_str     int not null check (stat_str     between 0 and 999),
  stat_con     int not null check (stat_con     between 0 and 999),
  stat_siz     int not null check (stat_siz     between 0 and 999),
  stat_dex     int not null check (stat_dex     between 0 and 999),
  stat_app     int not null check (stat_app     between 0 and 999),
  stat_int     int not null check (stat_int     between 0 and 999),
  stat_pow     int not null check (stat_pow     between 0 and 999),
  stat_edu     int not null check (stat_edu     between 0 and 999),
  luck         int not null default 50 check (luck between 0 and 99),

  -- 派生值
  hp_max       int not null,
  hp_current   int not null,
  mp_max       int not null,
  mp_current   int not null,
  san_max      int not null,
  san_start    int not null,
  san_current  int not null,
  mov          int not null,
  damage_bonus text not null default '0',              -- '-2' | '-1' | '0' | '+1d4' | '+1d6' ...
  build        int not null default 0,

  -- 技能与其它块状数据
  skills       jsonb not null default '{}'::jsonb,     -- { "侦查": { "base":25, "value":60 }, ... }
  inventory    jsonb not null default '[]'::jsonb,
  background   jsonb not null default '{}'::jsonb,     -- 信念 / 重要之人 / 意义地点 / 珍视之物 / 特质 / 伤痕 / 奇异际遇

  portrait_url text,
  is_archived  bool not null default false,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  check (hp_current  between 0 and hp_max),
  check (mp_current  between 0 and mp_max),
  check (san_current between 0 and san_max)
);

create index investigators_owner_idx on public.investigators (owner_id, is_archived);

create trigger investigators_set_updated_at
before update on public.investigators
for each row execute function public.set_updated_at();

-- =====================================================================
-- 2. modules -- 模组 (canonical schema 存在 content 里)
-- =====================================================================
create table public.modules (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid references auth.users(id) on delete cascade,    -- null = system preset
  source_kind      text not null check (source_kind in ('user_upload','ai_generated','preset')),

  title            text not null,
  era              text not null default '1920s',
  premise          text,
  tags             text[] not null default '{}',
  duration_min     int,

  schema_version   int  not null default 1,
  content          jsonb not null,                      -- 见 docs/schema.md §2.2

  original_upload_path text,                            -- Supabase Storage 路径 (可空)

  is_public        bool not null default false,
  is_archived      bool not null default false,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index modules_owner_idx  on public.modules (owner_id, is_archived);
create index modules_public_idx on public.modules (is_public) where is_public = true;

create trigger modules_set_updated_at
before update on public.modules
for each row execute function public.set_updated_at();

-- =====================================================================
-- 3. module_chunks -- 分片 + 可选向量
-- =====================================================================
create table public.module_chunks (
  id           uuid primary key default gen_random_uuid(),
  module_id    uuid not null references public.modules(id) on delete cascade,
  chunk_index  int  not null,
  content      text not null,
  metadata     jsonb not null default '{}'::jsonb,     -- { "section": "location:warehouse", "scene_ids": [...] }
  embedding    vector(1024),                            -- 可空, 由后续 embedding 服务回填
  created_at   timestamptz not null default now(),

  unique (module_id, chunk_index)
);

create index module_chunks_module_idx on public.module_chunks (module_id);
create index module_chunks_fts_idx
  on public.module_chunks using gin (to_tsvector('simple', content));
-- 向量索引等数据量起来再建:
-- create index module_chunks_embedding_idx
--   on public.module_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- =====================================================================
-- 4. sessions -- 一次跑团
-- =====================================================================
create table public.sessions (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references auth.users(id) on delete cascade,
  investigator_id  uuid not null references public.investigators(id) on delete restrict,
  module_id        uuid not null references public.modules(id) on delete restrict,

  status           text not null default 'active'
                     check (status in ('active','completed','abandoned','failed')),
  current_scene_id text,                                -- 指向 modules.content.scene_nodes[].id
  game_clock       jsonb not null default '{"elapsed_minutes":0}'::jsonb,

  ending           text,                                -- 'good' | 'pyrrhic' | 'bad' | 'dead' | 'insane' | 'escaped'
  summary          text,

  started_at       timestamptz not null default now(),
  ended_at         timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- 一个 investigator 同时只能有一局 active
create unique index sessions_one_active_per_investigator
  on public.sessions (investigator_id)
  where status = 'active';

create index sessions_owner_status_idx on public.sessions (owner_id, status);

create trigger sessions_set_updated_at
before update on public.sessions
for each row execute function public.set_updated_at();

-- =====================================================================
-- 5. session_investigator_state -- 会话内的人物快照
-- =====================================================================
create table public.session_investigator_state (
  session_id     uuid primary key references public.sessions(id) on delete cascade,
  base_snapshot  jsonb not null,                        -- 开局拷贝, 不变
  current_state  jsonb not null,                        -- 会变, 所有修改都需伴随 session_events
  updated_at     timestamptz not null default now()
);

create trigger sis_set_updated_at
before update on public.session_investigator_state
for each row execute function public.set_updated_at();

-- =====================================================================
-- 6. turns -- 回合
-- =====================================================================
create table public.turns (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null references public.sessions(id) on delete cascade,
  turn_index         int  not null,
  actor              text not null check (actor in ('player','kp','system')),
  player_input       text,
  kp_output          jsonb,                              -- 见 docs/schema.md §2.6
  visible_narration  text,                               -- 冗余, 便于索引与玩家日志
  created_at         timestamptz not null default now(),

  unique (session_id, turn_index)
);

create index turns_session_desc_idx on public.turns (session_id, turn_index desc);

-- =====================================================================
-- 7. checks -- 检定 (骰子结果只由服务端写入)
-- =====================================================================
create table public.checks (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions(id) on delete cascade,
  turn_id        uuid references public.turns(id) on delete cascade,

  kind           text not null
                   check (kind in ('skill','characteristic','opposed','san','luck','damage','custom')),
  skill_or_stat  text,
  target         int,
  difficulty     text check (difficulty in ('regular','hard','extreme')),
  bonus_dice     int not null default 0 check (bonus_dice  between 0 and 3),
  penalty_dice   int not null default 0 check (penalty_dice between 0 and 3),

  roll_raw       jsonb not null,                         -- { "tens":[3,7], "units":4, "chosen":34 }
  roll_result    int  not null,
  outcome        text not null
                   check (outcome in ('fumble','fail','regular_success','hard_success','extreme_success','critical')),
  pushed         bool not null default false,

  created_at     timestamptz not null default now()
);

create index checks_session_idx on public.checks (session_id, created_at desc);
create index checks_turn_idx    on public.checks (turn_id);

-- =====================================================================
-- 8. session_clues
-- =====================================================================
create table public.session_clues (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.sessions(id) on delete cascade,
  clue_key            text not null,                     -- 对应 modules.content.clues[].key
  discovered          bool not null default false,
  discovered_at       timestamptz,
  discovery_context   text,
  player_notes        text,

  unique (session_id, clue_key)
);

create index session_clues_session_idx on public.session_clues (session_id, discovered);

-- =====================================================================
-- 9. session_npcs
-- =====================================================================
create table public.session_npcs (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions(id) on delete cascade,
  npc_key      text not null,                            -- 对应 modules.content.npcs[].key
  disposition  text,                                     -- 'hostile' | 'wary' | 'neutral' | 'friendly' | 'ally' | ...
  alive        bool not null default true,
  hp_current   int,
  san_modifier int not null default 0,
  notes        jsonb not null default '{}'::jsonb,

  unique (session_id, npc_key)
);

create index session_npcs_session_idx on public.session_npcs (session_id);

-- =====================================================================
-- 10. session_events -- 通用结构化事件日志
-- =====================================================================
create table public.session_events (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  turn_id     uuid references public.turns(id) on delete set null,
  kind        text not null,                             -- 'clock_advance' | 'san_change' | 'hp_change' | 'mp_change'
                                                         -- | 'inventory' | 'relationship' | 'scene_change'
                                                         -- | 'clue_found' | 'combat_start' | 'phobia_gained' | ...
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index session_events_session_idx on public.session_events (session_id, created_at desc);
create index session_events_kind_idx    on public.session_events (session_id, kind);

-- =====================================================================
-- 11. growth_records -- 局后成长
-- =====================================================================
create table public.growth_records (
  id                       uuid primary key default gen_random_uuid(),
  session_id               uuid not null references public.sessions(id) on delete cascade,
  investigator_id          uuid not null references public.investigators(id) on delete cascade,

  skill_checks_attempted   jsonb not null default '{}'::jsonb,   -- { "侦查": true, "聆听": true }
  improvement_rolls        jsonb not null default '{}'::jsonb,   -- { "侦查": { "roll": 87, "delta": 5 } }
  san_loss_total           int  not null default 0,
  injuries                 jsonb not null default '[]'::jsonb,
  new_phobias_manias       jsonb not null default '[]'::jsonb,
  relationships_changed    jsonb not null default '[]'::jsonb,

  applied                  bool not null default false,
  applied_at               timestamptz,

  created_at               timestamptz not null default now(),

  unique (session_id)
);

create index growth_records_inv_idx on public.growth_records (investigator_id);

-- =====================================================================
-- 12. content_moderation
-- =====================================================================
create table public.content_moderation (
  id          uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('module','turn','investigator_bg','module_chunk')),
  target_id   uuid not null,
  flagged     bool not null default false,
  categories  jsonb not null default '{}'::jsonb,
  note        text,
  created_at  timestamptz not null default now()
);

create index content_moderation_target_idx on public.content_moderation (target_kind, target_id);
