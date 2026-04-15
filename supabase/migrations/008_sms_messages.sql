-- Create SMS messages table for storing incoming and outgoing SMS
create table if not exists sms_messages (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references auth.users(id) on delete cascade,
  from_number text not null,
  to_number   text not null,
  body        text not null default '',
  direction   text not null default 'inbound' check (direction in ('inbound','outbound')),
  client_id   uuid references clients(id) on delete set null,
  property_id uuid references properties(id) on delete set null,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Enable RLS on sms_messages table
alter table sms_messages enable row level security;

-- RLS policy: users can only access their own SMS messages
create policy "sms_owner" on sms_messages
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Create indexes for common queries
create index if not exists sms_from_idx on sms_messages(from_number);
create index if not exists sms_owner_idx on sms_messages(owner_id, created_at desc);
create index if not exists sms_property_idx on sms_messages(property_id);
