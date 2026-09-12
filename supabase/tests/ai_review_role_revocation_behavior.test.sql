begin;
select no_plan();
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) values
('25000001-0000-4000-8000-000000000001','authenticated','authenticated','ai-review-dentist@example.test',now(),'{"full_name":"AI review dentist"}'),
('25000001-0000-4000-8000-000000000002','authenticated','authenticated','ai-review-patient@example.test',now(),'{"full_name":"AI review patient"}'),
('25000001-0000-4000-8000-000000000003','authenticated','authenticated','ai-review-super@example.test',now(),'{"full_name":"AI review Super Admin"}');
insert into public.user_roles(user_id,role) values('25000001-0000-4000-8000-000000000001','dentist'),('25000001-0000-4000-8000-000000000003','super_admin');
insert into public.dentist_profiles(user_id,bmdc_registration_number,professional_title,status,approved_at,approved_by) values
('25000001-0000-4000-8000-000000000001','BMDC-AI-REVIEW-25','Dentist','approved',now(),'25000001-0000-4000-8000-000000000003');
insert into public.patient_profiles(id,account_owner_id,relationship,full_name) values
('25000002-0000-4000-8000-000000000001','25000001-0000-4000-8000-000000000002','self','AI review patient');
update public.feature_flags set enabled=true where flag_key='experimental_xray_ai';
insert into public.ai_tasks(id,task_type,audience,status,requested_by,patient_profile_id,prompt_version_id,provider,model,input,raw_output,required_review_fields)
select ('25000003-0000-4000-8000-'||lpad(ordinality::text,12,'0'))::uuid,task_type,'dentist','awaiting_review','25000001-0000-4000-8000-000000000001','25000002-0000-4000-8000-000000000001',
  (select id from public.ai_prompt_versions p where p.task_type=media.task_type and active limit 1),'openai','fixture-model','{"message":"Private clinical image context"}','{"quality":"limited"}',array['quality']
from unnest(array['photo_quality','oral_photo_observation','xray_observation']) with ordinality media(task_type,ordinality);
insert into public.ai_tasks(id,task_type,audience,status,requested_by,patient_profile_id,prompt_version_id,provider,model,input,raw_output,safe_output,completed_at) values
('25000003-0000-4000-8000-000000000004','general_guidance','patient','completed','25000001-0000-4000-8000-000000000002','25000002-0000-4000-8000-000000000001',(select id from public.ai_prompt_versions where task_type='general_guidance' and active limit 1),'openai','fixture-model','{"message":"Patient question"}','{"private":"raw provider evidence"}','{"summary":"Patient-safe guidance"}',now());
insert into public.patient_ai_messages(patient_profile_id,task_id,user_message,safe_response) values
('25000002-0000-4000-8000-000000000001','25000003-0000-4000-8000-000000000004','Patient question','{"summary":"Patient-safe guidance"}');

set local role authenticated;
set local "request.jwt.claim.sub"='25000001-0000-4000-8000-000000000001';
set local "request.jwt.claim.role"='authenticated';
select is((select count(*) from public.ai_tasks where requested_by=auth.uid()),3::bigint,'verified dentist can read own raw media drafts');
select throws_ok($$select public.apply_reviewed_ai_task('25000003-0000-4000-8000-000000000001','{}','{"quality":"reviewed"}','Reviewed image')$$,'22023','AI_FIELDS_REQUIRE_REVIEW','verified dentist must still review every required field');
select ok(not has_function_privilege('authenticated','public.review_ai_task(uuid,jsonb,jsonb,text)','EXECUTE'),'direct review remains unavailable to clients');
reset role;
delete from public.user_roles where user_id='25000001-0000-4000-8000-000000000001' and role='dentist';
set local role authenticated;
select is((select count(*) from public.ai_tasks where requested_by=auth.uid()),0::bigint,'revoked dentist cannot read own raw AI input or output');
select throws_ok(format('select public.apply_reviewed_ai_task(%L,%L,%L,%L)',('25000003-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'{"quality":true}','{"quality":"reviewed"}','Reviewed image'),'42501','AI_REVIEW_DENIED','revoked dentist cannot apply media task '||n)
from generate_series(1,3) n;
reset role;
select is((select count(*) from public.ai_tasks where requested_by='25000001-0000-4000-8000-000000000001' and status='awaiting_review'),3::bigint,'revoked review attempts leave drafts unchanged');
-- Exercise the private review helper as its database owner with the revoked
-- actor's JWT, so its guard is checked independently of the public apply RPC.
update public.ai_tasks set status='awaiting_review',completed_at=null where id='25000003-0000-4000-8000-000000000001';
select throws_ok($$select public.review_ai_task('25000003-0000-4000-8000-000000000001','{"quality":true}','{"quality":"reviewed"}','Reviewed image')$$,'42501','AI_REVIEW_DENIED','private review helper also checks current dentist verification');

-- Reset fixture states to keep the suspended regression independent on baseline.
update public.ai_tasks set status='awaiting_review',completed_at=null where requested_by='25000001-0000-4000-8000-000000000001';
insert into public.user_roles(user_id,role) values('25000001-0000-4000-8000-000000000001','dentist');
update public.dentist_profiles set status='suspended' where user_id='25000001-0000-4000-8000-000000000001';
set local role authenticated;
select is((select count(*) from public.ai_tasks where requested_by=auth.uid()),0::bigint,'suspended dentist cannot read own raw drafts despite active role');
select throws_ok(format('select public.apply_reviewed_ai_task(%L,%L,%L,%L)',('25000003-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'{"quality":true}','{"quality":"reviewed"}','Reviewed image'),'42501','AI_REVIEW_DENIED','suspended dentist cannot apply media task '||n)
from generate_series(1,3) n;
reset role;
select is((select count(*) from public.ai_tasks where requested_by='25000001-0000-4000-8000-000000000001' and status='awaiting_review'),3::bigint,'suspended review attempts leave drafts unchanged');
update public.ai_tasks set status='awaiting_review',completed_at=null where requested_by='25000001-0000-4000-8000-000000000001';
update public.dentist_profiles set status='approved' where user_id='25000001-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok(format('select public.apply_reviewed_ai_task(%L,%L,%L,%L)',('25000003-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'{"quality":true}','{"quality":"reviewed"}','Reviewed image'),'restored verified dentist can apply reviewed media task '||n)
from generate_series(1,3) n;
reset role;
select is((select count(*) from public.ai_tasks where requested_by='25000001-0000-4000-8000-000000000001' and status='completed'),3::bigint,'verified media reviews reach completed status');
select is((select count(*) from public.audit_logs where actor_id='25000001-0000-4000-8000-000000000001' and action='ai.draft_reviewed'),3::bigint,'only successful verified reviews create review audit records');

set local role authenticated;
set local "request.jwt.claim.sub"='25000001-0000-4000-8000-000000000002';
select is((select count(*) from public.ai_tasks),0::bigint,'patient cannot read raw patient or dentist tasks');
select throws_ok($$select public.apply_reviewed_ai_task('25000003-0000-4000-8000-000000000001','{"quality":true}','{"quality":"reviewed"}','Patient attempted review')$$,'42501','AI_REVIEW_DENIED','patient cannot apply dentist media review');
select is((select safe_response->>'summary' from public.patient_ai_messages where task_id='25000003-0000-4000-8000-000000000004'),'Patient-safe guidance','patient retains their separate final safe output');
set local "request.jwt.claim.sub"='25000001-0000-4000-8000-000000000003';
select is((select count(*) from public.ai_tasks),0::bigint,'Super Admin has no unaudited raw task table access');
select is(public.super_admin_ai_task_snapshot('25000003-0000-4000-8000-000000000001','Investigate clinical AI review complaint')->>'task_type','photo_quality','Super Admin retains reasoned audited snapshot access');
reset role;
select is((select count(*) from public.audit_logs where actor_id='25000001-0000-4000-8000-000000000003' and action='ai.super_admin_read'),1::bigint,'Super Admin snapshot still records sensitive-access audit');
select * from finish();
rollback;
