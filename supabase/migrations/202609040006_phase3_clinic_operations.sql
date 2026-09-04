begin;

alter table public.patient_profiles
  alter column account_owner_id drop not null,
  add column managed_by_clinic_id uuid references public.clinics(id) on delete restrict,
  add column created_by uuid references auth.users(id) on delete set null,
  add constraint patient_profile_ownership_scope
    check (num_nonnulls(account_owner_id, managed_by_clinic_id) = 1);

drop policy patient_profiles_read_owner on public.patient_profiles;
create policy patient_profiles_read_owner on public.patient_profiles for select to authenticated using (
  account_owner_id = auth.uid()
  or public.is_admin()
  or (
    managed_by_clinic_id is not null
    and public.has_clinic_role(managed_by_clinic_id, array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[])
  )
  or exists (
    select 1 from public.appointments a
    where a.patient_profile_id = patient_profiles.id
      and public.has_clinic_role(a.clinic_id, array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[])
  )
);

create or replace function public.create_walk_in_appointment(
  target_patient_profile_id uuid,
  target_service_id uuid,
  target_dentist_id uuid,
  requested_start_at timestamptz default clock_timestamp()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare service_record record; patient_record public.patient_profiles%rowtype; calculated_end timestamptz; result_id uuid;
begin
  select s.clinic_id, s.duration_minutes, s.price_bdt into service_record
  from public.clinic_services s
  join public.clinics c on c.id = s.clinic_id and c.status = 'approved'
  join public.dentist_profiles d on d.user_id = target_dentist_id and d.status = 'approved'
  join public.clinic_memberships m on m.clinic_id = s.clinic_id and m.user_id = target_dentist_id and m.role = 'dentist' and m.status = 'active'
  where s.id = target_service_id and s.is_active and (s.dentist_id is null or s.dentist_id = target_dentist_id);
  if not found then raise exception using errcode = '22023', message = 'SERVICE_NOT_BOOKABLE'; end if;
  if not (public.is_admin() or public.has_clinic_role(service_record.clinic_id, array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[])) then
    raise exception using errcode = '42501', message = 'WALK_IN_DENIED';
  end if;
  select * into patient_record from public.patient_profiles p where p.id = target_patient_profile_id and (
    p.account_owner_id = auth.uid()
    or p.managed_by_clinic_id = service_record.clinic_id
    or exists (select 1 from public.appointments a where a.patient_profile_id = p.id and a.clinic_id = service_record.clinic_id)
  );
  if not found then raise exception using errcode = '42501', message = 'PATIENT_PROFILE_NOT_AVAILABLE'; end if;
  calculated_end := requested_start_at + make_interval(mins => service_record.duration_minutes);
  perform pg_advisory_xact_lock(hashtextextended(target_dentist_id::text || ':' || requested_start_at::text, 0));
  insert into public.appointments (patient_profile_id, booked_by, clinic_id, dentist_id, service_id, start_at, end_at,
    duration_minutes, price_bdt, deposit_bdt)
  values (patient_record.id, coalesce(patient_record.account_owner_id, auth.uid()), service_record.clinic_id,
    target_dentist_id, target_service_id, requested_start_at, calculated_end, service_record.duration_minutes,
    service_record.price_bdt, 0)
  returning id into result_id;
  insert into public.appointment_events (appointment_id, actor_id, event_type, to_status, metadata)
  values (result_id, auth.uid(), 'appointment.walk_in_created', 'confirmed', jsonb_build_object('deposit_collected', false));
  perform public.write_audit('appointment.walk_in_created', 'appointment', result_id::text, jsonb_build_object('clinic_id', service_record.clinic_id));
  return result_id;
exception when exclusion_violation then
  raise exception using errcode = '23P01', message = 'SLOT_UNAVAILABLE';
end;
$$;

create or replace function public.create_guest_walk_in_appointment(
  target_clinic_id uuid,
  guest_full_name text,
  guest_phone text,
  target_service_id uuid,
  target_dentist_id uuid,
  requested_start_at timestamptz default clock_timestamp()
)
returns table (appointment_id uuid, patient_profile_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare result_profile_id uuid; result_appointment_id uuid;
begin
  if not (public.is_admin() or public.has_clinic_role(target_clinic_id, array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[])) then
    raise exception using errcode = '42501', message = 'WALK_IN_DENIED';
  end if;
  if char_length(trim(guest_full_name)) not between 2 and 120
    or (trim(guest_phone) <> '' and char_length(trim(guest_phone)) not between 7 and 24) then
    raise exception using errcode = '22023', message = 'INVALID_GUEST_PROFILE';
  end if;
  if not exists (
    select 1 from public.clinic_services s
    where s.id = target_service_id and s.clinic_id = target_clinic_id and s.is_active
      and (s.dentist_id is null or s.dentist_id = target_dentist_id)
  ) then raise exception using errcode = '22023', message = 'SERVICE_NOT_BOOKABLE'; end if;
  insert into public.patient_profiles (account_owner_id, relationship, full_name, phone, managed_by_clinic_id, created_by)
  values (null, 'other', trim(guest_full_name), trim(guest_phone), target_clinic_id, auth.uid())
  returning id into result_profile_id;
  result_appointment_id := public.create_walk_in_appointment(result_profile_id, target_service_id, target_dentist_id, requested_start_at);
  perform public.write_audit('patient_profile.guest_created', 'patient_profile', result_profile_id::text,
    jsonb_build_object('clinic_id', target_clinic_id, 'appointment_id', result_appointment_id));
  return query select result_appointment_id, result_profile_id;
end;
$$;

create or replace function public.list_clinic_appointments(
  target_clinic_id uuid,
  from_at timestamptz,
  through_at timestamptz
)
returns table (
  appointment_id uuid, patient_profile_id uuid, patient_name text, patient_phone text,
  dentist_id uuid, service_id uuid, service_name text, start_at timestamptz, end_at timestamptz,
  appointment_status public.appointment_status, deposit_bdt numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if through_at <= from_at or through_at > from_at + interval '32 days' then
    raise exception using errcode = '22023', message = 'INVALID_SCHEDULE_RANGE';
  end if;
  if not (public.is_admin() or public.has_clinic_role(target_clinic_id, array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[])) then
    raise exception using errcode = '42501', message = 'CLINIC_SCHEDULE_DENIED';
  end if;
  return query
    select a.id, p.id, p.full_name, p.phone, a.dentist_id, a.service_id, s.name, a.start_at, a.end_at, a.status, a.deposit_bdt
    from public.appointments a
    join public.patient_profiles p on p.id = a.patient_profile_id
    join public.clinic_services s on s.id = a.service_id
    where a.clinic_id = target_clinic_id and a.start_at >= from_at and a.start_at < through_at
    order by a.start_at;
end;
$$;

create or replace function public.list_clinic_waitlist(target_clinic_id uuid)
returns table (
  waitlist_id uuid, patient_profile_id uuid, patient_name text, patient_phone text,
  dentist_id uuid, service_id uuid, service_name text, preferred_date date,
  earliest_time time, latest_time time, waitlist_status public.waitlist_status,
  offered_start_at timestamptz, offer_expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin() or public.has_clinic_role(target_clinic_id, array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[])) then
    raise exception using errcode = '42501', message = 'CLINIC_WAITLIST_DENIED';
  end if;
  return query
    select w.id, p.id, p.full_name, p.phone, w.dentist_id, w.service_id, s.name, w.preferred_date,
      w.earliest_time, w.latest_time, w.status, w.offered_start_at, w.offer_expires_at
    from public.waitlist_entries w
    join public.patient_profiles p on p.id = w.patient_profile_id
    join public.clinic_services s on s.id = w.service_id
    where w.clinic_id = target_clinic_id and w.status in ('waiting','offered')
    order by w.preferred_date, w.created_at;
end;
$$;

create or replace function public.list_clinic_chat_threads(target_clinic_id uuid)
returns table (
  thread_id uuid, patient_profile_id uuid, patient_name text, appointment_id uuid,
  last_message text, last_message_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.is_admin() or public.has_clinic_role(target_clinic_id, array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[])) then
    raise exception using errcode = '42501', message = 'CLINIC_CHAT_DENIED';
  end if;
  return query
    select t.id, p.id, p.full_name, t.appointment_id, m.body, coalesce(m.created_at, t.created_at)
    from public.chat_threads t
    join public.patient_profiles p on p.id = t.patient_profile_id
    left join lateral (
      select cm.body, cm.created_at from public.chat_messages cm where cm.thread_id = t.id order by cm.created_at desc limit 1
    ) m on true
    where t.clinic_id = target_clinic_id
    order by coalesce(m.created_at, t.created_at) desc;
end;
$$;

revoke all on function public.create_guest_walk_in_appointment(uuid, text, text, uuid, uuid, timestamptz),
  public.list_clinic_appointments(uuid, timestamptz, timestamptz),
  public.list_clinic_waitlist(uuid), public.list_clinic_chat_threads(uuid)
  from public, anon, authenticated;
grant execute on function public.create_guest_walk_in_appointment(uuid, text, text, uuid, uuid, timestamptz),
  public.list_clinic_appointments(uuid, timestamptz, timestamptz),
  public.list_clinic_waitlist(uuid), public.list_clinic_chat_threads(uuid)
  to authenticated;

commit;
