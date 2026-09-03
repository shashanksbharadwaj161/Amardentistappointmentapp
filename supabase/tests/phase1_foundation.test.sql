begin;
select plan(16);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'user_roles', 'user roles exists');
select has_table('public', 'admin_invitations', 'admin invitations exists');
select has_table('public', 'audit_logs', 'audit logs exists');
select has_table('public', 'app_configuration', 'configuration exists');

select has_function('public', 'has_role', array['app_role'], 'has_role exists');
select has_function('public', 'is_admin', array[]::text[], 'is_admin exists');
select has_function('public', 'set_active_mode', array['app_mode'], 'mode RPC exists');
select has_function('public', 'create_admin_invitation', array['text', 'text', 'integer'], 'invite RPC exists');
select has_function('public', 'activate_admin_invitation', array['uuid'], 'invite activation RPC exists');
select has_function('public', 'bootstrap_super_admin', array['uuid'], 'bootstrap RPC exists');

select policies_are('public', 'profiles', array['profiles_read_self_or_admin', 'profiles_update_self']);
select policies_are('public', 'user_roles', array['roles_read_self_or_admin']);
select policies_are('public', 'admin_invitations', array['invitations_super_admin_read']);
select policies_are('public', 'app_configuration', array['public_configuration_read', 'authenticated_configuration_read', 'configuration_super_admin_update']);
select policies_are('public', 'audit_logs', array['audit_admin_read']);

select * from finish();
rollback;
