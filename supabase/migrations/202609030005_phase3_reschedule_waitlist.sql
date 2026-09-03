begin;

alter table public.waitlist_entries
  add column offer_hold_id uuid unique references public.appointment_holds(id) on delete set null;

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
  select a.id, p.receipt_number, (e.metadata ->> 'deposit')::public.deposit_disposition into result_id, result_receipt, disposition
  from public.payment_transactions p
  join public.appointments a on a.id = p.appointment_id
  join public.appointment_events e on e.appointment_id = a.id and e.event_type = 'appointment.rescheduled_to'
  where p.idempotency_key = trim(request_id) and e.metadata ->> 'from_appointment_id' = target_appointment_id::text;
  if found then return query select result_id, result_receipt, disposition; return; end if;
  if exists (select 1 from public.payment_transactions where idempotency_key = trim(request_id)) then
    raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REUSED';
  end if;
  select * into old_appointment from public.appointments
  where id = target_appointment_id and booked_by = auth.uid() for update;
  if not found or old_appointment.status <> 'confirmed' then
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
  disposition := case when old_appointment.start_at >= clock_timestamp() + interval '24 hours' then 'transferable' else 'forfeited' end;
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

create or replace function public.offer_waitlist_slot(
  target_clinic_id uuid,
  target_service_id uuid,
  offered_dentist_id uuid,
  offered_slot_start_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  waitlist_record public.waitlist_entries%rowtype;
  service_record public.clinic_services%rowtype;
  offered_end_at timestamptz;
  hold_id uuid;
begin
  if not (public.can_manage_clinic(target_clinic_id) or public.has_clinic_role(target_clinic_id, array['front_desk']::public.app_role[])) then
    raise exception using errcode = '42501', message = 'WAITLIST_OPERATION_DENIED';
  end if;
  if offered_slot_start_at <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'WAITLIST_SLOT_MUST_BE_FUTURE';
  end if;
  select * into service_record from public.clinic_services
  where id = target_service_id and clinic_id = target_clinic_id and is_active
    and (dentist_id is null or dentist_id = offered_dentist_id);
  if not found then raise exception using errcode = '22023', message = 'SERVICE_NOT_BOOKABLE'; end if;
  offered_end_at := offered_slot_start_at + make_interval(mins => service_record.duration_minutes);
  perform pg_advisory_xact_lock(hashtextextended(offered_dentist_id::text || ':' || offered_slot_start_at::text, 0));
  update public.appointment_holds set status = 'expired' where status = 'held' and expires_at <= clock_timestamp();
  if not exists (
    select 1 from public.available_clinic_slots(target_clinic_id, offered_dentist_id, target_service_id,
      (offered_slot_start_at at time zone 'Asia/Dhaka')::date, (offered_slot_start_at at time zone 'Asia/Dhaka')::date) slot
    where slot.start_at = offered_slot_start_at and slot.end_at = offered_end_at
  ) then raise exception using errcode = '23P01', message = 'SLOT_UNAVAILABLE'; end if;
  select * into waitlist_record from public.waitlist_entries w
  where w.clinic_id = target_clinic_id and w.service_id = target_service_id and w.status = 'waiting'
    and (w.dentist_id is null or w.dentist_id = offered_dentist_id)
    and w.preferred_date = (offered_slot_start_at at time zone 'Asia/Dhaka')::date
    and (w.earliest_time is null or (offered_slot_start_at at time zone 'Asia/Dhaka')::time between w.earliest_time and w.latest_time)
  order by w.created_at for update skip locked limit 1;
  if not found then raise exception using errcode = 'P0002', message = 'WAITLIST_EMPTY'; end if;
  insert into public.appointment_holds (patient_profile_id, booked_by, clinic_id, dentist_id, service_id, start_at, end_at,
    duration_minutes, price_bdt, deposit_bdt, expires_at)
  values (waitlist_record.patient_profile_id, waitlist_record.requested_by, target_clinic_id, offered_dentist_id,
    target_service_id, offered_slot_start_at, offered_end_at, service_record.duration_minutes,
    service_record.price_bdt, service_record.deposit_bdt, clock_timestamp() + interval '15 minutes')
  returning id into hold_id;
  update public.waitlist_entries set status = 'offered', dentist_id = offered_dentist_id,
    offered_start_at = offered_slot_start_at, offer_expires_at = clock_timestamp() + interval '15 minutes', offer_hold_id = hold_id
  where id = waitlist_record.id;
  insert into public.notification_outbox (recipient_id, channel, template_key, payload, idempotency_key)
  values (waitlist_record.requested_by, 'in_app', 'waitlist.slot_offered',
    jsonb_build_object('waitlist_id', waitlist_record.id, 'hold_id', hold_id, 'start_at', offered_slot_start_at),
    'waitlist-offer:' || waitlist_record.id::text);
  return waitlist_record.id;
exception when exclusion_violation then
  raise exception using errcode = '23P01', message = 'SLOT_UNAVAILABLE';
end;
$$;

create or replace function public.confirm_waitlist_offer(target_waitlist_id uuid, request_id text)
returns table (appointment_id uuid, receipt_number text, appointment_status public.appointment_status)
language plpgsql
security definer
set search_path = ''
as $$
declare entry public.waitlist_entries%rowtype; confirmation record;
begin
  select * into entry from public.waitlist_entries where id = target_waitlist_id and requested_by = auth.uid() for update;
  if not found then raise exception using errcode = '42501', message = 'WAITLIST_OFFER_DENIED'; end if;
  if entry.status = 'booked' then
    select * into confirmation from public.confirm_mock_appointment(entry.offer_hold_id, request_id);
    return query select confirmation.appointment_id, confirmation.receipt_number, confirmation.appointment_status;
    return;
  end if;
  if entry.status <> 'offered' or entry.offer_expires_at <= clock_timestamp() or entry.offer_hold_id is null then
    update public.waitlist_entries set status = 'expired' where id = entry.id and status = 'offered';
    update public.appointment_holds set status = 'expired' where id = entry.offer_hold_id and status = 'held';
    raise exception using errcode = '22023', message = 'WAITLIST_OFFER_EXPIRED';
  end if;
  select * into confirmation from public.confirm_mock_appointment(entry.offer_hold_id, request_id);
  update public.waitlist_entries set status = 'booked' where id = entry.id;
  return query select confirmation.appointment_id, confirmation.receipt_number, confirmation.appointment_status;
end;
$$;

revoke all on function public.reschedule_appointment(uuid, uuid, text),
  public.confirm_waitlist_offer(uuid, text) from public, anon, authenticated;
grant execute on function public.reschedule_appointment(uuid, uuid, text),
  public.confirm_waitlist_offer(uuid, text) to authenticated;

commit;
