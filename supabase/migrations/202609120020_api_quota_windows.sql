begin;

-- The original daily buckets were split by hour. Preserve already consumed
-- requests when switching the two daily AI scopes to UTC calendar days.
lock table public.api_rate_limits in share row exclusive mode;
with removed as (
  delete from public.api_rate_limits
  where scope in ('ai:dentist','ai:patient')
  returning actor_id,scope,window_started_at,request_count
)
insert into public.api_rate_limits(actor_id,scope,window_started_at,request_count)
select actor_id,scope,
  date_bin(interval '1440 minutes',window_started_at,timestamptz '1970-01-01 00:00:00+00'),
  least(sum(request_count),2147483647)::integer
from removed
group by actor_id,scope,
  date_bin(interval '1440 minutes',window_started_at,timestamptz '1970-01-01 00:00:00+00');

create or replace function public.consume_api_limit(actor uuid,target_scope text,max_requests integer,window_minutes integer default 1440)
returns boolean language plpgsql security definer set search_path=''
as $$
declare bucket timestamptz; count_now integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED';
  end if;
  if actor is null or target_scope is null or btrim(target_scope)=''
    or target_scope<>btrim(target_scope)
    or max_requests is null or max_requests<0
    or window_minutes is null or window_minutes<=0 then
    raise exception using errcode='22023',message='API_LIMIT_INPUT_INVALID';
  end if;
  if max_requests=0 then return false; end if;

  -- Absolute UTC windows, independent of the session timezone and hour field.
  -- Statement time also advances correctly within a long-lived transaction.
  bucket:=date_bin(window_minutes*interval '1 minute',statement_timestamp(),timestamptz '1970-01-01 00:00:00+00');
  -- The unique key and conditional update serialize competing requests. Denied
  -- attempts do not inflate usage, so raising a limit takes effect immediately.
  insert into public.api_rate_limits(actor_id,scope,window_started_at,request_count)
  values(actor,target_scope,bucket,1)
  on conflict(actor_id,scope,window_started_at) do update
    set request_count=public.api_rate_limits.request_count+1
    where public.api_rate_limits.request_count<max_requests
  returning request_count into count_now;
  return count_now is not null;
end $$;

revoke all on function public.consume_api_limit(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.consume_api_limit(uuid,text,integer,integer) to service_role;

commit;
