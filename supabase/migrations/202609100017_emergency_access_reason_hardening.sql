begin;

-- Emergency reads retain their existing Super Admin check, return shape, and
-- audit event. Reasons must be substantive and bounded before any read occurs.
-- The 500-character ceiling matches other clinical change/access audit reasons.
create or replace function public.super_admin_clinical_snapshot(target_patient_profile_id uuid, access_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
  normalized_reason text := btrim(coalesce(access_reason, ''), E' \t\n\r' || chr(11) || chr(12));
begin
  if not public.has_role('super_admin') then raise exception using errcode='42501', message='SUPER_ADMIN_REQUIRED'; end if;
  if char_length(normalized_reason) not between 10 and 500 then raise exception using errcode='22023', message='ACCESS_REASON_REQUIRED'; end if;
  select jsonb_build_object(
    'medicalHistory',(select to_jsonb(h) from public.patient_medical_histories h where h.patient_profile_id=target_patient_profile_id),
    'allergies',coalesce((select jsonb_agg(to_jsonb(a)) from public.patient_allergies a where a.patient_profile_id=target_patient_profile_id),'[]'::jsonb),
    'encounters',coalesce((select jsonb_agg(to_jsonb(e)) from public.clinical_encounters e where e.patient_profile_id=target_patient_profile_id),'[]'::jsonb),
    'diagnoses',coalesce((select jsonb_agg(to_jsonb(d)) from public.clinical_diagnoses d where d.patient_profile_id=target_patient_profile_id),'[]'::jsonb),
    'prescriptions',coalesce((select jsonb_agg(to_jsonb(p)) from public.prescriptions p where p.patient_profile_id=target_patient_profile_id),'[]'::jsonb)
  ) into result;
  perform public.write_audit('clinical.super_admin_read','patient_profile',target_patient_profile_id::text,jsonb_build_object('reason',normalized_reason));
  return result;
end;
$$;

create or replace function public.super_admin_ai_task_snapshot(target_task_id uuid,access_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  result jsonb;
  normalized_reason text := btrim(coalesce(access_reason, ''), E' \t\n\r' || chr(11) || chr(12));
begin
  if not public.has_role('super_admin') then
    raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED';
  end if;
  if char_length(normalized_reason) not between 10 and 500 then
    raise exception using errcode='22023',message='ACCESS_REASON_REQUIRED';
  end if;
  select to_jsonb(t) into result from public.ai_tasks t where t.id=target_task_id;
  perform public.write_audit('ai.super_admin_read','ai_task',target_task_id::text,jsonb_build_object('reason',normalized_reason));
  return result;
end;
$$;

-- CREATE OR REPLACE preserves the existing function owner and execution grants.
-- No new grants, policies, UI exposure, or access roles are introduced.
commit;
