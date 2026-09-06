begin;

create extension if not exists btree_gist with schema extensions;
set local search_path = public, extensions;

create type public.patient_relationship as enum ('self', 'child', 'spouse', 'parent', 'sibling', 'other');
create type public.appointment_status as enum ('confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show');
create type public.appointment_hold_status as enum ('held', 'consumed', 'expired', 'released');
create type public.deposit_disposition as enum ('refundable', 'transferable', 'forfeited');
create type public.payment_status as enum ('pending', 'succeeded', 'failed', 'refunded', 'partially_refunded');
create type public.waitlist_status as enum ('waiting', 'offered', 'booked', 'expired', 'withdrawn');
create type public.notification_channel as enum ('push', 'email', 'sms', 'in_app');
create type public.notification_status as enum ('queued', 'processing', 'sent', 'failed', 'cancelled');

create table public.patient_profiles (
  id uuid primary key default gen_random_uuid(),
  account_owner_id uuid not null references auth.users(id) on delete cascade,
  relationship public.patient_relationship not null,
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  date_of_birth date,
  gender text check (gender in ('female', 'male', 'non_binary', 'prefer_not_to_say')),
  phone text not null default '' check (phone = '' or char_length(trim(phone)) between 7 and 24),
  city text not null default '' check (char_length(city) <= 80),
  district text not null default '' check (char_length(district) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index one_self_patient_profile_per_account
  on public.patient_profiles (account_owner_id)
  where relationship = 'self';
create index patient_profiles_owner_idx on public.patient_profiles (account_owner_id, created_at);

create table public.appointment_holds (
  id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid not null references public.patient_profiles(id) on delete restrict,
  booked_by uuid not null references auth.users(id) on delete restrict,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  dentist_id uuid not null references auth.users(id) on delete restrict,
  service_id uuid not null references public.clinic_services(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 10 and 480),
  price_bdt numeric(12,2) not null check (price_bdt >= 0),
  deposit_bdt numeric(12,2) not null check (deposit_bdt between 0 and price_bdt),
  status public.appointment_hold_status not null default 'held',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_at > start_at),
  check (expires_at > created_at)
);

alter table public.appointment_holds add constraint no_overlapping_active_holds
  exclude using gist (
    dentist_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status = 'held');
create index appointment_holds_owner_idx on public.appointment_holds (booked_by, status, expires_at);
create index appointment_holds_expiry_idx on public.appointment_holds (expires_at) where status = 'held';

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid not null references public.patient_profiles(id) on delete restrict,
  booked_by uuid not null references auth.users(id) on delete restrict,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  dentist_id uuid not null references auth.users(id) on delete restrict,
  service_id uuid not null references public.clinic_services(id) on delete restrict,
  source_hold_id uuid unique references public.appointment_holds(id) on delete restrict,
  start_at timestamptz not null,
  end_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 10 and 480),
  price_bdt numeric(12,2) not null check (price_bdt >= 0),
  deposit_bdt numeric(12,2) not null check (deposit_bdt between 0 and price_bdt),
  status public.appointment_status not null default 'confirmed',
  cancellation_disposition public.deposit_disposition,
  cancellation_reason text check (char_length(cancellation_reason) <= 500),
  cancelled_at timestamptz,
  checked_in_at timestamptz,
  completed_at timestamptz,
  no_show_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_at > start_at)
);

alter table public.appointments add constraint no_overlapping_appointments
  exclude using gist (
    dentist_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (status in ('confirmed', 'checked_in', 'in_progress'));
create index appointments_patient_idx on public.appointments (patient_profile_id, start_at desc);
create index appointments_clinic_schedule_idx on public.appointments (clinic_id, start_at, status);
create index appointments_dentist_schedule_idx on public.appointments (dentist_id, start_at, status);

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete restrict,
  provider text not null check (provider in ('mock', 'bkash', 'nagad')),
  provider_reference text not null,
  idempotency_key text not null unique,
  kind text not null check (kind in ('deposit', 'refund')),
  amount_bdt numeric(12,2) not null check (amount_bdt >= 0),
  status public.payment_status not null,
  receipt_number text not null unique,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payment_transactions_appointment_idx on public.payment_transactions (appointment_id, created_at);

create table public.appointment_events (
  id bigint generated always as identity primary key,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  from_status public.appointment_status,
  to_status public.appointment_status,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index appointment_events_timeline_idx on public.appointment_events (appointment_id, created_at);

create table public.appointment_checkin_tokens (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index checkin_tokens_appointment_idx on public.appointment_checkin_tokens (appointment_id, expires_at desc);

create table public.waitlist_entries (
  id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid not null references public.patient_profiles(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  dentist_id uuid references auth.users(id) on delete cascade,
  service_id uuid not null references public.clinic_services(id) on delete cascade,
  preferred_date date not null,
  earliest_time time,
  latest_time time,
  status public.waitlist_status not null default 'waiting',
  offered_start_at timestamptz,
  offer_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((earliest_time is null) = (latest_time is null)),
  check (earliest_time is null or earliest_time < latest_time)
);
create index waitlist_order_idx on public.waitlist_entries (clinic_id, service_id, preferred_date, created_at) where status = 'waiting';

create table public.appointment_reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null unique references public.appointments(id) on delete restrict,
  patient_profile_id uuid not null references public.patient_profiles(id) on delete restrict,
  clinic_id uuid not null references public.clinics(id) on delete restrict,
  dentist_id uuid not null references auth.users(id) on delete restrict,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 1200),
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index reviews_dentist_idx on public.appointment_reviews (dentist_id, is_visible, created_at desc);
create index reviews_clinic_idx on public.appointment_reviews (clinic_id, is_visible, created_at desc);

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  patient_profile_id uuid not null references public.patient_profiles(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  last_message_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index one_chat_thread_per_context on public.chat_threads (patient_profile_id, clinic_id, appointment_id) nulls not distinct;

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index chat_messages_thread_idx on public.chat_messages (thread_id, created_at);

create table public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  channel public.notification_channel not null,
  template_key text not null check (template_key ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  idempotency_key text not null unique,
  status public.notification_status not null default 'queued',
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notification_outbox_delivery_idx on public.notification_outbox (status, next_attempt_at) where status in ('queued', 'failed');

create trigger patient_profiles_touch_updated_at before update on public.patient_profiles for each row execute function public.touch_updated_at();
create trigger appointments_touch_updated_at before update on public.appointments for each row execute function public.touch_updated_at();
create trigger payments_touch_updated_at before update on public.payment_transactions for each row execute function public.touch_updated_at();
create trigger waitlist_touch_updated_at before update on public.waitlist_entries for each row execute function public.touch_updated_at();
create trigger reviews_touch_updated_at before update on public.appointment_reviews for each row execute function public.touch_updated_at();
create trigger notifications_touch_updated_at before update on public.notification_outbox for each row execute function public.touch_updated_at();

create or replace function public.owns_patient_profile(target_patient_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.patient_profiles
    where id = target_patient_profile_id and account_owner_id = auth.uid()
  );
$$;

create or replace function public.can_operate_appointment(target_appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_admin() or exists (
    select 1 from public.appointments a
    where a.id = target_appointment_id and (
      a.booked_by = auth.uid()
      or public.has_clinic_role(a.clinic_id, array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[])
    )
  );
$$;

create or replace function public.upsert_patient_profile(
  patient_profile_id uuid,
  patient_relationship public.patient_relationship,
  patient_full_name text,
  patient_date_of_birth date default null,
  patient_gender text default null,
  patient_phone text default '',
  patient_city text default '',
  patient_district text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare result_id uuid;
begin
  if auth.uid() is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
  if patient_profile_id is not null and not public.owns_patient_profile(patient_profile_id) then
    raise exception using errcode = '42501', message = 'PATIENT_PROFILE_DENIED';
  end if;
  if char_length(trim(patient_full_name)) not between 2 and 120
    or (patient_date_of_birth is not null and patient_date_of_birth > current_date) then
    raise exception using errcode = '22023', message = 'INVALID_PATIENT_PROFILE';
  end if;
  insert into public.patient_profiles (id, account_owner_id, relationship, full_name, date_of_birth, gender, phone, city, district)
  values (coalesce(patient_profile_id, gen_random_uuid()), auth.uid(), patient_relationship, trim(patient_full_name), patient_date_of_birth,
    patient_gender, trim(patient_phone), trim(patient_city), trim(patient_district))
  on conflict (id) do update set relationship = excluded.relationship, full_name = excluded.full_name,
    date_of_birth = excluded.date_of_birth, gender = excluded.gender, phone = excluded.phone,
    city = excluded.city, district = excluded.district
  returning id into result_id;
  perform public.write_audit('patient_profile.saved', 'patient_profile', result_id::text, jsonb_build_object('relationship', patient_relationship));
  return result_id;
exception when unique_violation then
  raise exception using errcode = '23505', message = 'SELF_PROFILE_ALREADY_EXISTS';
end;
$$;

create or replace function public.search_marketplace(
  search_text text default '',
  specialty_filter text default '',
  gender_filter text default null,
  language_filter text default null,
  max_price_bdt numeric default null,
  minimum_rating numeric default 0,
  search_latitude double precision default null,
  search_longitude double precision default null,
  radius_km numeric default 50
)
returns table (
  dentist_id uuid, clinic_id uuid, clinic_name text, dentist_name text, professional_title text,
  specialties text[], languages text[], gender text, years_experience integer,
  service_id uuid, service_name text, duration_minutes integer, price_bdt numeric, deposit_bdt numeric,
  rating numeric, review_count bigint, distance_km numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with reviews as (
    select r.dentist_id, avg(r.rating)::numeric(3,2) as rating, count(*) as review_count
    from public.appointment_reviews r where r.is_visible group by r.dentist_id
  )
  select d.user_id, c.id, c.name, p.full_name, d.professional_title, d.specialties, d.languages,
    d.gender, d.years_experience, s.id, s.name, s.duration_minutes, s.price_bdt, s.deposit_bdt,
    coalesce(r.rating, 0), coalesce(r.review_count, 0),
    case when c.location is not null and search_latitude is not null and search_longitude is not null
      then round((extensions.st_distance(c.location, extensions.st_setsrid(extensions.st_makepoint(search_longitude, search_latitude), 4326)::extensions.geography) / 1000)::numeric, 2)
      else null end
  from public.dentist_profiles d
  join public.profiles p on p.id = d.user_id
  join public.clinic_memberships m on m.user_id = d.user_id and m.role = 'dentist' and m.status = 'active'
  join public.clinics c on c.id = m.clinic_id and c.status = 'approved'
  join public.clinic_services s on s.clinic_id = c.id and s.is_active and (s.dentist_id is null or s.dentist_id = d.user_id)
  left join reviews r on r.dentist_id = d.user_id
  where d.status = 'approved'
    and (trim(search_text) = '' or p.full_name ilike '%' || trim(search_text) || '%' or c.name ilike '%' || trim(search_text) || '%')
    and (trim(specialty_filter) = '' or exists (select 1 from unnest(d.specialties) as specialty(value) where specialty.value ilike trim(specialty_filter)))
    and (gender_filter is null or d.gender = gender_filter)
    and (language_filter is null or language_filter = any(d.languages))
    and (max_price_bdt is null or s.price_bdt <= max_price_bdt)
    and coalesce(r.rating, 0) >= minimum_rating
    and (search_latitude is null or search_longitude is null or c.location is null
      or extensions.st_dwithin(c.location, extensions.st_setsrid(extensions.st_makepoint(search_longitude, search_latitude), 4326)::extensions.geography, radius_km * 1000))
  order by coalesce(r.rating, 0) desc, coalesce(r.review_count, 0) desc, c.name, p.full_name;
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
    select duration_minutes from public.clinic_services
    where id = target_service_id and clinic_id = target_clinic_id and is_active
      and (dentist_id is null or dentist_id = target_dentist_id)
  ), eligible as (
    select 1 from public.clinics c
    join public.dentist_profiles d on d.user_id = target_dentist_id and d.status = 'approved'
    join public.clinic_memberships m on m.clinic_id = c.id and m.user_id = d.user_id and m.role = 'dentist' and m.status = 'active'
    where c.id = target_clinic_id and c.status = 'approved'
      and from_date between current_date and current_date + 180
      and through_date between from_date and from_date + 31
  ), dates as (
    select generate_series(from_date, through_date, interval '1 day')::date as slot_date from eligible
  ), windows as (
    select d.slot_date, b.id as block_id, b.start_time, b.end_time, b.timezone
    from dates d join public.weekly_schedule_blocks b on b.clinic_id = target_clinic_id
      and b.dentist_id = target_dentist_id and b.is_active and b.day_of_week = extract(dow from d.slot_date)::integer
    where not exists (
      select 1 from public.schedule_exceptions e where e.clinic_id = target_clinic_id and e.exception_date = d.slot_date
        and e.kind in ('clinic_closed', 'unavailable') and e.start_time is null
        and (e.dentist_id is null or e.dentist_id = target_dentist_id)
    )
    union all
    select d.slot_date, null::uuid, e.start_time, e.end_time, c.timezone
    from dates d join public.schedule_exceptions e on e.clinic_id = target_clinic_id and e.exception_date = d.slot_date
      and e.kind = 'available' and e.start_time is not null and e.dentist_id = target_dentist_id
    join public.clinics c on c.id = e.clinic_id
  ), local_slots as (
    select w.slot_date, w.block_id, w.timezone,
      generated_start.local_start::timestamp without time zone as local_start,
      (generated_start.local_start + make_interval(mins => s.duration_minutes))::timestamp without time zone as local_end
    from windows w cross join service s
    cross join lateral generate_series(w.slot_date + w.start_time, w.slot_date + w.end_time - make_interval(mins => s.duration_minutes), make_interval(mins => s.duration_minutes)) generated_start(local_start)
  ), candidates as (
    select distinct l.slot_date, l.local_start at time zone l.timezone as start_at, l.local_end at time zone l.timezone as end_at
    from local_slots l where l.local_end > l.local_start and (l.local_start at time zone l.timezone) > now()
      and not exists (
        select 1 from public.weekly_schedule_breaks b where b.schedule_block_id = l.block_id
          and tsrange(l.slot_date + b.start_time, l.slot_date + b.end_time, '[)') && tsrange(l.local_start, l.local_end, '[)')
      )
      and not exists (
        select 1 from public.schedule_exceptions e where e.clinic_id = target_clinic_id and e.exception_date = l.slot_date
          and e.kind in ('clinic_closed', 'unavailable') and (e.dentist_id is null or e.dentist_id = target_dentist_id)
          and (e.start_time is null or tsrange(l.slot_date + e.start_time, l.slot_date + e.end_time, '[)') && tsrange(l.local_start, l.local_end, '[)'))
      )
  )
  select c.slot_date, c.start_at, c.end_at from candidates c
  where not exists (
    select 1 from public.appointments a where a.dentist_id = target_dentist_id
      and a.status in ('confirmed','checked_in','in_progress') and tstzrange(a.start_at, a.end_at, '[)') && tstzrange(c.start_at, c.end_at, '[)')
  ) and not exists (
    select 1 from public.appointment_holds h where h.dentist_id = target_dentist_id and h.status = 'held' and h.expires_at > now()
      and tstzrange(h.start_at, h.end_at, '[)') && tstzrange(c.start_at, c.end_at, '[)')
  ) order by c.start_at;
$$;

create or replace function public.create_appointment_hold(
  target_patient_profile_id uuid,
  target_service_id uuid,
  target_dentist_id uuid,
  requested_start_at timestamptz
)
returns table (hold_id uuid, expires_at timestamptz, end_at timestamptz, price_bdt numeric, deposit_bdt numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare service_record record; calculated_end timestamptz; result_id uuid; result_expiry timestamptz := clock_timestamp() + interval '10 minutes';
begin
  if auth.uid() is null or not public.owns_patient_profile(target_patient_profile_id) then
    raise exception using errcode = '42501', message = 'PATIENT_PROFILE_DENIED';
  end if;
  select s.clinic_id, s.duration_minutes, s.price_bdt, s.deposit_bdt into service_record
  from public.clinic_services s
  join public.clinics c on c.id = s.clinic_id and c.status = 'approved'
  join public.dentist_profiles d on d.user_id = target_dentist_id and d.status = 'approved'
  join public.clinic_memberships m on m.clinic_id = s.clinic_id and m.user_id = target_dentist_id and m.role = 'dentist' and m.status = 'active'
  where s.id = target_service_id and s.is_active and (s.dentist_id is null or s.dentist_id = target_dentist_id);
  if not found then raise exception using errcode = '22023', message = 'SERVICE_NOT_BOOKABLE'; end if;
  if requested_start_at <= clock_timestamp() then raise exception using errcode = '22023', message = 'SLOT_IN_PAST'; end if;
  calculated_end := requested_start_at + make_interval(mins => service_record.duration_minutes);
  perform pg_advisory_xact_lock(hashtextextended(target_dentist_id::text || ':' || requested_start_at::text, 0));
  update public.appointment_holds h set status = 'expired' where h.status = 'held' and h.expires_at <= clock_timestamp();
  if not exists (
    select 1 from public.available_clinic_slots(service_record.clinic_id, target_dentist_id, target_service_id,
      (requested_start_at at time zone 'Asia/Dhaka')::date, (requested_start_at at time zone 'Asia/Dhaka')::date) slot
    where slot.start_at = requested_start_at and slot.end_at = calculated_end
  ) then raise exception using errcode = '23P01', message = 'SLOT_UNAVAILABLE'; end if;
  insert into public.appointment_holds (patient_profile_id, booked_by, clinic_id, dentist_id, service_id, start_at, end_at,
    duration_minutes, price_bdt, deposit_bdt, expires_at)
  values (target_patient_profile_id, auth.uid(), service_record.clinic_id, target_dentist_id, target_service_id, requested_start_at,
    calculated_end, service_record.duration_minutes, service_record.price_bdt, service_record.deposit_bdt, result_expiry)
  returning id into result_id;
  perform public.write_audit('appointment.hold_created', 'appointment_hold', result_id::text, jsonb_build_object('expires_at', result_expiry));
  return query select result_id, result_expiry, calculated_end, service_record.price_bdt, service_record.deposit_bdt;
exception when exclusion_violation then
  raise exception using errcode = '23P01', message = 'SLOT_UNAVAILABLE';
end;
$$;

create or replace function public.confirm_mock_appointment(target_hold_id uuid, request_id text)
returns table (appointment_id uuid, receipt_number text, appointment_status public.appointment_status)
language plpgsql
security definer
set search_path = ''
as $$
declare hold_record public.appointment_holds%rowtype; result_id uuid; result_receipt text;
begin
  if auth.uid() is null or char_length(trim(request_id)) < 8 then raise exception using errcode = '22023', message = 'INVALID_CONFIRMATION_REQUEST'; end if;
  select * into hold_record from public.appointment_holds where id = target_hold_id and booked_by = auth.uid() for update;
  if not found then raise exception using errcode = '42501', message = 'HOLD_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(hold_record.dentist_id::text || ':' || hold_record.start_at::text, 0));
  select a.id, p.receipt_number into result_id, result_receipt
  from public.payment_transactions p join public.appointments a on a.id = p.appointment_id
  where p.idempotency_key = trim(request_id) and a.source_hold_id = target_hold_id;
  if found then return query select result_id, result_receipt, 'confirmed'::public.appointment_status; return; end if;
  if exists (select 1 from public.payment_transactions p where p.idempotency_key = trim(request_id)) then
    raise exception using errcode = '22023', message = 'IDEMPOTENCY_KEY_REUSED';
  end if;
  if hold_record.status <> 'held' or hold_record.expires_at <= clock_timestamp() then
    update public.appointment_holds set status = 'expired' where id = target_hold_id and status = 'held';
    raise exception using errcode = '22023', message = 'HOLD_EXPIRED';
  end if;
  insert into public.appointments (patient_profile_id, booked_by, clinic_id, dentist_id, service_id, source_hold_id,
    start_at, end_at, duration_minutes, price_bdt, deposit_bdt)
  values (hold_record.patient_profile_id, auth.uid(), hold_record.clinic_id, hold_record.dentist_id, hold_record.service_id,
    hold_record.id, hold_record.start_at, hold_record.end_at, hold_record.duration_minutes, hold_record.price_bdt, hold_record.deposit_bdt)
  returning id into result_id;
  result_receipt := 'AMR-' || upper(substr(replace(result_id::text, '-', ''), 1, 12));
  insert into public.payment_transactions (appointment_id, provider, provider_reference, idempotency_key, kind, amount_bdt, status, receipt_number, confirmed_at)
  values (result_id, 'mock', result_id::text, trim(request_id), 'deposit', hold_record.deposit_bdt, 'succeeded', result_receipt, clock_timestamp());
  update public.appointment_holds set status = 'consumed', consumed_at = clock_timestamp() where id = hold_record.id;
  insert into public.appointment_events (appointment_id, actor_id, event_type, to_status) values (result_id, auth.uid(), 'booking.confirmed', 'confirmed');
  insert into public.notification_outbox (recipient_id, channel, template_key, payload, idempotency_key)
  values (auth.uid(), 'in_app', 'appointment.confirmed', jsonb_build_object('appointment_id', result_id), 'appointment-confirmed:' || result_id::text);
  perform public.write_audit('appointment.confirmed_mock', 'appointment', result_id::text, jsonb_build_object('hold_id', hold_record.id));
  return query select result_id, result_receipt, 'confirmed'::public.appointment_status;
exception when exclusion_violation then
  raise exception using errcode = '23P01', message = 'SLOT_UNAVAILABLE';
end;
$$;

create or replace function public.release_appointment_hold(target_hold_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.appointment_holds set status = 'released', released_at = clock_timestamp()
  where id = target_hold_id and booked_by = auth.uid() and status = 'held';
  if not found then raise exception using errcode = '42501', message = 'ACTIVE_HOLD_NOT_FOUND'; end if;
end;
$$;

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

create or replace function public.mark_appointment_no_show(target_appointment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare appointment_record public.appointments%rowtype;
begin
  select * into appointment_record from public.appointments where id = target_appointment_id for update;
  if not found or not (public.is_admin() or public.has_clinic_role(appointment_record.clinic_id, array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[])) then
    raise exception using errcode = '42501', message = 'APPOINTMENT_OPERATION_DENIED';
  end if;
  if appointment_record.status <> 'confirmed' or clock_timestamp() < appointment_record.start_at + interval '15 minutes' then
    raise exception using errcode = '22023', message = 'NO_SHOW_NOT_AVAILABLE';
  end if;
  update public.appointments set status = 'no_show', cancellation_disposition = 'forfeited', no_show_at = clock_timestamp() where id = target_appointment_id;
  insert into public.appointment_events (appointment_id, actor_id, event_type, from_status, to_status)
  values (target_appointment_id, auth.uid(), 'appointment.no_show', 'confirmed', 'no_show');
  perform public.write_audit('appointment.no_show', 'appointment', target_appointment_id::text, '{}'::jsonb);
end;
$$;

create or replace function public.issue_checkin_token(target_appointment_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare raw_token text := encode(extensions.gen_random_bytes(32), 'hex'); appointment_record public.appointments%rowtype;
begin
  select * into appointment_record from public.appointments where id = target_appointment_id;
  if not found or appointment_record.booked_by <> auth.uid() or appointment_record.status <> 'confirmed'
    or appointment_record.end_at <= clock_timestamp() then
    raise exception using errcode = '42501', message = 'CHECKIN_TOKEN_DENIED';
  end if;
  delete from public.appointment_checkin_tokens where appointment_id = target_appointment_id and used_at is null;
  insert into public.appointment_checkin_tokens (appointment_id, token_hash, expires_at, created_by)
  values (target_appointment_id, encode(extensions.digest(raw_token, 'sha256'), 'hex'), least(appointment_record.end_at, clock_timestamp() + interval '20 minutes'), auth.uid());
  return raw_token;
end;
$$;

create or replace function public.redeem_checkin_token(raw_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare token_record public.appointment_checkin_tokens%rowtype; appointment_record public.appointments%rowtype;
begin
  select * into token_record from public.appointment_checkin_tokens
  where token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex') for update;
  if not found or token_record.used_at is not null or token_record.expires_at <= clock_timestamp() then
    raise exception using errcode = '22023', message = 'CHECKIN_TOKEN_INVALID';
  end if;
  select * into appointment_record from public.appointments where id = token_record.appointment_id for update;
  if appointment_record.status <> 'confirmed' or not public.has_clinic_role(appointment_record.clinic_id, array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[]) then
    raise exception using errcode = '42501', message = 'CHECKIN_DENIED';
  end if;
  update public.appointment_checkin_tokens set used_at = clock_timestamp(), used_by = auth.uid() where id = token_record.id;
  update public.appointments set status = 'checked_in', checked_in_at = clock_timestamp() where id = appointment_record.id;
  insert into public.appointment_events (appointment_id, actor_id, event_type, from_status, to_status)
  values (appointment_record.id, auth.uid(), 'appointment.checked_in', 'confirmed', 'checked_in');
  return appointment_record.id;
end;
$$;

create or replace function public.join_waitlist(
  target_patient_profile_id uuid, target_clinic_id uuid, target_dentist_id uuid, target_service_id uuid,
  target_date date, target_earliest_time time default null, target_latest_time time default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare result_id uuid;
begin
  if not public.owns_patient_profile(target_patient_profile_id) then raise exception using errcode = '42501', message = 'PATIENT_PROFILE_DENIED'; end if;
  if target_date < current_date or (target_earliest_time is null) <> (target_latest_time is null)
    or (target_earliest_time is not null and target_earliest_time >= target_latest_time) then
    raise exception using errcode = '22023', message = 'INVALID_WAITLIST_REQUEST';
  end if;
  if not exists (select 1 from public.clinic_services s join public.clinics c on c.id = s.clinic_id and c.status = 'approved'
    where s.id = target_service_id and s.clinic_id = target_clinic_id and s.is_active) then
    raise exception using errcode = '22023', message = 'SERVICE_NOT_BOOKABLE';
  end if;
  insert into public.waitlist_entries (patient_profile_id, requested_by, clinic_id, dentist_id, service_id, preferred_date, earliest_time, latest_time)
  values (target_patient_profile_id, auth.uid(), target_clinic_id, target_dentist_id, target_service_id, target_date, target_earliest_time, target_latest_time)
  returning id into result_id;
  return result_id;
end;
$$;

create or replace function public.offer_waitlist_slot(
  target_clinic_id uuid, target_service_id uuid, offered_dentist_id uuid, offered_slot_start_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare result_id uuid; recipient uuid;
begin
  if not public.can_manage_clinic(target_clinic_id) then raise exception using errcode = '42501', message = 'WAITLIST_OPERATION_DENIED'; end if;
  if offered_slot_start_at <= clock_timestamp() then raise exception using errcode = '22023', message = 'WAITLIST_SLOT_MUST_BE_FUTURE'; end if;
  select w.id, w.requested_by into result_id, recipient from public.waitlist_entries w
  where w.clinic_id = target_clinic_id and w.service_id = target_service_id and w.status = 'waiting'
    and (w.dentist_id is null or w.dentist_id = offered_dentist_id)
    and w.preferred_date = (offered_slot_start_at at time zone 'Asia/Dhaka')::date
    and (w.earliest_time is null or (offered_slot_start_at at time zone 'Asia/Dhaka')::time between w.earliest_time and w.latest_time)
  order by w.created_at for update skip locked limit 1;
  if not found then raise exception using errcode = 'P0002', message = 'WAITLIST_EMPTY'; end if;
  update public.waitlist_entries set status = 'offered', dentist_id = offered_dentist_id, offered_start_at = offered_slot_start_at,
    offer_expires_at = clock_timestamp() + interval '15 minutes' where id = result_id;
  insert into public.notification_outbox (recipient_id, channel, template_key, payload, idempotency_key)
  values (recipient, 'in_app', 'waitlist.slot_offered', jsonb_build_object('waitlist_id', result_id, 'start_at', offered_slot_start_at), 'waitlist-offer:' || result_id::text);
  return result_id;
end;
$$;

create or replace function public.submit_appointment_review(target_appointment_id uuid, review_rating integer, review_comment text default '')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare appointment_record public.appointments%rowtype; result_id uuid;
begin
  select * into appointment_record from public.appointments where id = target_appointment_id and booked_by = auth.uid();
  if not found or appointment_record.status <> 'completed' then raise exception using errcode = '42501', message = 'REVIEW_NOT_ALLOWED'; end if;
  if review_rating not between 1 and 5 or char_length(review_comment) > 1200 then raise exception using errcode = '22023', message = 'INVALID_REVIEW'; end if;
  insert into public.appointment_reviews (appointment_id, patient_profile_id, clinic_id, dentist_id, rating, comment)
  values (target_appointment_id, appointment_record.patient_profile_id, appointment_record.clinic_id, appointment_record.dentist_id, review_rating, trim(review_comment))
  returning id into result_id;
  return result_id;
exception when unique_violation then raise exception using errcode = '23505', message = 'REVIEW_ALREADY_SUBMITTED';
end;
$$;

alter table public.patient_profiles enable row level security;
alter table public.appointment_holds enable row level security;
alter table public.appointments enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.appointment_events enable row level security;
alter table public.appointment_checkin_tokens enable row level security;
alter table public.waitlist_entries enable row level security;
alter table public.appointment_reviews enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.notification_outbox enable row level security;

create policy patient_profiles_read_owner on public.patient_profiles for select to authenticated using (account_owner_id = auth.uid() or public.is_admin());
create policy appointment_holds_read_scoped on public.appointment_holds for select to authenticated using (booked_by = auth.uid() or public.is_admin() or public.has_clinic_role(clinic_id, array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[]));
create policy appointments_read_scoped on public.appointments for select to authenticated using (booked_by = auth.uid() or public.is_admin() or public.has_clinic_role(clinic_id, array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[]));
create policy payments_read_scoped on public.payment_transactions for select to authenticated using (public.can_operate_appointment(appointment_id));
create policy appointment_events_read_scoped on public.appointment_events for select to authenticated using (public.can_operate_appointment(appointment_id));
create policy checkin_tokens_read_creator_or_staff on public.appointment_checkin_tokens for select to authenticated using (created_by = auth.uid() or public.can_operate_appointment(appointment_id));
create policy waitlist_read_scoped on public.waitlist_entries for select to authenticated using (requested_by = auth.uid() or public.is_admin() or public.has_clinic_role(clinic_id, array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[]));
create policy reviews_read_visible_or_owner on public.appointment_reviews for select to authenticated using (is_visible or public.owns_patient_profile(patient_profile_id) or public.is_admin());
create policy chat_threads_read_participants on public.chat_threads for select to authenticated using (public.owns_patient_profile(patient_profile_id) or public.is_admin() or public.has_clinic_role(clinic_id, array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[]));
create policy chat_messages_read_participants on public.chat_messages for select to authenticated using (exists (select 1 from public.chat_threads t where t.id = thread_id and (public.owns_patient_profile(t.patient_profile_id) or public.is_admin() or public.has_clinic_role(t.clinic_id, array['clinic_owner','clinic_manager','dentist','front_desk']::public.app_role[]))));
create policy notifications_read_recipient_or_admin on public.notification_outbox for select to authenticated using (recipient_id = auth.uid() or public.is_admin());

revoke all on table public.patient_profiles, public.appointment_holds, public.appointments, public.payment_transactions,
  public.appointment_events, public.appointment_checkin_tokens, public.waitlist_entries, public.appointment_reviews,
  public.chat_threads, public.chat_messages, public.notification_outbox from anon, authenticated;
grant select on table public.patient_profiles, public.appointment_holds, public.appointments, public.payment_transactions,
  public.appointment_events, public.appointment_checkin_tokens, public.waitlist_entries, public.appointment_reviews,
  public.chat_threads, public.chat_messages, public.notification_outbox to authenticated;

revoke all on function public.owns_patient_profile(uuid), public.can_operate_appointment(uuid),
  public.upsert_patient_profile(uuid, public.patient_relationship, text, date, text, text, text, text),
  public.search_marketplace(text, text, text, text, numeric, numeric, double precision, double precision, numeric),
  public.create_appointment_hold(uuid, uuid, uuid, timestamptz), public.confirm_mock_appointment(uuid, text),
  public.release_appointment_hold(uuid), public.cancel_appointment(uuid, text), public.mark_appointment_no_show(uuid),
  public.issue_checkin_token(uuid), public.redeem_checkin_token(text),
  public.join_waitlist(uuid, uuid, uuid, uuid, date, time, time), public.offer_waitlist_slot(uuid, uuid, uuid, timestamptz),
  public.submit_appointment_review(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.owns_patient_profile(uuid), public.can_operate_appointment(uuid),
  public.upsert_patient_profile(uuid, public.patient_relationship, text, date, text, text, text, text),
  public.search_marketplace(text, text, text, text, numeric, numeric, double precision, double precision, numeric),
  public.create_appointment_hold(uuid, uuid, uuid, timestamptz), public.confirm_mock_appointment(uuid, text),
  public.release_appointment_hold(uuid), public.cancel_appointment(uuid, text), public.mark_appointment_no_show(uuid),
  public.issue_checkin_token(uuid), public.redeem_checkin_token(text),
  public.join_waitlist(uuid, uuid, uuid, uuid, date, time, time), public.offer_waitlist_slot(uuid, uuid, uuid, timestamptz),
  public.submit_appointment_review(uuid, integer, text) to authenticated;

grant execute on function public.available_clinic_slots(uuid, uuid, uuid, date, date) to authenticated;

commit;
