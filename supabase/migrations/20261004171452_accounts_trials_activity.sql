-- Accounts and activity are private to the application servers. Compute payloads
-- remain in the existing private AWS queue/storage, with outcomes mirrored here.
create table public.modolouge_people (
  id uuid primary key,
  auth_user_id uuid unique references auth.users(id) on delete set null,
  kind text not null check (kind in ('guest','member')),
  email text,
  display_name text not null default '',
  discipline text not null default '',
  intent text not null default '',
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  last_ip inet,
  location jsonb not null default '{}',
  blocked boolean not null default false,
  guest_runs integer not null default 0 check (guest_runs between 0 and 5),
  guest_preparations integer not null default 0 check (guest_preparations between 0 and 5),
  linked_to uuid references public.modolouge_people(id),
  check (id is distinct from linked_to)
);
create index modolouge_people_seen on public.modolouge_people(last_seen desc);
create index modolouge_people_linked on public.modolouge_people(linked_to) where linked_to is not null;

create table public.modolouge_limits (
  key text primary key,
  used integer not null default 0,
  expires_at timestamptz not null
);
create index modolouge_limits_expiry on public.modolouge_limits(expires_at);

create table public.modolouge_activity (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.modolouge_people(id) on delete set null,
  event text not null,
  ip inet,
  location jsonb not null default '{}',
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index modolouge_activity_time on public.modolouge_activity(created_at desc);
create index modolouge_activity_actor_time on public.modolouge_activity(actor_id,created_at desc);

create table public.modolouge_compute_usage (
  id uuid primary key,
  actor_id uuid not null references public.modolouge_people(id),
  type text not null check (type in ('prepare','example','solve')),
  status text not null default 'queued',
  seconds double precision not null default 0,
  ip inet,
  ip_hash text,
  location jsonb not null default '{}',
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  refunded boolean not null default false
);
create index modolouge_compute_usage_actor_time on public.modolouge_compute_usage(actor_id,created_at desc);
create index modolouge_compute_usage_time on public.modolouge_compute_usage(created_at desc);

alter table public.modolouge_people enable row level security;
alter table public.modolouge_limits enable row level security;
alter table public.modolouge_activity enable row level security;
alter table public.modolouge_compute_usage enable row level security;
revoke all on public.modolouge_people, public.modolouge_limits, public.modolouge_activity, public.modolouge_compute_usage from anon, authenticated;
grant all on public.modolouge_people, public.modolouge_limits, public.modolouge_activity, public.modolouge_compute_usage to service_role;
-- Explicit deny policies document that these are server-only tables.
create policy server_only_people on public.modolouge_people for all to anon, authenticated using(false) with check(false);
create policy server_only_limits on public.modolouge_limits for all to anon, authenticated using(false) with check(false);
create policy server_only_activity on public.modolouge_activity for all to anon, authenticated using(false) with check(false);
create policy server_only_usage on public.modolouge_compute_usage for all to anon, authenticated using(false) with check(false);

create function public.modolouge_take_limit(p_key text, p_max integer, p_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare n integer;
begin
  insert into public.modolouge_limits(key,used,expires_at)
  values(p_key,1,now()+make_interval(secs=>p_seconds))
  on conflict(key) do update set
    used=case when modolouge_limits.expires_at<=now() then 1 else modolouge_limits.used+1 end,
    expires_at=case when modolouge_limits.expires_at<=now() then excluded.expires_at else modolouge_limits.expires_at end
  where modolouge_limits.expires_at<=now() or modolouge_limits.used<p_max
  returning used into n;
  return n is not null;
end $$;

create function public.modolouge_reserve_job(p_id uuid,p_actor uuid,p_type text,p_ip inet,p_hash text,p_location jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare person public.modolouge_people;
begin
  select * into person from public.modolouge_people where id=p_actor for update;
  if not found or person.blocked then raise exception 'ACCOUNT_BLOCKED'; end if;
  if person.linked_to is not null and person.kind='guest' then raise exception 'SIGN_IN_REQUIRED'; end if;
  if p_type not in ('prepare','example','solve') then raise exception 'INVALID_JOB'; end if;
  if person.kind='guest' then
    if person.guest_runs>=5 then raise exception 'TRIAL_EXHAUSTED'; end if;
    if p_type='solve' then
      if not public.modolouge_take_limit('trial:run:'||p_hash,5,2592000) then raise exception 'TRIAL_EXHAUSTED'; end if;
      update public.modolouge_people set guest_runs=guest_runs+1 where id=p_actor;
    else
      if person.guest_preparations>=5 or not public.modolouge_take_limit('trial:prepare:'||p_hash,5,2592000) then raise exception 'TRIAL_PREPARATION_LIMIT'; end if;
      update public.modolouge_people set guest_preparations=guest_preparations+1 where id=p_actor;
    end if;
  end if;
  insert into public.modolouge_compute_usage(id,actor_id,type,ip,ip_hash,location)
  values(p_id,p_actor,p_type,p_ip,p_hash,p_location);
  update public.modolouge_people set last_seen=now(),last_ip=p_ip,location=p_location where id=p_actor;
end $$;

-- Compensation only for dispatch failures, never for a computation which ran.
create function public.modolouge_refund_job(p_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare j public.modolouge_compute_usage; k text;
begin
  select * into j from public.modolouge_compute_usage where id=p_id for update;
  if not found or j.refunded or j.status<>'queued' then return; end if;
  update public.modolouge_compute_usage set refunded=true,status='dispatch_failed',finished_at=now() where id=p_id;
  if exists(select 1 from public.modolouge_people where id=j.actor_id and kind='guest') then
    if j.type='solve' then
      update public.modolouge_people set guest_runs=greatest(0,guest_runs-1) where id=j.actor_id;
      k='trial:run:'||j.ip_hash;
    else
      update public.modolouge_people set guest_preparations=greatest(0,guest_preparations-1) where id=j.actor_id;
      k='trial:prepare:'||j.ip_hash;
    end if;
    update public.modolouge_limits set used=greatest(0,used-1) where key=k;
  end if;
end $$;

create function public.modolouge_link_account(p_auth_id uuid,p_guest uuid default null)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare verified_email text;
begin
  select lower(email) into verified_email from auth.users where id=p_auth_id and email_confirmed_at is not null and not is_anonymous;
  if verified_email is null then raise exception 'VERIFIED_EMAIL_REQUIRED'; end if;
  insert into public.modolouge_people(id,auth_user_id,kind,email)
  values(p_auth_id,p_auth_id,'member',verified_email)
  on conflict(id) do update set email=excluded.email,last_seen=now();
  if p_guest is not null then
    -- The server obtains p_guest only from an encrypted, host-only guest cookie.
    update public.modolouge_people set linked_to=p_auth_id where id=p_guest and kind='guest' and linked_to is null and not blocked;
  end if;
  return p_auth_id;
end $$;

create function public.modolouge_prune_activity()
returns void language sql security invoker set search_path = '' as $$
  update public.modolouge_people set last_ip=null where last_seen<now()-interval '30 days' and last_ip is not null;
  update public.modolouge_activity set ip=null where created_at<now()-interval '30 days' and ip is not null;
  update public.modolouge_compute_usage set ip=null,ip_hash=null where created_at<now()-interval '30 days' and (ip is not null or ip_hash is not null);
  delete from public.modolouge_activity where created_at<now()-interval '90 days';
  delete from public.modolouge_compute_usage where created_at<now()-interval '13 months';
  delete from public.modolouge_limits where expires_at<now();
$$;

revoke execute on function public.modolouge_take_limit(text,integer,integer),public.modolouge_reserve_job(uuid,uuid,text,inet,text,jsonb),public.modolouge_refund_job(uuid),public.modolouge_link_account(uuid,uuid),public.modolouge_prune_activity() from public, anon, authenticated;
grant execute on function public.modolouge_take_limit(text,integer,integer),public.modolouge_reserve_job(uuid,uuid,text,inet,text,jsonb),public.modolouge_refund_job(uuid),public.modolouge_link_account(uuid,uuid),public.modolouge_prune_activity() to service_role;
