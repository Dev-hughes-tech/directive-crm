-- ============================================================
-- DIRECTIVE CRM — Migration 002: Harden Data Model
-- ============================================================
-- Goals:
--   1. Multi-tenant isolation via owner_id on every table
--   2. Align schema with lib/types.ts (add missing columns)
--   3. Create missing tables: jobs, job_photos, insurance_claims,
--      research_jobs, company_settings, activity_log
--   4. Add indexes on hot query paths (FK, geo, status, timestamp)
--   5. Replace permissive RLS with owner-scoped + admin-override policies
--   6. Install updated_at triggers and tighten check constraints
--   7. Prevent duplicate property addresses per owner
-- Safe to run multiple times (uses IF NOT EXISTS + conditional adds).
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 0. Shared helpers
-- ──────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

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

-- ──────────────────────────────────────────────────────────────
-- 1. PROPERTIES — add owner_id + missing columns + dedupe
-- ──────────────────────────────────────────────────────────────
alter table properties add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table properties add column if not exists updated_at timestamptz default now();
alter table properties add column if not exists permit_last_date text;
alter table properties add column if not exists sqft integer;
alter table properties add column if not exists lot_sqft integer;
alter table properties add column if not exists bedrooms integer;
alter table properties add column if not exists bathrooms numeric(4,1);
alter table properties add column if not exists appraised_value integer;
alter table properties add column if not exists listing_status text;
alter table properties add column if not exists listing_price integer;
alter table properties add column if not exists hoa_monthly integer;
alter table properties add column if not exists subdivision text;
alter table properties add column if not exists occupancy_type text;
alter table properties add column if not exists property_class text;
alter table properties add column if not exists land_use text;
alter table properties add column if not exists deed_date text;
alter table properties add column if not exists deed_type text;
alter table properties add column if not exists deed_book text;
alter table properties add column if not exists tax_annual integer;
alter table properties add column if not exists neighborhood text;
alter table properties add column if not exists owner_age integer;
alter table properties add column if not exists roof_age_estimated boolean default false;
alter table properties add column if not exists storm_history jsonb;
alter table properties add column if not exists roof_area_sqft integer;
alter table properties add column if not exists roof_pitch text;
alter table properties add column if not exists roof_pitch_degrees numeric(5,2);
alter table properties add column if not exists pitch_multiplier numeric(5,3);
alter table properties add column if not exists roofing_squares numeric(8,2);
alter table properties add column if not exists roof_segments integer;
alter table properties add column if not exists roof_segment_details jsonb;
alter table properties add column if not exists satellite_image_url text;
alter table properties add column if not exists roof_imagery_date text;
alter table properties add column if not exists roof_imagery_quality text;

-- Sanity constraints
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'properties_lat_range') then
    alter table properties add constraint properties_lat_range check (lat between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'properties_lng_range') then
    alter table properties add constraint properties_lng_range check (lng between -180 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'properties_year_built_range') then
    alter table properties add constraint properties_year_built_range check (year_built is null or (year_built between 1800 and 2100));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'properties_roof_age_range') then
    alter table properties add constraint properties_roof_age_range check (roof_age_years is null or roof_age_years between 0 and 200);
  end if;
end $$;

-- Dedupe address per owner (partial unique index — allows nulls for historical rows)
create unique index if not exists properties_owner_address_uniq
  on properties (owner_id, lower(address))
  where owner_id is not null;

-- Hot indexes
create index if not exists properties_owner_id_idx     on properties (owner_id);
create index if not exists properties_score_idx        on properties (score desc nulls last);
create index if not exists properties_created_at_idx   on properties (created_at desc);
create index if not exists properties_geo_idx          on properties (lat, lng);
create index if not exists properties_roof_age_idx     on properties (roof_age_years desc nulls last);
create index if not exists properties_listing_idx      on properties (listing_status) where listing_status is not null;

-- updated_at trigger
drop trigger if exists properties_set_updated_at on properties;
create trigger properties_set_updated_at
  before update on properties
  for each row execute function set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- 2. CLIENTS — owner_id + status constraint already exists
-- ──────────────────────────────────────────────────────────────
alter table clients add column if not exists owner_id uuid references auth.users(id) on delete cascade;

create index if not exists clients_owner_id_idx     on clients (owner_id);
create index if not exists clients_property_id_idx  on clients (property_id);
create index if not exists clients_status_idx       on clients (status);
create index if not exists clients_created_at_idx   on clients (created_at desc);

drop trigger if exists clients_set_updated_at on clients;
create trigger clients_set_updated_at
  before update on clients
  for each row execute function set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- 3. PROPOSALS — owner_id + tax/warranty/payment columns
-- ──────────────────────────────────────────────────────────────
alter table proposals add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table proposals add column if not exists updated_at timestamptz default now();
alter table proposals add column if not exists subtotal numeric(10,2) default 0;
alter table proposals add column if not exists tax_rate numeric(5,4) default 0;
alter table proposals add column if not exists tax_amount numeric(10,2) default 0;
alter table proposals add column if not exists warranty_years integer;
alter table proposals add column if not exists payment_terms text;
alter table proposals add column if not exists accepted_at timestamptz;
alter table proposals add column if not exists rejected_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'proposals_total_non_negative') then
    alter table proposals add constraint proposals_total_non_negative check (total >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'proposals_tax_rate_range') then
    alter table proposals add constraint proposals_tax_rate_range check (tax_rate >= 0 and tax_rate <= 1);
  end if;
end $$;

create index if not exists proposals_owner_id_idx     on proposals (owner_id);
create index if not exists proposals_client_id_idx    on proposals (client_id);
create index if not exists proposals_property_id_idx  on proposals (property_id);
create index if not exists proposals_status_idx       on proposals (status);
create index if not exists proposals_created_at_idx   on proposals (created_at desc);

drop trigger if exists proposals_set_updated_at on proposals;
create trigger proposals_set_updated_at
  before update on proposals
  for each row execute function set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- 4. PROPOSAL_LINE_ITEMS — sort order + non-negative
-- ──────────────────────────────────────────────────────────────
alter table proposal_line_items add column if not exists sort_order integer default 0;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'line_items_qty_non_negative') then
    alter table proposal_line_items add constraint line_items_qty_non_negative check (quantity >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'line_items_unit_price_non_negative') then
    alter table proposal_line_items add constraint line_items_unit_price_non_negative check (unit_price >= 0);
  end if;
end $$;

create index if not exists line_items_proposal_id_idx on proposal_line_items (proposal_id, sort_order);

-- ──────────────────────────────────────────────────────────────
-- 5. MATERIALS — owner_id
-- ──────────────────────────────────────────────────────────────
alter table materials add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table materials add column if not exists updated_at timestamptz default now();

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'materials_unit_cost_non_negative') then
    alter table materials add constraint materials_unit_cost_non_negative check (unit_cost >= 0);
  end if;
end $$;

create index if not exists materials_owner_id_idx  on materials (owner_id);
create index if not exists materials_category_idx  on materials (category);

drop trigger if exists materials_set_updated_at on materials;
create trigger materials_set_updated_at
  before update on materials
  for each row execute function set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- 6. CHAT_MESSAGES — add owner_id (tenant scope) + sender user ref
-- ──────────────────────────────────────────────────────────────
alter table chat_messages add column if not exists owner_id uuid references auth.users(id) on delete cascade;
alter table chat_messages add column if not exists sender_id uuid references auth.users(id);

create index if not exists chat_owner_channel_ts_idx on chat_messages (owner_id, channel, timestamp desc);
create index if not exists chat_unread_idx on chat_messages (channel, read) where read = false;

-- ──────────────────────────────────────────────────────────────
-- 7. JOBS (new table — used by app/page.tsx Jobs screen)
-- ──────────────────────────────────────────────────────────────
create table if not exists jobs (
  id text primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  property_id text references properties(id) on delete set null,
  client_id text references clients(id) on delete set null,
  proposal_id text references proposals(id) on delete set null,
  stage text not null default 'sold'
    check (stage in ('sold','permit_applied','permit_approved','crew_scheduled','in_progress','final_inspection','supplement_filed','invoice_sent','collected')),
  title text not null,
  address text not null,
  owner_name text,
  contract_amount numeric(12,2),
  contract_signed_at timestamptz,
  permit_number text,
  permit_applied_at timestamptz,
  permit_approved_at timestamptz,
  scheduled_date date,
  crew_lead text,
  crew_members text[] default '{}',
  started_at timestamptz,
  completed_at timestamptz,
  invoice_number text,
  invoice_sent_at timestamptz,
  amount_collected numeric(12,2),
  collected_at timestamptz,
  insurance jsonb,
  photos jsonb default '[]'::jsonb,
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint jobs_contract_non_negative check (contract_amount is null or contract_amount >= 0),
  constraint jobs_collected_non_negative check (amount_collected is null or amount_collected >= 0)
);

create index if not exists jobs_owner_id_idx     on jobs (owner_id);
create index if not exists jobs_stage_idx        on jobs (stage);
create index if not exists jobs_property_id_idx  on jobs (property_id);
create index if not exists jobs_client_id_idx    on jobs (client_id);
create index if not exists jobs_scheduled_idx    on jobs (scheduled_date) where scheduled_date is not null;
create index if not exists jobs_created_at_idx   on jobs (created_at desc);

drop trigger if exists jobs_set_updated_at on jobs;
create trigger jobs_set_updated_at
  before update on jobs
  for each row execute function set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- 8. JOB_PHOTOS (relational — alternative to embedded photos jsonb)
-- ──────────────────────────────────────────────────────────────
create table if not exists job_photos (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  category text not null
    check (category in ('overall_roof','ridge','valleys','gutters','downspouts','skylights','interior_damage','before','after','other')),
  data_url text,
  storage_path text,
  caption text default '',
  taken_at timestamptz default now(),
  created_at timestamptz default now()
);

create index if not exists job_photos_job_id_idx    on job_photos (job_id);
create index if not exists job_photos_owner_id_idx  on job_photos (owner_id);
create index if not exists job_photos_category_idx  on job_photos (category);

-- ──────────────────────────────────────────────────────────────
-- 9. INSURANCE_CLAIMS (new — normalized from jobs.insurance jsonb)
-- ──────────────────────────────────────────────────────────────
create table if not exists insurance_claims (
  id text primary key,
  job_id text not null references jobs(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  insurance_company text not null,
  claim_number text,
  adjuster_name text,
  adjuster_phone text,
  adjuster_email text,
  deductible numeric(10,2),
  initial_payout numeric(10,2),
  supplement_amount numeric(10,2),
  final_payout numeric(10,2),
  status text not null default 'pending'
    check (status in ('pending','adjuster_scheduled','inspection_done','supplement_submitted','supplement_approved','paid')),
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists claims_job_id_idx    on insurance_claims (job_id);
create index if not exists claims_owner_id_idx  on insurance_claims (owner_id);
create index if not exists claims_status_idx    on insurance_claims (status);

drop trigger if exists claims_set_updated_at on insurance_claims;
create trigger claims_set_updated_at
  before update on insurance_claims
  for each row execute function set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- 10. RESEARCH_JOBS (used by /api/research/start + /process + /status)
-- ──────────────────────────────────────────────────────────────
create table if not exists research_jobs (
  id text primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  address text not null,
  status text not null default 'queued'
    check (status in ('queued','running','done','error')),
  result jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists research_owner_id_idx   on research_jobs (owner_id);
create index if not exists research_status_idx     on research_jobs (status);
create index if not exists research_created_at_idx on research_jobs (created_at desc);

drop trigger if exists research_set_updated_at on research_jobs;
create trigger research_set_updated_at
  before update on research_jobs
  for each row execute function set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- 11. COMPANY_SETTINGS (new — currently only in localStorage)
-- ──────────────────────────────────────────────────────────────
create table if not exists company_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  company_name text,
  company_phone text,
  company_email text,
  license_number text,
  service_radius_miles integer default 50,
  tax_rate numeric(5,4) default 0,
  default_warranty_years integer,
  default_payment_terms text,
  logo_url text,
  notification_prefs jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint company_tax_rate_range check (tax_rate >= 0 and tax_rate <= 1),
  constraint company_radius_positive check (service_radius_miles > 0 and service_radius_miles <= 1000)
);

drop trigger if exists company_settings_set_updated_at on company_settings;
create trigger company_settings_set_updated_at
  before update on company_settings
  for each row execute function set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- 12. ACTIVITY_LOG (new — actor + timestamp for every state change)
-- ──────────────────────────────────────────────────────────────
create table if not exists activity_log (
  id bigserial primary key,
  owner_id uuid references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id),
  entity_type text not null,         -- 'property' | 'client' | 'proposal' | 'job' | 'claim' | 'settings'
  entity_id text not null,
  action text not null,              -- 'create' | 'update' | 'delete' | 'status_change' | 'login' | 'ai_call'
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create index if not exists activity_owner_idx       on activity_log (owner_id, created_at desc);
create index if not exists activity_entity_idx      on activity_log (entity_type, entity_id);
create index if not exists activity_actor_idx       on activity_log (actor_id, created_at desc);

-- ──────────────────────────────────────────────────────────────
-- 13. Replace permissive RLS with owner-scoped policies
-- ──────────────────────────────────────────────────────────────
-- Drop old open policies
drop policy if exists "Allow all for anon" on properties;
drop policy if exists "Allow all for anon" on clients;
drop policy if exists "Allow all for anon" on proposals;
drop policy if exists "Allow all for anon" on proposal_line_items;
drop policy if exists "Allow all for anon" on materials;
drop policy if exists "Allow all for anon" on chat_messages;

-- Enable RLS on new tables
alter table jobs              enable row level security;
alter table job_photos        enable row level security;
alter table insurance_claims  enable row level security;
alter table research_jobs     enable row level security;
alter table company_settings  enable row level security;
alter table activity_log      enable row level security;

-- Generic owner-scoped policy pattern — reused across every table
-- Admin gets full access; manager gets access to their reps' rows; owner accesses own rows.

-- PROPERTIES
drop policy if exists properties_owner_read on properties;
create policy properties_owner_read on properties for select
  using (owner_id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), owner_id));
drop policy if exists properties_owner_write on properties;
create policy properties_owner_write on properties for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

-- CLIENTS
drop policy if exists clients_owner_read on clients;
create policy clients_owner_read on clients for select
  using (owner_id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), owner_id));
drop policy if exists clients_owner_write on clients;
create policy clients_owner_write on clients for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

-- PROPOSALS
drop policy if exists proposals_owner_read on proposals;
create policy proposals_owner_read on proposals for select
  using (owner_id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), owner_id));
drop policy if exists proposals_owner_write on proposals;
create policy proposals_owner_write on proposals for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

-- PROPOSAL_LINE_ITEMS — follows parent proposal's owner
drop policy if exists line_items_owner_read on proposal_line_items;
create policy line_items_owner_read on proposal_line_items for select
  using (exists (
    select 1 from proposals p
    where p.id = proposal_line_items.proposal_id
      and (p.owner_id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), p.owner_id))
  ));
drop policy if exists line_items_owner_write on proposal_line_items;
create policy line_items_owner_write on proposal_line_items for all
  using (exists (
    select 1 from proposals p
    where p.id = proposal_line_items.proposal_id
      and (p.owner_id = auth.uid() or public.is_admin(auth.uid()))
  ))
  with check (exists (
    select 1 from proposals p
    where p.id = proposal_line_items.proposal_id
      and (p.owner_id = auth.uid() or public.is_admin(auth.uid()))
  ));

-- MATERIALS
drop policy if exists materials_owner_read on materials;
create policy materials_owner_read on materials for select
  using (owner_id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), owner_id));
drop policy if exists materials_owner_write on materials;
create policy materials_owner_write on materials for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

-- CHAT_MESSAGES — scoped to owner (team tenant)
drop policy if exists chat_owner_read on chat_messages;
create policy chat_owner_read on chat_messages for select
  using (owner_id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), owner_id));
drop policy if exists chat_owner_write on chat_messages;
create policy chat_owner_write on chat_messages for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

-- JOBS
create policy jobs_owner_read on jobs for select
  using (owner_id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), owner_id));
create policy jobs_owner_write on jobs for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

-- JOB_PHOTOS
create policy job_photos_owner_read on job_photos for select
  using (owner_id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), owner_id));
create policy job_photos_owner_write on job_photos for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

-- INSURANCE_CLAIMS
create policy claims_owner_read on insurance_claims for select
  using (owner_id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), owner_id));
create policy claims_owner_write on insurance_claims for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

-- RESEARCH_JOBS
create policy research_owner_read on research_jobs for select
  using (owner_id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), owner_id));
create policy research_owner_write on research_jobs for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

-- COMPANY_SETTINGS
create policy company_settings_owner_read on company_settings for select
  using (owner_id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), owner_id));
create policy company_settings_owner_write on company_settings for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

-- ACTIVITY_LOG — insert-only for owner; read for owner + manager + admin
create policy activity_owner_read on activity_log for select
  using (owner_id = auth.uid() or public.is_admin(auth.uid()) or public.is_manager_of(auth.uid(), owner_id));
create policy activity_owner_insert on activity_log for insert
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

-- ============================================================
-- END OF MIGRATION 002
-- ============================================================
-- Post-migration checklist:
--   [ ] Run: select * from supabase migrations
--   [ ] Verify no rows have owner_id = null after backfill
--   [ ] Once all rows have owner_id, run a follow-up migration:
--         alter table properties alter column owner_id set not null;
--       (and same for clients, proposals, materials, chat_messages)
-- ============================================================
