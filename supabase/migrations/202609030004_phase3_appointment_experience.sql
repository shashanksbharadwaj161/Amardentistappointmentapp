begin;

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
declare service_record record; calculated_end timestamptz; result_id uuid;
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
  if not exists (select 1 from public.patient_profiles where id = target_patient_profile_id) then
    raise exception using errcode = '22023', message = 'PATIENT_PROFILE_NOT_FOUND';
  end if;
  calculated_end := requested_start_at + make_interval(mins => service_record.duration_minutes);
  perform pg_advisory_xact_lock(hashtextextended(target_dentist_id::text || ':' || requested_start_at::text, 0));
  insert into public.appointments (patient_profile_id, booked_by, clinic_id, dentist_id, service_id, start_at, end_at,
    duration_minutes, price_bdt, deposit_bdt)
  select target_patient_profile_id, p.account_owner_id, service_record.clinic_id, target_dentist_id, target_service_id,
    requested_start_at, calculated_end, service_record.duration_minutes, service_record.price_bdt, 0
  from public.patient_profiles p where p.id = target_patient_profile_id
  returning id into result_id;
  insert into public.appointment_events (appointment_id, actor_id, event_type, to_status, metadata)
  values (result_id, auth.uid(), 'appointment.walk_in_created', 'confirmed', jsonb_build_object('deposit_collected', false));
  perform public.write_audit('appointment.walk_in_created', 'appointment', result_id::text, jsonb_build_object('clinic_id', service_record.clinic_id));
  return result_id;
exception when exclusion_violation then
  raise exception using errcode = '23P01', message = 'SLOT_UNAVAILABLE';
end;
$$;

create or replace function public.mark_appointment_completed(target_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare appointment_record public.appointments%rowtype;
begin
  select * into appointment_record from public.appointments where id = target_appointment_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'APPOINTMENT_NOT_FOUND'; end if;
  if not public.is_verified_dentist(auth.uid()) or (appointment_record.dentist_id <> auth.uid() and not public.has_role('super_admin')) then
    raise exception using errcode = '42501', message = 'COMPLETION_DENIED';
  end if;
  if appointment_record.status not in ('checked_in','in_progress') then
    raise exception using errcode = '22023', message = 'APPOINTMENT_NOT_COMPLETABLE';
  end if;
  update public.appointments set status = 'completed', completed_at = clock_timestamp() where id = target_appointment_id;
  insert into public.appointment_events (appointment_id, actor_id, event_type, from_status, to_status)
  values (target_appointment_id, auth.uid(), 'appointment.completed', appointment_record.status, 'completed');
  perform public.write_audit('appointment.completed', 'appointment', target_appointment_id::text, '{}'::jsonb);
end;
$$;

create or replace function public.get_or_create_chat_thread(
  target_patient_profile_id uuid,
  target_clinic_id uuid,
  target_appointment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare result_id uuid;
begin
  if not public.owns_patient_profile(target_patient_profile_id) then
    raise exception using errcode = '42501', message = 'CHAT_THREAD_DENIED';
  end if;
  if not exists (select 1 from public.clinics where id = target_clinic_id and status = 'approved') then
    raise exception using errcode = '22023', message = 'CLINIC_NOT_AVAILABLE';
  end if;
  if target_appointment_id is not null and not exists (
    select 1 from public.appointments where id = target_appointment_id and patient_profile_id = target_patient_profile_id
      and clinic_id = target_clinic_id and booked_by = auth.uid()
  ) then raise exception using errcode = '42501', message = 'CHAT_APPOINTMENT_DENIED'; end if;
  insert into public.chat_threads (patient_profile_id, clinic_id, appointment_id, created_by)
  values (target_patient_profile_id, target_clinic_id, target_appointment_id, auth.uid())
  on conflict (patient_profile_id, clinic_id, appointment_id) do update set patient_profile_id = excluded.patient_profile_id
  returning id into result_id;
  return result_id;
end;
$$;

create or replace function public.send_chat_message(target_thread_id uuid, message_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare thread_record public.chat_threads%rowtype; result_id uuid;
begin
  select * into thread_record from public.chat_threads where id = target_thread_id;
  if not found or not (
    public.owns_patient_profile(thread_record.patient_profile_id)
    or public.is_admin()
    or public.has_clinic_role(thread_record.clinic_id, array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[])
  ) then raise exception using errcode = '42501', message = 'CHAT_MESSAGE_DENIED'; end if;
  if char_length(trim(message_body)) not between 1 and 4000 then
    raise exception using errcode = '22023', message = 'INVALID_CHAT_MESSAGE';
  end if;
  insert into public.chat_messages (thread_id, sender_id, body) values (target_thread_id, auth.uid(), trim(message_body)) returning id into result_id;
  update public.chat_threads set last_message_at = clock_timestamp() where id = target_thread_id;
  return result_id;
end;
$$;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointments') then
      alter publication supabase_realtime add table public.appointments;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'appointment_holds') then
      alter publication supabase_realtime add table public.appointment_holds;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
      alter publication supabase_realtime add table public.chat_messages;
    end if;
  end if;
end;
$$;

revoke all on function public.create_walk_in_appointment(uuid, uuid, uuid, timestamptz),
  public.mark_appointment_completed(uuid), public.get_or_create_chat_thread(uuid, uuid, uuid),
  public.send_chat_message(uuid, text) from public, anon, authenticated;
grant execute on function public.create_walk_in_appointment(uuid, uuid, uuid, timestamptz),
  public.mark_appointment_completed(uuid), public.get_or_create_chat_thread(uuid, uuid, uuid),
  public.send_chat_message(uuid, text) to authenticated;

commit;
