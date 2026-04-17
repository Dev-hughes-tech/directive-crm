-- ============================================================
-- DIRECTIVE CRM — Migration 000: Canonical profiles schema
-- ============================================================
-- This migration must sort before schema-hardening migrations because later
-- functions and policies depend on public.profiles existing.
-- ============================================================

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

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

create index if not exists profiles_email_idx on public.profiles (lower(email)) where email is not null;
create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_manager_id_idx on public.profiles (manager_id) where manager_id is not null;
create index if not exists profiles_trial_ends_at_idx on public.profiles (trial_ends_at) where trial_ends_at is not null;

create or replace function public.is_admin(uid uuid)
returns boolean as $$
  select exists (select 1 from public.profiles where id = uid and role = 'admin');
$$ language sql stable security definer;

create or replace function public.is_manager_of(uid uuid, target_owner uuid)
returns boolean as $$
  select exists (
    select 1 from public.profiles p
    where p.id = target_owner
      and (p.manager_id = uid or p.id = uid)
  );
$$ language sql stable security definer;

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

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

insert into public.profiles (id, email, role, created_at, updated_at)
select
  au.id,
  au.email,
  'trial',
  now(),
  now()
from auth.users au
left join public.profiles p on p.id = au.id
where p.id is null
on conflict (id) do nothing;
