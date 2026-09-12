begin;
select no_plan();

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) values
('23000001-0000-4000-8000-000000000001','authenticated','authenticated','revocation-dentist@example.test',now(),'{"full_name":"Atomic Test dentist"}'),
('23000001-0000-4000-8000-000000000002','authenticated','authenticated','revocation-patient@example.test',now(),'{"full_name":"Atomic Test patient"}'),
('23000001-0000-4000-8000-000000000003','authenticated','authenticated','revocation-admin@example.test',now(),'{"full_name":"Atomic Test admin"}'),
('23000001-0000-4000-8000-000000000004','authenticated','authenticated','revocation-other-dentist@example.test',now(),'{"full_name":"Atomic Test other-dentist"}');
insert into public.user_roles(user_id,role) values('23000001-0000-4000-8000-000000000001','dentist'),('23000001-0000-4000-8000-000000000004','dentist'),('23000001-0000-4000-8000-000000000003','admin');
insert into public.clinics(id,name,slug,phone,address_line,district,city,status,approved_at,approved_by,created_by) values('23000002-0000-4000-8000-000000000001','Atomic Test Clinic','revocation-test-clinic','01710000000','Test Road','Dhaka','Dhaka','approved',now(),'23000001-0000-4000-8000-000000000003','23000001-0000-4000-8000-000000000001');
insert into public.clinic_memberships(clinic_id,user_id,role,status,joined_at) values('23000002-0000-4000-8000-000000000001','23000001-0000-4000-8000-000000000001','dentist','active',now()),('23000002-0000-4000-8000-000000000001','23000001-0000-4000-8000-000000000004','dentist','active',now());
insert into public.dentist_profiles(user_id,bmdc_registration_number,professional_title,status,approved_at,approved_by) values('23000001-0000-4000-8000-000000000001','BMDC-REVOKE-1','Dental Surgeon','approved',now(),'23000001-0000-4000-8000-000000000003'),('23000001-0000-4000-8000-000000000004','BMDC-REVOKE-2','Dental Surgeon','approved',now(),'23000001-0000-4000-8000-000000000003');
insert into public.patient_profiles(id,account_owner_id,relationship,full_name) values('23000003-0000-4000-8000-000000000001','23000001-0000-4000-8000-000000000002','self','Atomic Test Patient');
insert into public.clinic_services(id,clinic_id,dentist_id,name,duration_minutes,price_bdt,deposit_bdt,is_active,created_by) values('23000004-0000-4000-8000-000000000001','23000002-0000-4000-8000-000000000001','23000001-0000-4000-8000-000000000001','Atomic consultation',30,800,200,true,'23000001-0000-4000-8000-000000000001');
insert into public.appointments(id,patient_profile_id,booked_by,clinic_id,dentist_id,service_id,start_at,end_at,duration_minutes,price_bdt,deposit_bdt,status) values
('23000005-0000-4000-8000-000000000001','23000003-0000-4000-8000-000000000001','23000001-0000-4000-8000-000000000002','23000002-0000-4000-8000-000000000001','23000001-0000-4000-8000-000000000001','23000004-0000-4000-8000-000000000001',now()-interval '2 hours',now()-interval '90 minutes',30,800,200,'checked_in'),
('23000005-0000-4000-8000-000000000002','23000003-0000-4000-8000-000000000001','23000001-0000-4000-8000-000000000002','23000002-0000-4000-8000-000000000001','23000001-0000-4000-8000-000000000001','23000004-0000-4000-8000-000000000001',now()-interval '1 hour',now()-interval '30 minutes',30,800,200,'checked_in');
insert into public.clinical_encounters(id,appointment_id,patient_profile_id,clinic_id,treating_dentist_id,chief_complaint,subjective_notes,objective_notes,assessment,plan) values
('23000006-0000-4000-8000-000000000001','23000005-0000-4000-8000-000000000001','23000003-0000-4000-8000-000000000001','23000002-0000-4000-8000-000000000001','23000001-0000-4000-8000-000000000001','Original complaint','Original subjective','Original objective','Original assessment','Original plan'),
('23000006-0000-4000-8000-000000000002','23000005-0000-4000-8000-000000000002','23000003-0000-4000-8000-000000000001','23000002-0000-4000-8000-000000000001','23000001-0000-4000-8000-000000000001','Original complaint','Original subjective','Original objective','Original assessment','Original plan');

set local role authenticated;
set local "request.jwt.claim.sub"='23000001-0000-4000-8000-000000000001';
set local "request.jwt.claim.role"='authenticated';
select ok(public.is_verified_dentist(),'approved dentist with active global role is verified');
select lives_ok($$select public.save_clinical_encounter('23000006-0000-4000-8000-000000000001','Original complaint','Original subjective','Original objective','Original assessment','Original plan','Before role removal')$$,'active treating dentist can save the draft');
reset role;
delete from public.user_roles where user_id='23000001-0000-4000-8000-000000000001' and role='dentist';
select is((select status::text from public.dentist_profiles where user_id='23000001-0000-4000-8000-000000000001'),'approved','role removal leaves approval history intact');
set local role authenticated;
select is(public.is_verified_dentist(),false,'same authenticated session loses clinical verification immediately after role removal');
select is(public.is_treating_dentist('23000003-0000-4000-8000-000000000001','23000002-0000-4000-8000-000000000001'),false,'active clinic membership does not override global role revocation');
select throws_ok($$select public.save_clinical_encounter('23000006-0000-4000-8000-000000000001','Forbidden edit','Original subjective','Original objective','Original assessment','Original plan','After role removal')$$,'42501','ENCOUNTER_DENIED','revoked dentist cannot modify existing draft');
select throws_ok($$select public.save_and_finalize_clinical_encounter('23000006-0000-4000-8000-000000000001','{"complaint":"Original complaint","subjective":"Original subjective","objective":"Original objective","assessment":"Original assessment","plan":"Original plan"}','Original complaint','Original subjective','Original objective','Original assessment','Original plan','Finalize after removal')$$,'42501','ENCOUNTER_DENIED','revoked dentist cannot finalize a reviewed clinical record');
select throws_ok($$select * from public.prepare_ai_task('clinical_note','23000006-0000-4000-8000-000000000001',null,null,'Draft recorded facts','en')$$,'42501','AI_DENTIST_DENIED','revoked dentist cannot prepare clinical AI');
reset role;
select is((select chief_complaint from public.clinical_encounters where id='23000006-0000-4000-8000-000000000001'),'Original complaint','denied mutation preserves clinical notes');
select is((select status::text from public.clinical_encounters where id='23000006-0000-4000-8000-000000000001'),'draft','denied finalization preserves the draft');
insert into public.user_roles(user_id,role) values('23000001-0000-4000-8000-000000000001','dentist');
set local role authenticated;
select ok(public.is_verified_dentist(),'restoring role restores verified status without reissuing JWT');
reset role;
update public.dentist_profiles set status='suspended' where user_id='23000001-0000-4000-8000-000000000001';
set local role authenticated;
select is(public.is_verified_dentist(),false,'global role alone cannot override suspended professional approval');
select is(public.is_verified_dentist(null),false,'null subject is never verified');
reset role;
update public.dentist_profiles set status='approved' where user_id='23000001-0000-4000-8000-000000000001';

-- Exercise a real reschedule, then replay its exact key as owner and outsider.
insert into public.appointments(id,patient_profile_id,booked_by,clinic_id,dentist_id,service_id,start_at,end_at,duration_minutes,price_bdt,deposit_bdt,status) values
('23000005-0000-4000-8000-000000000003','23000003-0000-4000-8000-000000000001','23000001-0000-4000-8000-000000000002','23000002-0000-4000-8000-000000000001','23000001-0000-4000-8000-000000000001','23000004-0000-4000-8000-000000000001',now()+interval '3 days',now()+interval '3 days 30 minutes',30,800,200,'confirmed');
insert into public.appointment_holds(id,patient_profile_id,booked_by,clinic_id,dentist_id,service_id,start_at,end_at,duration_minutes,price_bdt,deposit_bdt,expires_at) values
('23000007-0000-4000-8000-000000000001','23000003-0000-4000-8000-000000000001','23000001-0000-4000-8000-000000000002','23000002-0000-4000-8000-000000000001','23000001-0000-4000-8000-000000000001','23000004-0000-4000-8000-000000000001',now()+interval '4 days',now()+interval '4 days 30 minutes',30,800,200,now()+interval '15 minutes');
set local role authenticated;
set local "request.jwt.claim.sub"='23000001-0000-4000-8000-000000000002';
select lives_ok($$select * from public.reschedule_appointment('23000005-0000-4000-8000-000000000003','23000007-0000-4000-8000-000000000001','role-reschedule-key-0001')$$,'owner can reschedule atomically');
select results_eq($$select appointment_id from public.reschedule_appointment('23000005-0000-4000-8000-000000000003','23000007-0000-4000-8000-000000000001','role-reschedule-key-0001')$$,$$select appointment_id from public.payment_transactions where idempotency_key='role-reschedule-key-0001'$$,'owner retry returns the same replacement even though original is cancelled');
set local "request.jwt.claim.sub"='23000001-0000-4000-8000-000000000004';
select throws_ok($$select * from public.reschedule_appointment('23000005-0000-4000-8000-000000000003','23000007-0000-4000-8000-000000000001','role-reschedule-key-0001')$$,'42501','APPOINTMENT_NOT_RESCHEDULABLE','outsider cannot disclose appointment or receipt by replaying the exact reschedule key');
select throws_ok($$select * from public.reschedule_appointment('23000005-0000-4000-8000-000000000003','23000007-0000-4000-8000-000000000001','different-reschedule-key')$$,'42501','APPOINTMENT_NOT_RESCHEDULABLE','outsider gets the same ownership denial for a fresh key');
reset role;
select is((select count(*) from public.payment_transactions where idempotency_key='role-reschedule-key-0001'),1::bigint,'retries create no duplicate deposit ledger entries');
select is((select count(*) from public.appointment_events where event_type='appointment.rescheduled_from' and appointment_id='23000005-0000-4000-8000-000000000003'),1::bigint,'retries create no duplicate reschedule events');
select * from finish();
rollback;
