-- ============================================================
-- Migration 013 — Work Sessions
-- Directive CRM
-- ============================================================

alter table public.properties
  add column if not exists session_id text;

create index if not exists properties_session_id_idx
  on public.properties (owner_id, session_id);

create table if not exists public.work_sessions (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  zip text,
  city text,
  state text,
  property_count integer not null default 0,
  client_count integer not null default 0,
  is_active boolean not null default false,
  last_accessed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists work_sessions_active_owner_uniq
  on public.work_sessions (owner_id)
  where is_active = true;

create index if not exists work_sessions_owner_idx
  on public.work_sessions (owner_id);

create index if not exists work_sessions_last_accessed_idx
  on public.work_sessions (owner_id, last_accessed_at desc);

drop trigger if exists work_sessions_set_updated_at on public.work_sessions;
create trigger work_sessions_set_updated_at
  before update on public.work_sessions
  for each row execute function public.set_updated_at();

alter table public.work_sessions enable row level security;

drop policy if exists "work_sessions_owner" on public.work_sessions;
create policy "work_sessions_owner" on public.work_sessions
  for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));
