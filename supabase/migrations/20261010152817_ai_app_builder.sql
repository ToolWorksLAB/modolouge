-- Server-mediated AI drafts, immutable publication snapshots and an auditable ledger.
create table public.modolouge_ai_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  daily_budget_usd numeric(12,6) not null default 5 check (daily_budget_usd between 0 and 100),
  updated_at timestamptz not null default now()
);
insert into public.modolouge_ai_settings (id) values (true);
create table public.modolouge_apps (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.modolouge_people(id),
  definition_id uuid not null,
  filename text not null,
  archive_key text not null,
  metadata jsonb not null,
  blueprint jsonb,
  revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, definition_id)
);
create index modolouge_apps_owner_updated on public.modolouge_apps(owner_id,updated_at desc);
create table public.modolouge_publications (
  slug text primary key check(slug ~ '^[a-f0-9]{24}$'),
  app_id uuid not null unique references public.modolouge_apps(id),
  owner_id uuid not null references public.modolouge_people(id),
  revision integer not null,
  runtime_owner_id uuid not null references public.modolouge_people(id),
  blueprint jsonb not null,
  controls jsonb not null,
  archive_key text not null,
  filename text not null,
  active boolean not null default true,
  published_at timestamptz not null default now()
);
create index modolouge_publications_owner on public.modolouge_publications(owner_id);
create table public.modolouge_ai_requests (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.modolouge_people(id),
  app_id uuid not null references public.modolouge_apps(id),
  fingerprint text not null,
  model text not null,
  status text not null default 'running' check(status in ('running','succeeded','failed')),
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cache_tokens bigint not null default 0,
  reasoning_tokens bigint not null default 0,
  cost_usd numeric(12,8),
  estimate_usd numeric(12,8) not null default 0,
  reserved_usd numeric(12,6) not null default 0.30,
  generation_ids jsonb not null default '[]',
  latency_ms integer,
  error_code text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index modolouge_ai_requests_actor_time on public.modolouge_ai_requests(actor_id,created_at desc);
create index modolouge_ai_requests_time on public.modolouge_ai_requests(created_at desc);
create index modolouge_ai_requests_app on public.modolouge_ai_requests(app_id);
create unique index modolouge_ai_fingerprint_success on public.modolouge_ai_requests(actor_id,fingerprint) where status in ('running','succeeded');

alter table public.modolouge_ai_settings enable row level security;
alter table public.modolouge_apps enable row level security;
alter table public.modolouge_publications enable row level security;
alter table public.modolouge_ai_requests enable row level security;
revoke all on public.modolouge_ai_settings, public.modolouge_apps, public.modolouge_publications, public.modolouge_ai_requests from anon, authenticated;
grant all on public.modolouge_ai_settings, public.modolouge_apps, public.modolouge_publications, public.modolouge_ai_requests to service_role;

create function public.modolouge_create_ai_app(p_owner uuid, p_definition uuid, p_filename text, p_metadata jsonb)
returns public.modolouge_apps language plpgsql security invoker set search_path = '' as $$
declare a public.modolouge_apps;
begin
  perform 1 from public.modolouge_people where id=p_owner and not blocked for update;
  if not found then raise exception 'ACCOUNT_DISABLED'; end if;
  select * into a from public.modolouge_apps where owner_id=p_owner and definition_id=p_definition;
  if found then return a; end if;
  if (select count(*) from public.modolouge_apps where owner_id=p_owner)>=20 then raise exception 'APP_LIMIT'; end if;
  insert into public.modolouge_apps(owner_id,definition_id,filename,archive_key,metadata)
  values(p_owner,p_definition,left(p_filename,120),p_owner::text||'/'||p_definition::text||'.json',p_metadata) returning * into a;
  return a;
end; $$;

create function public.modolouge_reserve_ai(p_actor uuid, p_app uuid, p_fingerprint text, p_model text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare s public.modolouge_ai_settings; person public.modolouge_people; request_id uuid; spent numeric;
begin
  -- Serialize reservations globally so simultaneous requests cannot overspend the cap.
  select * into s from public.modolouge_ai_settings where id=true for update;
  if not s.enabled then raise exception 'AI_PAUSED'; end if;
  select * into person from public.modolouge_people where id=p_actor and not blocked;
  if not found then raise exception 'ACCOUNT_DISABLED'; end if;
  if exists(select 1 from public.modolouge_ai_requests where actor_id=p_actor and status='running' and created_at>now()-interval '3 minutes') then raise exception 'AI_BUSY'; end if;
  if (select count(*) from public.modolouge_ai_requests where actor_id=p_actor and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') >= (case when person.kind='guest' then 1 else 10 end) then raise exception 'AI_ALLOWANCE'; end if;
  select coalesce(sum(coalesce(cost_usd,greatest(estimate_usd,reserved_usd))),0) into spent
  from public.modolouge_ai_requests where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  if spent+0.30>s.daily_budget_usd then raise exception 'AI_BUDGET'; end if;
  insert into public.modolouge_ai_requests(actor_id,app_id,fingerprint,model) values(p_actor,p_app,p_fingerprint,p_model) returning id into request_id;
  return request_id;
end; $$;

create function public.modolouge_ai_summary(p_since timestamptz)
returns table(actor_id uuid, requests bigint, failed bigint, input_tokens numeric, output_tokens numeric, cache_tokens numeric, reasoning_tokens numeric, reported_cost_usd numeric, estimated_cost_usd numeric, unresolved_reserve_usd numeric)
language sql stable security invoker set search_path = '' as $$
 select actor_id,count(*),count(*) filter(where status='failed'),sum(input_tokens),sum(output_tokens),sum(cache_tokens),sum(reasoning_tokens),
 coalesce(sum(cost_usd),0),coalesce(sum(estimate_usd) filter(where cost_usd is null),0),
 coalesce(sum(greatest(0,reserved_usd-estimate_usd)) filter(where cost_usd is null),0)
 from public.modolouge_ai_requests where created_at>=p_since group by actor_id;
$$;
revoke all on function public.modolouge_create_ai_app(uuid,uuid,text,jsonb), public.modolouge_reserve_ai(uuid,uuid,text,text), public.modolouge_ai_summary(timestamptz) from public,anon,authenticated;
grant execute on function public.modolouge_create_ai_app(uuid,uuid,text,jsonb), public.modolouge_reserve_ai(uuid,uuid,text,text), public.modolouge_ai_summary(timestamptz) to service_role;

-- Private archives are only read by the server. There are deliberately no client policies.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('modolouge-apps','modolouge-apps',false,41943040,array['application/json']);
