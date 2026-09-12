begin;

create or replace function public.prepare_payment_checkout(target_appointment_id uuid,target_provider public.payment_provider,request_key text)
returns table(payment_id uuid,amount_bdt numeric,currency text) language plpgsql security definer set search_path=''
as $$ declare appointment public.appointments%rowtype; existing public.payment_transactions%rowtype; begin
  if request_key is null or char_length(btrim(request_key))<12 then raise exception using errcode='22023',message='IDEMPOTENCY_KEY_INVALID'; end if;
  select * into appointment from public.appointments where id=target_appointment_id for update;
  if not found or not public.owns_patient_profile(appointment.patient_profile_id) then raise exception using errcode='42501',message='APPOINTMENT_PAYMENT_DENIED'; end if;
  if appointment.status not in ('confirmed','checked_in','completed') then raise exception using errcode='22023',message='APPOINTMENT_NOT_PAYABLE'; end if;
  if appointment.deposit_bdt<=0 then raise exception using errcode='22023',message='PAYMENT_AMOUNT_INVALID'; end if;
  select * into existing from public.payment_transactions where idempotency_key=request_key for update;
  if found then
    if existing.appointment_id is distinct from target_appointment_id or existing.provider is distinct from target_provider then raise exception using errcode='22023',message='IDEMPOTENCY_KEY_REUSED'; end if;
    if existing.status not in ('created','pending') then raise exception using errcode='22023',message='PAYMENT_ALREADY_FINALIZED'; end if;
    return query select existing.id,existing.amount_bdt,existing.currency; return;
  end if;
  return query insert into public.payment_transactions(provider,appointment_id,patient_profile_id,clinic_id,amount_bdt,idempotency_key,created_by)
    values(target_provider,appointment.id,appointment.patient_profile_id,appointment.clinic_id,appointment.deposit_bdt,request_key,auth.uid())
    returning public.payment_transactions.id,public.payment_transactions.amount_bdt,public.payment_transactions.currency;
end $$;

create or replace function public.set_payment_checkout_result(target_payment_id uuid,checkout_url text,provider_reference text,event_payload jsonb)
returns void language plpgsql security definer set search_path=''
as $$ declare payment public.payment_transactions%rowtype; begin
  select * into payment from public.payment_transactions where id=target_payment_id for update;
  if not found then raise exception using errcode='22023',message='PAYMENT_NOT_FOUND'; end if;
  if payment.status not in ('created','pending') then raise exception using errcode='22023',message='PAYMENT_ALREADY_FINALIZED'; end if;
  -- Concurrent checkout calls must reuse the first persisted provider session.
  if payment.status='pending' and nullif(btrim(payment.provider_checkout_url),'') is not null
    and nullif(btrim(payment.provider_payment_id),'') is not null then
    if payment.provider_checkout_url is distinct from nullif(btrim($2),'')
      or payment.provider_payment_id is distinct from nullif(btrim($3),'') then
      raise exception using errcode='22023',message='PAYMENT_CHECKOUT_ALREADY_CREATED';
    end if;
    return;
  end if;
  update public.payment_transactions set provider_checkout_url=nullif(btrim($2),''),provider_payment_id=nullif(btrim($3),''),provider_payload=coalesce(event_payload,'{}'::jsonb),status='pending',updated_at=now() where id=target_payment_id;
end $$;

revoke all on function public.set_payment_checkout_result(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.set_payment_checkout_result(uuid,text,text,jsonb) to service_role;

commit;
