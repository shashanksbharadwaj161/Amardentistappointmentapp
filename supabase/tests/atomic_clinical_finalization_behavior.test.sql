begin;
select plan(33);

-- Synthetic rollback-only fixtures; no external provider or real patient data.
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) values
('91000000-0000-4000-8000-000000000001','authenticated','authenticated','atomic-dentist@example.test',now(),'{"full_name":"Atomic Test dentist"}'),
('91000000-0000-4000-8000-000000000002','authenticated','authenticated','atomic-patient@example.test',now(),'{"full_name":"Atomic Test patient"}'),
('91000000-0000-4000-8000-000000000003','authenticated','authenticated','atomic-admin@example.test',now(),'{"full_name":"Atomic Test admin"}'),
('91000000-0000-4000-8000-000000000004','authenticated','authenticated','atomic-other-dentist@example.test',now(),'{"full_name":"Atomic Test other-dentist"}');
insert into public.user_roles(user_id,role) values('91000000-0000-4000-8000-000000000001','dentist'),('91000000-0000-4000-8000-000000000004','dentist'),('91000000-0000-4000-8000-000000000003','admin');
insert into public.clinics(id,name,slug,phone,address_line,district,city,status,approved_at,approved_by,created_by) values('92000000-0000-4000-8000-000000000001','Atomic Test Clinic','atomic-test-clinic','01710000000','Test Road','Dhaka','Dhaka','approved',now(),'91000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001');
insert into public.clinic_memberships(clinic_id,user_id,role,status,joined_at) values('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','dentist','active',now()),('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000004','dentist','active',now());
insert into public.dentist_profiles(user_id,bmdc_registration_number,professional_title,status,approved_at,approved_by) values('91000000-0000-4000-8000-000000000001','BMDC-ATOMIC-1','Dental Surgeon','approved',now(),'91000000-0000-4000-8000-000000000003'),('91000000-0000-4000-8000-000000000004','BMDC-ATOMIC-2','Dental Surgeon','approved',now(),'91000000-0000-4000-8000-000000000003');
insert into public.patient_profiles(id,account_owner_id,relationship,full_name) values('93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','self','Atomic Test Patient');
insert into public.clinic_services(id,clinic_id,dentist_id,name,duration_minutes,price_bdt,deposit_bdt,is_active,created_by) values('94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','Atomic consultation',30,800,200,true,'91000000-0000-4000-8000-000000000001');
insert into public.appointments(id,patient_profile_id,booked_by,clinic_id,dentist_id,service_id,start_at,end_at,duration_minutes,price_bdt,deposit_bdt,status) values
('95000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',now()-interval '2 hours',now()-interval '90 minutes',30,800,200,'checked_in'),
('95000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',now()-interval '1 hour',now()-interval '30 minutes',30,800,200,'checked_in');
insert into public.clinical_encounters(id,appointment_id,patient_profile_id,clinic_id,treating_dentist_id,chief_complaint,subjective_notes,objective_notes,assessment,plan) values
('96000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','Original complaint','Original subjective','Original objective','Original assessment','Original plan'),
('96000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','Original complaint','Original subjective','Original objective','Original assessment','Original plan');
insert into public.treatment_plans(patient_profile_id,clinic_id,encounter_id,treating_dentist_id,title) values('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001','Unfinished draft fixture');

select ok(not has_function_privilege('anon','public.save_and_finalize_clinical_encounter(uuid,jsonb,text,text,text,text,text,text)','EXECUTE'),'anonymous cannot finalize');

select ok(has_function_privilege('authenticated','public.save_and_finalize_clinical_encounter(uuid,jsonb,text,text,text,text,text,text)','EXECUTE'),'authenticated callers have guarded atomic RPC');

select ok(not has_function_privilege('authenticated','public.finalize_clinical_encounter(uuid,text)','EXECUTE'),'legacy direct finalization fails closed');

set local role authenticated; set local "request.jwt.claim.sub"='91000000-0000-4000-8000-000000000002'; set local "request.jwt.claim.role"='authenticated';

select throws_ok($$select public.save_and_finalize_clinical_encounter('96000000-0000-4000-8000-000000000001','{"complaint":"Original complaint","subjective":"Original subjective","objective":"Original objective","assessment":"Original assessment","plan":"Original plan"}'::jsonb,'Final complaint','Final subjective','Final objective','Final assessment','Final plan','Reviewed all clinical fields')$$,'42501','ENCOUNTER_DENIED','patient cannot finalize');

set local role authenticated; set local "request.jwt.claim.sub"='91000000-0000-4000-8000-000000000003'; set local "request.jwt.claim.role"='authenticated';

select throws_ok($$select public.save_and_finalize_clinical_encounter('96000000-0000-4000-8000-000000000001','{"complaint":"Original complaint","subjective":"Original subjective","objective":"Original objective","assessment":"Original assessment","plan":"Original plan"}'::jsonb,'Final complaint','Final subjective','Final objective','Final assessment','Final plan','Reviewed all clinical fields')$$,'42501','ENCOUNTER_DENIED','Admin cannot finalize');

set local role authenticated; set local "request.jwt.claim.sub"='91000000-0000-4000-8000-000000000004'; set local "request.jwt.claim.role"='authenticated';

select throws_ok($$select public.save_and_finalize_clinical_encounter('96000000-0000-4000-8000-000000000001','{"complaint":"Original complaint","subjective":"Original subjective","objective":"Original objective","assessment":"Original assessment","plan":"Original plan"}'::jsonb,'Final complaint','Final subjective','Final objective','Final assessment','Final plan','Reviewed all clinical fields')$$,'42501','ENCOUNTER_DENIED','unassigned verified dentist cannot finalize');

reset role; update public.dentist_profiles set status='suspended' where user_id='91000000-0000-4000-8000-000000000001';

set local role authenticated; set local "request.jwt.claim.sub"='91000000-0000-4000-8000-000000000001'; set local "request.jwt.claim.role"='authenticated';

select throws_ok($$select public.save_and_finalize_clinical_encounter('96000000-0000-4000-8000-000000000001','{"complaint":"Original complaint","subjective":"Original subjective","objective":"Original objective","assessment":"Original assessment","plan":"Original plan"}'::jsonb,'Final complaint','Final subjective','Final objective','Final assessment','Final plan','Reviewed all clinical fields')$$,'42501','ENCOUNTER_DENIED','suspended treating dentist cannot finalize');

reset role; update public.dentist_profiles set status='approved' where user_id='91000000-0000-4000-8000-000000000001';

set local role authenticated; set local "request.jwt.claim.sub"='91000000-0000-4000-8000-000000000001'; set local "request.jwt.claim.role"='authenticated';

select throws_ok($$select public.save_and_finalize_clinical_encounter('96000000-0000-4000-8000-000000000001',null,'Final complaint','Final subjective','Final objective','Final assessment','Final plan','Reviewed all clinical fields')$$,'40001','CLINICAL_RECORD_CHANGED','NULL expected snapshot fails closed');

select throws_ok($$select public.save_and_finalize_clinical_encounter('96000000-0000-4000-8000-000000000001','{}'::jsonb,'Final complaint','Final subjective','Final objective','Final assessment','Final plan','Reviewed all clinical fields')$$,'40001','CLINICAL_RECORD_CHANGED','incomplete expected snapshot fails closed');

select throws_ok($$select public.save_and_finalize_clinical_encounter('96000000-0000-4000-8000-000000000001','{"complaint":"Original complaint","subjective":"Original subjective","objective":"Original objective","assessment":"Original assessment","plan":"Original plan"}'::jsonb || '{"objective":"Stale objective"}'::jsonb,'Final complaint','Final subjective','Final objective','Final assessment','Final plan','Reviewed all clinical fields')$$,'40001','CLINICAL_RECORD_CHANGED','stale expected snapshot fails closed');

select throws_ok($$select public.save_and_finalize_clinical_encounter('96000000-0000-4000-8000-000000000001','{"complaint":"Original complaint","subjective":"Original subjective","objective":"Original objective","assessment":"Original assessment","plan":"Original plan"}'::jsonb,'Final complaint','Final subjective','Final objective','Final assessment','Final plan',null)$$,'22023','CLINICAL_CHANGE_REASON_REQUIRED','NULL reason rejected');

select throws_ok($$select public.save_and_finalize_clinical_encounter('96000000-0000-4000-8000-000000000001','{"complaint":"Original complaint","subjective":"Original subjective","objective":"Original objective","assessment":"Original assessment","plan":"Original plan"}'::jsonb,'Final complaint','Final subjective','Final objective','Final assessment','Final plan',repeat(chr(11)||chr(12),5))$$,'22023','CLINICAL_CHANGE_REASON_REQUIRED','blank reason rejected');

select throws_ok($$select public.save_and_finalize_clinical_encounter('96000000-0000-4000-8000-000000000001','{"complaint":"Original complaint","subjective":"Original subjective","objective":"Original objective","assessment":"Original assessment","plan":"Original plan"}'::jsonb,'Final complaint','Final subjective','Final objective','Final assessment','Final plan','ab')$$,'22023','CLINICAL_CHANGE_REASON_REQUIRED','short reason rejected');

select throws_ok($$select public.save_and_finalize_clinical_encounter('96000000-0000-4000-8000-000000000001','{"complaint":"Original complaint","subjective":"Original subjective","objective":"Original objective","assessment":"Original assessment","plan":"Original plan"}'::jsonb,'Final complaint','Final subjective','Final objective','Final assessment','Final plan',repeat('x',501))$$,'22023','CLINICAL_CHANGE_REASON_REQUIRED','oversized reason rejected');

select throws_ok($$select public.save_and_finalize_clinical_encounter('96000000-0000-4000-8000-000000000001','{"complaint":"Original complaint","subjective":"Original subjective","objective":"Original objective","assessment":"Original assessment","plan":"Original plan"}'::jsonb,'Final complaint','Final subjective',null,'Final assessment','Final plan','Reviewed all clinical fields')$$,'22023','CLINICAL_INPUT_INVALID','NULL objective rejected');

select throws_ok($$select public.save_and_finalize_clinical_encounter('96000000-0000-4000-8000-000000000001','{"complaint":"Original complaint","subjective":"Original subjective","objective":"Original objective","assessment":"Original assessment","plan":"Original plan"}'::jsonb,repeat('x',2001),'Final subjective','Final objective','Final assessment','Final plan','Reviewed all clinical fields')$$,'22023','CLINICAL_INPUT_INVALID','oversized complaint rejected');

select throws_ok($$select public.save_and_finalize_clinical_encounter('96000000-0000-4000-8000-000000000001','{"complaint":"Original complaint","subjective":"Original subjective","objective":"Original objective","assessment":"Original assessment","plan":"Original plan"}'::jsonb,'Final complaint',repeat('x',10001),'Final objective','Final assessment','Final plan','Reviewed all clinical fields')$$,'22023','CLINICAL_INPUT_INVALID','oversized subjective rejected');

select throws_ok($$select public.save_and_finalize_clinical_encounter('96000000-0000-4000-8000-000000000001','{"complaint":"Original complaint","subjective":"Original subjective","objective":"Original objective","assessment":"Original assessment","plan":"Original plan"}'::jsonb,'Final complaint','Final subjective','Final objective','Final assessment',repeat(chr(11),20),'Reviewed all clinical fields')$$,'22023','ENCOUNTER_FIELDS_REQUIRED','blank required final field rejected');

select throws_ok($$select public.save_and_finalize_clinical_encounter('96000000-0000-4000-8000-000000000002','{"complaint":"Original complaint","subjective":"Original subjective","objective":"Original objective","assessment":"Original assessment","plan":"Original plan"}'::jsonb,'Final complaint','Final subjective','Final objective','Final assessment','Final plan','Reviewed all clinical fields')$$,'22023','CLINICAL_DRAFTS_REMAIN','draft treatment plan prevents finalization');

select is((select chief_complaint from public.clinical_encounters where id='96000000-0000-4000-8000-000000000002'),'Original complaint','failed finalization rolls saved notes back');

select is((select status::text from public.clinical_encounters where id='96000000-0000-4000-8000-000000000002'),'draft','failed finalization leaves encounter draft');

reset role;

select is((select count(*) from public.clinical_record_versions where record_id='96000000-0000-4000-8000-000000000002'),0::bigint,'failed finalization rolls version insert back');

select is((select count(*) from public.audit_logs where target_id='96000000-0000-4000-8000-000000000002' and action='clinical.encounter_finalized'),0::bigint,'failed finalization creates no success audit');

select is((select status::text from public.appointments where id='95000000-0000-4000-8000-000000000002'),'checked_in','failed finalization leaves appointment unchanged');

set local role authenticated; set local "request.jwt.claim.sub"='91000000-0000-4000-8000-000000000001'; set local "request.jwt.claim.role"='authenticated';

select lives_ok($$select public.save_clinical_encounter('96000000-0000-4000-8000-000000000001','Original complaint','Original subjective','Reviewed AI objective','Original assessment','Original plan','Dentist-reviewed AI draft applied')$$,'a concurrent-style reviewed draft write updates notes before finalization');

select throws_ok($$select public.save_and_finalize_clinical_encounter('96000000-0000-4000-8000-000000000001','{"complaint":"Original complaint","subjective":"Original subjective","objective":"Original objective","assessment":"Original assessment","plan":"Original plan"}'::jsonb,'Final complaint','Final subjective','Final objective','Final assessment','Final plan','Reviewed all clinical fields')$$,'40001','CLINICAL_RECORD_CHANGED','pre-AI snapshot cannot silently finalize new notes');

select lives_ok($$select public.save_and_finalize_clinical_encounter('96000000-0000-4000-8000-000000000001','{"complaint":"Original complaint","subjective":"Original subjective","objective":"Reviewed AI objective","assessment":"Original assessment","plan":"Original plan"}'::jsonb,'Final complaint','Final subjective','Final objective','Final assessment','Final plan','Reviewed all clinical fields')$$,'freshly reviewed snapshot saves and finalizes atomically');

select is((select status::text||':'||objective_notes from public.clinical_encounters where id='96000000-0000-4000-8000-000000000001'),'finalized:Final objective','final record contains dentist submitted notes');

select is((select status::text from public.appointments where id='95000000-0000-4000-8000-000000000001'),'completed','successful finalization completes appointment');

select throws_ok($$select public.save_and_finalize_clinical_encounter('96000000-0000-4000-8000-000000000001','{"complaint":"Original complaint","subjective":"Original subjective","objective":"Reviewed AI objective","assessment":"Original assessment","plan":"Original plan"}'::jsonb,'Final complaint','Final subjective','Final objective','Final assessment','Final plan','Reviewed all clinical fields')$$,'22023','FINALIZED_RECORD_IMMUTABLE','replay cannot finalize or replace final record');

select throws_ok($$select public.save_clinical_encounter('96000000-0000-4000-8000-000000000001','Changed','Changed','Changed','Changed','Changed','Late AI result')$$,'22023','FINALIZED_RECORD_IMMUTABLE','late AI-style save cannot mutate final record');

reset role;

select is((select count(*) from public.audit_logs where target_id='96000000-0000-4000-8000-000000000001' and action='clinical.encounter_finalized'),1::bigint,'success has exactly one finalization audit');

select is((select count(*) from public.clinical_record_versions where record_id='96000000-0000-4000-8000-000000000001' and change_reason='Reviewed all clinical fields' and changed_by='91000000-0000-4000-8000-000000000001'),2::bigint,'atomic save and finalize preserve authored versions');

select * from finish();
rollback;
