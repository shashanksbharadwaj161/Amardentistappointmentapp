begin;

create or replace function public.save_tooth_observation(target_encounter_id uuid, target_dentition public.dentition_type, tooth_code text, tooth_surface public.tooth_surface, finding_text text, change_reason text default 'Odontogram updated')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare encounter public.clinical_encounters%rowtype; observation_id uuid;
begin
  select * into encounter from public.clinical_encounters where id=target_encounter_id;
  if not found or encounter.status<>'draft' or encounter.treating_dentist_id<>auth.uid() or not public.is_verified_dentist(auth.uid()) then raise exception using errcode='42501', message='ODONTOGRAM_DENIED'; end if;
  if (target_dentition='adult' and tooth_code !~ '^[1-4][1-8]$') or (target_dentition='primary' and tooth_code !~ '^[5-8][1-5]$') then
    raise exception using errcode='23514', message='INVALID_FDI_TOOTH_CODE';
  end if;
  perform set_config('app.change_reason',coalesce(nullif(btrim(change_reason),''),'Odontogram updated'),true);
  insert into public.odontogram_observations(encounter_id,patient_profile_id,clinic_id,dentition,fdi_tooth_code,surface,finding,recorded_by)
  values(encounter.id,encounter.patient_profile_id,encounter.clinic_id,target_dentition,tooth_code,tooth_surface,btrim(finding_text),auth.uid())
  on conflict(encounter_id,fdi_tooth_code,surface) do update set dentition=excluded.dentition,finding=excluded.finding,recorded_by=auth.uid(),updated_at=now()
  returning id into observation_id;
  return observation_id;
end;
$$;

create or replace function public.set_prescription_document(target_prescription_id uuid, object_path text)
returns void language plpgsql security definer set search_path = ''
as $$
declare prescription public.prescriptions%rowtype;
begin
  select * into prescription from public.prescriptions where id=target_prescription_id for update;
  if not found or prescription.status not in ('finalized','amended') or not public.can_read_clinical_record(prescription.patient_profile_id,prescription.clinic_id) then raise exception using errcode='42501', message='PRESCRIPTION_DOCUMENT_DENIED'; end if;
  if split_part(object_path,'/',2)<>target_prescription_id::text||'.pdf' or object_path !~ '^[0-9a-f-]+/[0-9a-f-]+\.pdf$' then raise exception using errcode='22023', message='PRESCRIPTION_DOCUMENT_PATH_INVALID'; end if;
  perform set_config('app.change_reason','Private prescription document generated',true);
  update public.prescriptions set document_path=object_path where id=target_prescription_id;
  perform public.write_audit('clinical.prescription_document_generated','prescription',target_prescription_id::text);
end;
$$;

revoke all on function public.save_tooth_observation(uuid,public.dentition_type,text,public.tooth_surface,text,text),public.set_prescription_document(uuid,text) from public,anon,authenticated;
grant execute on function public.save_tooth_observation(uuid,public.dentition_type,text,public.tooth_surface,text,text),public.set_prescription_document(uuid,text) to authenticated;

commit;
