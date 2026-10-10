alter table public.modolouge_apps add column conversation jsonb not null default '[]';
alter table public.modolouge_ai_requests add column events jsonb not null default '[]';
create table public.modolouge_app_versions (
  app_id uuid not null references public.modolouge_apps(id) on delete cascade,
  revision integer not null,
  definition_id uuid not null,
  archive_key text not null,
  metadata jsonb not null,
  blueprint jsonb,
  conversation jsonb not null,
  created_at timestamptz not null default now(),
  primary key(app_id,revision)
);
alter table public.modolouge_app_versions enable row level security;
revoke all on public.modolouge_app_versions from public,anon,authenticated;
grant all on public.modolouge_app_versions to service_role;
create function public.modolouge_snapshot_app() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.revision <> old.revision then
    insert into public.modolouge_app_versions(app_id,revision,definition_id,archive_key,metadata,blueprint,conversation)
    values(old.id,old.revision,old.definition_id,old.archive_key,old.metadata,old.blueprint,old.conversation)
    on conflict do nothing;
  end if;
  return new;
end; $$;
revoke all on function public.modolouge_snapshot_app() from public,anon,authenticated;
create trigger modolouge_keep_app_version before update on public.modolouge_apps for each row execute function public.modolouge_snapshot_app();

create or replace function public.modolouge_reserve_ai(p_actor uuid, p_app uuid, p_fingerprint text, p_model text)
returns uuid language plpgsql security invoker set search_path='' as $$
declare s public.modolouge_ai_settings; person public.modolouge_people; request_id uuid; spent numeric; reserve numeric;
begin
  select * into s from public.modolouge_ai_settings where id=true for update;
  if not s.enabled then raise exception 'AI_PAUSED'; end if;
  select * into person from public.modolouge_people where id=p_actor and not blocked;
  if not found then raise exception 'ACCOUNT_DISABLED'; end if;
  if exists(select 1 from public.modolouge_ai_requests where actor_id=p_actor and status='running' and created_at>now()-interval '6 minutes') then raise exception 'AI_BUSY'; end if;
  if (select count(*) from public.modolouge_ai_requests where actor_id=p_actor and error_code is distinct from 'provider_activation' and created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') >= (case when person.kind='guest' then 1 else 10 end) then raise exception 'AI_ALLOWANCE'; end if;
  reserve := case when p_model='openai/gpt-6.1-sol' then 3.0 else 0.30 end;
  select coalesce(sum(coalesce(cost_usd,greatest(estimate_usd,reserved_usd))),0) into spent from public.modolouge_ai_requests
    where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  if spent+reserve>s.daily_budget_usd then raise exception 'AI_BUDGET'; end if;
  insert into public.modolouge_ai_requests(actor_id,app_id,fingerprint,model,reserved_usd)
  values(p_actor,p_app,p_fingerprint,p_model,reserve) returning id into request_id;
  return request_id;
end; $$;

alter table public.modolouge_compute_usage drop constraint modolouge_compute_usage_type_check;
alter table public.modolouge_compute_usage add constraint modolouge_compute_usage_type_check check(type in ('prepare','example','solve','edit'));
create or replace function public.modolouge_reserve_job(p_id uuid,p_actor uuid,p_type text,p_ip inet,p_hash text,p_location jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare person public.modolouge_people;
begin
  select * into person from public.modolouge_people where id=p_actor for update;
  if not found or person.blocked then raise exception 'ACCOUNT_BLOCKED'; end if;
  if person.linked_to is not null and person.kind='guest' then raise exception 'SIGN_IN_REQUIRED'; end if;
  if p_type not in ('prepare','example','solve','edit') then raise exception 'INVALID_JOB'; end if;
  if p_type='edit' and person.kind<>'member' then raise exception 'SIGN_IN_REQUIRED'; end if;
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

