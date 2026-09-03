begin;

create extension if not exists postgis with schema extensions;

create type public.verification_status as enum (
  'draft',
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'suspended'
);

create type public.clinic_membership_status as enum (
  'invited',
  'active',
  'suspended',
  'removed'
);

create type public.verification_target as enum ('clinic', 'dentist');
create type public.verification_decision as enum ('approved', 'rejected', 'changes_requested', 'suspended');
create type public.schedule_exception_kind as enum ('unavailable', 'available', 'clinic_closed');

create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text not null default '' check (char_length(description) <= 1200),
  phone text not null check (char_length(trim(phone)) between 7 and 24),
  email text,
  address_line text not null check (char_length(trim(address_line)) between 5 and 240),
  district text not null check (char_length(trim(district)) between 2 and 80),
  city text not null check (char_length(trim(city)) between 2 and 80),
  location extensions.geography(point, 4326),
  timezone text not null default 'Asia/Dhaka',
  status public.verification_status not null default 'draft',
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
);

create index clinics_location_idx on public.clinics using gist (location);
create index clinics_status_idx on public.clinics (status, created_at desc);

create table public.clinic_memberships (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null check (role in ('clinic_owner', 'clinic_manager', 'dentist', 'front_desk')),
  status public.clinic_membership_status not null default 'active',
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, user_id, role)
);

create index clinic_memberships_user_idx on public.clinic_memberships (user_id, status);
create index clinic_memberships_clinic_idx on public.clinic_memberships (clinic_id, status, role);

create table public.clinic_staff_invitations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  email text not null,
  role public.app_role not null check (role in ('clinic_manager', 'dentist', 'front_desk')),
  status public.invitation_status not null default 'pending',
  invited_by uuid not null references auth.users(id) on delete restrict,
  accepted_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null,
  delivery_confirmed_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create unique index one_pending_clinic_invite_per_role
  on public.clinic_staff_invitations (clinic_id, lower(email), role)
  where status = 'pending';

create table public.dentist_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bmdc_registration_number text not null unique check (char_length(trim(bmdc_registration_number)) between 3 and 40),
  professional_title text not null default 'Dentist' check (char_length(professional_title) between 2 and 80),
  bio text not null default '' check (char_length(bio) <= 1600),
  specialties text[] not null default '{}',
  languages text[] not null default array['bn', 'en'],
  gender text check (gender in ('female', 'male', 'non_binary', 'prefer_not_to_say')),
  years_experience integer check (years_experience between 0 and 70),
  status public.verification_status not null default 'draft',
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(languages) > 0)
);

create index dentist_profiles_status_idx on public.dentist_profiles (status, submitted_at);

create table public.verification_documents (
  id uuid primary key default gen_random_uuid(),
  target_type public.verification_target not null,
  target_id uuid not null,
  document_kind text not null check (document_kind in ('bmdc_card', 'government_id', 'clinic_license', 'clinic_photo', 'other')),
  storage_path text not null unique,
  original_filename text not null check (char_length(original_filename) between 1 and 180),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint not null check (byte_size between 1 and 10485760),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index verification_documents_target_idx on public.verification_documents (target_type, target_id, created_at);

create table public.verification_decisions (
  id uuid primary key default gen_random_uuid(),
  target_type public.verification_target not null,
  target_id uuid not null,
  decision public.verification_decision not null,
  reason text not null default '' check (char_length(reason) <= 2000),
  decided_by uuid not null references auth.users(id) on delete restrict,
  decided_at timestamptz not null default now(),
  check (decision not in ('rejected', 'changes_requested', 'suspended') or char_length(trim(reason)) >= 5)
);

create index verification_decisions_target_idx on public.verification_decisions (target_type, target_id, decided_at desc);

create table public.clinic_services (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  dentist_id uuid references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 100),
  description text not null default '' check (char_length(description) <= 800),
  duration_minutes integer not null check (duration_minutes between 10 and 480 and duration_minutes % 5 = 0),
  price_bdt numeric(12,2) not null check (price_bdt >= 0),
  deposit_bdt numeric(12,2) not null check (deposit_bdt >= 0 and deposit_bdt <= price_bdt),
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (clinic_id, dentist_id, name)
);

create index clinic_services_lookup_idx on public.clinic_services (clinic_id, dentist_id, is_active);

create table public.weekly_schedule_blocks (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  dentist_id uuid not null references auth.users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  timezone text not null default 'Asia/Dhaka',
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time),
  unique (clinic_id, dentist_id, day_of_week, start_time, end_time)
);

create index weekly_schedule_lookup_idx on public.weekly_schedule_blocks (clinic_id, dentist_id, day_of_week) where is_active;

create table public.weekly_schedule_breaks (
  id uuid primary key default gen_random_uuid(),
  schedule_block_id uuid not null references public.weekly_schedule_blocks(id) on delete cascade,
  start_time time not null,
  end_time time not null,
  label text not null default 'Break' check (char_length(label) between 1 and 80),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (start_time < end_time),
  unique (schedule_block_id, start_time, end_time)
);

create table public.schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  dentist_id uuid references auth.users(id) on delete cascade,
  exception_date date not null,
  kind public.schedule_exception_kind not null,
  start_time time,
  end_time time,
  reason text not null default '' check (char_length(reason) <= 240),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    (start_time is null and end_time is null)
    or (start_time is not null and end_time is not null and start_time < end_time)
  ),
  check (kind <> 'clinic_closed' or dentist_id is null),
  unique nulls not distinct (clinic_id, dentist_id, exception_date, kind, start_time, end_time)
);

create index schedule_exceptions_lookup_idx on public.schedule_exceptions (clinic_id, dentist_id, exception_date);

create trigger clinics_touch_updated_at before update on public.clinics
for each row execute function public.touch_updated_at();
create trigger clinic_memberships_touch_updated_at before update on public.clinic_memberships
for each row execute function public.touch_updated_at();
create trigger dentist_profiles_touch_updated_at before update on public.dentist_profiles
for each row execute function public.touch_updated_at();
create trigger clinic_services_touch_updated_at before update on public.clinic_services
for each row execute function public.touch_updated_at();
create trigger weekly_schedule_blocks_touch_updated_at before update on public.weekly_schedule_blocks
for each row execute function public.touch_updated_at();

create or replace function public.has_clinic_role(target_clinic_id uuid, required_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clinic_memberships
    where clinic_id = target_clinic_id
      and user_id = auth.uid()
      and status = 'active'
      and role = any(required_roles)
  );
$$;

create or replace function public.can_manage_clinic(target_clinic_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin()
    or public.has_clinic_role(target_clinic_id, array['clinic_owner', 'clinic_manager']::public.app_role[]);
$$;

create or replace function public.is_verified_dentist(target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.dentist_profiles
    where user_id = target_user_id and status = 'approved'
  );
$$;

create or replace function public.unique_clinic_slug(clinic_name text)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  base_slug text;
  candidate text;
  suffix integer := 1;
begin
  base_slug := trim(both '-' from regexp_replace(lower(trim(clinic_name)), '[^a-z0-9]+', '-', 'g'));
  if base_slug = '' then base_slug := 'clinic'; end if;
  candidate := base_slug;
  while exists (select 1 from public.clinics where slug = candidate) loop
    suffix := suffix + 1;
    candidate := base_slug || '-' || suffix::text;
  end loop;
  return candidate;
end;
$$;

create or replace function public.create_clinic_application(
  clinic_name text,
  clinic_phone text,
  clinic_email text,
  clinic_address text,
  clinic_district text,
  clinic_city text,
  clinic_description text default '',
  latitude double precision default null,
  longitude double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_clinic_id uuid;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  if char_length(trim(clinic_name)) < 2 or char_length(trim(clinic_phone)) < 7
    or char_length(trim(clinic_address)) < 5 or char_length(trim(clinic_district)) < 2
    or char_length(trim(clinic_city)) < 2 then
    raise exception using errcode = '22023', message = 'INVALID_CLINIC_DETAILS';
  end if;
  if (latitude is null) <> (longitude is null) or latitude not between -90 and 90 or longitude not between -180 and 180 then
    raise exception using errcode = '22023', message = 'INVALID_LOCATION';
  end if;

  insert into public.clinics (
    name, slug, phone, email, address_line, district, city, description, location,
    status, submitted_at, created_by
  ) values (
    trim(clinic_name), public.unique_clinic_slug(clinic_name), trim(clinic_phone), nullif(lower(trim(clinic_email)), ''),
    trim(clinic_address), trim(clinic_district), trim(clinic_city), trim(clinic_description),
    case when latitude is null then null else extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326)::extensions.geography end,
    'submitted', now(), auth.uid()
  ) returning id into new_clinic_id;

  insert into public.clinic_memberships (clinic_id, user_id, role, status, joined_at)
  values (new_clinic_id, auth.uid(), 'clinic_owner', 'active', now());

  insert into public.user_roles (user_id, role, granted_by)
  values (auth.uid(), 'clinic_owner', auth.uid())
  on conflict (user_id, role) do nothing;

  if public.is_verified_dentist(auth.uid()) then
    insert into public.clinic_memberships (clinic_id, user_id, role, status, joined_at)
    values (new_clinic_id, auth.uid(), 'dentist', 'active', now())
    on conflict do nothing;
  end if;

  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'clinic.application_submitted', 'clinic', new_clinic_id::text, jsonb_build_object('name', trim(clinic_name)));

  return new_clinic_id;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'CLINIC_ALREADY_EXISTS';
end;
$$;

create or replace function public.submit_dentist_application(
  registration_number text,
  title text,
  biography text,
  specialty_list text[],
  language_list text[],
  dentist_gender text default null,
  experience_years integer default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'UNAUTHENTICATED';
  end if;
  if char_length(trim(registration_number)) < 3 or char_length(trim(title)) < 2
    or coalesce(cardinality(language_list), 0) = 0
    or experience_years not between 0 and 70 then
    raise exception using errcode = '22023', message = 'INVALID_DENTIST_APPLICATION';
  end if;

  insert into public.dentist_profiles (
    user_id, bmdc_registration_number, professional_title, bio, specialties, languages,
    gender, years_experience, status, submitted_at, rejection_reason
  ) values (
    auth.uid(), upper(trim(registration_number)), trim(title), trim(biography),
    coalesce(specialty_list, '{}'), language_list, dentist_gender, experience_years,
    'submitted', now(), null
  )
  on conflict (user_id) do update set
    bmdc_registration_number = excluded.bmdc_registration_number,
    professional_title = excluded.professional_title,
    bio = excluded.bio,
    specialties = excluded.specialties,
    languages = excluded.languages,
    gender = excluded.gender,
    years_experience = excluded.years_experience,
    status = 'submitted',
    submitted_at = now(),
    rejection_reason = null;

  insert into public.audit_logs (actor_id, action, target_type, target_id)
  values (auth.uid(), 'dentist.application_submitted', 'dentist', auth.uid()::text);
  return auth.uid();
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'BMDC_NUMBER_ALREADY_SUBMITTED';
end;
$$;

create or replace function public.register_verification_document(
  document_target public.verification_target,
  document_target_id uuid,
  document_type text,
  document_path text,
  filename text,
  content_type text,
  content_size bigint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  document_id uuid;
  owns_target boolean;
begin
  owns_target := case document_target
    when 'dentist' then document_target_id = auth.uid()
    when 'clinic' then public.can_manage_clinic(document_target_id)
    else false
  end;
  if auth.uid() is null or not owns_target then
    raise exception using errcode = '42501', message = 'TARGET_ACCESS_DENIED';
  end if;
  if split_part(document_path, '/', 1) <> auth.uid()::text then
    raise exception using errcode = '42501', message = 'INVALID_DOCUMENT_PATH';
  end if;

  insert into public.verification_documents (
    target_type, target_id, document_kind, storage_path, original_filename, mime_type, byte_size, uploaded_by
  ) values (
    document_target, document_target_id, document_type, document_path, filename, content_type, content_size, auth.uid()
  ) returning id into document_id;
  return document_id;
end;
$$;

create or replace function public.invite_clinic_member(
  target_clinic_id uuid,
  invite_email text,
  member_role public.app_role,
  expires_in_days integer default 7
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation_id uuid;
begin
  if not public.can_manage_clinic(target_clinic_id) then
    raise exception using errcode = '42501', message = 'CLINIC_MANAGER_REQUIRED';
  end if;
  if member_role not in ('clinic_manager', 'dentist', 'front_desk')
    or expires_in_days not between 1 and 30 then
    raise exception using errcode = '22023', message = 'INVALID_CLINIC_INVITATION';
  end if;

  update public.clinic_staff_invitations
  set status = 'expired'
  where clinic_id = target_clinic_id and lower(email) = lower(trim(invite_email))
    and role = member_role and status = 'pending' and expires_at <= now();

  insert into public.clinic_staff_invitations (clinic_id, email, role, invited_by, expires_at)
  values (target_clinic_id, lower(trim(invite_email)), member_role, auth.uid(), now() + make_interval(days => expires_in_days))
  returning id into invitation_id;

  return invitation_id;
end;
$$;

create or replace function public.activate_clinic_invitation(target_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_clinic uuid;
  target_email text;
  target_role public.app_role;
  invitation_actor uuid;
  existing_user uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  update public.clinic_staff_invitations
  set delivery_confirmed_at = now()
  where id = target_invitation_id and status = 'pending'
    and delivery_confirmed_at is null and expires_at > now()
  returning clinic_id, email, role, invited_by
  into target_clinic, target_email, target_role, invitation_actor;
  if target_clinic is null then return false; end if;

  select id into existing_user from auth.users
  where lower(email) = lower(target_email) and email_confirmed_at is not null;
  if existing_user is not null then
    insert into public.clinic_memberships (clinic_id, user_id, role, status, invited_by)
    values (target_clinic, existing_user, target_role, 'invited', invitation_actor)
    on conflict (clinic_id, user_id, role) do update
      set status = 'invited', invited_by = excluded.invited_by;
  end if;
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (invitation_actor, 'clinic.member_invited', 'clinic', target_clinic::text,
    jsonb_build_object('role', target_role, 'email', target_email));
  return true;
end;
$$;

create or replace function public.revoke_clinic_invitation_delivery(target_invitation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_clinic uuid;
  target_email text;
  target_role public.app_role;
  invitation_actor uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  update public.clinic_staff_invitations
  set status = 'revoked', revoked_at = now()
  where id = target_invitation_id and status = 'pending' and delivery_confirmed_at is null
  returning clinic_id, email, role, invited_by into target_clinic, target_email, target_role, invitation_actor;
  if target_clinic is null then return false; end if;
  update public.clinic_memberships membership
  set status = 'removed'
  from auth.users invited_user
  where membership.clinic_id = target_clinic and membership.role = target_role
    and membership.user_id = invited_user.id and lower(invited_user.email) = lower(target_email)
    and membership.status = 'invited';
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (invitation_actor, 'clinic.invitation_delivery_failed', 'clinic', target_clinic::text,
    jsonb_build_object('role', target_role, 'email', target_email));
  return true;
end;
$$;

create or replace function public.accept_clinic_membership(target_membership_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  accepted_role public.app_role;
  accepted_clinic uuid;
begin
  update public.clinic_memberships
  set status = 'active', joined_at = now()
  where id = target_membership_id and user_id = auth.uid() and status = 'invited'
  returning role, clinic_id into accepted_role, accepted_clinic;
  if accepted_role is null then return false; end if;

  insert into public.user_roles (user_id, role, granted_by)
  values (auth.uid(), accepted_role, auth.uid())
  on conflict (user_id, role) do nothing;
  update public.clinic_staff_invitations set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
  where clinic_id = accepted_clinic and lower(email) = lower((select email from auth.users where id = auth.uid()))
    and role = accepted_role and status = 'pending';
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'clinic.membership_accepted', 'clinic', accepted_clinic::text, jsonb_build_object('role', accepted_role));
  return true;
end;
$$;

create or replace function public.sync_verified_clinic_invitations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is null then return new; end if;
  insert into public.clinic_memberships (clinic_id, user_id, role, status, invited_by)
  select invitation.clinic_id, new.id, invitation.role, 'invited', invitation.invited_by
  from public.clinic_staff_invitations invitation
  where lower(invitation.email) = lower(coalesce(new.email, ''))
    and invitation.status = 'pending' and invitation.delivery_confirmed_at is not null
    and invitation.expires_at > now()
  on conflict (clinic_id, user_id, role) do update
    set status = 'invited', invited_by = excluded.invited_by;
  return new;
end;
$$;

create trigger on_auth_user_verified_for_clinic
after insert or update of email_confirmed_at on auth.users
for each row execute function public.sync_verified_clinic_invitations();

create or replace function public.decide_clinic_application(
  target_clinic_id uuid,
  review_decision public.verification_decision,
  review_reason text default ''
)
returns public.verification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_status public.verification_status;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if review_decision in ('rejected', 'changes_requested', 'suspended') and char_length(trim(review_reason)) < 5 then
    raise exception using errcode = '22023', message = 'REVIEW_REASON_REQUIRED';
  end if;
  next_status := case review_decision when 'changes_requested' then 'under_review' else review_decision::text::public.verification_status end;

  update public.clinics set status = next_status,
    approved_at = case when next_status = 'approved' then now() else approved_at end,
    approved_by = case when next_status = 'approved' then auth.uid() else approved_by end
  where id = target_clinic_id and status in ('submitted', 'under_review', 'approved', 'suspended')
  returning status into next_status;
  if not found then raise exception using errcode = '22023', message = 'CLINIC_NOT_REVIEWABLE'; end if;

  insert into public.verification_decisions (target_type, target_id, decision, reason, decided_by)
  values ('clinic', target_clinic_id, review_decision, trim(review_reason), auth.uid());
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'clinic.verification_decided', 'clinic', target_clinic_id::text,
    jsonb_build_object('decision', review_decision, 'reason', trim(review_reason)));
  return next_status;
end;
$$;

create or replace function public.decide_dentist_application(
  target_user_id uuid,
  review_decision public.verification_decision,
  review_reason text default ''
)
returns public.verification_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_status public.verification_status;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'ADMIN_REQUIRED';
  end if;
  if review_decision in ('rejected', 'changes_requested', 'suspended') and char_length(trim(review_reason)) < 5 then
    raise exception using errcode = '22023', message = 'REVIEW_REASON_REQUIRED';
  end if;
  next_status := case review_decision when 'changes_requested' then 'under_review' else review_decision::text::public.verification_status end;

  update public.dentist_profiles set status = next_status,
    approved_at = case when next_status = 'approved' then now() else approved_at end,
    approved_by = case when next_status = 'approved' then auth.uid() else approved_by end,
    rejection_reason = case when next_status in ('rejected', 'under_review') then trim(review_reason) else null end
  where user_id = target_user_id and status in ('submitted', 'under_review', 'approved', 'suspended')
  returning status into next_status;
  if not found then raise exception using errcode = '22023', message = 'DENTIST_NOT_REVIEWABLE'; end if;

  if next_status = 'approved' then
    insert into public.user_roles (user_id, role, granted_by)
    values (target_user_id, 'dentist', auth.uid())
    on conflict (user_id, role) do nothing;
  end if;
  insert into public.verification_decisions (target_type, target_id, decision, reason, decided_by)
  values ('dentist', target_user_id, review_decision, trim(review_reason), auth.uid());
  insert into public.audit_logs (actor_id, action, target_type, target_id, metadata)
  values (auth.uid(), 'dentist.verification_decided', 'dentist', target_user_id::text,
    jsonb_build_object('decision', review_decision, 'reason', trim(review_reason)));
  return next_status;
end;
$$;

create or replace function public.upsert_clinic_service(
  service_id uuid,
  target_clinic_id uuid,
  target_dentist_id uuid,
  service_name text,
  service_description text,
  service_duration_minutes integer,
  service_price_bdt numeric,
  service_deposit_bdt numeric,
  service_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare result_id uuid;
begin
  if not public.can_manage_clinic(target_clinic_id)
    and not (target_dentist_id = auth.uid() and public.has_clinic_role(target_clinic_id, array['dentist']::public.app_role[])) then
    raise exception using errcode = '42501', message = 'SERVICE_MANAGEMENT_DENIED';
  end if;
  if target_dentist_id is not null and not exists (
    select 1 from public.clinic_memberships where clinic_id = target_clinic_id and user_id = target_dentist_id
      and role = 'dentist' and status = 'active'
  ) then raise exception using errcode = '22023', message = 'DENTIST_NOT_IN_CLINIC'; end if;

  insert into public.clinic_services (id, clinic_id, dentist_id, name, description, duration_minutes, price_bdt, deposit_bdt, is_active, created_by)
  values (coalesce(service_id, gen_random_uuid()), target_clinic_id, target_dentist_id, trim(service_name), trim(service_description),
    service_duration_minutes, service_price_bdt, service_deposit_bdt, service_active, auth.uid())
  on conflict (id) do update set name = excluded.name, description = excluded.description,
    duration_minutes = excluded.duration_minutes, price_bdt = excluded.price_bdt,
    deposit_bdt = excluded.deposit_bdt, is_active = excluded.is_active
  where public.clinic_services.clinic_id = target_clinic_id
  returning id into result_id;
  if result_id is null then raise exception using errcode = '42501', message = 'SERVICE_UPDATE_DENIED'; end if;
  return result_id;
end;
$$;

create or replace function public.upsert_weekly_schedule_block(
  block_id uuid,
  target_clinic_id uuid,
  target_dentist_id uuid,
  weekday smallint,
  local_start time,
  local_end time,
  schedule_timezone text default 'Asia/Dhaka',
  active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare result_id uuid;
begin
  if not public.can_manage_clinic(target_clinic_id)
    and not (target_dentist_id = auth.uid() and public.has_clinic_role(target_clinic_id, array['dentist']::public.app_role[])) then
    raise exception using errcode = '42501', message = 'SCHEDULE_MANAGEMENT_DENIED';
  end if;
  if weekday not between 0 and 6 or local_start >= local_end then
    raise exception using errcode = '22023', message = 'INVALID_SCHEDULE_BLOCK';
  end if;
  if not exists (select 1 from pg_timezone_names where name = schedule_timezone) then
    raise exception using errcode = '22023', message = 'INVALID_TIMEZONE';
  end if;
  if not exists (
    select 1 from public.clinic_memberships where clinic_id = target_clinic_id and user_id = target_dentist_id
      and role = 'dentist' and status = 'active'
  ) then raise exception using errcode = '22023', message = 'DENTIST_NOT_IN_CLINIC'; end if;

  insert into public.weekly_schedule_blocks (id, clinic_id, dentist_id, day_of_week, start_time, end_time, timezone, is_active, created_by)
  values (coalesce(block_id, gen_random_uuid()), target_clinic_id, target_dentist_id, weekday, local_start, local_end, schedule_timezone, active, auth.uid())
  on conflict (id) do update set day_of_week = excluded.day_of_week, start_time = excluded.start_time,
    end_time = excluded.end_time, timezone = excluded.timezone, is_active = excluded.is_active
  where public.weekly_schedule_blocks.clinic_id = target_clinic_id and public.weekly_schedule_blocks.dentist_id = target_dentist_id
  returning id into result_id;
  if result_id is null then raise exception using errcode = '42501', message = 'SCHEDULE_UPDATE_DENIED'; end if;
  return result_id;
end;
$$;

create or replace function public.add_weekly_schedule_break(
  target_schedule_block_id uuid,
  local_start time,
  local_end time,
  break_label text default 'Break'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_clinic_id uuid;
  target_dentist_id uuid;
  block_start time;
  block_end time;
  result_id uuid;
begin
  select clinic_id, dentist_id, start_time, end_time
  into target_clinic_id, target_dentist_id, block_start, block_end
  from public.weekly_schedule_blocks where id = target_schedule_block_id;
  if not public.can_manage_clinic(target_clinic_id)
    and not (target_dentist_id = auth.uid() and public.has_clinic_role(target_clinic_id, array['dentist']::public.app_role[])) then
    raise exception using errcode = '42501', message = 'SCHEDULE_MANAGEMENT_DENIED';
  end if;
  if local_start < block_start or local_end > block_end or local_start >= local_end then
    raise exception using errcode = '22023', message = 'BREAK_OUTSIDE_SCHEDULE';
  end if;
  insert into public.weekly_schedule_breaks (schedule_block_id, start_time, end_time, label, created_by)
  values (target_schedule_block_id, local_start, local_end, trim(break_label), auth.uid())
  returning id into result_id;
  return result_id;
end;
$$;

create or replace function public.add_schedule_exception(
  target_clinic_id uuid,
  target_dentist_id uuid,
  target_date date,
  exception_kind public.schedule_exception_kind,
  local_start time default null,
  local_end time default null,
  exception_reason text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare result_id uuid;
begin
  if not public.can_manage_clinic(target_clinic_id)
    and not (target_dentist_id = auth.uid() and public.has_clinic_role(target_clinic_id, array['dentist']::public.app_role[])) then
    raise exception using errcode = '42501', message = 'SCHEDULE_MANAGEMENT_DENIED';
  end if;
  if target_date < current_date or (local_start is null) <> (local_end is null)
    or (local_start is not null and local_start >= local_end)
    or (exception_kind = 'clinic_closed' and target_dentist_id is not null) then
    raise exception using errcode = '22023', message = 'INVALID_SCHEDULE_EXCEPTION';
  end if;
  insert into public.schedule_exceptions (clinic_id, dentist_id, exception_date, kind, start_time, end_time, reason, created_by)
  values (target_clinic_id, target_dentist_id, target_date, exception_kind, local_start, local_end, trim(exception_reason), auth.uid())
  returning id into result_id;
  return result_id;
end;
$$;

create or replace function public.available_clinic_slots(
  target_clinic_id uuid,
  target_dentist_id uuid,
  target_service_id uuid,
  from_date date,
  through_date date
)
returns table (slot_date date, start_at timestamptz, end_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with service as (
    select duration_minutes
    from public.clinic_services
    where id = target_service_id and clinic_id = target_clinic_id and is_active
      and (dentist_id is null or dentist_id = target_dentist_id)
  ), eligible as (
    select 1
    from public.clinics c
    join public.dentist_profiles d on d.user_id = target_dentist_id and d.status = 'approved'
    join public.clinic_memberships m on m.clinic_id = c.id and m.user_id = d.user_id
      and m.role = 'dentist' and m.status = 'active'
    where c.id = target_clinic_id and c.status = 'approved'
      and from_date between current_date and current_date + 180
      and through_date between from_date and from_date + 31
  ), dates as (
    select generate_series(from_date, through_date, interval '1 day')::date as slot_date
    from eligible
  ), windows as (
    select d.slot_date, b.id as block_id, b.start_time, b.end_time, b.timezone
    from dates d
    join public.weekly_schedule_blocks b on b.clinic_id = target_clinic_id
      and b.dentist_id = target_dentist_id and b.is_active
      and b.day_of_week = extract(dow from d.slot_date)::integer
    where not exists (
      select 1 from public.schedule_exceptions e
      where e.clinic_id = target_clinic_id and e.exception_date = d.slot_date
        and e.kind in ('clinic_closed', 'unavailable') and e.start_time is null
        and (e.dentist_id is null or e.dentist_id = target_dentist_id)
    )
    union all
    select d.slot_date, null::uuid, e.start_time, e.end_time, c.timezone
    from dates d
    join public.schedule_exceptions e on e.clinic_id = target_clinic_id and e.exception_date = d.slot_date
      and e.kind = 'available' and e.start_time is not null
      and e.dentist_id = target_dentist_id
    join public.clinics c on c.id = e.clinic_id
  ), local_slots as (
    select w.slot_date, w.block_id, w.timezone,
      generated_start.local_start::timestamp without time zone as local_start,
      (generated_start.local_start + make_interval(mins => s.duration_minutes))::timestamp without time zone as local_end
    from windows w cross join service s
    cross join lateral generate_series(
      w.slot_date + w.start_time,
      w.slot_date + w.end_time - make_interval(mins => s.duration_minutes),
      make_interval(mins => s.duration_minutes)
    ) generated_start(local_start)
  )
  select distinct l.slot_date,
    l.local_start at time zone l.timezone as start_at,
    l.local_end at time zone l.timezone as end_at
  from local_slots l
  where l.local_end > l.local_start
    and (l.local_start at time zone l.timezone) > now()
    and not exists (
      select 1 from public.weekly_schedule_breaks b
      where b.schedule_block_id = l.block_id
        and tsrange(l.slot_date + b.start_time, l.slot_date + b.end_time, '[)')
          && tsrange(l.local_start, l.local_end, '[)')
    )
    and not exists (
      select 1 from public.schedule_exceptions e
      where e.clinic_id = target_clinic_id and e.exception_date = l.slot_date
        and e.kind in ('clinic_closed', 'unavailable')
        and (e.dentist_id is null or e.dentist_id = target_dentist_id)
        and (e.start_time is null or tsrange(l.slot_date + e.start_time, l.slot_date + e.end_time, '[)')
          && tsrange(l.local_start, l.local_end, '[)'))
    )
  order by start_at;
$$;

alter table public.clinics enable row level security;
alter table public.clinic_memberships enable row level security;
alter table public.clinic_staff_invitations enable row level security;
alter table public.dentist_profiles enable row level security;
alter table public.verification_documents enable row level security;
alter table public.verification_decisions enable row level security;
alter table public.clinic_services enable row level security;
alter table public.weekly_schedule_blocks enable row level security;
alter table public.weekly_schedule_breaks enable row level security;
alter table public.schedule_exceptions enable row level security;

create policy clinics_read_approved_member_or_admin on public.clinics for select to authenticated
using (status = 'approved' or created_by = (select auth.uid())
  or (select public.is_admin()) or (select public.has_clinic_role(id, array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[])));
create policy memberships_read_scoped on public.clinic_memberships for select to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()) or (select public.can_manage_clinic(clinic_id)));
create policy clinic_invitations_read_scoped on public.clinic_staff_invitations for select to authenticated
using ((select public.is_admin()) or (select public.can_manage_clinic(clinic_id))
  or lower(email) = lower(coalesce((select email from auth.users where id = (select auth.uid())), '')));
create policy dentist_profiles_read_approved_self_or_admin on public.dentist_profiles for select to authenticated
using (status = 'approved' or user_id = (select auth.uid()) or (select public.is_admin()));
create policy verification_documents_read_owner_or_admin on public.verification_documents for select to authenticated
using ((select public.is_admin()) or uploaded_by = (select auth.uid())
  or (target_type = 'clinic' and (select public.can_manage_clinic(target_id))));
create policy verification_decisions_read_scoped on public.verification_decisions for select to authenticated
using ((select public.is_admin()) or (target_type = 'dentist' and target_id = (select auth.uid()))
  or (target_type = 'clinic' and (select public.can_manage_clinic(target_id))));
create policy clinic_services_read_visible on public.clinic_services for select to authenticated
using ((select public.is_admin()) or (select public.can_manage_clinic(clinic_id))
  or exists (select 1 from public.clinics where id = clinic_id and status = 'approved'));
create policy weekly_blocks_read_visible on public.weekly_schedule_blocks for select to authenticated
using ((select public.is_admin()) or (select public.has_clinic_role(clinic_id, array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[]))
  or exists (select 1 from public.clinics where id = clinic_id and status = 'approved'));
create policy weekly_breaks_read_visible on public.weekly_schedule_breaks for select to authenticated
using (exists (select 1 from public.weekly_schedule_blocks b where b.id = schedule_block_id));
create policy schedule_exceptions_read_visible on public.schedule_exceptions for select to authenticated
using ((select public.is_admin()) or (select public.has_clinic_role(clinic_id, array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[]))
  or exists (select 1 from public.clinics where id = clinic_id and status = 'approved'));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('verification-documents', 'verification-documents', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy verification_upload_own_folder on storage.objects for insert to authenticated
with check (bucket_id = 'verification-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy verification_read_owner_or_admin on storage.objects for select to authenticated
using (bucket_id = 'verification-documents' and (
  (storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin())
));
create policy verification_delete_own_unreviewed on storage.objects for delete to authenticated
using (bucket_id = 'verification-documents' and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (select 1 from public.verification_documents d where d.storage_path = name));

revoke all on table public.clinics, public.clinic_memberships, public.clinic_staff_invitations,
  public.dentist_profiles, public.verification_documents, public.verification_decisions,
  public.clinic_services, public.weekly_schedule_blocks, public.weekly_schedule_breaks,
  public.schedule_exceptions from anon, authenticated;
grant select on table public.clinics, public.clinic_memberships, public.clinic_staff_invitations,
  public.dentist_profiles, public.verification_documents, public.verification_decisions,
  public.clinic_services, public.weekly_schedule_blocks, public.weekly_schedule_breaks,
  public.schedule_exceptions to authenticated;

revoke all on function public.has_clinic_role(uuid, public.app_role[]), public.can_manage_clinic(uuid),
  public.is_verified_dentist(uuid), public.unique_clinic_slug(text),
  public.create_clinic_application(text,text,text,text,text,text,text,double precision,double precision),
  public.submit_dentist_application(text,text,text,text[],text[],text,integer),
  public.register_verification_document(public.verification_target,uuid,text,text,text,text,bigint),
  public.invite_clinic_member(uuid,text,public.app_role,integer), public.activate_clinic_invitation(uuid),
  public.revoke_clinic_invitation_delivery(uuid), public.accept_clinic_membership(uuid),
  public.decide_clinic_application(uuid,public.verification_decision,text),
  public.decide_dentist_application(uuid,public.verification_decision,text),
  public.upsert_clinic_service(uuid,uuid,uuid,text,text,integer,numeric,numeric,boolean),
  public.upsert_weekly_schedule_block(uuid,uuid,uuid,smallint,time,time,text,boolean),
  public.add_weekly_schedule_break(uuid,time,time,text),
  public.add_schedule_exception(uuid,uuid,date,public.schedule_exception_kind,time,time,text),
  public.available_clinic_slots(uuid,uuid,uuid,date,date), public.sync_verified_clinic_invitations()
  from public, anon, authenticated;

grant execute on function public.has_clinic_role(uuid, public.app_role[]), public.can_manage_clinic(uuid),
  public.is_verified_dentist(uuid),
  public.create_clinic_application(text,text,text,text,text,text,text,double precision,double precision),
  public.submit_dentist_application(text,text,text,text[],text[],text,integer),
  public.register_verification_document(public.verification_target,uuid,text,text,text,text,bigint),
  public.invite_clinic_member(uuid,text,public.app_role,integer), public.accept_clinic_membership(uuid),
  public.upsert_clinic_service(uuid,uuid,uuid,text,text,integer,numeric,numeric,boolean),
  public.upsert_weekly_schedule_block(uuid,uuid,uuid,smallint,time,time,text,boolean),
  public.add_weekly_schedule_break(uuid,time,time,text),
  public.add_schedule_exception(uuid,uuid,date,public.schedule_exception_kind,time,time,text),
  public.available_clinic_slots(uuid,uuid,uuid,date,date)
  to authenticated;
grant execute on function public.decide_clinic_application(uuid,public.verification_decision,text),
  public.decide_dentist_application(uuid,public.verification_decision,text) to authenticated;
grant execute on function public.activate_clinic_invitation(uuid),
  public.revoke_clinic_invitation_delivery(uuid) to service_role;

revoke all on function public.unique_clinic_slug(text) from public, anon, authenticated;
revoke all on function public.sync_verified_clinic_invitations() from public, anon, authenticated;

commit;
