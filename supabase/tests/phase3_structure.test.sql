begin;
select plan(56);

select has_table('public', 'patient_profiles', 'patient and dependent profiles exist');
select has_table('public', 'appointment_holds', 'server booking holds exist');
select has_table('public', 'appointments', 'appointments exist');
select has_table('public', 'payment_transactions', 'payment transaction ledger exists');
select has_table('public', 'appointment_events', 'appointment timeline exists');
select has_table('public', 'appointment_checkin_tokens', 'single-use check-in tokens exist');
select has_table('public', 'waitlist_entries', 'waitlist exists');
select has_table('public', 'appointment_reviews', 'verified appointment reviews exist');
select has_table('public', 'chat_threads', 'patient-clinic chat threads exist');
select has_table('public', 'chat_messages', 'patient-clinic messages exist');
select has_table('public', 'notification_outbox', 'notification delivery outbox exists');

select has_type('public', 'patient_relationship', 'patient relationship enum exists');
select has_type('public', 'appointment_status', 'appointment status enum exists');
select has_type('public', 'appointment_hold_status', 'hold status enum exists');
select has_type('public', 'deposit_disposition', 'deposit policy enum exists');
select has_type('public', 'payment_status', 'payment status enum exists');
select has_type('public', 'waitlist_status', 'waitlist status enum exists');
select has_type('public', 'notification_channel', 'notification channel enum exists');
select has_type('public', 'notification_status', 'notification status enum exists');

select has_function('public', 'owns_patient_profile', 'patient ownership helper exists');
select has_function('public', 'can_operate_appointment', 'appointment access helper exists');
select has_function('public', 'upsert_patient_profile', 'patient profile RPC exists');
select has_function('public', 'search_marketplace', 'approved marketplace search RPC exists');
select has_function('public', 'available_clinic_slots', 'availability excludes holds and appointments');
select has_function('public', 'create_appointment_hold', 'ten-minute hold RPC exists');
select has_function('public', 'confirm_mock_appointment', 'mock confirmation RPC exists');
select has_function('public', 'release_appointment_hold', 'hold release RPC exists');
select has_function('public', 'cancel_appointment', 'cancellation policy RPC exists');
select has_function('public', 'mark_appointment_no_show', 'no-show policy RPC exists');
select has_function('public', 'issue_checkin_token', 'check-in token issue RPC exists');
select has_function('public', 'redeem_checkin_token', 'single-use check-in RPC exists');
select has_function('public', 'join_waitlist', 'waitlist join RPC exists');
select has_function('public', 'offer_waitlist_slot', 'first-in waitlist offer RPC exists');
select has_function('public', 'submit_appointment_review', 'completed appointment review RPC exists');
select has_function('public', 'create_walk_in_appointment', 'clinic walk-in RPC exists');
select has_function('public', 'mark_appointment_completed', 'verified dentist completion RPC exists');
select has_function('public', 'get_or_create_chat_thread', 'patient clinic thread RPC exists');
select has_function('public', 'send_chat_message', 'participant-only chat send RPC exists');
select has_function('public', 'reschedule_appointment', 'atomic reschedule RPC exists');
select has_function('public', 'confirm_waitlist_offer', 'waitlist confirmation RPC exists');
select has_column('public', 'waitlist_entries', 'offer_hold_id', 'waitlist offers retain their protected hold');

select policies_are('public', 'patient_profiles', array['patient_profiles_read_owner']);
select policies_are('public', 'appointment_holds', array['appointment_holds_read_scoped']);
select policies_are('public', 'appointments', array['appointments_read_scoped']);
select policies_are('public', 'payment_transactions', array['payments_read_scoped']);
select policies_are('public', 'appointment_events', array['appointment_events_read_scoped']);
select policies_are('public', 'appointment_checkin_tokens', array['checkin_tokens_read_creator_or_staff']);
select policies_are('public', 'waitlist_entries', array['waitlist_read_scoped']);
select policies_are('public', 'appointment_reviews', array['reviews_read_visible_or_owner']);
select policies_are('public', 'chat_threads', array['chat_threads_read_participants']);
select policies_are('public', 'chat_messages', array['chat_messages_read_participants']);
select policies_are('public', 'notification_outbox', array['notifications_read_recipient_or_admin']);

select has_constraint('public', 'appointment_holds', 'no_overlapping_active_holds', 'active holds have a database exclusion constraint');
select has_constraint('public', 'appointments', 'no_overlapping_appointments', 'active appointments have a database exclusion constraint');
select ok(not has_table_privilege('authenticated', 'public.appointments', 'INSERT'), 'clients cannot insert appointments directly');
select ok(not has_table_privilege('authenticated', 'public.payment_transactions', 'INSERT'), 'clients cannot forge payment rows');

select * from finish();
rollback;
