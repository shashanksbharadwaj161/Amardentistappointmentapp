-- Phase 3 map completion: trusted coordinates and current schedule status.
-- Replace the result type and its grants together in one transaction.
-- No table or patient data changes are needed.
begin;

drop function if exists public.search_marketplace(text, text, text, text, numeric, numeric, double precision, double precision, numeric);

create function public.search_marketplace(
  search_text text default '', specialty_filter text default '', gender_filter text default null,
  language_filter text default null, max_price_bdt numeric default null, minimum_rating numeric default 0,
  search_latitude double precision default null, search_longitude double precision default null, radius_km numeric default 50
)
returns table (
  dentist_id uuid, clinic_id uuid, clinic_name text, dentist_name text, professional_title text,
  specialties text[], languages text[], gender text, years_experience integer,
  service_id uuid, service_name text, duration_minutes integer, price_bdt numeric, deposit_bdt numeric,
  rating numeric, review_count bigint, distance_km numeric, latitude double precision, longitude double precision,
  open_now boolean
)
language sql stable security definer set search_path = '' as $$
  with reviews as (
    select r.dentist_id, avg(r.rating)::numeric(3,2) rating, count(*) review_count
    from public.appointment_reviews r where r.is_visible group by r.dentist_id
  ), current_windows as (
    select b.clinic_id, b.dentist_id, b.id block_id, b.timezone,
      (now() at time zone b.timezone)::date local_date,
      (now() at time zone b.timezone)::time local_time, b.start_time, b.end_time
    from public.weekly_schedule_blocks b
    where b.is_active and b.day_of_week = extract(dow from now() at time zone b.timezone)::integer
    union all
    select e.clinic_id, e.dentist_id, null::uuid, c.timezone,
      e.exception_date, (now() at time zone c.timezone)::time, e.start_time, e.end_time
    from public.schedule_exceptions e join public.clinics c on c.id = e.clinic_id
    where e.kind = 'available' and e.start_time is not null and e.dentist_id is not null
      and e.exception_date = (now() at time zone c.timezone)::date
  ), open_dentists as (
    select distinct w.clinic_id, w.dentist_id from current_windows w
    where w.local_time >= w.start_time and w.local_time < w.end_time
      and not exists (
        select 1 from public.weekly_schedule_breaks b where b.schedule_block_id = w.block_id
          and w.local_time >= b.start_time and w.local_time < b.end_time
      )
      and not exists (
        select 1 from public.schedule_exceptions e join public.clinics ec on ec.id = e.clinic_id
        where e.clinic_id = w.clinic_id and e.exception_date = (now() at time zone ec.timezone)::date
          and e.kind in ('clinic_closed', 'unavailable')
          and (e.dentist_id is null or e.dentist_id = w.dentist_id)
          and (e.start_time is null or (now() at time zone ec.timezone)::time >= e.start_time and (now() at time zone ec.timezone)::time < e.end_time)
      )
  )
  select d.user_id, c.id, c.name, p.full_name, d.professional_title, d.specialties, d.languages,
    d.gender, d.years_experience, s.id, s.name, s.duration_minutes, s.price_bdt, s.deposit_bdt,
    coalesce(r.rating, 0), coalesce(r.review_count, 0),
    case when c.location is not null and search_latitude is not null and search_longitude is not null
      then round((extensions.st_distance(c.location, extensions.st_setsrid(extensions.st_makepoint(search_longitude, search_latitude), 4326)::extensions.geography) / 1000)::numeric, 2)
      else null end,
    case when c.location is null then null else extensions.st_y(c.location::extensions.geometry) end,
    case when c.location is null then null else extensions.st_x(c.location::extensions.geometry) end,
    o.dentist_id is not null
  from public.dentist_profiles d
  join public.profiles p on p.id = d.user_id
  join public.clinic_memberships m on m.user_id = d.user_id and m.role = 'dentist' and m.status = 'active'
  join public.clinics c on c.id = m.clinic_id and c.status = 'approved'
  join public.clinic_services s on s.clinic_id = c.id and s.is_active and (s.dentist_id is null or s.dentist_id = d.user_id)
  left join reviews r on r.dentist_id = d.user_id
  left join open_dentists o on o.clinic_id = c.id and o.dentist_id = d.user_id
  where d.status = 'approved'
    and (trim(search_text) = '' or p.full_name ilike '%' || trim(search_text) || '%' or c.name ilike '%' || trim(search_text) || '%')
    and (trim(specialty_filter) = '' or exists (select 1 from unnest(d.specialties) specialty(value) where specialty.value ilike '%' || trim(specialty_filter) || '%'))
    and (gender_filter is null or d.gender = gender_filter)
    and (language_filter is null or language_filter = any(d.languages))
    and (max_price_bdt is null or s.price_bdt <= max_price_bdt)
    and coalesce(r.rating, 0) >= minimum_rating
    and ((search_latitude is null and search_longitude is null)
      or (search_latitude between -90 and 90 and search_longitude between -180 and 180 and radius_km between 1 and 250
        and c.location is not null
        and extensions.st_dwithin(c.location, extensions.st_setsrid(extensions.st_makepoint(search_longitude, search_latitude), 4326)::extensions.geography, radius_km * 1000)))
  order by coalesce(r.rating, 0) desc, coalesce(r.review_count, 0) desc, c.name, p.full_name;
$$;

revoke all on function public.search_marketplace(text, text, text, text, numeric, numeric, double precision, double precision, numeric) from public, anon, authenticated;
grant execute on function public.search_marketplace(text, text, text, text, numeric, numeric, double precision, double precision, numeric) to authenticated;

commit;
