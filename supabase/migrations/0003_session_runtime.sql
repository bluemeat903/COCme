-- =====================================================================
-- 0003_session_runtime.sql
-- Add transient runtime fields to sessions so a SessionState snapshot can be
-- fully reconstructed from the DB:
--   - pending_check:   if non-null, the next player action resolves this check
--   - flags:           narrative flags (truth-graph progression, etc.)
-- session_events already exists; we also add an optional turn_id pointer for
-- per-turn grouping on replay, plus an id column on checks already exists.
-- =====================================================================

alter table public.sessions
  add column if not exists pending_check jsonb,
  add column if not exists flags jsonb not null default '{}'::jsonb;

-- Reasonable partial index: active sessions frequently looked up by owner.
create index if not exists sessions_flags_idx
  on public.sessions using gin (flags);

-- session_events.turn_id already exists (nullable).  Nothing to change here.
