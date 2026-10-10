alter table public.modolouge_ai_requests add column ip inet, add column location jsonb not null default '{}';
create function public.modolouge_prune_ai_usage() returns void language sql security invoker set search_path='' as $$
  update public.modolouge_ai_requests set ip=null where created_at<now()-interval '30 days' and ip is not null;
  delete from public.modolouge_ai_requests where created_at<now()-interval '13 months';
$$;
revoke all on function public.modolouge_prune_ai_usage() from public,anon,authenticated;
grant execute on function public.modolouge_prune_ai_usage() to service_role;
select cron.schedule('modolouge-ai-retention','35 3 * * *','select public.modolouge_prune_ai_usage()');
