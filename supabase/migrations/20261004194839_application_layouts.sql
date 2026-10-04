-- Layouts are private server-managed documents, capped at 20 slots per account.
create table public.modolouge_designs (
  owner_id uuid not null references public.modolouge_people(id) on delete cascade,
  slot smallint not null check (slot between 1 and 20),
  title text not null check (char_length(title) between 1 and 160),
  definition_name text not null default '' check (char_length(definition_name) <= 220),
  document jsonb not null check (jsonb_typeof(document) = 'object' and octet_length(document::text) <= 950000),
  revision uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  primary key(owner_id, slot)
);
alter table public.modolouge_designs enable row level security;
revoke all on table public.modolouge_designs from public, anon, authenticated;
grant select, insert, update, delete on table public.modolouge_designs to service_role;
comment on table public.modolouge_designs is 'Private presentation layouts. Authenticated application routes enforce ownership. No raw Grasshopper archives or runtime values.';
