-- Email account credentials (stored per user)
create table if not exists email_accounts (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  label         text not null default 'My Email',   -- display name
  email_address text not null,
  imap_host     text not null,
  imap_port     integer not null default 993,
  imap_ssl      boolean not null default true,
  smtp_host     text not null,
  smtp_port     integer not null default 587,
  smtp_ssl      boolean not null default false,    -- starttls
  username      text not null,
  -- password stored as plain text for now (user accepts risk via UI disclaimer)
  -- In production this should be encrypted with a KMS key
  password_enc  text not null,
  created_at    timestamptz not null default now()
);

alter table email_accounts enable row level security;
create policy "email_accounts_owner" on email_accounts
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists email_accounts_owner_idx on email_accounts(owner_id);

-- Cached email messages (inbox cache to avoid re-fetching)
create table if not exists email_cache (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  account_id    uuid not null references email_accounts(id) on delete cascade,
  message_uid   text not null,
  from_email    text not null,
  from_name     text,
  subject       text not null default '(no subject)',
  preview       text,       -- first 200 chars of body
  body_text     text,
  body_html     text,
  received_at   timestamptz not null,
  is_read       boolean not null default false,
  client_id     uuid references clients(id) on delete set null,  -- matched CRM client
  created_at    timestamptz not null default now(),
  unique (account_id, message_uid)
);

alter table email_cache enable row level security;
create policy "email_cache_owner" on email_cache
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists email_cache_account_idx on email_cache(account_id, received_at desc);
create index if not exists email_cache_from_idx on email_cache(from_email);
