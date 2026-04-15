-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 003: Auto-create profiles row on new Supabase auth user signup
-- ──────────────────────────────────────────────────────────────────────────────
-- Without this trigger, new users who sign up have no profiles row.
-- requireUser() falls back to role='trial', but the RLS policies that check
-- profiles.role never see that default — they query the actual table row.
-- A missing profile causes RLS to deny writes to every table.
-- ──────────────────────────────────────────────────────────────────────────────

-- Function: called by trigger on auth.users INSERT
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer          -- runs with postgres superuser rights so it can write to public.profiles
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role, created_at)
  values (
    new.id,
    new.email,
    'trial',                -- Every new signup starts as trial
    now()
  )
  on conflict (id) do nothing;   -- idempotent — won't overwrite an existing row
  return new;
end;
$$;

-- Trigger: fires after every new row in auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Back-fill: create profile rows for any existing auth users that don't have one
insert into public.profiles (id, email, role, created_at)
select
  au.id,
  au.email,
  'trial',
  now()
from auth.users au
left join public.profiles p on p.id = au.id
where p.id is null
on conflict (id) do nothing;
