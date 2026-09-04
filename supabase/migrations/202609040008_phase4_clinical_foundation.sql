begin;

create type public.clinical_record_status as enum ('draft', 'finalized', 'amended');
create type public.consent_status as enum ('active', 'revoked');
create type public.dentition_type as enum ('adult', 'primary');
create type public.tooth_surface as enum ('whole', 'mesial', 'distal', 'buccal', 'lingual', 'occlusal', 'incisal');
create type public.treatment_plan_status as enum ('proposed', 'accepted', 'in_progress', 'completed', 'cancelled');
create type public.clinical_media_kind as enum ('photograph', 'xray');

create table public.patient_medical_histories (
  patient_profile_id uuid primary key references public.patient_profiles(id) on delete cascade,
  conditions text[] not null default '{}',
  current_medications text[] not null default '{}',
  prior_surgeries text[] not null default '{}',
  pregnancy_status text,
  tobacco_use text,
  notes text not null default '' check (char_length(notes) <= 5000),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now()
);

create table public.patient_allergies (
  id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid not null references public.patient_profiles(id) on delete cascade,
  allergen text not null check (char_length(btrim(allergen)) between 1 and 160),
  reaction text not null default '' check (char_length(reaction) <= 500),
  severity text not null default 'unknown' check (severity in ('unknown', 'mild', 'moderate', 'severe')),
  active boolean not null default true,
  recorded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index patient_allergies_patient_idx on public.patient_allergies(patient_profile_id, active);

create table public.consent_templates (
  id uuid primary key default gen_random_uuid(),
  consent_key text not null,
  version integer not null check (version > 0),
  title_en text not null,
  title_bn text not null,
  body_en text not null,
  body_bn text not null,
  checkbox_keys text[] not null check (cardinality(checkbox_keys) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(consent_key, version)
);

insert into public.consent_templates (consent_key, version, title_en, title_bn, body_en, body_bn, checkbox_keys)
values (
  'cross_clinic_history', 1,
  'Share dental history with this clinic',
  'এই ক্লিনিকের সঙ্গে ডেন্টাল ইতিহাস শেয়ার করুন',
  'I authorize the selected clinic and its verified treating dentists to view my prior finalized dental records for continuity of care. I can revoke this permission at any time; revocation blocks future access.',
  'সেবার ধারাবাহিকতার জন্য নির্বাচিত ক্লিনিক ও তাদের যাচাইকৃত চিকিৎসারত ডেন্টিস্টকে আমার আগের চূড়ান্ত ডেন্টাল রেকর্ড দেখার অনুমতি দিচ্ছি। আমি যেকোনো সময় অনুমতি প্রত্যাহার করতে পারি; প্রত্যাহারের পর ভবিষ্যৎ প্রবেশ বন্ধ হবে।',
  array['understand_scope', 'authorize_clinic', 'understand_revocation']
);

create table public.patient_clinic_consents (
  id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid not null references public.patient_profiles(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  template_id uuid not null references public.consent_templates(id) on delete restrict,
  template_version integer not null,
  accepted_checkboxes jsonb not null check (jsonb_typeof(accepted_checkboxes) = 'object'),
  status public.consent_status not null default 'active',
  accepted_by uuid not null references auth.users(id) on delete restrict,
  accepted_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  revocation_reason text check (char_length(revocation_reason) <= 500),
  created_at timestamptz not null default now(),
  check ((status = 'active' and revoked_at is null and revoked_by is null) or (status = 'revoked' and revoked_at is not null and revoked_by is not null))
);
create unique index one_active_clinic_consent on public.patient_clinic_consents(patient_profile_id, clinic_id) where status = 'active';
create index patient_clinic_consents_lookup_idx on public.patient_clinic_consents(patient_profile_id, clinic_id, status);

create table public.clinical_encounters (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete restrict,
  patient_profile_id uuid not null references public.patient_profiles(id) on delete restrict,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  treating_dentist_id uuid not null references auth.users(id) on delete restrict,
  status public.clinical_record_status not null default 'draft',
  chief_complaint text not null default '' check (char_length(chief_complaint) <= 2000),
  subjective_notes text not null default '' check (char_length(subjective_notes) <= 10000),
  objective_notes text not null default '' check (char_length(objective_notes) <= 10000),
  assessment text not null default '' check (char_length(assessment) <= 10000),
  plan text not null default '' check (char_length(plan) <= 10000),
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'draft' and finalized_at is null and finalized_by is null) or (status in ('finalized','amended') and finalized_at is not null and finalized_by is not null))
);
create index clinical_encounters_patient_idx on public.clinical_encounters(patient_profile_id, created_at desc);
create index clinical_encounters_dentist_idx on public.clinical_encounters(treating_dentist_id, created_at desc);

create table public.clinical_diagnoses (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.clinical_encounters(id) on delete cascade,
  patient_profile_id uuid not null references public.patient_profiles(id) on delete restrict,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  code text,
  diagnosis text not null check (char_length(btrim(diagnosis)) between 1 and 1000),
  notes text not null default '' check (char_length(notes) <= 5000),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.odontogram_observations (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.clinical_encounters(id) on delete cascade,
  patient_profile_id uuid not null references public.patient_profiles(id) on delete restrict,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  dentition public.dentition_type not null,
  fdi_tooth_code text not null,
  surface public.tooth_surface not null default 'whole',
  finding text not null check (char_length(btrim(finding)) between 1 and 1000),
  recorded_by uuid not null references auth.users(id) on delete restrict,
  finalized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(encounter_id, fdi_tooth_code, surface),
  check ((dentition='adult' and fdi_tooth_code ~ '^[1-4][1-8]$') or (dentition='primary' and fdi_tooth_code ~ '^[5-8][1-5]$'))
);

create table public.treatment_plans (
  id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid not null references public.patient_profiles(id) on delete restrict,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  encounter_id uuid references public.clinical_encounters(id) on delete restrict,
  treating_dentist_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  record_status public.clinical_record_status not null default 'draft',
  status public.treatment_plan_status not null default 'proposed',
  notes text not null default '' check (char_length(notes) <= 5000),
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((record_status='draft' and finalized_at is null and finalized_by is null) or (record_status in ('finalized','amended') and finalized_at is not null and finalized_by is not null))
);

create table public.treatment_plan_items (
  id uuid primary key default gen_random_uuid(),
  treatment_plan_id uuid not null references public.treatment_plans(id) on delete cascade,
  description text not null check (char_length(btrim(description)) between 1 and 1000),
  fdi_tooth_code text check (fdi_tooth_code is null or fdi_tooth_code ~ '^[1-4][1-8]$' or fdi_tooth_code ~ '^[5-8][1-5]$'),
  sequence_number integer not null check (sequence_number > 0),
  status public.treatment_plan_status not null default 'proposed',
  estimated_price_bdt numeric(12,2) check (estimated_price_bdt is null or estimated_price_bdt >= 0),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(treatment_plan_id, sequence_number)
);

create table public.clinical_media (
  id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid not null references public.patient_profiles(id) on delete restrict,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  encounter_id uuid not null references public.clinical_encounters(id) on delete cascade,
  kind public.clinical_media_kind not null,
  storage_path text not null unique check (storage_path !~ '(^|/)\.\.(/|$)'),
  filename text not null,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp','application/pdf','application/dicom')),
  byte_size bigint not null check (byte_size between 1 and 20971520),
  caption text not null default '' check (char_length(caption) <= 1000),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  finalized_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  encounter_id uuid not null references public.clinical_encounters(id) on delete restrict,
  patient_profile_id uuid not null references public.patient_profiles(id) on delete restrict,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  dentist_id uuid not null references auth.users(id) on delete restrict,
  status public.clinical_record_status not null default 'draft',
  instructions text not null default '' check (char_length(instructions) <= 5000),
  document_path text unique,
  finalized_at timestamptz,
  finalized_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'draft' and finalized_at is null and finalized_by is null) or (status in ('finalized','amended') and finalized_at is not null and finalized_by is not null))
);

create table public.prescription_items (
  id uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references public.prescriptions(id) on delete cascade,
  medicine_name text not null check (char_length(btrim(medicine_name)) between 1 and 300),
  strength text not null default '' check (char_length(strength) <= 100),
  dosage text not null check (char_length(btrim(dosage)) between 1 and 300),
  route text not null default 'oral' check (char_length(route) <= 100),
  frequency text not null check (char_length(btrim(frequency)) between 1 and 300),
  duration text not null check (char_length(btrim(duration)) between 1 and 300),
  instructions text not null default '' check (char_length(instructions) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clinical_record_versions (
  id bigint generated always as identity primary key,
  patient_profile_id uuid not null references public.patient_profiles(id) on delete restrict,
  clinic_id uuid references public.clinics(id) on delete restrict,
  record_type text not null,
  record_id uuid not null,
  before_record jsonb not null,
  after_record jsonb not null,
  changed_by uuid not null references auth.users(id) on delete restrict,
  change_reason text not null,
  changed_at timestamptz not null default now()
);
create index clinical_versions_record_idx on public.clinical_record_versions(record_type, record_id, changed_at desc);

create or replace function public.is_treating_dentist(target_patient_profile_id uuid, target_clinic_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_verified_dentist(auth.uid())
    and public.has_clinic_role(target_clinic_id, array['dentist']::public.app_role[])
    and exists (
      select 1 from public.appointments a
      where a.patient_profile_id = target_patient_profile_id and a.clinic_id = target_clinic_id
        and a.dentist_id = auth.uid() and a.status in ('checked_in','in_progress','completed')
    );
$$;

create or replace function public.has_active_clinical_consent(target_patient_profile_id uuid, target_clinic_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.patient_clinic_consents c where c.patient_profile_id = target_patient_profile_id and c.clinic_id = target_clinic_id and c.status = 'active');
$$;

create or replace function public.can_read_clinical_record(target_patient_profile_id uuid, source_clinic_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.owns_patient_profile(target_patient_profile_id)
    or public.is_treating_dentist(target_patient_profile_id, source_clinic_id)
    or exists (
      select 1 from public.clinic_memberships m
      where m.user_id = auth.uid() and m.role = 'dentist' and m.status = 'active'
        and public.is_treating_dentist(target_patient_profile_id, m.clinic_id)
        and public.has_active_clinical_consent(target_patient_profile_id, m.clinic_id)
    );
$$;

create or replace function public.can_read_patient_history(target_patient_profile_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.owns_patient_profile(target_patient_profile_id) or exists (
    select 1 from public.clinic_memberships m
    where m.user_id=auth.uid() and m.role='dentist' and m.status='active'
      and public.is_treating_dentist(target_patient_profile_id,m.clinic_id)
      and public.has_active_clinical_consent(target_patient_profile_id,m.clinic_id)
  );
$$;

create or replace function public.capture_clinical_version()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare reason text;
begin
  reason := nullif(current_setting('app.change_reason', true), '');
  if reason is null then raise exception using errcode = '22023', message = 'CLINICAL_CHANGE_REASON_REQUIRED'; end if;
  insert into public.clinical_record_versions(patient_profile_id, clinic_id, record_type, record_id, before_record, after_record, changed_by, change_reason)
  values (old.patient_profile_id, old.clinic_id, tg_table_name, old.id, to_jsonb(old), to_jsonb(new), auth.uid(), reason);
  return new;
end;
$$;

create or replace function public.capture_patient_history_version()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare reason text; source_clinic uuid;
begin
  reason := nullif(current_setting('app.change_reason', true), '');
  if reason is null then raise exception using errcode = '22023', message = 'CLINICAL_CHANGE_REASON_REQUIRED'; end if;
  select a.clinic_id into source_clinic from public.appointments a where a.patient_profile_id=old.patient_profile_id and a.dentist_id=auth.uid() order by a.created_at desc limit 1;
  insert into public.clinical_record_versions(patient_profile_id,clinic_id,record_type,record_id,before_record,after_record,changed_by,change_reason)
  values(old.patient_profile_id,source_clinic,tg_table_name,old.patient_profile_id,to_jsonb(old),to_jsonb(new),auth.uid(),reason);
  return new;
end;
$$;

create or replace function public.capture_allergy_version()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare reason text; source_clinic uuid;
begin
  reason := nullif(current_setting('app.change_reason', true), '');
  if reason is null then raise exception using errcode = '22023', message = 'CLINICAL_CHANGE_REASON_REQUIRED'; end if;
  select a.clinic_id into source_clinic from public.appointments a where a.patient_profile_id=old.patient_profile_id and a.dentist_id=auth.uid() order by a.created_at desc limit 1;
  insert into public.clinical_record_versions(patient_profile_id,clinic_id,record_type,record_id,before_record,after_record,changed_by,change_reason)
  values(old.patient_profile_id,source_clinic,tg_table_name,old.id,to_jsonb(old),to_jsonb(new),auth.uid(),reason);
  return new;
end;
$$;

create trigger encounter_versions before update on public.clinical_encounters for each row execute function public.capture_clinical_version();
create trigger diagnosis_versions before update on public.clinical_diagnoses for each row execute function public.capture_clinical_version();
create trigger odontogram_versions before update on public.odontogram_observations for each row execute function public.capture_clinical_version();
create trigger treatment_plan_versions before update on public.treatment_plans for each row execute function public.capture_clinical_version();
create trigger prescription_versions before update on public.prescriptions for each row execute function public.capture_clinical_version();
create trigger medical_history_versions before update on public.patient_medical_histories for each row execute function public.capture_patient_history_version();
create trigger allergy_versions before update on public.patient_allergies for each row execute function public.capture_allergy_version();

create trigger allergies_touch_updated_at before update on public.patient_allergies for each row execute function public.touch_updated_at();
create trigger encounters_touch_updated_at before update on public.clinical_encounters for each row execute function public.touch_updated_at();
create trigger diagnoses_touch_updated_at before update on public.clinical_diagnoses for each row execute function public.touch_updated_at();
create trigger odontogram_touch_updated_at before update on public.odontogram_observations for each row execute function public.touch_updated_at();
create trigger treatment_plans_touch_updated_at before update on public.treatment_plans for each row execute function public.touch_updated_at();
create trigger treatment_items_touch_updated_at before update on public.treatment_plan_items for each row execute function public.touch_updated_at();
create trigger prescriptions_touch_updated_at before update on public.prescriptions for each row execute function public.touch_updated_at();
create trigger prescription_items_touch_updated_at before update on public.prescription_items for each row execute function public.touch_updated_at();

create or replace function public.save_patient_medical_history(target_patient_profile_id uuid, condition_list text[], medication_list text[], surgery_list text[], pregnancy text, tobacco text, history_notes text, change_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.owns_patient_profile(target_patient_profile_id) and not exists(
    select 1 from public.clinic_memberships m where m.user_id=auth.uid() and m.role='dentist' and m.status='active' and public.is_treating_dentist(target_patient_profile_id,m.clinic_id)
  ) then raise exception using errcode='42501', message='MEDICAL_HISTORY_DENIED'; end if;
  perform set_config('app.change_reason',coalesce(nullif(btrim(change_reason),''),'Medical history updated'),true);
  insert into public.patient_medical_histories(patient_profile_id,conditions,current_medications,prior_surgeries,pregnancy_status,tobacco_use,notes,updated_by)
  values(target_patient_profile_id,coalesce(condition_list,'{}'),coalesce(medication_list,'{}'),coalesce(surgery_list,'{}'),nullif(btrim(pregnancy),''),nullif(btrim(tobacco),''),btrim(history_notes),auth.uid())
  on conflict(patient_profile_id) do update set conditions=excluded.conditions,current_medications=excluded.current_medications,prior_surgeries=excluded.prior_surgeries,pregnancy_status=excluded.pregnancy_status,tobacco_use=excluded.tobacco_use,notes=excluded.notes,updated_by=auth.uid(),updated_at=now();
  perform public.write_audit('clinical.medical_history_saved','patient_profile',target_patient_profile_id::text);
end;
$$;

create or replace function public.add_patient_allergy(target_patient_profile_id uuid, allergen_name text, reaction_text text, allergy_severity text)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare allergy_id uuid;
begin
  if allergy_severity not in ('unknown','mild','moderate','severe') then raise exception using errcode='22023', message='ALLERGY_SEVERITY_INVALID'; end if;
  if not public.owns_patient_profile(target_patient_profile_id) and not exists(
    select 1 from public.clinic_memberships m where m.user_id=auth.uid() and m.role='dentist' and m.status='active' and public.is_treating_dentist(target_patient_profile_id,m.clinic_id)
  ) then raise exception using errcode='42501', message='ALLERGY_DENIED'; end if;
  insert into public.patient_allergies(patient_profile_id,allergen,reaction,severity,recorded_by)
  values(target_patient_profile_id,btrim(allergen_name),btrim(reaction_text),allergy_severity,auth.uid()) returning id into allergy_id;
  perform public.write_audit('clinical.allergy_added','patient_allergy',allergy_id::text,jsonb_build_object('patient_profile_id',target_patient_profile_id));
  return allergy_id;
end;
$$;

create or replace function public.create_treatment_plan(target_encounter_id uuid, plan_title text, plan_notes text, items jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare encounter public.clinical_encounters%rowtype; plan_id uuid; item jsonb; sequence integer:=0;
begin
  select * into encounter from public.clinical_encounters where id=target_encounter_id;
  if not found or encounter.status<>'draft' or encounter.treating_dentist_id<>auth.uid() or not public.is_verified_dentist(auth.uid()) then raise exception using errcode='42501', message='TREATMENT_PLAN_DENIED'; end if;
  if jsonb_typeof(items)<>'array' or jsonb_array_length(items)=0 then raise exception using errcode='22023', message='TREATMENT_ITEMS_REQUIRED'; end if;
  insert into public.treatment_plans(patient_profile_id,clinic_id,encounter_id,treating_dentist_id,title,notes)
  values(encounter.patient_profile_id,encounter.clinic_id,encounter.id,auth.uid(),btrim(plan_title),btrim(plan_notes)) returning id into plan_id;
  for item in select * from jsonb_array_elements(items) loop
    sequence:=sequence+1;
    insert into public.treatment_plan_items(treatment_plan_id,description,fdi_tooth_code,sequence_number,estimated_price_bdt)
    values(plan_id,btrim(item->>'description'),nullif(btrim(item->>'fdiToothCode'),''),sequence,nullif(item->>'estimatedPriceBdt','')::numeric);
  end loop;
  perform public.write_audit('clinical.treatment_plan_created','treatment_plan',plan_id::text);
  return plan_id;
end;
$$;

create or replace function public.register_clinical_media(target_encounter_id uuid, media_kind public.clinical_media_kind, object_path text, original_filename text, mime_type text, content_size bigint, media_caption text default '')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare encounter public.clinical_encounters%rowtype; media_id uuid;
begin
  select * into encounter from public.clinical_encounters where id=target_encounter_id;
  if not found or encounter.status<>'draft' or encounter.treating_dentist_id<>auth.uid() or not public.is_verified_dentist(auth.uid()) then raise exception using errcode='42501', message='CLINICAL_MEDIA_DENIED'; end if;
  if split_part(object_path,'/',1)<>auth.uid()::text then raise exception using errcode='22023', message='CLINICAL_MEDIA_PATH_INVALID'; end if;
  insert into public.clinical_media(patient_profile_id,clinic_id,encounter_id,kind,storage_path,filename,content_type,byte_size,caption,uploaded_by)
  values(encounter.patient_profile_id,encounter.clinic_id,encounter.id,media_kind,object_path,original_filename,mime_type,content_size,btrim(media_caption),auth.uid()) returning id into media_id;
  perform public.write_audit('clinical.media_registered','clinical_media',media_id::text,jsonb_build_object('kind',media_kind));
  return media_id;
end;
$$;

create or replace function public.finalize_treatment_plan(target_treatment_plan_id uuid, change_reason text default 'Treatment plan finalized')
returns void language plpgsql security definer set search_path = ''
as $$
declare target public.treatment_plans%rowtype;
begin
  select * into target from public.treatment_plans where id=target_treatment_plan_id for update;
  if not found or target.treating_dentist_id<>auth.uid() or target.record_status<>'draft' or not public.is_verified_dentist(auth.uid()) then raise exception using errcode='42501', message='TREATMENT_PLAN_DENIED'; end if;
  perform set_config('app.change_reason',coalesce(nullif(btrim(change_reason),''),'Treatment plan finalized'),true);
  update public.treatment_plans set record_status='finalized',finalized_at=now(),finalized_by=auth.uid() where id=target.id;
  perform public.write_audit('clinical.treatment_plan_finalized','treatment_plan',target.id::text);
end;
$$;

create or replace function public.set_patient_clinic_consent(target_patient_profile_id uuid, target_clinic_id uuid, target_template_id uuid, checkbox_values jsonb)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare template public.consent_templates%rowtype; consent_id uuid; checkbox_key text;
begin
  if not public.owns_patient_profile(target_patient_profile_id) then raise exception using errcode='42501', message='CONSENT_DENIED'; end if;
  select * into template from public.consent_templates where id=target_template_id and active;
  if not found then raise exception using errcode='22023', message='CONSENT_TEMPLATE_INVALID'; end if;
  foreach checkbox_key in array template.checkbox_keys loop
    if coalesce((checkbox_values ->> checkbox_key)::boolean, false) is not true then raise exception using errcode='22023', message='CONSENT_CHECKBOX_REQUIRED'; end if;
  end loop;
  update public.patient_clinic_consents set status='revoked', revoked_by=auth.uid(), revoked_at=now(), revocation_reason='Replaced by a newer consent'
    where patient_profile_id=target_patient_profile_id and clinic_id=target_clinic_id and status='active';
  insert into public.patient_clinic_consents(patient_profile_id,clinic_id,template_id,template_version,accepted_checkboxes,accepted_by)
  values(target_patient_profile_id,target_clinic_id,template.id,template.version,checkbox_values,auth.uid()) returning id into consent_id;
  perform public.write_audit('clinical.consent_granted','patient_clinic_consent',consent_id::text,jsonb_build_object('patient_profile_id',target_patient_profile_id,'clinic_id',target_clinic_id,'template_version',template.version));
  return consent_id;
end;
$$;

create or replace function public.revoke_patient_clinic_consent(target_consent_id uuid, reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare target public.patient_clinic_consents%rowtype;
begin
  select * into target from public.patient_clinic_consents where id=target_consent_id for update;
  if not found or not public.owns_patient_profile(target.patient_profile_id) then raise exception using errcode='42501', message='CONSENT_DENIED'; end if;
  if target.status='active' then
    update public.patient_clinic_consents set status='revoked', revoked_by=auth.uid(), revoked_at=now(), revocation_reason=nullif(btrim(reason),'') where id=target.id;
    perform public.write_audit('clinical.consent_revoked','patient_clinic_consent',target.id::text,jsonb_build_object('patient_profile_id',target.patient_profile_id,'clinic_id',target.clinic_id));
  end if;
end;
$$;

create or replace function public.start_clinical_encounter(target_appointment_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare appointment public.appointments%rowtype; encounter_id uuid; created_now boolean := false;
begin
  select * into appointment from public.appointments where id=target_appointment_id for update;
  if not found or appointment.dentist_id<>auth.uid() or appointment.status not in ('checked_in','in_progress','completed') or not public.is_verified_dentist(auth.uid()) then raise exception using errcode='42501', message='ENCOUNTER_DENIED'; end if;
  insert into public.clinical_encounters(appointment_id,patient_profile_id,clinic_id,treating_dentist_id)
  values(appointment.id,appointment.patient_profile_id,appointment.clinic_id,auth.uid())
  on conflict(appointment_id) do nothing
  returning id into encounter_id;
  if encounter_id is null then
    select id into encounter_id from public.clinical_encounters where appointment_id=appointment.id and treating_dentist_id=auth.uid();
    if encounter_id is null then raise exception using errcode='42501', message='ENCOUNTER_DENIED'; end if;
  else
    created_now := true;
  end if;
  if created_now then perform public.write_audit('clinical.encounter_started','clinical_encounter',encounter_id::text,jsonb_build_object('appointment_id',appointment.id)); end if;
  return encounter_id;
end;
$$;

create or replace function public.save_clinical_encounter(target_encounter_id uuid, complaint text, subjective text, objective text, assessment_text text, plan_text text, change_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare encounter public.clinical_encounters%rowtype;
begin
  select * into encounter from public.clinical_encounters where id=target_encounter_id for update;
  if not found or encounter.treating_dentist_id<>auth.uid() or not public.is_verified_dentist(auth.uid()) then raise exception using errcode='42501', message='ENCOUNTER_DENIED'; end if;
  if encounter.status<>'draft' then raise exception using errcode='22023', message='FINALIZED_RECORD_IMMUTABLE'; end if;
  perform set_config('app.change_reason',coalesce(nullif(btrim(change_reason),''),'Clinical note updated'),true);
  update public.clinical_encounters set chief_complaint=btrim(complaint),subjective_notes=btrim(subjective),objective_notes=btrim(objective),assessment=btrim(assessment_text),plan=btrim(plan_text) where id=target_encounter_id;
end;
$$;

create or replace function public.finalize_clinical_encounter(target_encounter_id uuid, change_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare encounter public.clinical_encounters%rowtype;
begin
  select * into encounter from public.clinical_encounters where id=target_encounter_id for update;
  if not found or encounter.treating_dentist_id<>auth.uid() or not public.is_verified_dentist(auth.uid()) then raise exception using errcode='42501', message='ENCOUNTER_DENIED'; end if;
  if encounter.status<>'draft' then raise exception using errcode='22023', message='FINALIZED_RECORD_IMMUTABLE'; end if;
  if char_length(btrim(encounter.objective_notes))=0 or char_length(btrim(encounter.assessment))=0 or char_length(btrim(encounter.plan))=0 then raise exception using errcode='22023', message='ENCOUNTER_FIELDS_REQUIRED'; end if;
  if exists(select 1 from public.prescriptions where encounter_id=target_encounter_id and status='draft') or exists(select 1 from public.treatment_plans where encounter_id=target_encounter_id and record_status='draft') then raise exception using errcode='22023', message='CLINICAL_DRAFTS_REMAIN'; end if;
  perform set_config('app.change_reason',coalesce(nullif(btrim(change_reason),''),'Encounter finalized'),true);
  update public.clinical_encounters set status='finalized',finalized_at=now(),finalized_by=auth.uid() where id=target_encounter_id;
  update public.clinical_diagnoses set finalized_at=now() where encounter_id=target_encounter_id and finalized_at is null;
  update public.odontogram_observations set finalized_at=now() where encounter_id=target_encounter_id and finalized_at is null;
  update public.clinical_media set finalized_at=now() where encounter_id=target_encounter_id and finalized_at is null;
  update public.appointments set status='completed',completed_at=now(),updated_at=now() where id=encounter.appointment_id and status='checked_in';
  perform public.write_audit('clinical.encounter_finalized','clinical_encounter',target_encounter_id::text);
end;
$$;

create or replace function public.add_clinical_diagnosis(target_encounter_id uuid, diagnosis_code text, diagnosis_text text, diagnosis_notes text default '')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare encounter public.clinical_encounters%rowtype; diagnosis_id uuid;
begin
  select * into encounter from public.clinical_encounters where id=target_encounter_id;
  if not found or encounter.status<>'draft' or encounter.treating_dentist_id<>auth.uid() or not public.is_verified_dentist(auth.uid()) then raise exception using errcode='42501', message='DIAGNOSIS_DENIED'; end if;
  insert into public.clinical_diagnoses(encounter_id,patient_profile_id,clinic_id,code,diagnosis,notes,recorded_by)
  values(encounter.id,encounter.patient_profile_id,encounter.clinic_id,nullif(btrim(diagnosis_code),''),btrim(diagnosis_text),btrim(diagnosis_notes),auth.uid()) returning id into diagnosis_id;
  return diagnosis_id;
end;
$$;

create or replace function public.save_tooth_observation(target_encounter_id uuid, target_dentition public.dentition_type, tooth_code text, tooth_surface public.tooth_surface, finding_text text, change_reason text default 'Odontogram updated')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare encounter public.clinical_encounters%rowtype; observation_id uuid;
begin
  select * into encounter from public.clinical_encounters where id=target_encounter_id;
  if not found or encounter.status<>'draft' or encounter.treating_dentist_id<>auth.uid() or not public.is_verified_dentist(auth.uid()) then raise exception using errcode='42501', message='ODONTOGRAM_DENIED'; end if;
  perform set_config('app.change_reason',coalesce(nullif(btrim(change_reason),''),'Odontogram updated'),true);
  insert into public.odontogram_observations(encounter_id,patient_profile_id,clinic_id,dentition,fdi_tooth_code,surface,finding,recorded_by)
  values(encounter.id,encounter.patient_profile_id,encounter.clinic_id,target_dentition,tooth_code,tooth_surface,btrim(finding_text),auth.uid())
  on conflict(encounter_id,fdi_tooth_code,surface) do update set dentition=excluded.dentition,finding=excluded.finding,recorded_by=auth.uid(),updated_at=now()
  returning id into observation_id;
  return observation_id;
end;
$$;

create or replace function public.save_prescription_draft(target_encounter_id uuid, target_prescription_id uuid, prescription_instructions text, items jsonb, change_reason text default 'Prescription draft updated')
returns uuid language plpgsql security definer set search_path = ''
as $$
declare encounter public.clinical_encounters%rowtype; prescription public.prescriptions%rowtype; item jsonb; v_prescription_id uuid;
begin
  select * into encounter from public.clinical_encounters where id=target_encounter_id;
  if not found or encounter.status<>'draft' or encounter.treating_dentist_id<>auth.uid() or not public.is_verified_dentist(auth.uid()) then raise exception using errcode='42501', message='PRESCRIPTION_DENIED'; end if;
  if jsonb_typeof(items)<>'array' or jsonb_array_length(items)=0 then raise exception using errcode='22023', message='PRESCRIPTION_ITEMS_REQUIRED'; end if;
  if target_prescription_id is null then
    insert into public.prescriptions(encounter_id,patient_profile_id,clinic_id,dentist_id,instructions)
    values(encounter.id,encounter.patient_profile_id,encounter.clinic_id,auth.uid(),btrim(prescription_instructions)) returning id into v_prescription_id;
  else
    select * into prescription from public.prescriptions where id=target_prescription_id for update;
    if not found or prescription.dentist_id<>auth.uid() or prescription.status<>'draft' then raise exception using errcode='42501', message='PRESCRIPTION_DENIED'; end if;
    v_prescription_id:=prescription.id;
    perform set_config('app.change_reason',coalesce(nullif(btrim(change_reason),''),'Prescription draft updated'),true);
    update public.prescriptions set instructions=btrim(prescription_instructions) where id=v_prescription_id;
    delete from public.prescription_items where prescription_items.prescription_id=v_prescription_id;
  end if;
  for item in select * from jsonb_array_elements(items) loop
    insert into public.prescription_items(prescription_id,medicine_name,strength,dosage,route,frequency,duration,instructions)
    values(v_prescription_id,btrim(item->>'medicineName'),coalesce(btrim(item->>'strength'),''),btrim(item->>'dosage'),coalesce(nullif(btrim(item->>'route'),''),'oral'),btrim(item->>'frequency'),btrim(item->>'duration'),coalesce(btrim(item->>'instructions'),''));
  end loop;
  return v_prescription_id;
end;
$$;

create or replace function public.finalize_prescription(target_prescription_id uuid, change_reason text default 'Prescription finalized')
returns void language plpgsql security definer set search_path = ''
as $$
declare prescription public.prescriptions%rowtype;
begin
  select * into prescription from public.prescriptions where id=target_prescription_id for update;
  if not found or prescription.dentist_id<>auth.uid() or prescription.status<>'draft' or not public.is_verified_dentist(auth.uid()) then raise exception using errcode='42501', message='PRESCRIPTION_DENIED'; end if;
  if not exists(select 1 from public.prescription_items where prescription_id=target_prescription_id) then raise exception using errcode='22023', message='PRESCRIPTION_ITEMS_REQUIRED'; end if;
  perform set_config('app.change_reason',coalesce(nullif(btrim(change_reason),''),'Prescription finalized'),true);
  update public.prescriptions set status='finalized',finalized_at=now(),finalized_by=auth.uid() where id=target_prescription_id;
  perform public.write_audit('clinical.prescription_finalized','prescription',target_prescription_id::text);
end;
$$;

create or replace function public.set_prescription_document(target_prescription_id uuid, object_path text)
returns void language plpgsql security definer set search_path = ''
as $$
declare prescription public.prescriptions%rowtype;
begin
  select * into prescription from public.prescriptions where id=target_prescription_id for update;
  if not found or prescription.status not in ('finalized','amended') or not public.can_read_clinical_record(prescription.patient_profile_id,prescription.clinic_id) then raise exception using errcode='42501', message='PRESCRIPTION_DOCUMENT_DENIED'; end if;
  if split_part(object_path,'/',2)<>target_prescription_id::text or object_path !~ '^[0-9a-f-]+/[0-9a-f-]+\.pdf$' then raise exception using errcode='22023', message='PRESCRIPTION_DOCUMENT_PATH_INVALID'; end if;
  perform set_config('app.change_reason','Private prescription document generated',true);
  update public.prescriptions set document_path=object_path where id=target_prescription_id;
  perform public.write_audit('clinical.prescription_document_generated','prescription',target_prescription_id::text);
end;
$$;

create or replace function public.super_admin_clinical_snapshot(target_patient_profile_id uuid, access_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not public.has_role('super_admin') then raise exception using errcode='42501', message='SUPER_ADMIN_REQUIRED'; end if;
  if char_length(btrim(access_reason))<10 then raise exception using errcode='22023', message='ACCESS_REASON_REQUIRED'; end if;
  select jsonb_build_object(
    'medicalHistory',(select to_jsonb(h) from public.patient_medical_histories h where h.patient_profile_id=target_patient_profile_id),
    'allergies',coalesce((select jsonb_agg(to_jsonb(a)) from public.patient_allergies a where a.patient_profile_id=target_patient_profile_id),'[]'::jsonb),
    'encounters',coalesce((select jsonb_agg(to_jsonb(e)) from public.clinical_encounters e where e.patient_profile_id=target_patient_profile_id),'[]'::jsonb),
    'diagnoses',coalesce((select jsonb_agg(to_jsonb(d)) from public.clinical_diagnoses d where d.patient_profile_id=target_patient_profile_id),'[]'::jsonb),
    'prescriptions',coalesce((select jsonb_agg(to_jsonb(p)) from public.prescriptions p where p.patient_profile_id=target_patient_profile_id),'[]'::jsonb)
  ) into result;
  perform public.write_audit('clinical.super_admin_read','patient_profile',target_patient_profile_id::text,jsonb_build_object('reason',btrim(access_reason)));
  return result;
end;
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('clinical-media','clinical-media',false,20971520,array['image/jpeg','image/png','image/webp','application/pdf','application/dicom']),
  ('prescriptions','prescriptions',false,5242880,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

alter table public.patient_medical_histories enable row level security;
alter table public.patient_allergies enable row level security;
alter table public.consent_templates enable row level security;
alter table public.patient_clinic_consents enable row level security;
alter table public.clinical_encounters enable row level security;
alter table public.clinical_diagnoses enable row level security;
alter table public.odontogram_observations enable row level security;
alter table public.treatment_plans enable row level security;
alter table public.treatment_plan_items enable row level security;
alter table public.clinical_media enable row level security;
alter table public.prescriptions enable row level security;
alter table public.prescription_items enable row level security;
alter table public.clinical_record_versions enable row level security;

create policy medical_history_read_clinical on public.patient_medical_histories for select to authenticated using(public.can_read_patient_history(patient_profile_id));
create policy allergies_read_clinical on public.patient_allergies for select to authenticated using(public.can_read_patient_history(patient_profile_id));
create policy consent_templates_read_active on public.consent_templates for select to authenticated using(active);
create policy consents_read_owner_or_treating on public.patient_clinic_consents for select to authenticated using(public.owns_patient_profile(patient_profile_id) or public.is_treating_dentist(patient_profile_id,clinic_id));
create policy encounters_read_clinical on public.clinical_encounters for select to authenticated using(public.can_read_clinical_record(patient_profile_id,clinic_id) and (not public.owns_patient_profile(patient_profile_id) or status in ('finalized','amended')));
create policy diagnoses_read_clinical on public.clinical_diagnoses for select to authenticated using(public.can_read_clinical_record(patient_profile_id,clinic_id) and (not public.owns_patient_profile(patient_profile_id) or finalized_at is not null));
create policy odontogram_read_clinical on public.odontogram_observations for select to authenticated using(public.can_read_clinical_record(patient_profile_id,clinic_id) and (not public.owns_patient_profile(patient_profile_id) or finalized_at is not null));
create policy treatment_plans_read_clinical on public.treatment_plans for select to authenticated using(public.can_read_clinical_record(patient_profile_id,clinic_id) and (not public.owns_patient_profile(patient_profile_id) or record_status in ('finalized','amended')));
create policy treatment_items_read_clinical on public.treatment_plan_items for select to authenticated using(exists(select 1 from public.treatment_plans p where p.id=treatment_plan_id and public.can_read_clinical_record(p.patient_profile_id,p.clinic_id) and (not public.owns_patient_profile(p.patient_profile_id) or p.record_status in ('finalized','amended'))));
create policy clinical_media_read_clinical on public.clinical_media for select to authenticated using(public.can_read_clinical_record(patient_profile_id,clinic_id) and (not public.owns_patient_profile(patient_profile_id) or finalized_at is not null));
create policy prescriptions_read_clinical on public.prescriptions for select to authenticated using(public.can_read_clinical_record(patient_profile_id,clinic_id) and (not public.owns_patient_profile(patient_profile_id) or status in ('finalized','amended')));
create policy prescription_items_read_clinical on public.prescription_items for select to authenticated using(exists(select 1 from public.prescriptions p where p.id=prescription_id and public.can_read_clinical_record(p.patient_profile_id,p.clinic_id) and (not public.owns_patient_profile(p.patient_profile_id) or p.status in ('finalized','amended'))));
create policy clinical_versions_read_dentist on public.clinical_record_versions for select to authenticated using(public.is_treating_dentist(patient_profile_id,clinic_id));

create policy clinical_media_objects_read on storage.objects for select to authenticated using(bucket_id='clinical-media' and exists(select 1 from public.clinical_media m where m.storage_path=name and public.can_read_clinical_record(m.patient_profile_id,m.clinic_id) and (not public.owns_patient_profile(m.patient_profile_id) or m.finalized_at is not null)));
create policy prescription_objects_read on storage.objects for select to authenticated using(bucket_id='prescriptions' and exists(select 1 from public.prescriptions p where p.document_path=name and public.can_read_clinical_record(p.patient_profile_id,p.clinic_id) and p.status in ('finalized','amended')));
create policy clinical_media_objects_upload on storage.objects for insert to authenticated with check(bucket_id='clinical-media' and split_part(name,'/',1)=auth.uid()::text and public.is_verified_dentist(auth.uid()));
create policy clinical_media_objects_cleanup on storage.objects for delete to authenticated using(bucket_id='clinical-media' and owner_id=auth.uid()::text and not exists(select 1 from public.clinical_media m where m.storage_path=name));

revoke all on public.patient_medical_histories,public.patient_allergies,public.consent_templates,public.patient_clinic_consents,public.clinical_encounters,public.clinical_diagnoses,public.odontogram_observations,public.treatment_plans,public.treatment_plan_items,public.clinical_media,public.prescriptions,public.prescription_items,public.clinical_record_versions from anon,authenticated;
grant select on public.patient_medical_histories,public.patient_allergies,public.consent_templates,public.patient_clinic_consents,public.clinical_encounters,public.clinical_diagnoses,public.odontogram_observations,public.treatment_plans,public.treatment_plan_items,public.clinical_media,public.prescriptions,public.prescription_items,public.clinical_record_versions to authenticated;

revoke all on function public.save_patient_medical_history(uuid,text[],text[],text[],text,text,text,text),public.add_patient_allergy(uuid,text,text,text),public.set_patient_clinic_consent(uuid,uuid,uuid,jsonb),public.revoke_patient_clinic_consent(uuid,text),public.start_clinical_encounter(uuid),public.save_clinical_encounter(uuid,text,text,text,text,text,text),public.finalize_clinical_encounter(uuid,text),public.add_clinical_diagnosis(uuid,text,text,text),public.save_tooth_observation(uuid,public.dentition_type,text,public.tooth_surface,text,text),public.create_treatment_plan(uuid,text,text,jsonb),public.finalize_treatment_plan(uuid,text),public.register_clinical_media(uuid,public.clinical_media_kind,text,text,text,bigint,text),public.save_prescription_draft(uuid,uuid,text,jsonb,text),public.finalize_prescription(uuid,text),public.set_prescription_document(uuid,text),public.super_admin_clinical_snapshot(uuid,text) from public,anon,authenticated;
grant execute on function public.save_patient_medical_history(uuid,text[],text[],text[],text,text,text,text),public.add_patient_allergy(uuid,text,text,text),public.set_patient_clinic_consent(uuid,uuid,uuid,jsonb),public.revoke_patient_clinic_consent(uuid,text),public.start_clinical_encounter(uuid),public.save_clinical_encounter(uuid,text,text,text,text,text,text),public.finalize_clinical_encounter(uuid,text),public.add_clinical_diagnosis(uuid,text,text,text),public.save_tooth_observation(uuid,public.dentition_type,text,public.tooth_surface,text,text),public.create_treatment_plan(uuid,text,text,jsonb),public.finalize_treatment_plan(uuid,text),public.register_clinical_media(uuid,public.clinical_media_kind,text,text,text,bigint,text),public.save_prescription_draft(uuid,uuid,text,jsonb,text),public.finalize_prescription(uuid,text),public.set_prescription_document(uuid,text),public.super_admin_clinical_snapshot(uuid,text) to authenticated;

commit;
