begin;

-- The third RPC argument shares a name with the legacy ledger column.
create or replace function public.set_payment_checkout_result(target_payment_id uuid,checkout_url text,provider_reference text,event_payload jsonb)
returns void language plpgsql security definer set search_path=''
as $$ begin
  update public.payment_transactions set provider_checkout_url=nullif(btrim(checkout_url),''),provider_payment_id=nullif(btrim($3),''),provider_payload=coalesce(event_payload,'{}'::jsonb),status='pending',updated_at=now() where id=target_payment_id;
  if not found then raise exception using errcode='22023',message='PAYMENT_NOT_FOUND'; end if;
end $$;

revoke all on function public.set_payment_checkout_result(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.set_payment_checkout_result(uuid,text,text,jsonb) to service_role;

commit;
