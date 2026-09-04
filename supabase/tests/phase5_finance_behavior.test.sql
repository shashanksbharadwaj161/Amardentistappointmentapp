begin;
select plan(26);
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) values
('51000000-0000-4000-8000-000000000001','authenticated','authenticated','finance-owner@example.test',now(),'{"full_name":"Finance Owner"}'),
('51000000-0000-4000-8000-000000000002','authenticated','authenticated','finance-patient@example.test',now(),'{"full_name":"Finance Patient"}'),
('51000000-0000-4000-8000-000000000003','authenticated','authenticated','finance-outsider@example.test',now(),'{"full_name":"Finance Outsider"}'),
('51000000-0000-4000-8000-000000000004','authenticated','authenticated','finance-super@example.test',now(),'{"full_name":"Finance Super"}');
insert into public.user_roles(user_id,role) values('51000000-0000-4000-8000-000000000004','super_admin');
insert into public.clinics(id,name,slug,phone,address_line,district,city,status,approved_at,approved_by,created_by) values('52000000-0000-4000-8000-000000000001','Finance Test Clinic','finance-test-clinic','01710000000','Test Road','Dhaka','Dhaka','approved',now(),'51000000-0000-4000-8000-000000000004','51000000-0000-4000-8000-000000000001');
insert into public.clinic_memberships(clinic_id,user_id,role,status,joined_at) values('52000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','clinic_owner','active',now());
insert into public.patient_profiles(id,account_owner_id,relationship,full_name) values('53000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002','self','Finance Patient');
insert into public.dentist_profiles(user_id,bmdc_registration_number,professional_title,status,approved_at,approved_by) values('51000000-0000-4000-8000-000000000001','BMDC-FINANCE-01','Dental Surgeon','approved',now(),'51000000-0000-4000-8000-000000000004');
insert into public.clinic_services(id,clinic_id,dentist_id,name,duration_minutes,price_bdt,deposit_bdt,is_active,created_by) values('54000000-0000-4000-8000-000000000001','52000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','Finance consultation',30,1200,300,true,'51000000-0000-4000-8000-000000000001');
insert into public.appointments(id,patient_profile_id,booked_by,clinic_id,dentist_id,service_id,start_at,end_at,duration_minutes,price_bdt,deposit_bdt,status) values('55000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000002','52000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','54000000-0000-4000-8000-000000000001',now()+interval '2 days',now()+interval '2 days 30 minutes',30,1200,300,'confirmed');
select ok(not has_table_privilege('authenticated','public.payment_transactions','INSERT'),'payment writes are RPC only');
select ok(not has_table_privilege('authenticated','public.stock_movements','INSERT'),'stock writes are RPC only');
select ok(not has_table_privilege('authenticated','public.user_subscriptions','INSERT'),'subscription writes are webhook only');
set local role authenticated;set local "request.jwt.claim.sub"='51000000-0000-4000-8000-000000000003';set local "request.jwt.claim.role"='authenticated';
select throws_ok($$select * from public.prepare_payment_checkout('55000000-0000-4000-8000-000000000001','bkash','outsider-key-123')$$,'42501','APPOINTMENT_PAYMENT_DENIED','outsider cannot prepare patient payment');
reset role;set local role authenticated;set local "request.jwt.claim.sub"='51000000-0000-4000-8000-000000000002';set local "request.jwt.claim.role"='authenticated';
select results_eq($$select amount_bdt from public.prepare_payment_checkout('55000000-0000-4000-8000-000000000001','bkash','patient-key-1234')$$,$$values(300::numeric)$$,'checkout amount is derived from trusted appointment deposit');
select is((select payment_id from public.prepare_payment_checkout('55000000-0000-4000-8000-000000000001','bkash','patient-key-1234')),(select id from public.payment_transactions where idempotency_key='patient-key-1234'),'checkout preparation is idempotent');
select throws_ok($$select * from public.prepare_payment_checkout('55000000-0000-4000-8000-000000000001','nagad','patient-key-1234')$$,'22023','IDEMPOTENCY_KEY_REUSED','idempotency key cannot cross providers');
reset role;set local role authenticated;set local "request.jwt.claim.sub"='51000000-0000-4000-8000-000000000004';set local "request.jwt.claim.role"='authenticated';
select ok(length(public.set_commission_rate(null,5)::text)=36,'Super Admin sets audited commission');
select is(public.active_commission_rate('52000000-0000-4000-8000-000000000001'),5::numeric,'platform commission is active');
select ok(length(public.set_subscription_plan(null,'patient-plus-test','patient_plus','Patient Plus','পেশেন্ট প্লাস',299,'monthly','{}','{priority_support}',true)::text)=36,'Super Admin configures subscription plan');
reset role;
select ok(public.apply_payment_event('bkash','provider-event-1',(select id from public.payment_transactions where idempotency_key='patient-key-1234'),'provider-payment-1','succeeded','{}','digest'),'signed service event applies');
select ok(not public.apply_payment_event('bkash','provider-event-1',(select id from public.payment_transactions where idempotency_key='patient-key-1234'),'provider-payment-1','succeeded','{}','digest'),'payment webhook replay is harmless');
select results_eq($$select entry_type,amount_bdt from public.clinic_ledger_entries order by id$$,$$values('payment',300::numeric),('commission',-15::numeric)$$,'confirmed payment reconciles gross and commission exactly once');
select ok(public.apply_subscription_event('subscription-event-1','INITIAL_PURCHASE','51000000-0000-4000-8000-000000000002','patient-plus-test','transaction-1','active',now(),now()+interval '1 month',now()+interval '1 month','sandbox','{}'),'subscription event applies');
select ok(not public.apply_subscription_event('subscription-event-1','INITIAL_PURCHASE','51000000-0000-4000-8000-000000000002','patient-plus-test','transaction-1','active',now(),now()+interval '1 month',now()+interval '1 month','sandbox','{}'),'subscription webhook replay is harmless');
reset role;set local role authenticated;set local "request.jwt.claim.sub"='51000000-0000-4000-8000-000000000001';set local "request.jwt.claim.role"='authenticated';
select ok(length(set_config('test.item',public.create_inventory_item('52000000-0000-4000-8000-000000000001','GLOVE-1','Examination gloves','box',5)::text,true))=36,'owner creates stock item');
select ok(length(set_config('test.lot',public.create_inventory_lot(current_setting('test.item')::uuid,'LOT-1',current_date+90,400,10)::text,true))=36,'owner receives a tracked lot');
select lives_ok($$select public.post_stock_movement('52000000-0000-4000-8000-000000000001',current_setting('test.item')::uuid,current_setting('test.lot')::uuid,'consumption',4,'Treatment consumption','encounter',null)$$,'treatment consumption posts atomically');
select results_eq($$select on_hand from public.inventory_lots where id=current_setting('test.lot')::uuid$$,$$values(6::numeric)$$,'on hand stock matches movements');
select throws_ok($$select public.post_stock_movement('52000000-0000-4000-8000-000000000001',current_setting('test.item')::uuid,current_setting('test.lot')::uuid,'consumption',7,'Would be negative','encounter',null)$$,'23514','INSUFFICIENT_STOCK','stock cannot silently become negative');
select ok(length(public.record_expense('52000000-0000-4000-8000-000000000001','Utilities','Monthly electricity',1000,current_date)::text)=36,'owner records expense');
select results_eq($$select gross_payments,commission_total,expense_total,net_payable from public.clinic_finance_summary('52000000-0000-4000-8000-000000000001',current_date-1,current_date+1)$$,$$values(300::numeric,15::numeric,1000::numeric,285::numeric)$$,'finance report reconciles ledger and expense totals');
select ok(length(set_config('test.refund',public.prepare_refund((select id from public.payment_transactions where idempotency_key='patient-key-1234'),100,'Approved cancellation','refund-key-1234')::text,true))=36,'owner prepares bounded refund');
reset role;select ok(public.apply_refund_result(current_setting('test.refund')::uuid,'succeeded','refund-provider-1','{}'),'provider-confirmed refund applies once');
select ok(not public.apply_refund_result(current_setting('test.refund')::uuid,'succeeded','refund-provider-1','{}'),'refund replay is harmless');
select results_eq($$select status::text from public.payment_transactions where idempotency_key='patient-key-1234'$$,$$values('partially_refunded')$$,'payment reflects partial refund');
select * from finish();
rollback;
