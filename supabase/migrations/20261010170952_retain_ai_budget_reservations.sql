-- Keep the full reservation until a turn ends, even when earlier model steps report partial costs.
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
  select coalesce(sum(greatest(coalesce(cost_usd,estimate_usd),reserved_usd)),0) into spent from public.modolouge_ai_requests
    where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
  if spent+reserve>s.daily_budget_usd then raise exception 'AI_BUDGET'; end if;
  insert into public.modolouge_ai_requests(actor_id,app_id,fingerprint,model,reserved_usd)
  values(p_actor,p_app,p_fingerprint,p_model,reserve) returning id into request_id;
  return request_id;
end; $$;

create or replace function public.modolouge_ai_summary(p_since timestamptz)
returns table(actor_id uuid, requests bigint, failed bigint, input_tokens numeric, output_tokens numeric, cache_tokens numeric, reasoning_tokens numeric, reported_cost_usd numeric, estimated_cost_usd numeric, unresolved_reserve_usd numeric)
language sql stable security invoker set search_path = '' as $$
 select actor_id,count(*),count(*) filter(where status='failed'),sum(input_tokens),sum(output_tokens),sum(cache_tokens),sum(reasoning_tokens),
 coalesce(sum(cost_usd),0),coalesce(sum(estimate_usd) filter(where cost_usd is null),0),
 coalesce(sum(greatest(0,reserved_usd-coalesce(cost_usd,estimate_usd))),0)
 from public.modolouge_ai_requests where created_at>=p_since group by actor_id;
$$;
