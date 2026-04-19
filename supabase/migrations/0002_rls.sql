-- =====================================================================
-- 0002_rls.sql
-- Row Level Security: 所有业务表默认拒绝, 按 owner_id 放行.
-- 原则:
--   - modules.is_public = true 允许任何已登录用户只读
--   - 其余一律 owner-only
--   - 子表(turns / checks / session_* / growth_records / module_chunks)
--     通过关联父表的 owner_id 鉴权
-- 服务端如需绕过 RLS, 使用 service_role key (Postgres role `service_role`).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 启用 RLS
-- ---------------------------------------------------------------------
alter table public.investigators                 enable row level security;
alter table public.modules                       enable row level security;
alter table public.module_chunks                 enable row level security;
alter table public.sessions                      enable row level security;
alter table public.session_investigator_state    enable row level security;
alter table public.turns                         enable row level security;
alter table public.checks                        enable row level security;
alter table public.session_clues                 enable row level security;
alter table public.session_npcs                  enable row level security;
alter table public.session_events                enable row level security;
alter table public.growth_records                enable row level security;
alter table public.content_moderation            enable row level security;

-- ---------------------------------------------------------------------
-- investigators: owner-only
-- ---------------------------------------------------------------------
create policy investigators_select_own on public.investigators
  for select using (owner_id = auth.uid());
create policy investigators_insert_own on public.investigators
  for insert with check (owner_id = auth.uid());
create policy investigators_update_own on public.investigators
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy investigators_delete_own on public.investigators
  for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- modules: owner 或 is_public 可读, 写入仅 owner
-- ---------------------------------------------------------------------
create policy modules_select_visible on public.modules
  for select using (owner_id = auth.uid() or is_public = true);
create policy modules_insert_own on public.modules
  for insert with check (owner_id = auth.uid());
create policy modules_update_own on public.modules
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy modules_delete_own on public.modules
  for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- module_chunks: 跟随所属 module 的可见性
-- ---------------------------------------------------------------------
create policy module_chunks_select_visible on public.module_chunks
  for select using (
    exists (
      select 1 from public.modules m
       where m.id = module_chunks.module_id
         and (m.owner_id = auth.uid() or m.is_public = true)
    )
  );
create policy module_chunks_write_own on public.module_chunks
  for all using (
    exists (select 1 from public.modules m
              where m.id = module_chunks.module_id and m.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.modules m
              where m.id = module_chunks.module_id and m.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- sessions: owner-only
-- ---------------------------------------------------------------------
create policy sessions_select_own on public.sessions
  for select using (owner_id = auth.uid());
create policy sessions_insert_own on public.sessions
  for insert with check (
    owner_id = auth.uid()
    and exists (select 1 from public.investigators i
                 where i.id = investigator_id and i.owner_id = auth.uid())
    and exists (select 1 from public.modules m
                 where m.id = module_id
                   and (m.owner_id = auth.uid() or m.is_public = true))
  );
create policy sessions_update_own on public.sessions
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy sessions_delete_own on public.sessions
  for delete using (owner_id = auth.uid());

-- ---------------------------------------------------------------------
-- 通用: 通过 session 关联鉴权 (session_investigator_state / turns / checks
--        / session_clues / session_npcs / session_events / growth_records)
-- ---------------------------------------------------------------------

-- session_investigator_state
create policy sis_access_own on public.session_investigator_state
  for all using (
    exists (select 1 from public.sessions s
             where s.id = session_investigator_state.session_id
               and s.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.sessions s
             where s.id = session_investigator_state.session_id
               and s.owner_id = auth.uid())
  );

-- turns
create policy turns_access_own on public.turns
  for all using (
    exists (select 1 from public.sessions s
             where s.id = turns.session_id and s.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.sessions s
             where s.id = turns.session_id and s.owner_id = auth.uid())
  );

-- checks
create policy checks_access_own on public.checks
  for all using (
    exists (select 1 from public.sessions s
             where s.id = checks.session_id and s.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.sessions s
             where s.id = checks.session_id and s.owner_id = auth.uid())
  );

-- session_clues
create policy session_clues_access_own on public.session_clues
  for all using (
    exists (select 1 from public.sessions s
             where s.id = session_clues.session_id and s.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.sessions s
             where s.id = session_clues.session_id and s.owner_id = auth.uid())
  );

-- session_npcs
create policy session_npcs_access_own on public.session_npcs
  for all using (
    exists (select 1 from public.sessions s
             where s.id = session_npcs.session_id and s.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.sessions s
             where s.id = session_npcs.session_id and s.owner_id = auth.uid())
  );

-- session_events
create policy session_events_access_own on public.session_events
  for all using (
    exists (select 1 from public.sessions s
             where s.id = session_events.session_id and s.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.sessions s
             where s.id = session_events.session_id and s.owner_id = auth.uid())
  );

-- growth_records
create policy growth_records_access_own on public.growth_records
  for all using (
    exists (select 1 from public.sessions s
             where s.id = growth_records.session_id and s.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.sessions s
             where s.id = growth_records.session_id and s.owner_id = auth.uid())
  );

-- ---------------------------------------------------------------------
-- content_moderation: 仅 service_role 写入 / 读取
-- 业务前端不直接读这张表; 没有给 anon / authenticated 的 policy,
-- 默认 RLS 拒绝即可.
-- ---------------------------------------------------------------------
