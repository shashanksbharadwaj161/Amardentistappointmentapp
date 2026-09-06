begin;
select plan(28);
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) values
('61000000-0000-4000-8000-000000000001','authenticated','authenticated','ai-dentist@example.test',now(),'{"full_name":"AI Dentist"}'),
('61000000-0000-4000-8000-000000000002','authenticated','authenticated','ai-patient@example.test',now(),'{"full_name":"AI Patient"}'),
('61000000-0000-4000-8000-000000000003','authenticated','authenticated','ai-outsider@example.test',now(),'{"full_name":"AI Outsider"}'),
('61000000-0000-4000-8000-000000000004','authenticated','authenticated','ai-super@example.test',now(),'{"full_name":"AI Super"}');
insert into public.user_roles(user_id,role) values('61000000-0000-4000-8000-000000000001','dentist'),('61000000-0000-4000-8000-000000000004','super_admin');
insert into public.clinics(id,name,slug,phone,address_line,district,city,status,approved_at,approved_by,created_by) values('62000000-0000-4000-8000-000000000001','AI Test Clinic','ai-test-clinic','01710000000','Test Road','Dhaka','Dhaka','approved',now(),'61000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000001');
insert into public.clinic_memberships(clinic_id,user_id,role,status,joined_at) values('62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','dentist','active',now());
insert into public.dentist_profiles(user_id,bmdc_registration_number,professional_title,status,approved_at,approved_by) values('61000000-0000-4000-8000-000000000001','BMDC-AI-01','Dental Surgeon','approved',now(),'61000000-0000-4000-8000-000000000004');
insert into public.patient_profiles(id,account_owner_id,relationship,full_name) values('63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','self','AI Patient');
insert into public.clinic_services(id,clinic_id,dentist_id,name,duration_minutes,price_bdt,deposit_bdt,is_active,created_by) values('64000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','AI consultation',30,800,200,true,'61000000-0000-4000-8000-000000000001');
insert into public.appointments(id,patient_profile_id,booked_by,clinic_id,dentist_id,service_id,start_at,end_at,duration_minutes,price_bdt,deposit_bdt,status) values('65000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000001',now()-interval '1 hour',now()-interval '30 minutes',30,800,200,'checked_in');
insert into public.clinical_encounters(id,appointment_id,patient_profile_id,clinic_id,treating_dentist_id,status,chief_complaint) values('66000000-0000-4000-8000-000000000001','65000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','draft','Cold sensitivity');
insert into public.clinical_media(id,patient_profile_id,clinic_id,encounter_id,kind,storage_path,filename,content_type,byte_size,uploaded_by) values('67000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001','xray','61000000-0000-4000-8000-000000000001/xray.jpg','xray.jpg','image/jpeg',100,'61000000-0000-4000-8000-000000000001');

set local role authenticated;set local "request.jwt.claim.sub"='61000000-0000-4000-8000-000000000004';set local "request.jwt.claim.role"='authenticated';
select lives_ok($$select public.set_feature_flag('dentist_ai',false)$$,'Super Admin can disable dentist AI');
reset role;set local role authenticated;set local "request.jwt.claim.sub"='61000000-0000-4000-8000-000000000001';set local "request.jwt.claim.role"='authenticated';
select throws_ok($$select * from public.prepare_ai_task('clinical_note','66000000-0000-4000-8000-000000000001',null,null,'Draft only from facts','en')$$,'22023','AI_FEATURE_DISABLED','disabled dentist AI fails at the database boundary');
reset role;set local role authenticated;set local "request.jwt.claim.sub"='61000000-0000-4000-8000-000000000004';set local "request.jwt.claim.role"='authenticated';
select lives_ok($$select public.set_feature_flag('dentist_ai',true)$$,'Super Admin can re-enable dentist AI');

set local role authenticated;set local "request.jwt.claim.sub"='61000000-0000-4000-8000-000000000003';set local "request.jwt.claim.role"='authenticated';
select throws_ok($$select * from public.prepare_ai_task('clinical_note','66000000-0000-4000-8000-000000000001',null,null,'Invent a diagnosis','en')$$,'42501','AI_DENTIST_DENIED','outsider cannot draft against another dentist encounter');
select throws_ok($$select * from public.prepare_ai_task('symptom_intake',null,'63000000-0000-4000-8000-000000000001',null,'Tooth pain for two days','en')$$,'42501','AI_PATIENT_DENIED','outsider cannot use another patient profile');
reset role;set local role authenticated;set local "request.jwt.claim.sub"='61000000-0000-4000-8000-000000000001';set local "request.jwt.claim.role"='authenticated';
select ok(length(set_config('test.ai_task',(select task_id from public.prepare_ai_task('clinical_note','66000000-0000-4000-8000-000000000001',null,null,'Draft only from the recorded facts','en'))::text,true))=36,'treating dentist creates a private AI task');
select is((select required_review_fields from public.ai_tasks where id=current_setting('test.ai_task')::uuid),array['subjective','objective','assessment','plan']::text[],'clinical note requires every structured field');
select throws_ok($$select public.apply_reviewed_ai_task(current_setting('test.ai_task')::uuid,'{"subjective":true}'::jsonb,'{}'::jsonb,'Reviewed')$$,'42501','AI_REVIEW_DENIED','uncompleted provider task cannot be reviewed');
reset role;set local role service_role;set local "request.jwt.claim.role"='service_role';
select is(public.ai_daily_limit('61000000-0000-4000-8000-000000000001','dentist'),15,'database-configured free dentist limit is authoritative');
reset role;
select throws_ok($$insert into public.ai_tasks(task_type,audience,requested_by,patient_profile_id,clinic_id,encounter_id,media_id,prompt_version_id,provider,model,locale,input,required_review_fields) values('xray_observation','dentist','61000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','66000000-0000-4000-8000-000000000001','67000000-0000-4000-8000-000000000001',(select id from public.ai_prompt_versions where task_type='xray_observation' and active limit 1),'openai','test-model','en','{"message":"review"}'::jsonb,array['quality'])$$,'22023','AI_XRAY_FEATURE_DISABLED','experimental X-ray AI remains blocked while its flag is off');
set local role service_role;set local "request.jwt.claim.role"='service_role';
select ok(public.consume_api_limit('61000000-0000-4000-8000-000000000001','ai:dentist',2,1440),'first AI request is under limit');
select ok(public.consume_api_limit('61000000-0000-4000-8000-000000000001','ai:dentist',2,1440),'second AI request is under limit');
select ok(not public.consume_api_limit('61000000-0000-4000-8000-000000000001','ai:dentist',2,1440),'third AI request is rate limited');
select lives_ok($$select public.complete_ai_task(current_setting('test.ai_task')::uuid,'{"subjective":"Reported pain","objective":"Review","assessment":"Review","plan":"Examine"}'::jsonb,null,'provider-1',10,12,0.01,null)$$,'server stores provider output privately');
reset role;set local role authenticated;set local "request.jwt.claim.sub"='61000000-0000-4000-8000-000000000001';set local "request.jwt.claim.role"='authenticated';
select throws_ok($$select public.apply_reviewed_ai_task(current_setting('test.ai_task')::uuid,'{"subjective":true,"objective":true}'::jsonb,'{}'::jsonb,'Reviewed')$$,'22023','AI_FIELDS_REQUIRE_REVIEW','partial field review is rejected');
select lives_ok($$select public.apply_reviewed_ai_task(current_setting('test.ai_task')::uuid,'{"subjective":true,"objective":true,"assessment":true,"plan":true}'::jsonb,'{"subjective":"Reported pain","objective":"Reviewed finding","assessment":"Dentist assessment","plan":"Dentist plan"}'::jsonb,'All fields checked')$$,'dentist atomically applies only after all fields are reviewed');
select is((select status::text from public.ai_tasks where id=current_setting('test.ai_task')::uuid),'completed','reviewed dentist task completes');
select is((select subjective_notes from public.clinical_encounters where id='66000000-0000-4000-8000-000000000001'),'Reported pain','reviewed note is applied in the same transaction');
reset role;set local role authenticated;set local "request.jwt.claim.sub"='61000000-0000-4000-8000-000000000002';set local "request.jwt.claim.role"='authenticated';
select ok(length(set_config('test.patient_task',(select task_id from public.prepare_ai_task('symptom_intake',null,'63000000-0000-4000-8000-000000000001',null,'Tooth pain for two days','bn'))::text,true))=36,'patient creates a bounded guidance task');
select is((select count(*) from public.ai_tasks where id=current_setting('test.patient_task')::uuid),0::bigint,'patient cannot directly read raw AI task');
reset role;set local role service_role;set local "request.jwt.claim.role"='service_role';
select lives_ok($$select public.complete_ai_task(current_setting('test.patient_task')::uuid,'{"provider":"raw"}'::jsonb,'{"summary":"সাধারণ তথ্য","urgency":"soon","guidance":["ডেন্টিস্ট বুক করুন"],"redFlags":[],"bookingRecommended":true,"disclaimer":"এটি সাধারণ তথ্য, রোগ নির্ণয় বা প্রেসক্রিপশন নয়।"}'::jsonb,'provider-2',8,16,0.01,null)$$,'server stores a distinct patient-safe response');
reset role;set local role authenticated;set local "request.jwt.claim.sub"='61000000-0000-4000-8000-000000000002';set local "request.jwt.claim.role"='authenticated';
select is((select safe_response->>'summary' from public.patient_ai_messages where task_id=current_setting('test.patient_task')::uuid),'সাধারণ তথ্য','patient sees only the safety-filtered response');
select is((select count(*) from public.patient_ai_messages where task_id=current_setting('test.ai_task')::uuid),0::bigint,'dentist raw drafts never enter the patient message table');
reset role;set local role authenticated;set local "request.jwt.claim.sub"='61000000-0000-4000-8000-000000000004';set local "request.jwt.claim.role"='authenticated';
select lives_ok($$select public.set_feature_flag('experimental_xray_ai',true)$$,'Super Admin can gate experimental X-ray AI');
select is((select enabled from public.feature_flags where flag_key='experimental_xray_ai'),true,'feature flag change persists');
select lives_ok($$select public.set_platform_usage_limit('patient_ai_daily',4,30)$$,'Super Admin changes bounded usage quotas');
reset role;set local role service_role;set local "request.jwt.claim.role"='service_role';
select is(public.ai_daily_limit('61000000-0000-4000-8000-000000000002','patient'),4,'edited free patient limit drives the server rate limit');
reset role;
insert into public.notification_outbox(id,recipient_id,channel,template_key,payload,idempotency_key,status,attempt_count,next_attempt_at,created_at,updated_at) values('68000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','email','lease.recovery','{}','lease-recovery-key','processing',1,now()-interval '10 minutes',now()-interval '10 minutes',now()-interval '10 minutes');
set local role service_role;set local "request.jwt.claim.role"='service_role';
select is((select count(*) from public.claim_notification_batch(10) where id='68000000-0000-4000-8000-000000000001'),1::bigint,'stale processing notification is reclaimed after its lease');
select * from finish();
rollback;
