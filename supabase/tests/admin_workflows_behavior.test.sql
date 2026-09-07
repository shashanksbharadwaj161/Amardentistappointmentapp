begin;
select plan(16);
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) values
('71000000-0000-4000-8000-000000000001','authenticated','authenticated','support-patient@example.test',now(),'{"full_name":"Test Patient"}'),
('71000000-0000-4000-8000-000000000002','authenticated','authenticated','support-admin@example.test',now(),'{"full_name":"Test Admin"}'),
('71000000-0000-4000-8000-000000000003','authenticated','authenticated','support-super@example.test',now(),'{"full_name":"Test Super"}'),
('71000000-0000-4000-8000-000000000004','authenticated','authenticated','support-outsider@example.test',now(),'{"full_name":"Test Outsider"}');
insert into public.user_roles(user_id,role) values
('71000000-0000-4000-8000-000000000002','admin'),('71000000-0000-4000-8000-000000000003','super_admin');
select ok(not has_function_privilege('anon','public.open_support_case(text,text,text,uuid)','EXECUTE'),'anonymous cannot open cases');
select ok(not has_function_privilege('authenticated','public.refund_execution_context(uuid)','EXECUTE'),'refund provider context is service-only');
set local role authenticated;
set local "request.jwt.claim.sub"='71000000-0000-4000-8000-000000000001';
set local "request.jwt.claim.role"='authenticated';
select ok(length(set_config('test.case',public.open_support_case('technical','The appointment screen does not load')::text,true))=36,'patient opens a case');
select is((select count(*) from public.support_cases where id=current_setting('test.case')::uuid),1::bigint,'patient reads own case');
select throws_ok($$select public.open_support_case('unknown','An invalid category')$$,'22023','CASE_INPUT_INVALID','category validated');
select throws_ok($$select public.open_support_case('technical','x')$$,'22023','CASE_INPUT_INVALID','summary validated');
select throws_ok($$select public.update_support_case(current_setting('test.case')::uuid,'resolved','Pretend resolution',true,now())$$,'42501','ADMIN_REQUIRED','patient cannot resolve cases');
select throws_ok($$select * from public.admin_user_roles()$$,'42501','SUPER_ADMIN_REQUIRED','patient cannot enumerate roles');
set local "request.jwt.claim.sub"='71000000-0000-4000-8000-000000000004';
select is((select count(*) from public.support_cases where id=current_setting('test.case')::uuid),0::bigint,'outsider cannot read case');
set local "request.jwt.claim.sub"='71000000-0000-4000-8000-000000000002';
select throws_ok($$select public.update_support_case(current_setting('test.case')::uuid,'resolved','Investigated safely',true,now()-interval '1 day')$$,'40001','CASE_CHANGED_REFRESH','stale case edits rejected');
select lives_ok($$select public.update_support_case(current_setting('test.case')::uuid,'investigating','Investigating report',true,(select updated_at from public.support_cases where id=current_setting('test.case')::uuid))$$,'admin assigns and updates case');
select is((select assigned_to from public.support_cases where id=current_setting('test.case')::uuid),'71000000-0000-4000-8000-000000000002'::uuid,'assignment persisted');
select throws_ok($$select public.moderate_case_review(current_setting('test.case')::uuid,false,'Reported language')$$,'22023','REVIEW_CASE_REQUIRED','unrelated case cannot moderate review');
select throws_ok($$select public.revoke_operational_admin('71000000-0000-4000-8000-000000000003','Remove protected user')$$,'42501','SUPER_ADMIN_REQUIRED','ordinary admin cannot remove access');
set local "request.jwt.claim.sub"='71000000-0000-4000-8000-000000000003';
select throws_ok($$select public.revoke_operational_admin('71000000-0000-4000-8000-000000000003','Remove protected user')$$,'42501','SUPER_ADMIN_PROTECTED','super admin cannot be removed through operational revocation');
select lives_ok($$select public.revoke_operational_admin('71000000-0000-4000-8000-000000000002','Access no longer required')$$,'super admin revokes ordinary admin');
select * from finish();
rollback;
