begin;

create or replace function public.expire_waitlist_offers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_count integer;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;

  with expired_offers as (
    update public.waitlist_entries
    set status = 'expired'
    where status = 'offered' and offer_expires_at <= clock_timestamp()
    returning offer_hold_id
  ), expired_holds as (
    update public.appointment_holds
    set status = 'expired'
    where status = 'held' and id in (select offer_hold_id from expired_offers where offer_hold_id is not null)
    returning id
  )
  select count(*)::integer into expired_count from expired_offers;

  return expired_count;
end;
$$;

revoke all on function public.expire_waitlist_offers() from public, anon, authenticated;
grant execute on function public.expire_waitlist_offers() to authenticated;

commit;
