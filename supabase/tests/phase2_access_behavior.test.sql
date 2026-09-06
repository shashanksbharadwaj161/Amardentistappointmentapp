begin;
select plan(35);

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data)
values
  ('20000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'owner@example.test', now(), '{"full_name":"Clinic Owner"}'),
  ('20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'dentist@example.test', now(), '{"full_name":"Test Dentist"}'),
  ('20000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'outsider@example.test', now(), '{"full_name":"Outside Patient"}'),
  ('20000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'admin-two@example.test', now(), '{"full_name":"Review Admin"}'),
  ('20000000-0000-4000-8000-000000000005', 'authenticated', 'authenticated', 'other-owner@example.test', now(), '{"full_name":"Other Owner"}');

insert into public.user_roles (user_id, role, granted_by)
values ('20000000-0000-4000-8000-000000000004', 'admin', '20000000-0000-4000-8000-000000000004');

select ok(not has_table_privilege('authenticated', 'public.clinics', 'INSERT'), 'clinic rows cannot be inserted directly');
select ok(not has_table_privilege('authenticated', 'public.clinic_memberships', 'INSERT'), 'memberships cannot be self-granted');
select ok(not has_table_privilege('authenticated', 'public.dentist_profiles', 'UPDATE'), 'verification cannot be changed directly');
select ok(has_function_privilege('authenticated', 'public.create_clinic_application(text,text,text,text,text,text,text,double precision,double precision)', 'EXECUTE'), 'authenticated users may submit a clinic application');
select ok(has_function_privilege('authenticated', 'public.available_clinic_slots(uuid,uuid,uuid,date,date)', 'EXECUTE'), 'authenticated users may request approved availability');
select ok(not has_function_privilege('authenticated', 'public.activate_clinic_invitation(uuid)', 'EXECUTE'), 'clinic invitation activation is service-only');

set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
set local "request.jwt.claim.role" = 'authenticated';

select lives_ok(
  $$select public.create_clinic_application('Calm Dental Centre','01700000000','care@example.test','12 Care Road','Dhaka','Dhaka','Quiet, accessible dental care',23.8103,90.4125)$$,
  'an authenticated owner can submit a clinic'
);
select results_eq(
  $$select count(*)::bigint from public.clinics where name = 'Calm Dental Centre' and status = 'submitted'$$,
  $$values (1::bigint)$$,
  'clinic begins submitted rather than publicly approved'
);
select results_eq(
  $$select count(*)::bigint from public.clinic_memberships m join public.clinics c on c.id = m.clinic_id where c.name = 'Calm Dental Centre' and m.user_id = '20000000-0000-4000-8000-000000000001' and m.role = 'clinic_owner' and m.status = 'active'$$,
  $$values (1::bigint)$$,
  'creator receives an active clinic owner membership'
);
select lives_ok(
  $$select set_config('test.clinic_invitation_id', public.invite_clinic_member((select id from public.clinics where name = 'Calm Dental Centre'),'dentist@example.test','dentist',7)::text, true)$$,
  'clinic owner can invite a dentist'
);
select results_eq(
  $$select count(*)::bigint from public.clinic_memberships m join public.clinics c on c.id = m.clinic_id where c.name = 'Calm Dental Centre' and m.user_id = '20000000-0000-4000-8000-000000000002' and m.status = 'invited'$$,
  $$values (0::bigint)$$,
  'membership is unavailable before delivery activation'
);

reset role;
set local role service_role;
set local "request.jwt.claim.role" = 'service_role';
select lives_ok(
  $$select public.activate_clinic_invitation(current_setting('test.clinic_invitation_id')::uuid)$$,
  'service role activates a delivered clinic invitation'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000001';
set local "request.jwt.claim.role" = 'authenticated';
select results_eq(
  $$select count(*)::bigint from public.clinic_memberships m join public.clinics c on c.id = m.clinic_id where c.name = 'Calm Dental Centre' and m.user_id = '20000000-0000-4000-8000-000000000002' and m.status = 'invited'$$,
  $$values (1::bigint)$$,
  'activated delivery creates the pending membership'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000003';
set local "request.jwt.claim.role" = 'authenticated';

select results_eq(
  $$select count(*)::bigint from public.clinics where name = 'Calm Dental Centre'$$,
  $$values (0::bigint)$$,
  'an unrelated patient cannot see an unapproved clinic'
);
select throws_ok(
  $$select public.invite_clinic_member((select id from public.clinics limit 1),'blocked@example.test','front_desk',7)$$,
  '42501', 'CLINIC_MANAGER_REQUIRED', 'an unrelated patient cannot invite clinic staff'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000002';
set local "request.jwt.claim.role" = 'authenticated';

select lives_ok(
  $$select public.submit_dentist_application('BMDC-TEST-200','Dental Surgeon','Focused on calm preventive care',array['General dentistry'],array['bn','en'],'female',8)$$,
  'a dentist can submit BMDC credentials'
);
select results_eq(
  $$select count(*)::bigint from public.dentist_profiles where user_id = '20000000-0000-4000-8000-000000000002' and status = 'submitted'$$,
  $$values (1::bigint)$$,
  'dentist begins submitted rather than approved'
);
select lives_ok(
  $$select public.accept_clinic_membership((select m.id from public.clinic_memberships m where m.user_id='20000000-0000-4000-8000-000000000002' and m.role='dentist' and m.status='invited'))$$,
  'the invited dentist can accept their own clinic membership'
);
select results_eq(
  $$select count(*)::bigint from public.clinics where name = 'Calm Dental Centre'$$,
  $$values (1::bigint)$$,
  'a clinic member can see their pending clinic'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000003';

select results_eq(
  $$select count(*)::bigint from public.dentist_profiles where user_id = '20000000-0000-4000-8000-000000000002'$$,
  $$values (0::bigint)$$,
  'an unrelated patient cannot see an unapproved dentist'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000004';

select lives_ok(
  $$select public.decide_clinic_application((select id from public.clinics where name='Calm Dental Centre'),'approved','Credentials checked')$$,
  'an admin can approve a clinic'
);
select lives_ok(
  $$select public.decide_dentist_application('20000000-0000-4000-8000-000000000002','approved','BMDC checked')$$,
  'an admin can approve a dentist'
);
select results_eq(
  $$select count(*)::bigint from public.verification_decisions where target_id in ((select id from public.clinics where name='Calm Dental Centre'),'20000000-0000-4000-8000-000000000002')$$,
  $$values (2::bigint)$$,
  'both verification decisions are preserved'
);
select results_eq(
  $$select count(*)::bigint from public.user_roles where user_id='20000000-0000-4000-8000-000000000002' and role='dentist'$$,
  $$values (1::bigint)$$,
  'approval grants the global dentist capability'
);
select throws_ok(
  $$select public.decide_clinic_application((select id from public.clinics where name='Calm Dental Centre'),'rejected','')$$,
  '22023', 'REVIEW_REASON_REQUIRED', 'rejection requires a meaningful reason'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000003';

select results_eq(
  $$select count(*)::bigint from public.clinics where name='Calm Dental Centre' and status='approved'$$,
  $$values (1::bigint)$$,
  'approved clinic becomes visible to an authenticated patient'
);
select results_eq(
  $$select count(*)::bigint from public.dentist_profiles where user_id='20000000-0000-4000-8000-000000000002' and status='approved'$$,
  $$values (1::bigint)$$,
  'approved dentist becomes visible to an authenticated patient'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000002';

select lives_ok(
  $$select public.upsert_clinic_service(null,(select id from public.clinics where name='Calm Dental Centre'),'20000000-0000-4000-8000-000000000002','Consultation','Initial dental assessment',30,800,200,true)$$,
  'verified clinic dentist can configure their service'
);
select lives_ok(
  $$select public.upsert_weekly_schedule_block(null,(select id from public.clinics where name='Calm Dental Centre'),'20000000-0000-4000-8000-000000000002',extract(dow from (current_date + 7))::smallint,'09:00','12:00','Asia/Dhaka',true)$$,
  'clinic dentist can configure a weekly block'
);
select lives_ok(
  $$select public.add_weekly_schedule_break((select id from public.weekly_schedule_blocks where dentist_id='20000000-0000-4000-8000-000000000002'),'10:00','10:30','Team break')$$,
  'clinic dentist can configure a break'
);
select lives_ok(
  $$select public.add_schedule_exception((select id from public.clinics where name='Calm Dental Centre'),'20000000-0000-4000-8000-000000000002',current_date + 7,'unavailable','11:00','11:30','Training')$$,
  'clinic dentist can add a one-off exception'
);
select results_eq(
  $$select count(*)::bigint from public.available_clinic_slots(
    (select id from public.clinics where name='Calm Dental Centre'),
    '20000000-0000-4000-8000-000000000002',
    (select id from public.clinic_services where name='Consultation'),
    current_date + 7,
    current_date + 7
  )$$,
  $$values (4::bigint)$$,
  'shared availability removes break and exception overlaps'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '20000000-0000-4000-8000-000000000005';

select lives_ok(
  $$select public.create_clinic_application('Other Clinic','01800000000','','44 Other Road','Chattogram','Chattogram','',null,null)$$,
  'a second owner can create an isolated clinic'
);
select throws_ok(
  $$select public.upsert_weekly_schedule_block(null,(select id from public.clinics where name='Calm Dental Centre'),'20000000-0000-4000-8000-000000000002',1::smallint,'08:00','09:00','Asia/Dhaka',true)$$,
  '42501', 'SCHEDULE_MANAGEMENT_DENIED', 'one clinic owner cannot modify another clinic schedule'
);

reset role;
select results_eq(
  $$select count(*)::bigint from public.audit_logs where action in ('clinic.application_submitted','dentist.application_submitted','clinic.member_invited','clinic.verification_decided','dentist.verification_decided')$$,
  $$values (6::bigint)$$,
  'Phase 2 privileged actions write audit events'
);

select * from finish();
rollback;
