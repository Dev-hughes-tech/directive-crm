-- ──────────────────────────────────────────────────────────────────────────────
-- Migration 006: Jobs, Insurance Claims, and Job Photos tables
-- ──────────────────────────────────────────────────────────────────────────────
-- These tables were missing from the initial schema, causing saveJob() to fail
-- silently against localStorage only. All three tables are owner-scoped with RLS.
-- ──────────────────────────────────────────────────────────────────────────────

-- ── Jobs ─────────────────────────────────────────────────────────────────────
create table if not exists jobs (
  id                  uuid primary key default gen_random_uuid(),
  owner_id            uuid not null references auth.users(id) on delete cascade,
  property_id         uuid references properties(id) on delete set null,
  client_id           uuid references clients(id) on delete set null,
  proposal_id         uuid references proposals(id) on delete set null,
  stage               text not null default 'sold'
                        check (stage in (
                          'sold','permit_applied','permit_approved','crew_scheduled',
                          'in_progress','final_inspection','supplement_filed',
                          'invoice_sent','collected'
                        )),
  title               text not null default '',
  address             text not null default '',
  owner_name          text,
  contract_amount     numeric(12,2),
  contract_signed_at  timestamptz,
  permit_number       text,
  permit_applied_at   timestamptz,
  permit_approved_at  timestamptz,
  scheduled_date      date,
  crew_lead           text,
  crew_members        text[] not null default '{}',
  started_at          timestamptz,
  completed_at        timestamptz,
  invoice_number      text,
  invoice_sent_at     timestamptz,
  amount_collected    numeric(12,2),
  collected_at        timestamptz,
  notes               text not null default '',
  -- insurance and photos stored as JSONB for flexibility
  insurance           jsonb,
  photos              jsonb not null default '[]',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Index for fast owner queries
create index if not exists jobs_owner_id_idx on jobs(owner_id);
create index if not exists jobs_stage_idx on jobs(owner_id, stage);
create index if not exists jobs_property_id_idx on jobs(property_id);

-- ── Insurance Claims (normalized, also storable inline via jobs.insurance JSONB)
create table if not exists insurance_claims (
  id                    uuid primary key default gen_random_uuid(),
  owner_id              uuid not null references auth.users(id) on delete cascade,
  job_id                uuid not null references jobs(id) on delete cascade,
  insurance_company     text not null default '',
  claim_number          text not null default '',
  adjuster_name         text,
  adjuster_phone        text,
  adjuster_email        text,
  deductible            numeric(12,2),
  initial_payout        numeric(12,2),
  supplement_amount     numeric(12,2),
  final_payout          numeric(12,2),
  status                text not null default 'pending'
                          check (status in (
                            'pending','adjuster_scheduled','inspection_done',
                            'supplement_submitted','supplement_approved','paid'
                          )),
  notes                 text not null default '',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists insurance_claims_job_id_idx on insurance_claims(job_id);
create index if not exists insurance_claims_owner_id_idx on insurance_claims(owner_id);

-- ── Job Photos (normalized, also storable inline via jobs.photos JSONB) ──────
create table if not exists job_photos (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  job_id      uuid not null references jobs(id) on delete cascade,
  category    text not null default 'other'
                check (category in (
                  'overall_roof','ridge','valleys','gutters','downspouts',
                  'skylights','interior_damage','before','after','other'
                )),
  storage_url text,         -- Supabase Storage public URL (preferred)
  data_url    text,         -- Base64 fallback for offline mode (cleared after upload)
  caption     text not null default '',
  taken_at    timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists job_photos_job_id_idx on job_photos(job_id);
create index if not exists job_photos_owner_id_idx on job_photos(owner_id);

-- ── Row-Level Security ────────────────────────────────────────────────────────
alter table jobs             enable row level security;
alter table insurance_claims enable row level security;
alter table job_photos       enable row level security;

-- Jobs: owner sees only their own rows
create policy "jobs_owner_select" on jobs for select using (owner_id = auth.uid());
create policy "jobs_owner_insert" on jobs for insert with check (owner_id = auth.uid());
create policy "jobs_owner_update" on jobs for update using (owner_id = auth.uid());
create policy "jobs_owner_delete" on jobs for delete using (owner_id = auth.uid());

-- Insurance claims: scoped by owner
create policy "insurance_owner_select" on insurance_claims for select using (owner_id = auth.uid());
create policy "insurance_owner_insert" on insurance_claims for insert with check (owner_id = auth.uid());
create policy "insurance_owner_update" on insurance_claims for update using (owner_id = auth.uid());
create policy "insurance_owner_delete" on insurance_claims for delete using (owner_id = auth.uid());

-- Job photos: scoped by owner
create policy "job_photos_owner_select" on job_photos for select using (owner_id = auth.uid());
create policy "job_photos_owner_insert" on job_photos for insert with check (owner_id = auth.uid());
create policy "job_photos_owner_update" on job_photos for update using (owner_id = auth.uid());
create policy "job_photos_owner_delete" on job_photos for delete using (owner_id = auth.uid());

-- ── Auto-update updated_at ────────────────────────────────────────────────────
create or replace function update_updated_at_column()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jobs_updated_at on jobs;
create trigger jobs_updated_at
  before update on jobs
  for each row execute function update_updated_at_column();

drop trigger if exists insurance_updated_at on insurance_claims;
create trigger insurance_updated_at
  before update on insurance_claims
  for each row execute function update_updated_at_column();
