-- Properties table (core GPS sweep data)
create table if not exists properties (
  id text primary key,
  address text not null,
  lat double precision not null,
  lng double precision not null,
  owner_name text,
  owner_phone text,
  owner_email text,
  year_built integer,
  roof_age_years integer,
  market_value integer,
  assessed_value integer,
  last_sale_date text,
  last_sale_price integer,
  county text,
  parcel_id text,
  permit_count integer default 0,
  flags text[] default '{}',
  sources jsonb default '{}',
  score integer default 0,
  created_at timestamptz default now()
);

-- Clients table (CRM status tracking per property)
create table if not exists clients (
  id text primary key,
  property_id text references properties(id) on delete cascade,
  status text not null default 'new_lead' check (status in ('new_lead','contacted','proposal_sent','scheduled','complete','lost')),
  notes text default '',
  last_contact timestamptz,
  assigned_to text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Proposals table
create table if not exists proposals (
  id text primary key,
  client_id text references clients(id) on delete cascade,
  property_id text references properties(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected')),
  total numeric(10,2) default 0,
  notes text default '',
  created_at timestamptz default now(),
  sent_at timestamptz
);

-- Proposal line items
create table if not exists proposal_line_items (
  id text primary key,
  proposal_id text references proposals(id) on delete cascade,
  description text not null,
  quantity numeric(10,2) default 0,
  unit text default 'each',
  unit_price numeric(10,2) default 0,
  total numeric(10,2) default 0
);

-- Materials catalog
create table if not exists materials (
  id text primary key,
  name text not null,
  category text not null default 'other' check (category in ('shingles','underlayment','flashing','fasteners','ventilation','other')),
  unit text default 'each',
  unit_cost numeric(10,2) default 0,
  supplier text default '',
  supplier_phone text,
  notes text default '',
  created_at timestamptz default now()
);

-- Team chat messages
create table if not exists chat_messages (
  id text primary key,
  channel text not null default 'general',
  sender_name text not null,
  sender_role text not null check (sender_role in ('rep','manager')),
  message text not null,
  timestamp timestamptz default now(),
  read boolean default false
);

-- Enable Row Level Security (but allow all for now — anon key has full access)
alter table properties enable row level security;
alter table clients enable row level security;
alter table proposals enable row level security;
alter table proposal_line_items enable row level security;
alter table materials enable row level security;
alter table chat_messages enable row level security;

-- Allow all operations for anon key (open access — auth will be added later)
create policy "Allow all for anon" on properties for all using (true) with check (true);
create policy "Allow all for anon" on clients for all using (true) with check (true);
create policy "Allow all for anon" on proposals for all using (true) with check (true);
create policy "Allow all for anon" on proposal_line_items for all using (true) with check (true);
create policy "Allow all for anon" on materials for all using (true) with check (true);
create policy "Allow all for anon" on chat_messages for all using (true) with check (true);
