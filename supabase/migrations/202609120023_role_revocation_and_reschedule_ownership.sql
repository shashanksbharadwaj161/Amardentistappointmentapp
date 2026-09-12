begin;

-- Current role membership and professional approval are both required.
create or replace function public.is_verified_dentist(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.dentist_profiles d
    join public.user_roles r on r.user_id = d.user_id and r.role = 'dentist'
    where d.user_id = target_user_id and d.status = 'approved'
  );
$$;

create or replace function public.reschedule_appointment(
  target_appointment_id uuid,
  target_hold_id uuid,
  request_id text
)
returns table (appointment_id uuid, receipt_number text, deposit_disposition public.deposit_disposition)
language plpgsql
security definer
set search_path = ''
as $$
declare
  old_appointment public.appointments%rowtype;
  new_hold public.appointment_holds%rowtype;
  result_id uuid;
  result_receipt text;
  disposition public.deposit_disposition;
begin
  if auth.uid() is null or char_length(trim(request_id)) < 8 then
    raise exception using errcode = '22023', message = 'INVALID_RESCHEDULE_REQUEST';
  end if;
  -- Authorize the original booking before an idempotent result can be read.
  select * into old_appointment from public.appointments
  where id = target_appointment_id and booked_by = auth.uid() for update;
  if not found then
    raise exception using errcode = '42501', message = 'APPOINTMENT_NOT_RESCHEDULABLE';
  end if;
  select a.id, p.receipt_number, (e.metadata ->> 'deposit')::public.deposit_disposition into result_id, result_receipt, disposition
  from public.payment_transactions p
  join public.appointments a on a.id = p.appointment_id
  join public.appointment_events e on e.appointment_id = a.id and e.event_type = 'appointment.rescheduled_to'
  where p.idempotency_key = trim(request_id) and a.booked_by = auth.uid() and e.metadata ->> 'from_appointment_id' = target_appointment_id::text;
  if found then return query select result_id, result_receipt, disposition; return; end if;
  if exists (select 1 from public.payment_transactions where idempotency_key = trim(request_id)) then
    raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REUSED';
  end if;
  if old_appointment.status <> 'confirmed' then
    raise exception using errcode = '42501', message = 'APPOINTMENT_NOT_RESCHEDULABLE';
  end if;
  select * into new_hold from public.appointment_holds
  where id = target_hold_id and booked_by = auth.uid() for update;
  if not found or new_hold.status <> 'held' or new_hold.expires_at <= clock_timestamp()
    or new_hold.patient_profile_id <> old_appointment.patient_profile_id then
    raise exception using errcode = '22023', message = 'RESCHEDULE_HOLD_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(old_appointment.dentist_id::text || ':' || old_appointment.start_at::text, 0));
  perform pg_advisory_xact_lock(hashtextextended(new_hold.dentist_id::text || ':' || new_hold.start_at::text, 0));
  disposition := case when old_appointment.start_at >= clock_timestamp() + interval '24 hours' then 'transferable'::public.deposit_disposition else 'forfeited'::public.deposit_disposition end;
  update public.appointments set status = 'cancelled', cancellation_disposition = disposition,
    cancellation_reason = 'Rescheduled', cancelled_at = clock_timestamp() where id = old_appointment.id;
  insert into public.appointments (patient_profile_id, booked_by, clinic_id, dentist_id, service_id, source_hold_id,
    start_at, end_at, duration_minutes, price_bdt, deposit_bdt)
  values (new_hold.patient_profile_id, auth.uid(), new_hold.clinic_id, new_hold.dentist_id, new_hold.service_id,
    new_hold.id, new_hold.start_at, new_hold.end_at, new_hold.duration_minutes, new_hold.price_bdt, new_hold.deposit_bdt)
  returning id into result_id;
  result_receipt := 'AMR-' || upper(substr(replace(result_id::text, '-', ''), 1, 12));
  insert into public.payment_transactions (appointment_id, provider, provider_reference, idempotency_key, kind,
    amount_bdt, status, receipt_number, metadata, confirmed_at)
  values (result_id, 'mock', result_id::text, trim(request_id), 'deposit',
    case when disposition = 'transferable' then 0 else new_hold.deposit_bdt end,
    'succeeded', result_receipt, jsonb_build_object('rescheduled_from', old_appointment.id, 'deposit_disposition', disposition), clock_timestamp());
  update public.appointment_holds set status = 'consumed', consumed_at = clock_timestamp() where id = new_hold.id;
  insert into public.appointment_events (appointment_id, actor_id, event_type, from_status, to_status, metadata)
  values
    (old_appointment.id, auth.uid(), 'appointment.rescheduled_from', 'confirmed', 'cancelled', jsonb_build_object('to_appointment_id', result_id, 'deposit', disposition)),
    (result_id, auth.uid(), 'appointment.rescheduled_to', null, 'confirmed', jsonb_build_object('from_appointment_id', old_appointment.id, 'deposit', disposition));
  perform public.write_audit('appointment.rescheduled', 'appointment', result_id::text, jsonb_build_object('from_appointment_id', old_appointment.id, 'deposit', disposition));
  return query select result_id, result_receipt, disposition;
exception when exclusion_violation then
  raise exception using errcode = '23P01', message = 'SLOT_UNAVAILABLE';
end;
$$;

commit;

