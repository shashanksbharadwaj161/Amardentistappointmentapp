begin;

alter policy ai_tasks_dentist_read_own on public.ai_tasks
  using(audience='dentist' and requested_by=auth.uid() and public.is_verified_dentist(auth.uid()));

create or replace function public.review_ai_task(target_task_id uuid,target_reviewed_fields jsonb,target_final_output jsonb,change_summary text)
returns void language plpgsql security definer set search_path=''
as $$ declare task public.ai_tasks%rowtype; field text; begin
  select * into task from public.ai_tasks where id=target_task_id for update;
  if not found or task.audience<>'dentist' or task.requested_by<>auth.uid() or task.status<>'awaiting_review' or not public.is_verified_dentist(auth.uid()) then raise exception using errcode='42501',message='AI_REVIEW_DENIED'; end if;
  foreach field in array task.required_review_fields loop if coalesce((target_reviewed_fields->>field)::boolean,false)=false then raise exception using errcode='22023',message='AI_FIELDS_REQUIRE_REVIEW'; end if; end loop;
  if jsonb_typeof(target_final_output)<>'object' or char_length(btrim(change_summary))<3 then raise exception using errcode='22023',message='AI_REVIEW_INVALID'; end if;
  update public.ai_tasks set status='completed',reviewed_fields=target_reviewed_fields,final_output=target_final_output,review_change_summary=btrim(change_summary),reviewed_by=auth.uid(),reviewed_at=now(),completed_at=now() where id=task.id;
  perform public.write_audit('ai.draft_reviewed','ai_task',task.id::text,jsonb_build_object('task_type',task.task_type,'changed',task.raw_output is distinct from target_final_output));
end $$;

create or replace function public.apply_reviewed_ai_task(target_task_id uuid,target_reviewed_fields jsonb,target_final_output jsonb,change_summary text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare task public.ai_tasks%rowtype; encounter public.clinical_encounters%rowtype; prescription_id uuid;
begin
  select * into task from public.ai_tasks where id=target_task_id for update;
  if not found or not public.is_verified_dentist(auth.uid()) then raise exception using errcode='42501',message='AI_REVIEW_DENIED'; end if;
  perform public.review_ai_task(target_task_id,target_reviewed_fields,target_final_output,change_summary);
  if task.task_type='clinical_note' then
    select * into encounter from public.clinical_encounters where id=task.encounter_id for update;
    perform public.save_clinical_encounter(
      task.encounter_id,encounter.chief_complaint,
      coalesce(target_final_output->>'subjective',''),coalesce(target_final_output->>'objective',''),
      coalesce(target_final_output->>'assessment',''),coalesce(target_final_output->>'plan',''),
      'Dentist-reviewed AI draft applied'
    );
  elsif task.task_type='prescription' and jsonb_typeof(target_final_output->'items')='array' and jsonb_array_length(target_final_output->'items')>0 then
    prescription_id:=public.save_prescription_draft(task.encounter_id,null,coalesce(target_final_output->>'rationale',''),target_final_output->'items','Dentist-reviewed AI prescription draft applied');
  end if;
  return prescription_id;
end $$;

commit;

