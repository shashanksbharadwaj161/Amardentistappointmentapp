begin;
select plan(36);

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) values
('b1000000-0000-4000-8000-000000000001','authenticated','authenticated','dual-super@example.test',now(),'{"full_name":"Dual Provider Test Super"}'),
('b1000000-0000-4000-8000-000000000002','authenticated','authenticated','dual-admin@example.test',now(),'{"full_name":"Dual Provider Test Admin"}'),
('b1000000-0000-4000-8000-000000000003','authenticated','authenticated','dual-patient@example.test',now(),'{"full_name":"Dual Provider Test Patient"}');
insert into public.user_roles(user_id,role) values('b1000000-0000-4000-8000-000000000001','super_admin'),('b1000000-0000-4000-8000-000000000002','admin');
insert into public.patient_profiles(id,account_owner_id,relationship,full_name) values('b2000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000003','self','Dual Provider Test Patient');
-- Rollback-only isolated settings. Never print stored plaintext secrets.
update public.ai_provider_settings set active_provider=false,enabled=false;
update public.ai_provider_settings set active_provider=true where provider='openai';
update public.feature_flags set enabled=true where flag_key='patient_ai';

select ok(not has_function_privilege('anon','public.select_ai_provider(text)','EXECUTE'),'anon cannot call select_ai_provider(text)');

select ok(not has_function_privilege('authenticated','public.ai_task_provider_secret(uuid)','EXECUTE'),'authenticated cannot call ai_task_provider_secret(uuid)');

select ok(has_function_privilege('service_role','public.ai_task_provider_secret(uuid)','EXECUTE'),'service_role may call ai_task_provider_secret(uuid)');

select ok(not has_function_privilege('anon','public.set_ai_provider_model(text,text)','EXECUTE'),'anon cannot call set_ai_provider_model(text,text)');

reset role; set local role authenticated; set local "request.jwt.claim.role"='authenticated'; set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000002';

select throws_ok($$select public.select_ai_provider('anthropic')$$,'42501','SUPER_ADMIN_REQUIRED','Admin cannot change active provider');

select throws_ok($$select public.set_ai_provider_model('anthropic','claude-sonnet-4-5-20250929')$$,'42501','SUPER_ADMIN_REQUIRED','Admin cannot change model');

reset role; set local role authenticated; set local "request.jwt.claim.role"='authenticated'; set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000001';

select throws_ok($$select public.select_ai_provider('unknown')$$,'22023','AI_PROVIDER_INPUT_INVALID','unknown provider rejected');

select throws_ok($$select public.select_ai_provider('anthropic')$$,'22023','AI_PROVIDER_NOT_CONFIGURED','unconfigured provider cannot be selected');

select throws_ok($$select public.set_ai_provider_model('anthropic',null)$$,'22023','AI_PROVIDER_INPUT_INVALID','invalid Claude model rejected null');

select throws_ok($$select public.set_ai_provider_model('anthropic','gpt-5-mini')$$,'22023','AI_PROVIDER_INPUT_INVALID','invalid Claude model rejected gpt-5-mini');

select throws_ok($$select public.set_ai_provider_model('anthropic','claude bad')$$,'22023','AI_PROVIDER_INPUT_INVALID','invalid Claude model rejected claude bad');

select throws_ok($$select public.set_ai_provider_model('anthropic',repeat('x',121))$$,'22023','AI_PROVIDER_INPUT_INVALID','invalid Claude model rejected repeat(x,121)');

reset role; set local role service_role; set local "request.jwt.claim.role"='service_role'; set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000001';

select throws_ok($$select public.rotate_ai_provider_secret('b1000000-0000-4000-8000-000000000002','anthropic','claude-haiku-4-5-20251001',repeat('synthetic',5))$$,'42501','SUPER_ADMIN_REQUIRED','rotation verifies the actor is Super Admin');

select throws_ok($$select public.rotate_ai_provider_secret('b1000000-0000-4000-8000-000000000001','anthropic','gpt-5-mini',repeat('synthetic',5))$$,'22023','AI_PROVIDER_INPUT_INVALID','rotation validates provider model');

select lives_ok($$select public.rotate_ai_provider_secret('b1000000-0000-4000-8000-000000000001','openai','gpt-5-mini',repeat('synthetic-openai-',3))$$,'OpenAI key configured privately');

select lives_ok($$select public.rotate_ai_provider_secret('b1000000-0000-4000-8000-000000000001','anthropic','claude-haiku-4-5-20251001',repeat('synthetic-claude-',3))$$,'Claude key configured independently');

reset role;

select is((select provider from public.ai_provider_settings where active_provider),'openai','configuring Claude does not change active provider');

select is((select count(distinct vault_secret_id) from public.ai_provider_settings where provider in ('openai','anthropic')),2::bigint,'providers have separate Vault secrets');

reset role; set local role authenticated; set local "request.jwt.claim.role"='authenticated'; set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000001';

select lives_ok($$select public.set_ai_provider_model('anthropic','claude-sonnet-4-5-20250929')$$,'Super Admin can select another Claude model without reentering a key');

select lives_ok($$select public.select_ai_provider('anthropic')$$,'configured Claude can become active');

select is((select count(*) from public.ai_provider_settings where active_provider),1::bigint,'exactly one active provider remains');

select is((select count(*) from public.audit_logs where actor_id='b1000000-0000-4000-8000-000000000001' and action='ai.active_provider_selected'),1::bigint,'provider selection is audited');

select is((select count(*) from public.audit_logs where actor_id='b1000000-0000-4000-8000-000000000001' and action='ai.provider_model_selected'),1::bigint,'model selection is audited');

reset role; set local role authenticated; set local "request.jwt.claim.role"='authenticated'; set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000003';

select ok(length(set_config('test.dual_task',(select task_id from public.prepare_ai_task('general_guidance',null,'b2000000-0000-4000-8000-000000000001',null,'Synthetic dental guidance request','en'))::text,true))=36,'patient task prepared with active provider');

reset role; set local role authenticated; set local "request.jwt.claim.role"='authenticated'; set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000001';

select lives_ok($$select public.select_ai_provider('openai')$$,'Super Admin can switch back without altering pending task');

reset role; set local role service_role; set local "request.jwt.claim.role"='service_role'; set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000001';

select is((select provider||':'||model from public.ai_task_provider_secret(current_setting('test.dual_task')::uuid)),'anthropic:claude-sonnet-4-5-20250929','pending task retains captured Claude provider and model after switch');

select ok((select secret=repeat('synthetic-claude-',3) from public.ai_task_provider_secret(current_setting('test.dual_task')::uuid)),'pending Claude task uses only its own credential');

select lives_ok($$select public.rotate_ai_provider_secret('b1000000-0000-4000-8000-000000000001','anthropic','claude-haiku-4-5-20251001',repeat('synthetic-claude-new-',3))$$,'Claude model rotation can occur after a task was prepared');

select is((select count(*) from public.ai_task_provider_secret(current_setting('test.dual_task')::uuid)),0::bigint,'old task fails closed after model rotation rather than using another model');

reset role;

select is((select provider||':'||model from public.ai_tasks where id=current_setting('test.dual_task')::uuid),'anthropic:claude-sonnet-4-5-20250929','task audit snapshot was not rewritten by rotation');

reset role; set local role authenticated; set local "request.jwt.claim.role"='authenticated'; set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000003';

select ok(length(set_config('test.openai_task',(select task_id from public.prepare_ai_task('general_guidance',null,'b2000000-0000-4000-8000-000000000001',null,'Another synthetic dental guidance request','en'))::text,true))=36,'next task uses newly active provider');

reset role; set local role service_role; set local "request.jwt.claim.role"='service_role'; set local "request.jwt.claim.sub"='b1000000-0000-4000-8000-000000000001';

select is((select provider||':'||model from public.ai_task_provider_secret(current_setting('test.openai_task')::uuid)),'openai:gpt-5-mini','new task routes to captured OpenAI settings');

select lives_ok($$select public.rotate_ai_provider_secret('b1000000-0000-4000-8000-000000000001','openai','gpt-5-mini',repeat('synthetic-openai-new-',3))$$,'same-model key rotation is allowed');

select ok((select secret=repeat('synthetic-openai-new-',3) from public.ai_task_provider_secret(current_setting('test.openai_task')::uuid)),'same-model rotation still resolves only captured provider and model');

select lives_ok($$select public.complete_ai_task(current_setting('test.openai_task')::uuid,'{}'::jsonb,null,'',0,0,0,'AI_PROVIDER_FAILED')$$,'fixture task failure recorded');

select throws_ok($$select * from public.ai_task_provider_secret(current_setting('test.openai_task')::uuid)$$,'22023','AI_TASK_NOT_PENDING','finished task cannot obtain credentials again');

select * from finish();
rollback;
