begin;
select plan(32);

-- All synthetic identities and snapshots are rolled back. No credentials or
-- external AI provider requests are needed for this security regression.
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) values
('81000000-0000-4000-8000-000000000001','authenticated','authenticated','emergency-super@example.test',now(),'{"full_name":"Emergency Test Super"}'),
('81000000-0000-4000-8000-000000000002','authenticated','authenticated','emergency-admin@example.test',now(),'{"full_name":"Emergency Test Admin"}'),
('81000000-0000-4000-8000-000000000003','authenticated','authenticated','emergency-patient@example.test',now(),'{"full_name":"Emergency Test Patient"}');
insert into public.user_roles(user_id,role) values ('81000000-0000-4000-8000-000000000001','super_admin'),('81000000-0000-4000-8000-000000000002','admin');
insert into public.patient_profiles(id,account_owner_id,relationship,full_name) values ('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000003','self','Emergency Test Patient');
update public.feature_flags set enabled=true where flag_key='patient_ai';
insert into public.ai_tasks(id,task_type,audience,requested_by,patient_profile_id,prompt_version_id,provider,model,input)
values ('83000000-0000-4000-8000-000000000001','general_guidance','patient','81000000-0000-4000-8000-000000000003','82000000-0000-4000-8000-000000000001',(select id from public.ai_prompt_versions where task_type='general_guidance' and active order by version desc limit 1),'openai','fixture-only','{"message":"Synthetic audit fixture"}');

select ok(not has_function_privilege('anon','public.super_admin_clinical_snapshot(uuid,text)','EXECUTE'),'anonymous cannot invoke super_admin_clinical_snapshot');

select ok(not has_function_privilege('anon','public.super_admin_ai_task_snapshot(uuid,text)','EXECUTE'),'anonymous cannot invoke super_admin_ai_task_snapshot');

set local role authenticated;
set local "request.jwt.claim.role"='authenticated';

set local "request.jwt.claim.sub"='81000000-0000-4000-8000-000000000002';

select throws_ok($$select public.super_admin_clinical_snapshot('82000000-0000-4000-8000-000000000001','Authorized support investigation')$$,'42501','SUPER_ADMIN_REQUIRED','Admin cannot use super_admin_clinical_snapshot');

select throws_ok($$select public.super_admin_ai_task_snapshot('83000000-0000-4000-8000-000000000001','Authorized support investigation')$$,'42501','SUPER_ADMIN_REQUIRED','Admin cannot use super_admin_ai_task_snapshot');

set local "request.jwt.claim.sub"='81000000-0000-4000-8000-000000000003';

select throws_ok($$select public.super_admin_clinical_snapshot('82000000-0000-4000-8000-000000000001','Authorized support investigation')$$,'42501','SUPER_ADMIN_REQUIRED','patient cannot use super_admin_clinical_snapshot');

select throws_ok($$select public.super_admin_ai_task_snapshot('83000000-0000-4000-8000-000000000001','Authorized support investigation')$$,'42501','SUPER_ADMIN_REQUIRED','patient cannot use super_admin_ai_task_snapshot');

set local "request.jwt.claim.sub"='81000000-0000-4000-8000-000000000001';

select throws_ok($$select public.super_admin_clinical_snapshot('82000000-0000-4000-8000-000000000001',null)$$,'22023','ACCESS_REASON_REQUIRED','super_admin_clinical_snapshot rejects NULL reason');

select throws_ok($$select public.super_admin_ai_task_snapshot('83000000-0000-4000-8000-000000000001',null)$$,'22023','ACCESS_REASON_REQUIRED','super_admin_ai_task_snapshot rejects NULL reason');

select throws_ok($$select public.super_admin_clinical_snapshot('82000000-0000-4000-8000-000000000001','')$$,'22023','ACCESS_REASON_REQUIRED','super_admin_clinical_snapshot rejects empty reason');

select throws_ok($$select public.super_admin_ai_task_snapshot('83000000-0000-4000-8000-000000000001','')$$,'22023','ACCESS_REASON_REQUIRED','super_admin_ai_task_snapshot rejects empty reason');

select throws_ok($$select public.super_admin_clinical_snapshot('82000000-0000-4000-8000-000000000001',repeat(' ', 20))$$,'22023','ACCESS_REASON_REQUIRED','super_admin_clinical_snapshot rejects spaces reason');

select throws_ok($$select public.super_admin_ai_task_snapshot('83000000-0000-4000-8000-000000000001',repeat(' ', 20))$$,'22023','ACCESS_REASON_REQUIRED','super_admin_ai_task_snapshot rejects spaces reason');

select throws_ok($$select public.super_admin_clinical_snapshot('82000000-0000-4000-8000-000000000001',repeat(E'\t\n\r', 5))$$,'22023','ACCESS_REASON_REQUIRED','super_admin_clinical_snapshot rejects whitespace reason');

select throws_ok($$select public.super_admin_ai_task_snapshot('83000000-0000-4000-8000-000000000001',repeat(E'\t\n\r', 5))$$,'22023','ACCESS_REASON_REQUIRED','super_admin_ai_task_snapshot rejects whitespace reason');

select throws_ok($$select public.super_admin_clinical_snapshot('82000000-0000-4000-8000-000000000001',repeat(chr(11), 20))$$,'22023','ACCESS_REASON_REQUIRED','clinical snapshot rejects vertical-tab-only reason');

select throws_ok($$select public.super_admin_ai_task_snapshot('83000000-0000-4000-8000-000000000001',repeat(chr(11), 20))$$,'22023','ACCESS_REASON_REQUIRED','AI snapshot rejects vertical-tab-only reason');

select throws_ok($$select public.super_admin_clinical_snapshot('82000000-0000-4000-8000-000000000001',repeat(chr(12), 20))$$,'22023','ACCESS_REASON_REQUIRED','clinical snapshot rejects form-feed-only reason');

select throws_ok($$select public.super_admin_ai_task_snapshot('83000000-0000-4000-8000-000000000001',repeat(chr(12), 20))$$,'22023','ACCESS_REASON_REQUIRED','AI snapshot rejects form-feed-only reason');

select throws_ok($$select public.super_admin_clinical_snapshot('82000000-0000-4000-8000-000000000001','123456789')$$,'22023','ACCESS_REASON_REQUIRED','super_admin_clinical_snapshot rejects short reason');

select throws_ok($$select public.super_admin_ai_task_snapshot('83000000-0000-4000-8000-000000000001','123456789')$$,'22023','ACCESS_REASON_REQUIRED','super_admin_ai_task_snapshot rejects short reason');

select throws_ok($$select public.super_admin_clinical_snapshot('82000000-0000-4000-8000-000000000001',repeat('x',501))$$,'22023','ACCESS_REASON_REQUIRED','super_admin_clinical_snapshot rejects oversized reason');

select throws_ok($$select public.super_admin_ai_task_snapshot('83000000-0000-4000-8000-000000000001',repeat('x',501))$$,'22023','ACCESS_REASON_REQUIRED','super_admin_ai_task_snapshot rejects oversized reason');

select is((select count(*) from public.audit_logs where actor_id='81000000-0000-4000-8000-000000000001' and action='clinical.super_admin_read' and target_id='82000000-0000-4000-8000-000000000001'),0::bigint,'rejected clinical.super_admin_read attempts do not produce successful-read events');

select is((select count(*) from public.audit_logs where actor_id='81000000-0000-4000-8000-000000000001' and action='ai.super_admin_read' and target_id='83000000-0000-4000-8000-000000000001'),0::bigint,'rejected ai.super_admin_read attempts do not produce successful-read events');

select is(jsonb_typeof(public.super_admin_clinical_snapshot('82000000-0000-4000-8000-000000000001',E' \t1234567890\n ')),'object','clinical snapshot accepts trimmed minimum length reason');

select is(public.super_admin_ai_task_snapshot('83000000-0000-4000-8000-000000000001',E' \t1234567890\n ')->>'id','83000000-0000-4000-8000-000000000001','AI snapshot preserves the requested task payload');

select is(jsonb_typeof(public.super_admin_clinical_snapshot('82000000-0000-4000-8000-000000000001',repeat('x',500))),'object','clinical reason accepts maximum length');

select is(public.super_admin_ai_task_snapshot('83000000-0000-4000-8000-000000000001',repeat('x',500))->>'task_type','general_guidance','AI reason accepts maximum length and preserves task fields');

select is((select count(*) from public.audit_logs where actor_id='81000000-0000-4000-8000-000000000001' and action='clinical.super_admin_read' and target_id='82000000-0000-4000-8000-000000000001'),2::bigint,'each valid clinical.super_admin_read is audited');

select is((select count(*) from public.audit_logs where actor_id='81000000-0000-4000-8000-000000000001' and action='clinical.super_admin_read' and target_id='82000000-0000-4000-8000-000000000001' and metadata->>'reason'='1234567890'),1::bigint,'clinical.super_admin_read audits the normalized reason');

select is((select count(*) from public.audit_logs where actor_id='81000000-0000-4000-8000-000000000001' and action='ai.super_admin_read' and target_id='83000000-0000-4000-8000-000000000001'),2::bigint,'each valid ai.super_admin_read is audited');

select is((select count(*) from public.audit_logs where actor_id='81000000-0000-4000-8000-000000000001' and action='ai.super_admin_read' and target_id='83000000-0000-4000-8000-000000000001' and metadata->>'reason'='1234567890'),1::bigint,'ai.super_admin_read audits the normalized reason');

select * from finish();
rollback;
