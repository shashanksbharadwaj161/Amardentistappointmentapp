begin;

-- Qualify the second argument position so it cannot collide with the column
-- carrying the same public API name.
create or replace function public.cancel_appointment(target_appointment_id uuid, cancellation_reason text default '')
returns public.deposit_disposition
language plpgsql
security definer
set search_path = ''
as $$
declare appointment_record public.appointments%rowtype; disposition public.deposit_disposition;
begin
  select * into appointment_record from public.appointments where id = target_appointment_id and booked_by = auth.uid() for update;
  if not found then raise exception using errcode = '42501', message = 'APPOINTMENT_NOT_FOUND'; end if;
  if appointment_record.status <> 'confirmed' then raise exception using errcode = '22023', message = 'APPOINTMENT_NOT_CANCELLABLE'; end if;
  disposition := case when appointment_record.start_at >= clock_timestamp() + interval '24 hours' then 'refundable' else 'forfeited' end;
  update public.appointments set status = 'cancelled', cancellation_disposition = disposition,
    cancellation_reason = nullif(trim($2), ''), cancelled_at = clock_timestamp() where id = target_appointment_id;
  insert into public.appointment_events (appointment_id, actor_id, event_type, from_status, to_status, metadata)
  values (target_appointment_id, auth.uid(), 'appointment.cancelled', 'confirmed', 'cancelled', jsonb_build_object('deposit', disposition));
  perform public.write_audit('appointment.cancelled', 'appointment', target_appointment_id::text, jsonb_build_object('deposit', disposition));
  return disposition;
end;
$$;

revoke all on function public.cancel_appointment(uuid,text) from public, anon, authenticated;
grant execute on function public.cancel_appointment(uuid,text) to authenticated;

commit;
