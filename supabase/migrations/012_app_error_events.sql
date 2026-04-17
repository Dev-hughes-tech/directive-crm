-- ============================================================
-- DIRECTIVE CRM — Migration 012: App error events
-- ============================================================

create table if not exists public.app_error_events (
  id bigserial primary key,
  owner_id uuid references auth.users(id) on delete set null,
  source text not null,
  route text,
  message text not null,
  digest text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists app_error_events_owner_idx on public.app_error_events (owner_id, created_at desc);
create index if not exists app_error_events_source_idx on public.app_error_events (source, created_at desc);

alter table public.app_error_events enable row level security;

drop policy if exists app_error_events_read on public.app_error_events;
create policy app_error_events_read on public.app_error_events for select
  using (owner_id = auth.uid() or public.is_admin(auth.uid()));
