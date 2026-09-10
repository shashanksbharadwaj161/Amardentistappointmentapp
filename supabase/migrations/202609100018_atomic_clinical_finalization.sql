begin;

-- Compare the exact last-reviewed notes under the same row lock as both writes.
-- A concurrent AI/dentist save either commits before this lock (and is detected)
-- or waits until finalization commits (and then cannot mutate a final record).
create or replace function public.save_and_finalize_clinical_encounter(
  target_encounter_id uuid,
  expected_notes jsonb,
  complaint text,
  subjective text,
  objective text,
  assessment_text text,
  plan_text text,
  change_reason text
)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  encounter public.clinical_encounters%rowtype;
  reviewed_notes jsonb;
  whitespace text := E' \t\n\r' || chr(11) || chr(12);
  reason text := btrim(coalesce(change_reason,''), whitespace);
begin
  select * into encounter from public.clinical_encounters
  where id=target_encounter_id for update;
  if not found or encounter.treating_dentist_id is distinct from auth.uid()
    or not public.is_verified_dentist(auth.uid()) then
    raise exception using errcode='42501',message='ENCOUNTER_DENIED';
  end if;
  if encounter.status<>'draft' then
    raise exception using errcode='22023',message='FINALIZED_RECORD_IMMUTABLE';
  end if;
  reviewed_notes := jsonb_build_object(
    'complaint',encounter.chief_complaint,
    'subjective',encounter.subjective_notes,
    'objective',encounter.objective_notes,
    'assessment',encounter.assessment,
    'plan',encounter.plan
  );
  if expected_notes is distinct from reviewed_notes then
    raise exception using errcode='40001',message='CLINICAL_RECORD_CHANGED';
  end if;
  if char_length(reason) not between 3 and 500 then
    raise exception using errcode='22023',message='CLINICAL_CHANGE_REASON_REQUIRED';
  end if;
  if complaint is null or subjective is null or objective is null
    or assessment_text is null or plan_text is null
    or char_length(btrim(complaint,whitespace))>2000
    or char_length(btrim(subjective,whitespace))>10000
    or char_length(btrim(objective,whitespace))>10000
    or char_length(btrim(assessment_text,whitespace))>10000
    or char_length(btrim(plan_text,whitespace))>10000 then
    raise exception using errcode='22023',message='CLINICAL_INPUT_INVALID';
  end if;
  if char_length(btrim(objective,whitespace))=0
    or char_length(btrim(assessment_text,whitespace))=0
    or char_length(btrim(plan_text,whitespace))=0 then
    raise exception using errcode='22023',message='ENCOUNTER_FIELDS_REQUIRED';
  end if;

  perform public.save_clinical_encounter(target_encounter_id,
    btrim(complaint,whitespace),btrim(subjective,whitespace),
    btrim(objective,whitespace),btrim(assessment_text,whitespace),
    btrim(plan_text,whitespace),reason);
  perform public.finalize_clinical_encounter(target_encounter_id,reason);
end;
$$;

-- Keep the legacy helper for owner-executed internal calls, but old clients must
-- not bypass the compare/save/finalize transaction through direct finalization.
revoke all on function public.finalize_clinical_encounter(uuid,text) from public,anon,authenticated;
revoke all on function public.save_and_finalize_clinical_encounter(uuid,jsonb,text,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.save_and_finalize_clinical_encounter(uuid,jsonb,text,text,text,text,text,text) to authenticated;

commit;
