create function public.modolouge_usage_summary(p_month date)
returns table(actor_id uuid,jobs bigint,failed bigint,seconds double precision)
language sql stable security invoker set search_path='' as $$
 select actor_id,count(*),count(*) filter(where status='failed'),coalesce(sum(seconds),0)
 from public.modolouge_compute_usage
 where created_at>=p_month and created_at<p_month+interval '1 month' and not refunded
 group by actor_id;
$$;
revoke execute on function public.modolouge_usage_summary(date) from public,anon,authenticated;
grant execute on function public.modolouge_usage_summary(date) to service_role;
create extension if not exists pg_cron;
select cron.schedule('modolouge-retention','17 3 * * *','select public.modolouge_prune_activity()');
