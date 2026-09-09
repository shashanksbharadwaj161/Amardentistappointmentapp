begin;
select plan(17);

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data)
values ('16000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'map-dentist@example.test', now(), '{"full_name":"Map Test Dentist"}');
insert into public.clinics (id, name, slug, phone, address_line, district, city, location, timezone, status, created_by)
values
  ('16000000-0000-4000-8000-000000000002', 'Map Test Clinic', 'map-test-clinic', '01700000000', '10 Test Road', 'Dhaka', 'Dhaka', extensions.st_setsrid(extensions.st_makepoint(90.4077, 23.7808), 4326)::extensions.geography, 'UTC', 'approved', '16000000-0000-4000-8000-000000000001'),
  ('16000000-0000-4000-8000-000000000003', 'Map Unknown Location', 'map-unknown-location', '01700000000', '10 Test Road', 'Dhaka', 'Dhaka', null, 'UTC', 'approved', '16000000-0000-4000-8000-000000000001');
insert into public.dentist_profiles (user_id, bmdc_registration_number, professional_title, specialties, status)
values ('16000000-0000-4000-8000-000000000001', 'BMDC-MAP-TEST', 'Dental Surgeon', array['General dentistry'], 'approved');
insert into public.clinic_memberships (clinic_id, user_id, role, status)
select id, '16000000-0000-4000-8000-000000000001', 'dentist', 'active' from public.clinics where slug in ('map-test-clinic', 'map-unknown-location');
insert into public.clinic_services (clinic_id, name, duration_minutes, price_bdt, deposit_bdt, created_by)
select id, 'Map consultation', 30, 800, 200, '16000000-0000-4000-8000-000000000001' from public.clinics where slug in ('map-test-clinic', 'map-unknown-location');
insert into public.weekly_schedule_blocks (id, clinic_id, dentist_id, day_of_week, start_time, end_time, timezone, created_by)
values ('16000000-0000-4000-8000-000000000004', '16000000-0000-4000-8000-000000000002', '16000000-0000-4000-8000-000000000001', extract(dow from now() at time zone 'UTC')::smallint, '00:00', '24:00', 'UTC', '16000000-0000-4000-8000-000000000001');

select ok(has_function_privilege('authenticated', 'public.search_marketplace(text,text,text,text,numeric,numeric,double precision,double precision,numeric)', 'EXECUTE'), 'authenticated patients can search the map');
select ok(not has_function_privilege('anon', 'public.search_marketplace(text,text,text,text,numeric,numeric,double precision,double precision,numeric)', 'EXECUTE'), 'anonymous users cannot bypass marketplace permissions');
select is((select round(latitude::numeric, 4) from public.search_marketplace('Map Test Clinic')), 23.7808::numeric, 'latitude is projected from trusted clinic geography');
select is((select round(longitude::numeric, 4) from public.search_marketplace('Map Test Clinic')), 90.4077::numeric, 'longitude is projected from trusted clinic geography');
select ok((select distance_km is null from public.search_marketplace('Map Test Clinic')), 'distance is unknown until an origin is provided');
select is((select distance_km from public.search_marketplace('Map Test Clinic', '', null, null, null, 0, 23.7808, 90.4077, 1)), 0::numeric, 'a clinic at the search origin has zero distance');
select is((select count(*) from public.search_marketplace('Map Test Clinic', '', null, null, null, 0, 35.6762, 139.6503, 50)), 0::bigint, 'a Tokyo search does not label a Dhaka clinic nearby');
select is((select count(*) from public.search_marketplace('Map Unknown Location', '', null, null, null, 0, 23.7808, 90.4077, 50)), 0::bigint, 'unknown clinic coordinates cannot satisfy a radius filter');
select is((select count(*) from public.search_marketplace('Map Test Clinic', 'General')), 1::bigint, 'partial specialty search matches the preview behavior');
select ok((select open_now from public.search_marketplace('Map Test Clinic')), 'a current active schedule reports open now');

insert into public.weekly_schedule_breaks (schedule_block_id, start_time, end_time, created_by)
values ('16000000-0000-4000-8000-000000000004', '00:00', '24:00', '16000000-0000-4000-8000-000000000001');
select ok(not (select open_now from public.search_marketplace('Map Test Clinic')), 'a current break stops the open now claim');
delete from public.weekly_schedule_breaks where schedule_block_id = '16000000-0000-4000-8000-000000000004';
insert into public.schedule_exceptions (clinic_id, dentist_id, exception_date, kind, start_time, end_time, created_by)
values ('16000000-0000-4000-8000-000000000002', '16000000-0000-4000-8000-000000000001', (now() at time zone 'UTC')::date, 'unavailable', '00:00', '24:00', '16000000-0000-4000-8000-000000000001');
select ok(not (select open_now from public.search_marketplace('Map Test Clinic')), 'a timed unavailability overrides the weekly schedule');
delete from public.schedule_exceptions where clinic_id = '16000000-0000-4000-8000-000000000002';
update public.weekly_schedule_blocks set is_active = false where id = '16000000-0000-4000-8000-000000000004';
select ok(not (select open_now from public.search_marketplace('Map Test Clinic')), 'an inactive schedule is not open');
insert into public.schedule_exceptions (clinic_id, dentist_id, exception_date, kind, start_time, end_time, created_by)
values ('16000000-0000-4000-8000-000000000002', '16000000-0000-4000-8000-000000000001', (now() at time zone 'UTC')::date, 'available', '00:00', '24:00', '16000000-0000-4000-8000-000000000001');
select ok((select open_now from public.search_marketplace('Map Test Clinic')), 'one-off available hours can open an otherwise inactive day');
insert into public.schedule_exceptions (clinic_id, exception_date, kind, created_by)
values ('16000000-0000-4000-8000-000000000002', (now() at time zone 'UTC')::date, 'clinic_closed', '16000000-0000-4000-8000-000000000001');
select ok(not (select open_now from public.search_marketplace('Map Test Clinic')), 'a full clinic closure wins over a one-off availability');
update public.weekly_schedule_blocks set is_active = true where id = '16000000-0000-4000-8000-000000000004';
update public.clinics set timezone = case when (now() at time zone 'Etc/GMT-14')::date <> (now() at time zone 'UTC')::date then 'Etc/GMT-14' else 'Etc/GMT+12' end where id = '16000000-0000-4000-8000-000000000002';
update public.schedule_exceptions set exception_date = (now() at time zone (select timezone from public.clinics where id = clinic_id))::date where clinic_id = '16000000-0000-4000-8000-000000000002' and kind = 'clinic_closed';
select ok(not (select open_now from public.search_marketplace('Map Test Clinic')), 'closures use the clinic date even when the weekly block has a different timezone');
update public.clinics set status = 'suspended' where id = '16000000-0000-4000-8000-000000000002';
select is((select count(*) from public.search_marketplace('Map Test Clinic')), 0::bigint, 'suspended clinics and their coordinates stay hidden');

select * from finish();
rollback;
