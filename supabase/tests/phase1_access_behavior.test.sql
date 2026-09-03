begin;
select plan(26);

insert into auth.users (id, aud, role, email, email_confirmed_at, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'patient-one@example.test', now(), '{"full_name":"Patient One"}'),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'patient-two@example.test', now(), '{"full_name":"Patient Two"}'),
  ('10000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'admin@example.test', now(), '{"full_name":"Admin User"}'),
  ('10000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'super@example.test', now(), '{"full_name":"Super Admin"}');

insert into public.user_roles (user_id, role, granted_by)
values
  ('10000000-0000-4000-8000-000000000003', 'admin', '10000000-0000-4000-8000-000000000004'),
  ('10000000-0000-4000-8000-000000000004', 'super_admin', '10000000-0000-4000-8000-000000000004');

insert into public.audit_logs (actor_id, action, target_type, target_id)
values ('10000000-0000-4000-8000-000000000004', 'test.fixture', 'test', 'phase-1');

select ok(has_table_privilege('authenticated', 'public.profiles', 'SELECT'), 'authenticated may query profiles through RLS');
select ok(has_column_privilege('authenticated', 'public.profiles', 'locale', 'UPDATE'), 'authenticated may update the permitted locale column');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'active_mode', 'UPDATE'), 'active mode cannot be changed directly');
select ok(not has_table_privilege('authenticated', 'public.user_roles', 'INSERT'), 'roles cannot be self-granted');
select ok(not has_table_privilege('anon', 'public.profiles', 'SELECT'), 'anonymous users cannot query profiles');
select ok(has_function_privilege('authenticated', 'public.set_active_mode(public.app_mode)', 'EXECUTE'), 'authenticated users may request a mode change');
select ok(not has_function_privilege('authenticated', 'public.bootstrap_super_admin(uuid)', 'EXECUTE'), 'bootstrap is unavailable to authenticated users');
select ok(not has_function_privilege('authenticated', 'public.activate_admin_invitation(uuid)', 'EXECUTE'), 'invitation activation is unavailable to authenticated users');

set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000001';
set local "request.jwt.claim.role" = 'authenticated';

select results_eq(
  $$select count(*)::bigint from public.profiles$$,
  $$values (1::bigint)$$,
  'a patient sees only their own profile'
);
select results_eq(
  $$select count(*)::bigint from public.profiles where id = '10000000-0000-4000-8000-000000000002'$$,
  $$values (0::bigint)$$,
  'a patient cannot read another profile'
);
select lives_ok(
  $$update public.profiles set locale = 'bn' where id = '10000000-0000-4000-8000-000000000001'$$,
  'a patient can update their own allowed profile column'
);
select results_eq(
  $$update public.profiles set locale = 'bn' where id = '10000000-0000-4000-8000-000000000002' returning id$$,
  $$select id from public.profiles where false$$,
  'RLS silently blocks updates to another profile'
);
select throws_ok(
  $$select public.set_active_mode('professional')$$,
  '42501',
  'PROFESSIONAL_ROLE_REQUIRED',
  'a patient cannot enter professional mode'
);
select lives_ok(
  $$select public.set_active_mode('patient')$$,
  'a patient can remain in patient mode'
);
select results_eq(
  $$select count(*)::bigint from public.audit_logs$$,
  $$values (0::bigint)$$,
  'a patient cannot read the audit ledger'
);
select throws_ok(
  $$select public.create_admin_invitation('blocked@example.test', 'Blocked', 7)$$,
  '42501',
  'SUPER_ADMIN_REQUIRED',
  'a patient cannot invite an administrator'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000003';

select results_eq(
  $$select count(*)::bigint from public.profiles where id in (
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000004'
  )$$,
  $$values (4::bigint)$$,
  'an admin can read profiles for platform operations'
);
select results_eq(
  $$select count(*)::bigint from public.audit_logs where action = 'test.fixture' and target_id = 'phase-1'$$,
  $$values (1::bigint)$$,
  'an admin can read the audit ledger'
);
select throws_ok(
  $$select public.create_admin_invitation('blocked-admin@example.test', 'Blocked Admin', 7)$$,
  '42501',
  'SUPER_ADMIN_REQUIRED',
  'a regular admin cannot invite another administrator'
);

reset role;
set local role authenticated;
set local "request.jwt.claim.sub" = '10000000-0000-4000-8000-000000000004';

select lives_ok(
  $$select public.create_admin_invitation('invited@example.test', 'Invited Admin', 7)$$,
  'a Super Admin can create an invitation'
);
select results_eq(
  $$select count(*)::bigint from public.admin_invitations where email = 'invited@example.test'$$,
  $$values (1::bigint)$$,
  'the Super Admin can read the created invitation'
);
select results_eq(
  $$select count(*)::bigint from public.admin_invitations where email = 'invited@example.test' and delivery_confirmed_at is null$$,
  $$values (1::bigint)$$,
  'a newly recorded invitation is not active before delivery confirmation'
);

reset role;
update public.admin_invitations
set id = '10000000-0000-4000-8000-000000000005'
where email = 'invited@example.test';

set local role service_role;
set local "request.jwt.claim.role" = 'service_role';

select lives_ok(
  $$select public.activate_admin_invitation('10000000-0000-4000-8000-000000000005')$$,
  'the service role can atomically activate and audit a delivered invitation'
);

reset role;

select results_eq(
  $$select count(*)::bigint from public.admin_invitations where email = 'invited@example.test' and delivery_confirmed_at is not null$$,
  $$values (1::bigint)$$,
  'delivery confirmation activates the invitation'
);
select results_eq(
  $$select count(*)::bigint from public.audit_logs where action = 'admin.invited' and target_id = 'invited@example.test'$$,
  $$values (1::bigint)$$,
  'invitation activation always writes its audit event in the same transaction'
);

reset role;
set local role anon;
reset "request.jwt.claim.sub";
reset "request.jwt.claim.role";

select results_eq(
  $$select count(*)::bigint from public.app_configuration$$,
  $$values (4::bigint)$$,
  'anonymous clients can read only public configuration'
);

select * from finish();
rollback;
