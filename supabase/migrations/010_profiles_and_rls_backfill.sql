-- ============================================================
-- DIRECTIVE CRM — Migration 010: Profiles + RLS live backfill
-- ============================================================
-- Purpose:
--   1. Backfill the canonical profiles schema/policies for already-deployed DBs
--   2. Drop any lingering open-access policies on core CRM tables
--   3. Re-assert owner-scoped policies on the core CRM tables
--   4. Fail closed on public.searches and add owner/user policies when possible
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'trial'
    check (role in ('admin', 'enterprise_manager', 'enterprise_rep', 'pro', 'plus', 'basic', 'trial')),
  company_name text,
  plan_expires_at timestamptz,
  manager_id uuid references auth.users(id) on delete set null,
  full_name text,
  trial_ends_at timestamptz,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists role text;
alter table public.profiles alter column role set default 'trial';
alter table public.profiles add column if not exists company_name text;
alter table public.profiles add column if not exists plan_expires_at timestamptz;
alter table public.profiles add column if not exists manager_id uuid references auth.users(id) on delete set null;
alter table public.profiles add column if not exists full_name text;
alter table public.profiles add column if not exists trial_ends_at timestamptz;
alter table public.profiles add column if not exists invited_by uuid references auth.users(id) on delete set null;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

alter table public.profiles enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles for select
  using (id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), id));

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles for insert
  with check (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles for update
  using (id = auth.uid() or public.is_admin(auth.uid()))
  with check (id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists profiles_admin_delete on public.profiles;
create policy profiles_admin_delete on public.profiles for delete
  using (public.is_admin(auth.uid()));

drop policy if exists "Allow all for anon" on public.properties;
drop policy if exists open_access on public.properties;
drop policy if exists properties_owner_read on public.properties;
drop policy if exists properties_owner_write on public.properties;
create policy properties_owner_read on public.properties for select
  using (owner_id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), owner_id));
create policy properties_owner_write on public.properties for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "Allow all for anon" on public.clients;
drop policy if exists open_access on public.clients;
drop policy if exists clients_owner_read on public.clients;
drop policy if exists clients_owner_write on public.clients;
create policy clients_owner_read on public.clients for select
  using (owner_id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), owner_id));
create policy clients_owner_write on public.clients for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "Allow all for anon" on public.proposals;
drop policy if exists open_access on public.proposals;
drop policy if exists proposals_owner_read on public.proposals;
drop policy if exists proposals_owner_write on public.proposals;
create policy proposals_owner_read on public.proposals for select
  using (owner_id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), owner_id));
create policy proposals_owner_write on public.proposals for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "Allow all for anon" on public.proposal_line_items;
drop policy if exists open_access on public.proposal_line_items;
drop policy if exists line_items_owner_read on public.proposal_line_items;
drop policy if exists line_items_owner_write on public.proposal_line_items;
create policy line_items_owner_read on public.proposal_line_items for select
  using (exists (
    select 1 from public.proposals p
    where p.id = public.proposal_line_items.proposal_id
      and (p.owner_id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), p.owner_id))
  ));
create policy line_items_owner_write on public.proposal_line_items for all
  using (exists (
    select 1 from public.proposals p
    where p.id = public.proposal_line_items.proposal_id
      and (p.owner_id = auth.uid() or public.is_admin(auth.uid()))
  ))
  with check (exists (
    select 1 from public.proposals p
    where p.id = public.proposal_line_items.proposal_id
      and (p.owner_id = auth.uid() or public.is_admin(auth.uid()))
  ));

drop policy if exists "Allow all for anon" on public.materials;
drop policy if exists open_access on public.materials;
drop policy if exists materials_owner_read on public.materials;
drop policy if exists materials_owner_write on public.materials;
create policy materials_owner_read on public.materials for select
  using (owner_id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), owner_id));
create policy materials_owner_write on public.materials for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "Allow all for anon" on public.chat_messages;
drop policy if exists open_access on public.chat_messages;
drop policy if exists chat_owner_read on public.chat_messages;
drop policy if exists chat_owner_write on public.chat_messages;
create policy chat_owner_read on public.chat_messages for select
  using (owner_id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), owner_id));
create policy chat_owner_write on public.chat_messages for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

do $$
declare
  actor_column text;
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'searches'
  ) then
    execute 'alter table if exists public.searches enable row level security';
    execute 'drop policy if exists searches_owner_read on public.searches';
    execute 'drop policy if exists searches_owner_write on public.searches';
    execute 'drop policy if exists "Allow all for anon" on public.searches';
    execute 'drop policy if exists open_access on public.searches';

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'searches'
        and column_name = 'owner_id'
    ) then
      actor_column := 'owner_id';
    elsif exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'searches'
        and column_name = 'user_id'
    ) then
      actor_column := 'user_id';
    else
      actor_column := null;
    end if;

    if actor_column is not null then
      execute format(
        'create policy searches_owner_read on public.searches for select using (%I = auth.uid() or public.is_admin(auth.uid()))',
        actor_column
      );
      execute format(
        'create policy searches_owner_write on public.searches for all using (%I = auth.uid() or public.is_admin(auth.uid())) with check (%I = auth.uid() or public.is_admin(auth.uid()))',
        actor_column,
        actor_column
      );
    end if;
  end if;
end $$;
