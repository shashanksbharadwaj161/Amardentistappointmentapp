begin;
select no_plan();
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) values
('24000001-0000-4000-8000-000000000001','authenticated','authenticated','retry-owner@example.test',now(),'{"full_name":"Finance Owner"}'),
('24000001-0000-4000-8000-000000000002','authenticated','authenticated','retry-patient@example.test',now(),'{"full_name":"Finance Patient"}'),
('24000001-0000-4000-8000-000000000003','authenticated','authenticated','retry-outsider@example.test',now(),'{"full_name":"Finance Outsider"}'),
('24000001-0000-4000-8000-000000000004','authenticated','authenticated','retry-super@example.test',now(),'{"full_name":"Finance Super"}');
insert into public.user_roles(user_id,role) values('24000001-0000-4000-8000-000000000004','super_admin');
insert into public.clinics(id,name,slug,phone,address_line,district,city,status,approved_at,approved_by,created_by) values('24000002-0000-4000-8000-000000000001','Finance Test Clinic','retry-test-clinic','01710000000','Test Road','Dhaka','Dhaka','approved',now(),'24000001-0000-4000-8000-000000000004','24000001-0000-4000-8000-000000000001');
insert into public.clinic_memberships(clinic_id,user_id,role,status,joined_at) values('24000002-0000-4000-8000-000000000001','24000001-0000-4000-8000-000000000001','clinic_owner','active',now());
insert into public.patient_profiles(id,account_owner_id,relationship,full_name) values('24000003-0000-4000-8000-000000000001','24000001-0000-4000-8000-000000000002','self','Finance Patient');
insert into public.dentist_profiles(user_id,bmdc_registration_number,professional_title,status,approved_at,approved_by) values('24000001-0000-4000-8000-000000000001','BMDC-RETRY-01','Dental Surgeon','approved',now(),'24000001-0000-4000-8000-000000000004');
insert into public.clinic_services(id,clinic_id,dentist_id,name,duration_minutes,price_bdt,deposit_bdt,is_active,created_by) values('24000004-0000-4000-8000-000000000001','24000002-0000-4000-8000-000000000001','24000001-0000-4000-8000-000000000001','Finance consultation',30,1200,300,true,'24000001-0000-4000-8000-000000000001');
insert into public.appointments(id,patient_profile_id,booked_by,clinic_id,dentist_id,service_id,start_at,end_at,duration_minutes,price_bdt,deposit_bdt,status) values('24000005-0000-4000-8000-000000000001','24000003-0000-4000-8000-000000000001','24000001-0000-4000-8000-000000000002','24000002-0000-4000-8000-000000000001','24000001-0000-4000-8000-000000000001','24000004-0000-4000-8000-000000000001',now()+interval '2 days',now()+interval '2 days 30 minutes',30,1200,300,'confirmed');

set local role authenticated;
set local "request.jwt.claim.sub"='24000001-0000-4000-8000-000000000002';
set local "request.jwt.claim.role"='authenticated';
select is((select amount_bdt from public.prepare_payment_checkout('24000005-0000-4000-8000-000000000001','bkash','retry-checkout-key-0001')),300::numeric,'initial checkout derives amount from trusted appointment');
select results_eq($$select payment_id from public.prepare_payment_checkout('24000005-0000-4000-8000-000000000001','bkash','retry-checkout-key-0001')$$,$$select id from public.payment_transactions where idempotency_key='retry-checkout-key-0001'$$,'owner preparation retry preserves the original payment');
set local "request.jwt.claim.sub"='24000001-0000-4000-8000-000000000003';
select throws_ok($$select * from public.prepare_payment_checkout('24000005-0000-4000-8000-000000000001','bkash','retry-checkout-key-0001')$$,'42501','APPOINTMENT_PAYMENT_DENIED','outsider with exact key and appointment cannot read checkout');
set local "request.jwt.claim.sub"='24000001-0000-4000-8000-000000000002';
select throws_ok($$select * from public.prepare_payment_checkout('24000005-0000-4000-8000-000000000001','nagad','retry-checkout-key-0001')$$,'22023','IDEMPOTENCY_KEY_REUSED','owner cannot reuse key across providers');
reset role;
set local role service_role;
set local "request.jwt.claim.role"='service_role';
select lives_ok($$select public.set_payment_checkout_result((select id from public.payment_transactions where idempotency_key='retry-checkout-key-0001'),'https://pay.example.test/winner','winner-id','{"first":true}')$$,'first provider session persists');
select lives_ok($$select public.set_payment_checkout_result((select id from public.payment_transactions where idempotency_key='retry-checkout-key-0001'),'https://pay.example.test/winner','winner-id','{"retry":true}')$$,'same provider session is idempotent');
select throws_ok($$select public.set_payment_checkout_result((select id from public.payment_transactions where idempotency_key='retry-checkout-key-0001'),'https://pay.example.test/loser','loser-id','{}')$$,'22023','PAYMENT_CHECKOUT_ALREADY_CREATED','a competing result cannot overwrite the first stored session');
select is((select provider_payment_id from public.payment_transactions where idempotency_key='retry-checkout-key-0001'),'winner-id','provider reference remains the winning session');
select is((select provider_payload from public.payment_transactions where idempotency_key='retry-checkout-key-0001'),'{"first":true}'::jsonb,'idempotent retries preserve original provider evidence');

reset role;
insert into public.payment_transactions(appointment_id,provider,amount_bdt,idempotency_key,created_by,status,provider_checkout_url,provider_payment_id)
select '24000005-0000-4000-8000-000000000001','bkash',300,'retry-terminal-'||state,'24000001-0000-4000-8000-000000000002',state::public.payment_state,'https://pay.example.test/terminal','terminal-'||state
from unnest(array['succeeded','refunded','partially_refunded','failed']) state;
set local role authenticated;
set local "request.jwt.claim.role"='authenticated';
select throws_ok(format('select * from public.prepare_payment_checkout(%L,%L,%L)','24000005-0000-4000-8000-000000000001','bkash','retry-terminal-'||state),'22023','PAYMENT_ALREADY_FINALIZED','preparation refuses terminal '||state||' retry')
from unnest(array['succeeded','refunded','partially_refunded','failed']) state;
reset role;
set local role service_role;
set local "request.jwt.claim.role"='service_role';
select throws_ok(format('select public.set_payment_checkout_result(%L,%L,%L,%L)',id,'https://pay.example.test/downgrade','downgrade-'||status,'{}'),'22023','PAYMENT_ALREADY_FINALIZED','setter refuses terminal '||status||' downgrade')
from public.payment_transactions where idempotency_key like 'retry-terminal-%' order by idempotency_key;
select is((select count(*) from public.payment_transactions where idempotency_key like 'retry-terminal-%' and status::text=replace(idempotency_key,'retry-terminal-','')),4::bigint,'all terminal states remain unchanged');
reset role;
update public.appointments set status='cancelled' where id='24000005-0000-4000-8000-000000000001';
set local role authenticated;
set local "request.jwt.claim.role"='authenticated';
select throws_ok($$select * from public.prepare_payment_checkout('24000005-0000-4000-8000-000000000001','bkash','retry-checkout-key-0001')$$,'22023','APPOINTMENT_NOT_PAYABLE','cancelled appointment cannot replay an existing pending checkout');
select * from finish();
rollback;
