begin;
select plan(36);

select has_table('public', 'clinics', 'clinics exists');
select has_table('public', 'clinic_memberships', 'clinic memberships exists');
select has_table('public', 'clinic_staff_invitations', 'clinic staff invitations exists');
select has_table('public', 'dentist_profiles', 'dentist profiles exists');
select has_table('public', 'verification_documents', 'verification documents exists');
select has_table('public', 'verification_decisions', 'verification decisions exists');
select has_table('public', 'clinic_services', 'clinic services exists');
select has_table('public', 'weekly_schedule_blocks', 'weekly schedule blocks exists');
select has_table('public', 'weekly_schedule_breaks', 'weekly schedule breaks exists');
select has_table('public', 'schedule_exceptions', 'schedule exceptions exists');

select has_function('public', 'has_clinic_role', 'clinic role helper exists');
select has_function('public', 'can_manage_clinic', 'clinic manager helper exists');
select has_function('public', 'is_verified_dentist', 'dentist verification helper exists');
select has_function('public', 'create_clinic_application', 'clinic application RPC exists');
select has_function('public', 'submit_dentist_application', 'dentist application RPC exists');
select has_function('public', 'register_verification_document', 'document registration RPC exists');
select has_function('public', 'invite_clinic_member', 'clinic invitation RPC exists');
select has_function('public', 'activate_clinic_invitation', 'clinic invitation activation RPC exists');
select has_function('public', 'revoke_clinic_invitation_delivery', 'clinic invitation cleanup RPC exists');
select has_function('public', 'accept_clinic_membership', 'clinic invitation acceptance RPC exists');
select has_function('public', 'decide_clinic_application', 'clinic decision RPC exists');
select has_function('public', 'decide_dentist_application', 'dentist decision RPC exists');
select has_function('public', 'upsert_clinic_service', 'service RPC exists');
select has_function('public', 'upsert_weekly_schedule_block', 'schedule RPC exists');
select has_function('public', 'available_clinic_slots', 'shared availability RPC exists');

select policies_are('public', 'clinics', array['clinics_read_approved_member_or_admin']);
select policies_are('public', 'clinic_memberships', array['memberships_read_scoped']);
select policies_are('public', 'clinic_staff_invitations', array['clinic_invitations_read_scoped']);
select policies_are('public', 'dentist_profiles', array['dentist_profiles_read_approved_self_or_admin']);
select policies_are('public', 'verification_documents', array['verification_documents_read_owner_or_admin']);
select policies_are('public', 'verification_decisions', array['verification_decisions_read_scoped']);
select policies_are('public', 'clinic_services', array['clinic_services_read_visible']);
select policies_are('public', 'weekly_schedule_blocks', array['weekly_blocks_read_visible']);
select policies_are('public', 'weekly_schedule_breaks', array['weekly_breaks_read_visible']);
select policies_are('public', 'schedule_exceptions', array['schedule_exceptions_read_visible']);

select results_eq(
  $$select count(*)::bigint from storage.buckets where id = 'verification-documents' and public = false$$,
  $$values (1::bigint)$$,
  'verification storage is private'
);

select * from finish();
rollback;
