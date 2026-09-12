begin;
select plan(13);
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) values
('22000000-0022-4000-8000-000000000001','authenticated','authenticated','checkout-reference@example.test',now(),'{"full_name":"Checkout Test"}');
insert into public.user_roles(user_id,role) values('22000000-0022-4000-8000-000000000001','super_admin');
insert into public.clinics(id,name,slug,phone,address_line,district,city,created_by) values
('22000000-0022-4000-8000-000000000002','Checkout Test Clinic','checkout-reference-test','01710000000','Test Road','Dhaka','Dhaka','22000000-0022-4000-8000-000000000001');
insert into public.patient_profiles(id,account_owner_id,relationship,full_name) values
('22000000-0022-4000-8000-000000000003','22000000-0022-4000-8000-000000000001','self','Checkout Test');
insert into public.invoices(id,invoice_number,clinic_id,patient_profile_id,created_by) values
('22000000-0022-4000-8000-000000000004','INV-CHECKOUT-REFERENCE','22000000-0022-4000-8000-000000000002','22000000-0022-4000-8000-000000000003','22000000-0022-4000-8000-000000000001');
insert into public.payment_transactions(id,provider,provider_reference,invoice_id,patient_profile_id,clinic_id,amount_bdt,idempotency_key,created_by) values
('22000000-0022-4000-8000-000000000005','mock','legacy-reference','22000000-0022-4000-8000-000000000004','22000000-0022-4000-8000-000000000003','22000000-0022-4000-8000-000000000002',100,'checkout-reference-test-1','22000000-0022-4000-8000-000000000001');

set local role anon;
select throws_ok($$select public.set_payment_checkout_result('22000000-0022-4000-8000-000000000005','https://checkout.example.test','external-id','{}')$$,'42501','permission denied for function set_payment_checkout_result','anonymous cannot write provider checkout results');
reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='22000000-0022-4000-8000-000000000001';
set local "request.jwt.claim.role"='authenticated';
select throws_ok($$select public.set_payment_checkout_result('22000000-0022-4000-8000-000000000005','https://checkout.example.test','external-id','{}')$$,'42501','permission denied for function set_payment_checkout_result','Super Admin cannot bypass server-only checkout writes');
reset role;
set local role service_role;
set local "request.jwt.claim.role"='service_role';
select lives_ok($$select public.set_payment_checkout_result(target_payment_id=>'22000000-0022-4000-8000-000000000005',checkout_url=>' https://checkout.example.test/session ',provider_reference=>' new-provider-id ',event_payload=>'{"checkout":"created"}'::jsonb)$$,'named RPC arguments store checkout results without column ambiguity');
select is((select provider_payment_id from public.payment_transactions where id='22000000-0022-4000-8000-000000000005'),'new-provider-id','provider payment ID comes from trimmed argument');
select is((select provider_reference from public.payment_transactions where id='22000000-0022-4000-8000-000000000005'),'legacy-reference','legacy reference column is preserved');
select is((select provider_checkout_url from public.payment_transactions where id='22000000-0022-4000-8000-000000000005'),'https://checkout.example.test/session','checkout URL is trimmed');
select is((select provider_payload from public.payment_transactions where id='22000000-0022-4000-8000-000000000005'),'{"checkout":"created"}'::jsonb,'provider payload is retained');
select is((select status::text from public.payment_transactions where id='22000000-0022-4000-8000-000000000005'),'pending','checkout moves payment to pending');
select throws_ok($$select public.set_payment_checkout_result('22000000-0022-4000-8000-000000000099','https://checkout.example.test','missing-id','{}')$$,'22023','PAYMENT_NOT_FOUND','unknown payment still fails validation');
select throws_ok($$select public.set_payment_checkout_result(null,'https://checkout.example.test','missing-id','{}')$$,'22023','PAYMENT_NOT_FOUND','null payment still fails validation');
select throws_ok($$select public.set_payment_checkout_result('22000000-0022-4000-8000-000000000005',' ',' ',null)$$,'22023','PAYMENT_CHECKOUT_ALREADY_CREATED','blank retry cannot erase an established checkout');
select ok((select provider_payment_id='new-provider-id' and provider_checkout_url='https://checkout.example.test/session' from public.payment_transactions where id='22000000-0022-4000-8000-000000000005'),'rejected blank retry preserves established provider details');
select is((select provider_payload from public.payment_transactions where id='22000000-0022-4000-8000-000000000005'),'{"checkout":"created"}'::jsonb,'rejected retry preserves original provider payload');
select * from finish();
rollback;
