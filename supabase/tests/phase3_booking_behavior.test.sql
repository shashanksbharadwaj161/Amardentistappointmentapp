begin;
select plan(30);

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data)
values
  ('30000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'clinic-owner@example.test', now(), '{"full_name":"Clinic Owner"}'),
  ('30000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'verified-dentist@example.test', now(), '{"full_name":"Verified Dentist"}'),
  ('30000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'booking-patient@example.test', now(), '{"full_name":"Booking Patient"}'),
  ('30000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'other-patient@example.test', now(), '{"full_name":"Other Patient"}'),
  ('30000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'front-desk@example.test', now(), '{"full_name":"Front Desk"}');

insert into public.clinics (id, name, slug, phone, address_line, district, city, status, approved_at, approved_by, created_by)
values ('31000000-0000-4000-8000-000000000001', 'Booking Test Dental', 'booking-test-dental', '01700000000', '10 Test Road', 'Dhaka', 'Dhaka', 'approved', now(), '30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001');
insert into public.clinic_memberships (clinic_id, user_id, role, status, joined_at)
values
  ('31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'clinic_owner', 'active', now()),
  ('31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'dentist', 'active', now()),
  ('31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000005', 'front_desk', 'active', now());
insert into public.dentist_profiles (user_id, bmdc_registration_number, professional_title, specialties, languages, status, approved_at, approved_by)
values ('30000000-0000-4000-8000-000000000002', 'BMDC-BOOKING-TEST', 'Dental Surgeon', array['General dentistry'], array['bn','en'], 'approved', now(), '30000000-0000-4000-8000-000000000001');
insert into public.clinic_services (id, clinic_id, dentist_id, name, duration_minutes, price_bdt, deposit_bdt, is_active, created_by)
values ('32000000-0000-4000-8000-000000000001', '31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'Booking consultation', 30, 800, 200, true, '30000000-0000-4000-8000-000000000001');
insert into public.weekly_schedule_blocks (clinic_id, dentist_id, day_of_week, start_time, end_time, timezone, created_by)
values ('31000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', extract(dow from current_date + 7)::smallint, '09:00', '11:00', 'Asia/Dhaka', '30000000-0000-4000-8000-000000000002');

select ok(not has_table_privilege('authenticated', 'public.appointments', 'INSERT'), 'appointments cannot be inserted from the client');
select ok(not has_table_privilege('authenticated', 'public.appointment_holds', 'UPDATE'), 'holds cannot be extended from the client');
select ok(not has_table_privilege('authenticated', 'public.payment_transactions', 'INSERT'), 'payments cannot be forged from the client');
select ok(has_function_privilege('authenticated', 'public.create_appointment_hold(uuid,uuid,uuid,timestamp with time zone)', 'EXECUTE'), 'authenticated patients can request a protected hold');
select ok(has_function_privilege('authenticated', 'public.confirm_mock_appointment(uuid,text)', 'EXECUTE'), 'authenticated patients can confirm through the trusted RPC');

set local role authenticated;
set local "request.jwt.claim.sub" = '30000000-0000-4000-8000-000000000003';
set local "request.jwt.claim.role" = 'authenticated';

select lives_ok(
  $$select public.upsert_patient_profile(null, 'self', 'Booking Patient', '1994-02-10', 'female', '01700000001', 'Dhaka', 'Dhaka')$$,
  'a patient creates their self booking profile'
);
select results_eq(
  $$select count(*)::bigint from public.patient_profiles where account_owner_id = '30000000-0000-4000-8000-000000000003'$$,
  $$values (1::bigint)$$,
  'the patient sees their owned profile'
);
select throws_ok(
  $$select public.upsert_patient_profile(null, 'self', 'Duplicate Self', null, null, '', '', '')$$,
  '23505', 'SELF_PROFILE_ALREADY_EXISTS', 'only one self profile exists per account'
);
select results_eq(
  $$select count(*)::bigint from public.search_marketplace('', '', null, null, null, 0, null, null, 50) where clinic_id = '31000000-0000-4000-8000-000000000001'$$,
  $$values (1::bigint)$$,
  'approved clinic, dentist, and service appear in marketplace search'
);
select results_eq(
  $$select count(*)::bigint from public.available_clinic_slots('31000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000001',current_date + 7,current_date + 7)$$,
  $$values (4::bigint)$$,
  'four trusted 30-minute slots are initially available'
);
select lives_ok(
  $$select * from public.create_appointment_hold(
    (select id from public.patient_profiles where account_owner_id='30000000-0000-4000-8000-000000000003'),
    '32000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',
    ((current_date + 7 + time '09:00') at time zone 'Asia/Dhaka'))$$,
  'patient creates a ten-minute server hold'
);
select results_eq(
  $$select duration_minutes::bigint from public.appointment_holds where booked_by='30000000-0000-4000-8000-000000000003'$$,
  $$values (30::bigint)$$,
  'hold duration comes from the trusted service record'
);
select results_eq(
  $$select deposit_bdt from public.appointment_holds where booked_by='30000000-0000-4000-8000-000000000003'$$,
  $$values (200::numeric)$$,
  'hold deposit comes from the trusted service record'
);
select ok(
  (select expires_at between created_at + interval '9 minutes 59 seconds' and created_at + interval '10 minutes 1 second' from public.appointment_holds where booked_by='30000000-0000-4000-8000-000000000003'),
  'hold expires in ten minutes'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '30000000-0000-4000-8000-000000000004';
set local "request.jwt.claim.role" = 'authenticated';
select lives_ok(
  $$select public.upsert_patient_profile(null, 'self', 'Other Patient', '1992-03-11', null, '', 'Dhaka', 'Dhaka')$$,
  'second patient creates a separate profile'
);
select results_eq(
  $$select count(*)::bigint from public.patient_profiles where account_owner_id='30000000-0000-4000-8000-000000000003'$$,
  $$values (0::bigint)$$,
  'one patient cannot read another patient profile'
);
select throws_ok(
  $$select * from public.create_appointment_hold(
    (select id from public.patient_profiles where account_owner_id='30000000-0000-4000-8000-000000000004'),
    '32000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',
    ((current_date + 7 + time '09:00') at time zone 'Asia/Dhaka'))$$,
  '23P01', 'SLOT_UNAVAILABLE', 'a second patient cannot hold an overlapping slot'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '30000000-0000-4000-8000-000000000003';
set local "request.jwt.claim.role" = 'authenticated';
select lives_ok(
  $$select * from public.confirm_mock_appointment((select id from public.appointment_holds where booked_by='30000000-0000-4000-8000-000000000003'),'booking-confirmation-request-0001')$$,
  'the hold confirms into one appointment and mock receipt'
);
select lives_ok(
  $$select * from public.confirm_mock_appointment((select id from public.appointment_holds where booked_by='30000000-0000-4000-8000-000000000003'),'booking-confirmation-request-0001')$$,
  'replaying the same confirmation request is harmless'
);
select results_eq(
  $$select count(*)::bigint from public.appointments where booked_by='30000000-0000-4000-8000-000000000003'$$,
  $$values (1::bigint)$$,
  'idempotent confirmation creates one appointment'
);
select results_eq(
  $$select count(*)::bigint from public.payment_transactions where idempotency_key='booking-confirmation-request-0001' and status='succeeded'$$,
  $$values (1::bigint)$$,
  'idempotent confirmation creates one payment record'
);
select results_eq(
  $$select count(*)::bigint from public.available_clinic_slots('31000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000001',current_date + 7,current_date + 7)$$,
  $$values (3::bigint)$$,
  'confirmed appointment disappears from shared availability'
);
select is(
  public.cancel_appointment((select id from public.appointments where booked_by='30000000-0000-4000-8000-000000000003'), 'Plan changed')::text,
  'refundable',
  'cancellation at least 24 hours before start is refundable'
);
select results_eq(
  $$select count(*)::bigint from public.available_clinic_slots('31000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000001',current_date + 7,current_date + 7)$$,
  $$values (4::bigint)$$,
  'a cancelled future slot reopens'
);

reset role;
insert into public.appointments (id, patient_profile_id, booked_by, clinic_id, dentist_id, service_id, start_at, end_at, duration_minutes, price_bdt, deposit_bdt)
values ('33000000-0000-4000-8000-000000000001',
  (select id from public.patient_profiles where account_owner_id='30000000-0000-4000-8000-000000000003'),
  '30000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000001',
  clock_timestamp() - interval '5 minutes', clock_timestamp() + interval '25 minutes', 30, 800, 200);

set local role authenticated;
set local "request.jwt.claim.sub" = '30000000-0000-4000-8000-000000000003';
set local "request.jwt.claim.role" = 'authenticated';
select ok(length(set_config('test.checkin_token', public.issue_checkin_token('33000000-0000-4000-8000-000000000001'), true)) = 64, 'patient receives an opaque one-time check-in token');

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '30000000-0000-4000-8000-000000000005';
set local "request.jwt.claim.role" = 'authenticated';
select lives_ok($$select public.redeem_checkin_token(current_setting('test.checkin_token'))$$, 'front desk redeems the check-in token');
select throws_ok($$select public.redeem_checkin_token(current_setting('test.checkin_token'))$$, '22023', 'CHECKIN_TOKEN_INVALID', 'a redeemed QR token cannot be replayed');
select results_eq($$select status::text from public.appointments where id='33000000-0000-4000-8000-000000000001'$$, $$values ('checked_in'::text)$$, 'successful QR redemption checks the patient in');
select throws_ok($$select public.mark_appointment_no_show('33000000-0000-4000-8000-000000000001')$$, '22023', 'NO_SHOW_NOT_AVAILABLE', 'checked-in appointment cannot be marked no-show');

reset role;
select results_eq(
  $$select count(*)::bigint from public.audit_logs where action in ('patient_profile.saved','appointment.hold_created','appointment.confirmed_mock','appointment.cancelled')$$,
  $$values (5::bigint)$$,
  'Phase 3 trusted mutations produce audit events'
);

select * from finish();
rollback;
