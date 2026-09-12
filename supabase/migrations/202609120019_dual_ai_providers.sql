begin;
alter table public.ai_provider_settings drop constraint ai_provider_settings_provider_check;
alter table public.ai_provider_settings add constraint ai_provider_settings_provider_check check (provider in ('openai','anthropic'));
alter table public.ai_provider_settings add column active_provider boolean not null default false;
update public.ai_provider_settings set active_provider=true where provider='openai';
create unique index one_active_ai_provider on public.ai_provider_settings(active_provider) where active_provider;
insert into public.ai_provider_settings(provider,model,active_provider)
values('anthropic','claude-haiku-4-5-20251001',false);
alter table public.ai_provider_settings add constraint anthropic_model_identifier
check (provider<>'anthropic' or model ~ '^claude-[a-z0-9][a-z0-9._-]*$');

create or replace function public.select_ai_provider(target_provider text)
returns void language plpgsql security definer set search_path=''
as $$
declare previous text;
begin
  if not public.has_role('super_admin') then raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED'; end if;
  if target_provider is null or target_provider not in ('openai','anthropic') then raise exception using errcode='22023',message='AI_PROVIDER_INPUT_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('amar.ai.provider.settings',0));
  if not exists(select 1 from public.ai_provider_settings s join vault.secrets v on v.id=s.vault_secret_id where s.provider=target_provider and s.enabled) then
    raise exception using errcode='22023',message='AI_PROVIDER_NOT_CONFIGURED';
  end if;
  select provider into previous from public.ai_provider_settings where active_provider;
  update public.ai_provider_settings set active_provider=false where active_provider;
  update public.ai_provider_settings set active_provider=true where provider=target_provider;
  perform public.write_audit('ai.active_provider_selected','ai_provider',target_provider,jsonb_build_object('previous_provider',previous));
end;
$$;

-- Selecting another model does not require revealing or re-entering a saved key.
create or replace function public.set_ai_provider_model(target_provider text,target_model text)
returns void language plpgsql security definer set search_path=''
as $$
declare normalized_model text:=btrim(coalesce(target_model,'')); previous text;
begin
  if not public.has_role('super_admin') then raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED'; end if;
  if target_provider is null or target_provider not in ('openai','anthropic')
    or char_length(normalized_model) not between 3 and 120
    or normalized_model !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'
    or (target_provider='anthropic' and normalized_model !~ '^claude-[a-z0-9][a-z0-9._-]*$') then
    raise exception using errcode='22023',message='AI_PROVIDER_INPUT_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('amar.ai.provider.settings',0));
  select model into previous from public.ai_provider_settings where provider=target_provider for update;
  if not found then raise exception using errcode='22023',message='AI_PROVIDER_INPUT_INVALID'; end if;
  update public.ai_provider_settings set model=normalized_model where provider=target_provider;
  perform public.write_audit('ai.provider_model_selected','ai_provider',target_provider,jsonb_build_object('previous_model',previous,'model',normalized_model));
end;
$$;

create or replace function public.rotate_ai_provider_secret(actor uuid,target_provider text,target_model text,new_secret text)
returns text language plpgsql security definer set search_path=''
as $$
declare existing uuid; saved uuid; hint text; normalized_model text:=btrim(coalesce(target_model,''));
begin
  if auth.role() is distinct from 'service_role' then raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED'; end if;
  if not exists(select 1 from public.user_roles where user_id=actor and role='super_admin') then raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED'; end if;
  if target_provider is null or target_provider not in ('openai','anthropic')
    or char_length(normalized_model) not between 3 and 120
    or normalized_model !~ '^[A-Za-z0-9][A-Za-z0-9._:/-]*$'
    or char_length(btrim(coalesce(new_secret,''))) not between 20 and 1000
    or (target_provider='anthropic' and normalized_model !~ '^claude-[a-z0-9][a-z0-9._-]*$') then
    raise exception using errcode='22023',message='AI_PROVIDER_INPUT_INVALID';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('amar.ai.provider.settings',0));
  select vault_secret_id into existing from public.ai_provider_settings where provider=target_provider for update;
  if not found then raise exception using errcode='22023',message='AI_PROVIDER_INPUT_INVALID'; end if;
  if existing is null then saved:=vault.create_secret(btrim(new_secret),'amar-dentist-ai-'||target_provider,'Write-only AI provider credential');
  else perform vault.update_secret(existing,btrim(new_secret),'amar-dentist-ai-'||target_provider,'Write-only AI provider credential'); saved:=existing; end if;
  hint:='•••• '||right(btrim(new_secret),4);
  update public.ai_provider_settings set model=normalized_model,vault_secret_id=saved,key_hint=hint,enabled=true,configured_by=actor,configured_at=now(),updated_at=now() where provider=target_provider;
  insert into public.audit_logs(actor_id,action,target_type,target_id,metadata) values(actor,'ai.provider_key_rotated','ai_provider',target_provider,jsonb_build_object('model',normalized_model,'key_hint',hint));
  return hint;
end;
$$;

create or replace function public.prepare_ai_task(target_task_type text,target_encounter_id uuid,target_patient_profile_id uuid,target_media_id uuid,user_input text,target_locale text default 'en')
returns table(task_id uuid,prompt_text text,output_schema jsonb,context jsonb,required_fields text[],audience public.ai_task_audience)
language plpgsql security definer set search_path=''
as $$ declare prompt public.ai_prompt_versions%rowtype; encounter public.clinical_encounters%rowtype; media public.clinical_media%rowtype; provider public.ai_provider_settings%rowtype; v_task uuid; v_context jsonb; v_fields text[]; begin
  select * into prompt from public.ai_prompt_versions where task_type=target_task_type and active order by version desc limit 1;
  if not found then raise exception using errcode='22023',message='AI_TASK_UNSUPPORTED'; end if;
  select * into provider from public.ai_provider_settings where active_provider for share;
  if not found then raise exception using errcode='22023',message='AI_PROVIDER_NOT_CONFIGURED'; end if;
  if target_locale is null or target_locale not in ('en','bn') or char_length(btrim(coalesce(user_input,''))) not between 3 and 12000 then raise exception using errcode='22023',message='AI_INPUT_INVALID'; end if;
  if prompt.audience='dentist' then
    select * into encounter from public.clinical_encounters where id=target_encounter_id;
    if not found or encounter.treating_dentist_id<>auth.uid() or encounter.status<>'draft' or not public.is_verified_dentist(auth.uid()) then raise exception using errcode='42501',message='AI_DENTIST_DENIED'; end if;
    if target_task_type in ('photo_quality','oral_photo_observation','xray_observation') then
      select * into media from public.clinical_media where id=target_media_id and encounter_id=encounter.id;
      if not found then raise exception using errcode='22023',message='AI_MEDIA_REQUIRED'; end if;
      if target_task_type='xray_observation' and media.kind<>'xray' then raise exception using errcode='22023',message='AI_XRAY_REQUIRED'; end if;
    end if;
    v_context:=jsonb_build_object('encounter',jsonb_build_object('chiefComplaint',encounter.chief_complaint,'subjective',encounter.subjective_notes,'objective',encounter.objective_notes,'assessment',encounter.assessment,'plan',encounter.plan),'allergies',coalesce((select jsonb_agg(jsonb_build_object('allergen',a.allergen,'reaction',a.reaction,'severity',a.severity)) from public.patient_allergies a where a.patient_profile_id=encounter.patient_profile_id and a.active),'[]'::jsonb),'mediaPath',media.storage_path);
    v_fields:=case target_task_type when 'clinical_note' then array['subjective','objective','assessment','plan'] when 'prescription' then array['rationale','allergyWarnings','items'] else array['quality','qualityNotes','visibleObservations','limitations'] end;
    target_patient_profile_id:=encounter.patient_profile_id;
  else
    if target_patient_profile_id is null or not public.owns_patient_profile(target_patient_profile_id) then raise exception using errcode='42501',message='AI_PATIENT_DENIED'; end if;
    v_context:=jsonb_build_object('finalizedRecords',coalesce((select jsonb_agg(jsonb_build_object('chiefComplaint',e.chief_complaint,'assessment',e.assessment,'plan',e.plan,'finalizedAt',e.finalized_at)) from public.clinical_encounters e where e.patient_profile_id=target_patient_profile_id and e.status in ('finalized','amended')),'[]'::jsonb));
    if target_task_type='record_explanation' and jsonb_array_length(v_context->'finalizedRecords')=0 then raise exception using errcode='22023',message='FINALIZED_RECORD_REQUIRED'; end if;
    v_fields:='{}';
  end if;
  insert into public.ai_tasks(task_type,audience,requested_by,patient_profile_id,clinic_id,encounter_id,media_id,prompt_version_id,provider,model,locale,input,required_review_fields)
  values(target_task_type,prompt.audience,auth.uid(),target_patient_profile_id,encounter.clinic_id,target_encounter_id,target_media_id,prompt.id,provider.provider,provider.model,target_locale,jsonb_build_object('message',btrim(user_input),'context',v_context),v_fields) returning id into v_task;
  return query select v_task,prompt.system_prompt,prompt.output_schema,v_context,v_fields,prompt.audience;
end $$;

-- Resolve credentials from a task's captured provider/model, never the current
-- selection. Model changes during execution fail closed instead of misauditing.
create or replace function public.ai_task_provider_secret(target_task_id uuid)
returns table(provider text,model text,secret text)
language plpgsql security definer set search_path=''
as $$
declare task public.ai_tasks%rowtype;
begin
  if auth.role() is distinct from 'service_role' then raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED'; end if;
  select * into task from public.ai_tasks where id=target_task_id;
  if not found or task.status not in ('queued','processing') then raise exception using errcode='22023',message='AI_TASK_NOT_PENDING'; end if;
  return query select s.provider,task.model,d.decrypted_secret
  from public.ai_provider_settings s join vault.decrypted_secrets d on d.id=s.vault_secret_id
  where s.provider=task.provider and s.model=task.model and s.enabled;
end;
$$;

revoke all on function public.select_ai_provider(text) from public,anon,authenticated;
grant execute on function public.select_ai_provider(text) to authenticated;
revoke all on function public.set_ai_provider_model(text,text) from public,anon,authenticated;
grant execute on function public.set_ai_provider_model(text,text) to authenticated;
revoke all on function public.ai_task_provider_secret(uuid) from public,anon,authenticated;
grant execute on function public.ai_task_provider_secret(uuid) to service_role;
-- Existing rotation and task-preparation grants are preserved by CREATE OR REPLACE.
commit;
