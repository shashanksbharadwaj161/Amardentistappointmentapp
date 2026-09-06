begin;

create extension if not exists supabase_vault with schema vault;

create type public.ai_task_status as enum ('queued','processing','awaiting_review','completed','rejected','failed');
create type public.ai_task_audience as enum ('dentist','patient');
create type public.support_case_status as enum ('open','investigating','resolved','dismissed');

create table public.ai_provider_settings (
  provider text primary key check (provider in ('openai')),
  model text not null check (char_length(btrim(model)) between 3 and 120),
  vault_secret_id uuid unique,
  key_hint text not null default '',
  enabled boolean not null default false,
  configured_by uuid references auth.users(id) on delete restrict,
  configured_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((vault_secret_id is null and enabled=false) or vault_secret_id is not null)
);

insert into public.ai_provider_settings(provider,model) values ('openai','gpt-5-mini');

create table public.ai_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  task_type text not null check (task_type in ('clinical_note','prescription','photo_quality','oral_photo_observation','xray_observation','record_explanation','symptom_intake','general_guidance')),
  version integer not null check (version>0),
  audience public.ai_task_audience not null,
  system_prompt text not null,
  output_schema jsonb not null check (jsonb_typeof(output_schema)='object'),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(task_type,version)
);

insert into public.ai_prompt_versions(task_type,version,audience,system_prompt,output_schema) values
('clinical_note',1,'dentist','Draft a structured dental note using only supplied facts. Never invent findings, diagnoses, medications, doses, or patient details. Mark uncertainty in cautions. The treating dentist must review every field.', '{"required":["subjective","objective","assessment","plan","cautions"]}'),
('prescription',1,'dentist','Suggest a prescription draft only for clinician review. Use supplied allergies and finalized clinical facts. Never present the draft as final. If facts are insufficient, return no items and explain the gap.', '{"required":["rationale","allergyWarnings","items"]}'),
('photo_quality',1,'dentist','Assess only technical image quality and retake needs. Do not diagnose.', '{"required":["quality","qualityNotes","visibleObservations","limitations","experimental"]}'),
('oral_photo_observation',1,'dentist','Describe visible non-diagnostic oral-photo observations. State limitations. Do not name disease or recommend medication.', '{"required":["quality","qualityNotes","visibleObservations","limitations","experimental"]}'),
('xray_observation',1,'dentist','Provide experimental, non-diagnostic X-ray observations for dentist review. Clearly label uncertainty and limitations. Never finalize a diagnosis.', '{"required":["quality","qualityNotes","visibleObservations","limitations","experimental"]}'),
('record_explanation',1,'patient','Explain only the supplied finalized record in plain language. Do not diagnose, prescribe, add facts, or override the treating dentist. Include a clear informational disclaimer.', '{"required":["summary","urgency","guidance","redFlags","bookingRecommended","disclaimer"]}'),
('symptom_intake',1,'patient','Organize symptoms, offer general dental guidance and urgency suggestions. Never diagnose or prescribe. Emergency red flags must advise local emergency care.', '{"required":["summary","urgency","guidance","redFlags","bookingRecommended","disclaimer"]}'),
('general_guidance',1,'patient','Give conservative general dental guidance and a booking next step. Never diagnose or prescribe.', '{"required":["summary","urgency","guidance","redFlags","bookingRecommended","disclaimer"]}');

create table public.ai_tasks (
  id uuid primary key default gen_random_uuid(),
  task_type text not null check (task_type in ('clinical_note','prescription','photo_quality','oral_photo_observation','xray_observation','record_explanation','symptom_intake','general_guidance')),
  audience public.ai_task_audience not null,
  status public.ai_task_status not null default 'queued',
  requested_by uuid not null references auth.users(id) on delete restrict,
  patient_profile_id uuid references public.patient_profiles(id) on delete restrict,
  clinic_id uuid references public.clinics(id) on delete restrict,
  encounter_id uuid references public.clinical_encounters(id) on delete restrict,
  media_id uuid references public.clinical_media(id) on delete restrict,
  prompt_version_id uuid not null references public.ai_prompt_versions(id) on delete restrict,
  provider text not null,
  model text not null,
  locale text not null default 'en' check (locale in ('en','bn')),
  input jsonb not null check (jsonb_typeof(input)='object'),
  raw_output jsonb,
  safe_output jsonb,
  required_review_fields text[] not null default '{}',
  reviewed_fields jsonb not null default '{}'::jsonb check (jsonb_typeof(reviewed_fields)='object'),
  final_output jsonb,
  review_change_summary text,
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  input_tokens integer check (input_tokens is null or input_tokens>=0),
  output_tokens integer check (output_tokens is null or output_tokens>=0),
  estimated_cost_usd numeric(12,6) check (estimated_cost_usd is null or estimated_cost_usd>=0),
  provider_request_id text,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((audience='patient' and cardinality(required_review_fields)=0) or audience='dentist'),
  check ((status='completed' and completed_at is not null) or status<>'completed')
);
create index ai_tasks_actor_time_idx on public.ai_tasks(requested_by,created_at desc);
create index ai_tasks_clinic_time_idx on public.ai_tasks(clinic_id,created_at desc);
create index ai_tasks_patient_idx on public.ai_tasks(patient_profile_id,created_at desc);

create table public.patient_ai_messages (
  id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid not null references public.patient_profiles(id) on delete cascade,
  task_id uuid not null unique references public.ai_tasks(id) on delete restrict,
  user_message text not null check (char_length(user_message) between 1 and 12000),
  safe_response jsonb not null check (jsonb_typeof(safe_response)='object'),
  created_at timestamptz not null default now()
);

create table public.feature_flags (
  flag_key text primary key,
  description text not null,
  enabled boolean not null default false,
  audience text not null default 'all' check (audience in ('all','patient','professional','admin')),
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);
insert into public.feature_flags(flag_key,description,enabled,audience) values
('dentist_ai','Dentist AI review workspace',true,'professional'),
('patient_ai','Patient guidance assistant',true,'patient'),
('experimental_xray_ai','Experimental X-ray observations',false,'professional'),
('sms_notifications','SMS notification delivery',false,'all');

create table public.platform_usage_limits (
  limit_key text primary key,
  description text not null,
  free_value integer not null check (free_value>=0),
  paid_value integer not null check (paid_value>=free_value),
  updated_by uuid references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);
insert into public.platform_usage_limits values
('patient_ai_daily','Patient AI requests per day',5,40,null,now()),
('dentist_ai_daily','Dentist AI requests per day',15,150,null,now());

create table public.api_rate_limits (
  actor_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check(request_count>=0),
  primary key(actor_id,scope,window_started_at)
);

create table public.ai_usage_daily (
  usage_date date not null,
  actor_id uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid references public.clinics(id) on delete cascade,
  task_type text not null,
  request_count integer not null default 0 check(request_count>=0),
  input_tokens bigint not null default 0 check(input_tokens>=0),
  output_tokens bigint not null default 0 check(output_tokens>=0),
  estimated_cost_usd numeric(14,6) not null default 0 check(estimated_cost_usd>=0),
  primary key(usage_date,actor_id,task_type)
);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  outbox_id uuid references public.notification_outbox(id) on delete cascade,
  channel public.notification_channel not null,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  template_key text not null,
  reference_type text,
  reference_id uuid,
  idempotency_key text not null unique,
  status public.notification_status not null default 'queued',
  attempt_count integer not null default 0 check(attempt_count between 0 and 12),
  provider_message_id text,
  last_error_code text,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notification_delivery_queue_idx on public.notification_deliveries(status,next_attempt_at);

create table public.notification_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check(platform in ('ios','android','web')),
  push_token text not null unique check(char_length(push_token) between 20 and 500),
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.support_cases (
  id uuid primary key default gen_random_uuid(),
  category text not null check(category in ('dispute','refund','moderation','privacy','technical')),
  status public.support_case_status not null default 'open',
  opened_by uuid not null references auth.users(id) on delete restrict,
  assigned_to uuid references auth.users(id) on delete restrict,
  clinic_id uuid references public.clinics(id) on delete restrict,
  reference_type text,
  reference_id uuid,
  summary text not null check(char_length(btrim(summary)) between 5 and 1000),
  resolution text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.support_cases(id) on delete restrict,
  action text not null,
  target_type text not null,
  target_id uuid,
  reason text not null check(char_length(btrim(reason)) between 5 and 2000),
  actor_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create or replace function public.rotate_ai_provider_secret(actor uuid,target_provider text,target_model text,new_secret text)
returns text language plpgsql security definer set search_path=''
as $$ declare existing uuid; saved uuid; hint text; begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED'; end if;
  if target_provider<>'openai' or char_length(btrim(target_model)) not between 3 and 120 or char_length(btrim(new_secret))<20 then raise exception using errcode='22023',message='AI_PROVIDER_INPUT_INVALID'; end if;
  if not exists(select 1 from public.user_roles where user_id=actor and role='super_admin') then raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED'; end if;
  select vault_secret_id into existing from public.ai_provider_settings where provider=target_provider for update;
  if existing is null then saved:=vault.create_secret(btrim(new_secret),'amar-dentist-ai-'||target_provider,'Write-only AI provider credential');
  else perform vault.update_secret(existing,btrim(new_secret),'amar-dentist-ai-'||target_provider,'Write-only AI provider credential'); saved:=existing; end if;
  hint:='•••• '||right(btrim(new_secret),4);
  update public.ai_provider_settings set model=btrim(target_model),vault_secret_id=saved,key_hint=hint,enabled=true,configured_by=actor,configured_at=now(),updated_at=now() where provider=target_provider;
  insert into public.audit_logs(actor_id,action,target_type,target_id,metadata) values(actor,'ai.provider_key_rotated','ai_provider',target_provider,jsonb_build_object('model',target_model,'key_hint',hint));
  return hint;
end $$;

create or replace function public.ai_provider_secret(target_provider text)
returns table(model text,secret text) language plpgsql security definer set search_path=''
as $$ begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED'; end if;
  return query select s.model,d.decrypted_secret from public.ai_provider_settings s join vault.decrypted_secrets d on d.id=s.vault_secret_id where s.provider=target_provider and s.enabled;
end $$;

create or replace function public.consume_api_limit(actor uuid,target_scope text,max_requests integer,window_minutes integer default 1440)
returns boolean language plpgsql security definer set search_path=''
as $$ declare bucket timestamptz; count_now integer; begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED'; end if;
  bucket:=date_trunc('minute',now())-(extract(minute from now())::integer%greatest(window_minutes,1))*interval '1 minute';
  insert into public.api_rate_limits(actor_id,scope,window_started_at,request_count) values(actor,target_scope,bucket,1)
  on conflict(actor_id,scope,window_started_at) do update set request_count=public.api_rate_limits.request_count+1 returning request_count into count_now;
  return count_now<=greatest(max_requests,1);
end $$;

create or replace function public.prepare_ai_task(target_task_type text,target_encounter_id uuid,target_patient_profile_id uuid,target_media_id uuid,user_input text,target_locale text default 'en')
returns table(task_id uuid,prompt_text text,output_schema jsonb,context jsonb,required_fields text[],audience public.ai_task_audience)
language plpgsql security definer set search_path=''
as $$ declare prompt public.ai_prompt_versions%rowtype; encounter public.clinical_encounters%rowtype; media public.clinical_media%rowtype; provider public.ai_provider_settings%rowtype; v_task uuid; v_context jsonb; v_fields text[]; begin
  select * into prompt from public.ai_prompt_versions where task_type=target_task_type and active order by version desc limit 1;
  if not found then raise exception using errcode='22023',message='AI_TASK_UNSUPPORTED'; end if;
  select * into provider from public.ai_provider_settings where ai_provider_settings.provider='openai';
  if target_locale not in ('en','bn') or char_length(btrim(user_input)) not between 3 and 12000 then raise exception using errcode='22023',message='AI_INPUT_INVALID'; end if;
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

create or replace function public.complete_ai_task(target_task_id uuid,provider_output jsonb,patient_safe_output jsonb,target_provider_request_id text,target_input_tokens integer,target_output_tokens integer,target_cost numeric,target_error text default null)
returns void language plpgsql security definer set search_path=''
as $$ declare task public.ai_tasks%rowtype; begin
  if auth.role()<>'service_role' then raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED'; end if;
  select * into task from public.ai_tasks where id=target_task_id for update;
  if not found then raise exception using errcode='22023',message='AI_TASK_NOT_FOUND'; end if;
  if target_error is not null then update public.ai_tasks set status='failed',raw_output=provider_output,error_code=target_error,completed_at=now() where id=task.id; return; end if;
  if task.audience='patient' and patient_safe_output is null then raise exception using errcode='22023',message='PATIENT_SAFE_OUTPUT_REQUIRED'; end if;
  update public.ai_tasks set status=case when audience='dentist' then 'awaiting_review'::public.ai_task_status else 'completed'::public.ai_task_status end,raw_output=provider_output,safe_output=patient_safe_output,provider_request_id=target_provider_request_id,input_tokens=greatest(target_input_tokens,0),output_tokens=greatest(target_output_tokens,0),estimated_cost_usd=greatest(target_cost,0),completed_at=case when audience='patient' then now() end where id=task.id;
  if task.audience='patient' then insert into public.patient_ai_messages(patient_profile_id,task_id,user_message,safe_response) values(task.patient_profile_id,task.id,task.input->>'message',patient_safe_output); end if;
  insert into public.ai_usage_daily(usage_date,actor_id,clinic_id,task_type,request_count,input_tokens,output_tokens,estimated_cost_usd) values(current_date,task.requested_by,task.clinic_id,task.task_type,1,greatest(target_input_tokens,0),greatest(target_output_tokens,0),greatest(target_cost,0)) on conflict(usage_date,actor_id,task_type) do update set request_count=public.ai_usage_daily.request_count+1,input_tokens=public.ai_usage_daily.input_tokens+excluded.input_tokens,output_tokens=public.ai_usage_daily.output_tokens+excluded.output_tokens,estimated_cost_usd=public.ai_usage_daily.estimated_cost_usd+excluded.estimated_cost_usd;
end $$;

create or replace function public.review_ai_task(target_task_id uuid,target_reviewed_fields jsonb,target_final_output jsonb,change_summary text)
returns void language plpgsql security definer set search_path=''
as $$ declare task public.ai_tasks%rowtype; field text; begin
  select * into task from public.ai_tasks where id=target_task_id for update;
  if not found or task.audience<>'dentist' or task.requested_by<>auth.uid() or task.status<>'awaiting_review' then raise exception using errcode='42501',message='AI_REVIEW_DENIED'; end if;
  foreach field in array task.required_review_fields loop if coalesce((target_reviewed_fields->>field)::boolean,false)=false then raise exception using errcode='22023',message='AI_FIELDS_REQUIRE_REVIEW'; end if; end loop;
  if jsonb_typeof(target_final_output)<>'object' or char_length(btrim(change_summary))<3 then raise exception using errcode='22023',message='AI_REVIEW_INVALID'; end if;
  update public.ai_tasks set status='completed',reviewed_fields=target_reviewed_fields,final_output=target_final_output,review_change_summary=btrim(change_summary),reviewed_by=auth.uid(),reviewed_at=now(),completed_at=now() where id=task.id;
  perform public.write_audit('ai.draft_reviewed','ai_task',task.id::text,jsonb_build_object('task_type',task.task_type,'changed',task.raw_output is distinct from target_final_output));
end $$;

create or replace function public.set_feature_flag(target_key text,target_enabled boolean)
returns void language plpgsql security definer set search_path=''
as $$ begin if not public.has_role('super_admin') then raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED'; end if; update public.feature_flags set enabled=target_enabled,updated_by=auth.uid(),updated_at=now() where flag_key=target_key; if not found then raise exception using errcode='22023',message='FLAG_NOT_FOUND'; end if; perform public.write_audit('platform.feature_flag_updated','feature_flag',target_key,jsonb_build_object('enabled',target_enabled)); end $$;

create or replace function public.set_platform_usage_limit(target_key text,target_free integer,target_paid integer)
returns void language plpgsql security definer set search_path=''
as $$ begin if not public.has_role('super_admin') then raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED'; end if; if target_free<0 or target_paid<target_free then raise exception using errcode='22023',message='USAGE_LIMIT_INVALID'; end if; update public.platform_usage_limits set free_value=target_free,paid_value=target_paid,updated_by=auth.uid(),updated_at=now() where limit_key=target_key; if not found then raise exception using errcode='22023',message='LIMIT_NOT_FOUND'; end if; perform public.write_audit('platform.usage_limit_updated','usage_limit',target_key); end $$;

create or replace function public.register_notification_device(target_platform text,target_push_token text)
returns uuid language plpgsql security definer set search_path=''
as $$ declare result uuid; begin if target_platform not in ('ios','android','web') or char_length(btrim(target_push_token)) not between 20 and 500 then raise exception using errcode='22023',message='DEVICE_TOKEN_INVALID'; end if; insert into public.notification_devices(user_id,platform,push_token) values(auth.uid(),target_platform,btrim(target_push_token)) on conflict(push_token) do update set user_id=auth.uid(),platform=excluded.platform,enabled=true,last_seen_at=now() returning id into result; return result; end $$;

create or replace function public.claim_notification_batch(batch_size integer default 25)
returns setof public.notification_outbox language plpgsql security definer set search_path=''
as $$ begin if auth.role()<>'service_role' then raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED'; end if; return query with candidates as (select id from public.notification_outbox where channel<>'in_app' and status in ('queued','failed') and next_attempt_at<=now() and attempt_count<12 order by created_at for update skip locked limit least(greatest(batch_size,1),100)) update public.notification_outbox n set status='processing',attempt_count=n.attempt_count+1,updated_at=now() from candidates c where n.id=c.id returning n.*; end $$;

create or replace function public.finish_notification_delivery(target_outbox_id uuid,delivered boolean,target_provider_message_id text,target_error_code text)
returns void language plpgsql security definer set search_path=''
as $$ declare item public.notification_outbox%rowtype; begin if auth.role()<>'service_role' then raise exception using errcode='42501',message='SERVICE_ROLE_REQUIRED'; end if; select * into item from public.notification_outbox where id=target_outbox_id for update; if not found then return; end if; update public.notification_outbox set status=case when delivered then 'sent'::public.notification_status else 'failed'::public.notification_status end,sent_at=case when delivered then now() else null end,last_error_code=case when delivered then null else left(coalesce(target_error_code,'DELIVERY_FAILED'),120) end,next_attempt_at=case when delivered then next_attempt_at else now()+make_interval(mins=>least(60,power(2,least(attempt_count,6))::integer)) end,updated_at=now() where id=item.id; insert into public.notification_deliveries(outbox_id,channel,recipient_user_id,template_key,idempotency_key,status,attempt_count,provider_message_id,last_error_code,next_attempt_at,sent_at) values(item.id,item.channel,item.recipient_id,item.template_key,item.idempotency_key||':'||item.attempt_count::text,case when delivered then 'sent'::public.notification_status else 'failed'::public.notification_status end,item.attempt_count,nullif(target_provider_message_id,''),case when delivered then null else left(coalesce(target_error_code,'DELIVERY_FAILED'),120) end,case when delivered then now() else now()+interval '5 minutes' end,case when delivered then now() else null end); end $$;

create or replace function public.super_admin_ai_task_snapshot(target_task_id uuid,access_reason text)
returns jsonb language plpgsql security definer set search_path=''
as $$ declare result jsonb; begin if not public.has_role('super_admin') then raise exception using errcode='42501',message='SUPER_ADMIN_REQUIRED'; end if; if char_length(btrim(access_reason))<10 then raise exception using errcode='22023',message='ACCESS_REASON_REQUIRED'; end if; select to_jsonb(t) into result from public.ai_tasks t where t.id=target_task_id; perform public.write_audit('ai.super_admin_read','ai_task',target_task_id::text,jsonb_build_object('reason',btrim(access_reason))); return result; end $$;

create trigger ai_provider_settings_touch_updated_at before update on public.ai_provider_settings for each row execute function public.touch_updated_at();
create trigger notification_deliveries_touch_updated_at before update on public.notification_deliveries for each row execute function public.touch_updated_at();
create trigger support_cases_touch_updated_at before update on public.support_cases for each row execute function public.touch_updated_at();

alter table public.ai_provider_settings enable row level security;
alter table public.ai_prompt_versions enable row level security;
alter table public.ai_tasks enable row level security;
alter table public.patient_ai_messages enable row level security;
alter table public.feature_flags enable row level security;
alter table public.platform_usage_limits enable row level security;
alter table public.api_rate_limits enable row level security;
alter table public.ai_usage_daily enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.notification_devices enable row level security;
alter table public.support_cases enable row level security;
alter table public.moderation_actions enable row level security;

create policy ai_provider_admin_read on public.ai_provider_settings for select to authenticated using(public.has_role('super_admin'));
create policy prompt_versions_admin_read on public.ai_prompt_versions for select to authenticated using(public.has_role('super_admin'));
create policy ai_tasks_dentist_read_own on public.ai_tasks for select to authenticated using(audience='dentist' and requested_by=auth.uid());
create policy patient_ai_messages_owner_read on public.patient_ai_messages for select to authenticated using(public.owns_patient_profile(patient_profile_id));
create policy feature_flags_authenticated_read on public.feature_flags for select to authenticated using(true);
create policy usage_limits_authenticated_read on public.platform_usage_limits for select to authenticated using(true);
create policy ai_usage_admin_read on public.ai_usage_daily for select to authenticated using(public.has_role('super_admin'));
create policy notification_owner_read on public.notification_deliveries for select to authenticated using(recipient_user_id=auth.uid() or public.has_role('super_admin'));
create policy notification_devices_owner_read on public.notification_devices for select to authenticated using(user_id=auth.uid());
create policy support_cases_participant_read on public.support_cases for select to authenticated using(opened_by=auth.uid() or assigned_to=auth.uid() or public.has_role('admin') or public.has_role('super_admin'));
create policy moderation_admin_read on public.moderation_actions for select to authenticated using(public.has_role('admin') or public.has_role('super_admin'));

revoke all on public.ai_provider_settings,public.ai_prompt_versions,public.ai_tasks,public.patient_ai_messages,public.feature_flags,public.platform_usage_limits,public.api_rate_limits,public.ai_usage_daily,public.notification_deliveries,public.notification_devices,public.support_cases,public.moderation_actions from anon,authenticated;
grant select on public.ai_provider_settings,public.ai_prompt_versions,public.ai_tasks,public.patient_ai_messages,public.feature_flags,public.platform_usage_limits,public.ai_usage_daily,public.notification_deliveries,public.notification_devices,public.support_cases,public.moderation_actions to authenticated;
revoke all on function public.rotate_ai_provider_secret(uuid,text,text,text),public.ai_provider_secret(text),public.consume_api_limit(uuid,text,integer,integer),public.complete_ai_task(uuid,jsonb,jsonb,text,integer,integer,numeric,text),public.claim_notification_batch(integer),public.finish_notification_delivery(uuid,boolean,text,text) from public,anon,authenticated;
grant execute on function public.rotate_ai_provider_secret(uuid,text,text,text),public.ai_provider_secret(text),public.consume_api_limit(uuid,text,integer,integer),public.complete_ai_task(uuid,jsonb,jsonb,text,integer,integer,numeric,text),public.claim_notification_batch(integer),public.finish_notification_delivery(uuid,boolean,text,text) to service_role;
revoke all on function public.prepare_ai_task(text,uuid,uuid,uuid,text,text),public.review_ai_task(uuid,jsonb,jsonb,text),public.set_feature_flag(text,boolean),public.set_platform_usage_limit(text,integer,integer),public.super_admin_ai_task_snapshot(uuid,text),public.register_notification_device(text,text) from public,anon,authenticated;
grant execute on function public.prepare_ai_task(text,uuid,uuid,uuid,text,text),public.review_ai_task(uuid,jsonb,jsonb,text),public.set_feature_flag(text,boolean),public.set_platform_usage_limit(text,integer,integer),public.super_admin_ai_task_snapshot(uuid,text),public.register_notification_device(text,text) to authenticated;

commit;
