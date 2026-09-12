begin;
select no_plan();
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) values
('20000000-0020-4000-8000-000000000001','authenticated','authenticated','quota-window@example.test',now(),'{"full_name":"Quota test"}');
insert into public.user_roles(user_id,role) values('20000000-0020-4000-8000-000000000001','super_admin');

set local role anon;
set local "request.jwt.claim.role"='anon';
select throws_ok($$select public.consume_api_limit('20000000-0020-4000-8000-000000000001','ai:patient',1,1440)$$,'42501','permission denied for function consume_api_limit','anonymous callers cannot consume quotas');
reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='20000000-0020-4000-8000-000000000001';
set local "request.jwt.claim.role"='authenticated';
select throws_ok($$select public.consume_api_limit('20000000-0020-4000-8000-000000000001','ai:patient',1,1440)$$,'42501','permission denied for function consume_api_limit','even Super Admin cannot call the server-only quota function');
reset role;
set local role service_role;
set local "request.jwt.claim.role"='';
select throws_ok($$select public.consume_api_limit('20000000-0020-4000-8000-000000000001','ai:patient',1,1440)$$,'42501','SERVICE_ROLE_REQUIRED','missing JWT role fails closed even with execute permission');
set local "request.jwt.claim.role"='service_role';

select throws_ok($$select public.consume_api_limit(null,'quota:invalid',1,1440)$$,'22023','API_LIMIT_INPUT_INVALID','null actor rejected');
select throws_ok($$select public.consume_api_limit('20000000-0020-4000-8000-000000000001',null,1,1440)$$,'22023','API_LIMIT_INPUT_INVALID','null scope rejected');
select throws_ok($$select public.consume_api_limit('20000000-0020-4000-8000-000000000001',' ',1,1440)$$,'22023','API_LIMIT_INPUT_INVALID','blank scope rejected');
select throws_ok($$select public.consume_api_limit('20000000-0020-4000-8000-000000000001',' ai:patient',1,1440)$$,'22023','API_LIMIT_INPUT_INVALID','padded scope cannot create an accidental independent bucket');
select throws_ok($$select public.consume_api_limit('20000000-0020-4000-8000-000000000001','quota:invalid',null,1440)$$,'22023','API_LIMIT_INPUT_INVALID','null maximum rejected');
select throws_ok($$select public.consume_api_limit('20000000-0020-4000-8000-000000000001','quota:invalid',-1,1440)$$,'22023','API_LIMIT_INPUT_INVALID','negative maximum rejected');
select throws_ok($$select public.consume_api_limit('20000000-0020-4000-8000-000000000001','quota:invalid',1,null)$$,'22023','API_LIMIT_INPUT_INVALID','null window rejected');
select throws_ok($$select public.consume_api_limit('20000000-0020-4000-8000-000000000001','quota:invalid',1,0)$$,'22023','API_LIMIT_INPUT_INVALID','zero window rejected');
select throws_ok($$select public.consume_api_limit('20000000-0020-4000-8000-000000000001','quota:invalid',1,-1)$$,'22023','API_LIMIT_INPUT_INVALID','negative window rejected');
select is(public.consume_api_limit('20000000-0020-4000-8000-000000000001','quota:zero',0,1440),false,'zero disables the very first request');
select is((select count(*) from public.api_rate_limits where actor_id='20000000-0020-4000-8000-000000000001'),0::bigint,'invalid and disabled requests write no counters');

select is(public.consume_api_limit('20000000-0020-4000-8000-000000000001','ai:patient',2),true,'default window accepts first daily request');
set local timezone='Asia/Kathmandu';
select is(public.consume_api_limit('20000000-0020-4000-8000-000000000001','ai:patient',2,1440),true,'timezone change shares the same daily bucket');
select is((select window_started_at from public.api_rate_limits where actor_id='20000000-0020-4000-8000-000000000001' and scope='ai:patient'),date_trunc('day',statement_timestamp() at time zone 'UTC') at time zone 'UTC','daily bucket is exactly UTC midnight');
select is(public.consume_api_limit('20000000-0020-4000-8000-000000000001','ai:patient',2,1440),false,'third request is denied');
select is(public.consume_api_limit('20000000-0020-4000-8000-000000000001','ai:patient',0,1440),false,'setting zero disables an existing bucket immediately');
select is(public.consume_api_limit('20000000-0020-4000-8000-000000000001','ai:patient',1,1440),false,'lowering limit preserves consumed requests');
select is(public.consume_api_limit('20000000-0020-4000-8000-000000000001','ai:patient',3,1440),true,'raising limit in same bucket immediately admits one more request');
select is(public.consume_api_limit('20000000-0020-4000-8000-000000000001','ai:patient',3,1440),false,'raised limit still stops exactly at its maximum');
select is((select request_count from public.api_rate_limits where actor_id='20000000-0020-4000-8000-000000000001' and scope='ai:patient'),3,'denied attempts do not consume future quota');

-- Seed a fully consumed window immediately before the current UTC day. The
-- current day must have its own allowance; a full current-day bucket must stop
-- requests at every hour of the day (the original hourly reset regression).
reset role;
insert into public.api_rate_limits(actor_id,scope,window_started_at,request_count) values
('20000000-0020-4000-8000-000000000001','quota:day-boundary',(date_trunc('day',statement_timestamp() at time zone 'UTC') at time zone 'UTC')-interval '24 hours',5),
('20000000-0020-4000-8000-000000000001','quota:day-exhausted',date_trunc('day',statement_timestamp() at time zone 'UTC') at time zone 'UTC',5),
('20000000-0020-4000-8000-000000000001','quota:overflow',date_trunc('day',statement_timestamp() at time zone 'UTC') at time zone 'UTC',2147483647);
set local role service_role;
select is(public.consume_api_limit('20000000-0020-4000-8000-000000000001','quota:day-boundary',5,1440),true,'prior-day exhaustion does not block the new UTC day');
select is((select count(*) from public.api_rate_limits where actor_id='20000000-0020-4000-8000-000000000001' and scope='quota:day-boundary'),2::bigint,'requests across the day boundary occupy distinct buckets');
select is(public.consume_api_limit('20000000-0020-4000-8000-000000000001','quota:day-exhausted',5,1440),false,'daily exhaustion does not reset at the current hour');
select is(public.consume_api_limit('20000000-0020-4000-8000-000000000001','quota:overflow',2147483647,1440),false,'saturated integer counter denies without overflow');

select is(public.consume_api_limit('20000000-0020-4000-8000-000000000001','ai:connection-test',6,60),true,'connection test retains its hourly allowance');
select is((select window_started_at from public.api_rate_limits where actor_id='20000000-0020-4000-8000-000000000001' and scope='ai:connection-test'),date_trunc('hour',statement_timestamp() at time zone 'UTC') at time zone 'UTC','hourly bucket aligns to UTC despite a fractional timezone');
select is(public.consume_api_limit('20000000-0020-4000-8000-000000000001','quota:90-minutes',2,90),true,'non-hour window accepts request');
select is((select extract(epoch from window_started_at)::bigint%5400 from public.api_rate_limits where actor_id='20000000-0020-4000-8000-000000000001' and scope='quota:90-minutes'),0::bigint,'90-minute bucket aligns to the full elapsed window');
select is((select count(*) from generate_series(1,20) where public.consume_api_limit('20000000-0020-4000-8000-000000000001','quota:many',6,60)),6::bigint,'repeated requests admit exactly six');
select is((select request_count from public.api_rate_limits where actor_id='20000000-0020-4000-8000-000000000001' and scope='quota:many'),6,'conditional upsert stops incrementing at the limit');

select * from finish();
rollback;
