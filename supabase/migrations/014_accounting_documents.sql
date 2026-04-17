-- ============================================================
-- Migration 014 — Accounting Documents & File Storage
-- Directive CRM
-- ============================================================

create table if not exists public.invoices (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  property_id text,
  job_id text,
  client_id text,
  invoice_number text not null,
  status text not null default 'draft',
  issue_date date not null default current_date,
  due_date date,
  bill_to_name text,
  bill_to_address text,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  tax_rate numeric(8,4) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  paid_at timestamptz
);

create table if not exists public.estimates (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  property_id text,
  client_id text,
  estimate_number text not null,
  status text not null default 'draft',
  title text not null default '',
  scope text not null default '',
  subtotal numeric(12,2) not null default 0,
  tax_rate numeric(8,4) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.contracts (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  property_id text,
  client_id text,
  contract_number text not null,
  status text not null default 'draft',
  homeowner_name text,
  property_address text,
  contract_amount numeric(12,2) not null default 0,
  signed_at timestamptz,
  notes text not null default '',
  terms text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_files (
  id text primary key,
  owner_id uuid not null references auth.users (id) on delete cascade,
  document_type text not null,
  document_id text not null,
  file_name text not null,
  file_path text not null,
  file_size bigint not null default 0,
  mime_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists invoices_owner_invoice_number_uniq
  on public.invoices (owner_id, invoice_number);

create unique index if not exists estimates_owner_estimate_number_uniq
  on public.estimates (owner_id, estimate_number);

create unique index if not exists contracts_owner_contract_number_uniq
  on public.contracts (owner_id, contract_number);

create index if not exists invoices_owner_created_idx
  on public.invoices (owner_id, created_at desc);

create index if not exists estimates_owner_created_idx
  on public.estimates (owner_id, created_at desc);

create index if not exists contracts_owner_created_idx
  on public.contracts (owner_id, created_at desc);

create index if not exists document_files_lookup_idx
  on public.document_files (owner_id, document_type, document_id, created_at desc);

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

drop trigger if exists estimates_set_updated_at on public.estimates;
create trigger estimates_set_updated_at
  before update on public.estimates
  for each row execute function public.set_updated_at();

drop trigger if exists contracts_set_updated_at on public.contracts;
create trigger contracts_set_updated_at
  before update on public.contracts
  for each row execute function public.set_updated_at();

drop trigger if exists document_files_set_updated_at on public.document_files;
create trigger document_files_set_updated_at
  before update on public.document_files
  for each row execute function public.set_updated_at();

alter table public.invoices enable row level security;
alter table public.estimates enable row level security;
alter table public.contracts enable row level security;
alter table public.document_files enable row level security;

drop policy if exists "invoices_owner" on public.invoices;
create policy "invoices_owner" on public.invoices
  for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "estimates_owner" on public.estimates;
create policy "estimates_owner" on public.estimates
  for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "contracts_owner" on public.contracts;
create policy "contracts_owner" on public.contracts
  for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

drop policy if exists "document_files_owner" on public.document_files;
create policy "document_files_owner" on public.document_files
  for all
  using (owner_id = auth.uid() or public.is_admin(auth.uid()))
  with check (owner_id = auth.uid() or public.is_admin(auth.uid()));

insert into storage.buckets (id, name, public)
values ('directive-documents', 'directive-documents', false)
on conflict (id) do nothing;

drop policy if exists "directive_docs_select" on storage.objects;
create policy "directive_docs_select" on storage.objects
  for select
  using (
    bucket_id = 'directive-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "directive_docs_insert" on storage.objects;
create policy "directive_docs_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'directive-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "directive_docs_update" on storage.objects;
create policy "directive_docs_update" on storage.objects
  for update
  using (
    bucket_id = 'directive-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'directive-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "directive_docs_delete" on storage.objects;
create policy "directive_docs_delete" on storage.objects
  for delete
  using (
    bucket_id = 'directive-documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
