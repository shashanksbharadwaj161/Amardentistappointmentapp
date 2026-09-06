begin;

-- Forward repair for projects that applied the initial Phase 3 migration before
-- the output-column/table-column ambiguity was found by hosted pgTAP.
create or replace function public.create_appointment_hold(
  target_patient_profile_id uuid,
  target_service_id uuid,
  target_dentist_id uuid,
  requested_start_at timestamptz
)
returns table (hold_id uuid, expires_at timestamptz, end_at timestamptz, price_bdt numeric, deposit_bdt numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare service_record record; calculated_end timestamptz; result_id uuid; result_expiry timestamptz := clock_timestamp() + interval '10 minutes';
begin
  if auth.uid() is null or not public.owns_patient_profile(target_patient_profile_id) then
    raise exception using errcode = '42501', message = 'PATIENT_PROFILE_DENIED';
  end if;
  select s.clinic_id, s.duration_minutes, s.price_bdt, s.deposit_bdt into service_record
  from public.clinic_services s
  join public.clinics c on c.id = s.clinic_id and c.status = 'approved'
  join public.dentist_profiles d on d.user_id = target_dentist_id and d.status = 'approved'
  join public.clinic_memberships m on m.clinic_id = s.clinic_id and m.user_id = target_dentist_id and m.role = 'dentist' and m.status = 'active'
  where s.id = target_service_id and s.is_active and (s.dentist_id is null or s.dentist_id = target_dentist_id);
  if not found then raise exception using errcode = '22023', message = 'SERVICE_NOT_BOOKABLE'; end if;
  if requested_start_at <= clock_timestamp() then raise exception using errcode = '22023', message = 'SLOT_IN_PAST'; end if;
  calculated_end := requested_start_at + make_interval(mins => service_record.duration_minutes);
  perform pg_advisory_xact_lock(hashtextextended(target_dentist_id::text || ':' || requested_start_at::text, 0));
  update public.appointment_holds h set status = 'expired' where h.status = 'held' and h.expires_at <= clock_timestamp();
  if not exists (
    select 1 from public.available_clinic_slots(service_record.clinic_id, target_dentist_id, target_service_id,
      (requested_start_at at time zone 'Asia/Dhaka')::date, (requested_start_at at time zone 'Asia/Dhaka')::date) slot
    where slot.start_at = requested_start_at and slot.end_at = calculated_end
  ) then raise exception using errcode = '23P01', message = 'SLOT_UNAVAILABLE'; end if;
  insert into public.appointment_holds (patient_profile_id, booked_by, clinic_id, dentist_id, service_id, start_at, end_at,
    duration_minutes, price_bdt, deposit_bdt, expires_at)
  values (target_patient_profile_id, auth.uid(), service_record.clinic_id, target_dentist_id, target_service_id, requested_start_at,
    calculated_end, service_record.duration_minutes, service_record.price_bdt, service_record.deposit_bdt, result_expiry)
  returning id into result_id;
  perform public.write_audit('appointment.hold_created', 'appointment_hold', result_id::text, jsonb_build_object('expires_at', result_expiry));
  return query select result_id, result_expiry, calculated_end, service_record.price_bdt, service_record.deposit_bdt;
exception when exclusion_violation then
  raise exception using errcode = '23P01', message = 'SLOT_UNAVAILABLE';
end;
$$;

revoke all on function public.create_appointment_hold(uuid,uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.create_appointment_hold(uuid,uuid,uuid,timestamptz) to authenticated;

commit;
