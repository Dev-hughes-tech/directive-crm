-- ============================================================
-- DIRECTIVE CRM — Migration 011: Property damage photos
-- ============================================================

create table if not exists public.property_damage_photos (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  storage_path text not null,
  original_name text,
  mime_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_damage_photos_owner_idx on public.property_damage_photos (owner_id, created_at desc);
create index if not exists property_damage_photos_property_idx on public.property_damage_photos (property_id, created_at desc);
create unique index if not exists property_damage_photos_path_idx on public.property_damage_photos (storage_path);

alter table public.property_damage_photos enable row level security;

drop policy if exists property_damage_photos_read on public.property_damage_photos;
create policy property_damage_photos_read on public.property_damage_photos for select
  using (owner_id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), owner_id));

drop policy if exists property_damage_photos_write on public.property_damage_photos;
create policy property_damage_photos_write on public.property_damage_photos for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

drop trigger if exists property_damage_photos_set_updated_at on public.property_damage_photos;
create trigger property_damage_photos_set_updated_at
  before update on public.property_damage_photos
  for each row execute function public.set_updated_at();
