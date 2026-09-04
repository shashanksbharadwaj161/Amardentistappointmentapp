begin;
select plan(43);

insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) values
('41000000-0000-4000-8000-000000000001','authenticated','authenticated','owner-one@example.test',now(),'{"full_name":"Clinic Owner"}'),
('41000000-0000-4000-8000-000000000002','authenticated','authenticated','dentist-one@example.test',now(),'{"full_name":"Dentist One"}'),
('41000000-0000-4000-8000-000000000003','authenticated','authenticated','clinical-patient@example.test',now(),'{"full_name":"Clinical Patient"}'),
('41000000-0000-4000-8000-000000000004','authenticated','authenticated','front-desk-clinical@example.test',now(),'{"full_name":"Front Desk"}'),
('41000000-0000-4000-8000-000000000005','authenticated','authenticated','manager-clinical@example.test',now(),'{"full_name":"Manager"}'),
('41000000-0000-4000-8000-000000000006','authenticated','authenticated','ordinary-admin@example.test',now(),'{"full_name":"Administrator"}'),
('41000000-0000-4000-8000-000000000007','authenticated','authenticated','super-admin@example.test',now(),'{"full_name":"Super Administrator"}'),
('41000000-0000-4000-8000-000000000008','authenticated','authenticated','dentist-two@example.test',now(),'{"full_name":"Dentist Two"}');

insert into public.user_roles(user_id,role) values
('41000000-0000-4000-8000-000000000006','admin'),
('41000000-0000-4000-8000-000000000007','super_admin');

insert into public.clinics(id,name,slug,phone,address_line,district,city,status,approved_at,approved_by,created_by) values
('42000000-0000-4000-8000-000000000001','Clinical Test One','clinical-test-one','01710000001','One Test Road','Dhaka','Dhaka','approved',now(),'41000000-0000-4000-8000-000000000007','41000000-0000-4000-8000-000000000001'),
('42000000-0000-4000-8000-000000000002','Clinical Test Two','clinical-test-two','01710000002','Two Test Road','Dhaka','Dhaka','approved',now(),'41000000-0000-4000-8000-000000000007','41000000-0000-4000-8000-000000000008');

insert into public.clinic_memberships(clinic_id,user_id,role,status,joined_at) values
('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','clinic_owner','active',now()),
('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002','dentist','active',now()),
('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000004','front_desk','active',now()),
('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000005','clinic_manager','active',now()),
('42000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000008','dentist','active',now());

insert into public.dentist_profiles(user_id,bmdc_registration_number,professional_title,specialties,languages,status,approved_at,approved_by) values
('41000000-0000-4000-8000-000000000002','BMDC-CLINICAL-ONE','Dental Surgeon',array['General dentistry'],array['en','bn'],'approved',now(),'41000000-0000-4000-8000-000000000007'),
('41000000-0000-4000-8000-000000000008','BMDC-CLINICAL-TWO','Dental Surgeon',array['Restorative dentistry'],array['en','bn'],'approved',now(),'41000000-0000-4000-8000-000000000007');

insert into public.clinic_services(id,clinic_id,dentist_id,name,duration_minutes,price_bdt,deposit_bdt,is_active,created_by) values
('43000000-0000-4000-8000-000000000001','42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002','Clinical consultation',30,1000,200,true,'41000000-0000-4000-8000-000000000001'),
('43000000-0000-4000-8000-000000000002','42000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000008','Continuity consultation',30,1000,200,true,'41000000-0000-4000-8000-000000000008');

select ok(not has_table_privilege('authenticated','public.clinical_encounters','INSERT'),'encounters are RPC-only');
select ok(not has_table_privilege('authenticated','public.clinical_diagnoses','INSERT'),'diagnoses are RPC-only');
select ok(not has_table_privilege('authenticated','public.prescriptions','UPDATE'),'prescription finalization is RPC-only');
select ok(has_function_privilege('authenticated','public.start_clinical_encounter(uuid)','EXECUTE'),'authenticated users may call the guarded encounter RPC');

set local role authenticated;
set local "request.jwt.claim.sub"='41000000-0000-4000-8000-000000000003';
set local "request.jwt.claim.role"='authenticated';
select lives_ok($$select public.upsert_patient_profile(null,'self','Clinical Patient','1990-01-01',null,'','','')$$,'patient creates a clinical profile');
select lives_ok($$select public.save_patient_medical_history((select id from public.patient_profiles where account_owner_id='41000000-0000-4000-8000-000000000003'),array['Hypertension'],array['Medicine A'],'{}',null,null,'Stable','Initial history')$$,'patient saves medical history');
select ok(length(public.add_patient_allergy((select id from public.patient_profiles where account_owner_id='41000000-0000-4000-8000-000000000003'),'Penicillin','Rash','moderate')::text)=36,'patient adds an allergy');
select ok(length(public.set_patient_clinic_consent((select id from public.patient_profiles where account_owner_id='41000000-0000-4000-8000-000000000003'),'42000000-0000-4000-8000-000000000001',(select id from public.consent_templates where consent_key='cross_clinic_history' and active),'{"understand_scope":true,"authorize_clinic":true,"understand_revocation":true}'::jsonb)::text)=36,'patient checks every bilingual consent item');

reset role;
insert into public.appointments(id,patient_profile_id,booked_by,clinic_id,dentist_id,service_id,start_at,end_at,duration_minutes,price_bdt,deposit_bdt,status,checked_in_at) values
('44000000-0000-4000-8000-000000000001',(select id from public.patient_profiles where account_owner_id='41000000-0000-4000-8000-000000000003'),'41000000-0000-4000-8000-000000000003','42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002','43000000-0000-4000-8000-000000000001',now()-interval '10 minutes',now()+interval '20 minutes',30,1000,200,'checked_in',now());

set local role authenticated;
set local "request.jwt.claim.sub"='41000000-0000-4000-8000-000000000004';
set local "request.jwt.claim.role"='authenticated';
select results_eq($$select count(*)::bigint from public.patient_medical_histories$$,$$values(0::bigint)$$,'front desk cannot read clinical history');
select throws_ok($$select public.start_clinical_encounter('44000000-0000-4000-8000-000000000001')$$,'42501','ENCOUNTER_DENIED','front desk cannot start an encounter');

reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='41000000-0000-4000-8000-000000000001';
set local "request.jwt.claim.role"='authenticated';
select results_eq($$select count(*)::bigint from public.patient_allergies$$,$$values(0::bigint)$$,'clinic owner cannot read clinical allergies');

reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='41000000-0000-4000-8000-000000000006';
set local "request.jwt.claim.role"='authenticated';
select results_eq($$select count(*)::bigint from public.patient_medical_histories$$,$$values(0::bigint)$$,'ordinary Admin cannot read clinical history');
select throws_ok($$select public.super_admin_clinical_snapshot((select id from public.patient_profiles limit 1),'Investigating authorized support request')$$,'42501','SUPER_ADMIN_REQUIRED','ordinary Admin cannot use the audited Super Admin reader');

reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='41000000-0000-4000-8000-000000000002';
set local "request.jwt.claim.role"='authenticated';
select results_eq($$select count(*)::bigint from public.patient_medical_histories$$,$$values(1::bigint)$$,'consented treating dentist reads patient history');
select ok(length(set_config('test.encounter',public.start_clinical_encounter('44000000-0000-4000-8000-000000000001')::text,true))=36,'assigned verified dentist starts encounter');
select is(public.start_clinical_encounter('44000000-0000-4000-8000-000000000001'),current_setting('test.encounter')::uuid,'opening an existing encounter is idempotent');
select lives_ok($$select public.save_clinical_encounter(current_setting('test.encounter')::uuid,'Sensitivity','Patient reports cold sensitivity','Caries visible on 16','Dentinal caries','Restore tooth 16','Initial structured assessment')$$,'dentist saves structured progress notes');
select ok(length(public.add_clinical_diagnosis(current_setting('test.encounter')::uuid,'K02.9','Dental caries','Tooth 16')::text)=36,'verified dentist records diagnosis');
select ok(length(public.save_tooth_observation(current_setting('test.encounter')::uuid,'adult','16','occlusal','Caries','Initial odontogram')::text)=36,'dentist charts an adult FDI surface');
select throws_ok($$select public.save_tooth_observation(current_setting('test.encounter')::uuid,'primary','18','occlusal','Caries','Invalid primary code')$$,'23514','primary dentition rejects an adult FDI code');
select ok(length(set_config('test.plan',public.create_treatment_plan(current_setting('test.encounter')::uuid,'Restore tooth 16','Discussed alternatives','[{"description":"Composite restoration","fdiToothCode":"16","estimatedPriceBdt":2500}]'::jsonb)::text,true))=36,'dentist creates treatment plan and item');
select lives_ok($$select public.finalize_treatment_plan(current_setting('test.plan')::uuid,'Plan reviewed with patient')$$,'dentist finalizes treatment plan');
select ok(length(set_config('test.prescription',public.save_prescription_draft(current_setting('test.encounter')::uuid,null,'Take after food','[{"medicineName":"Paracetamol","strength":"500 mg","dosage":"1 tablet","route":"oral","frequency":"twice daily","duration":"3 days","instructions":"After food"}]'::jsonb,'Initial prescription')::text,true))=36,'dentist saves structured prescription draft');
select lives_ok($$select public.finalize_prescription(current_setting('test.prescription')::uuid,'Medication and allergies reviewed')$$,'verified dentist finalizes prescription');

reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='41000000-0000-4000-8000-000000000003';
set local "request.jwt.claim.role"='authenticated';
select results_eq($$select count(*)::bigint from public.clinical_encounters$$,$$values(0::bigint)$$,'patient cannot see draft encounter');
select results_eq($$select count(*)::bigint from public.prescriptions$$,$$values(1::bigint)$$,'patient sees finalized prescription only');
select lives_ok($$select public.set_prescription_document(current_setting('test.prescription')::uuid,(select patient_profile_id::text||'/'||id::text||'.pdf' from public.prescriptions where id=current_setting('test.prescription')::uuid))$$,'authorized patient can register a private generated prescription document');

reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='41000000-0000-4000-8000-000000000002';
set local "request.jwt.claim.role"='authenticated';
select lives_ok($$select public.finalize_clinical_encounter(current_setting('test.encounter')::uuid,'All fields reviewed')$$,'verified dentist finalizes encounter');
select results_eq($$select status::text,completed_at is not null from public.appointments where id='44000000-0000-4000-8000-000000000001'$$,$$values('completed',true)$$,'finalizing clinical care completes the checked-in appointment atomically');

reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='41000000-0000-4000-8000-000000000003';
set local "request.jwt.claim.role"='authenticated';
select results_eq($$select count(*)::bigint from public.clinical_encounters$$,$$values(1::bigint)$$,'patient sees finalized encounter');
select results_eq($$select count(*)::bigint from public.clinical_diagnoses$$,$$values(1::bigint)$$,'patient sees finalized diagnosis');
select results_eq($$select count(*)::bigint from public.odontogram_observations$$,$$values(1::bigint)$$,'patient sees finalized odontogram observation');
select results_eq($$select count(*)::bigint from public.treatment_plans$$,$$values(1::bigint)$$,'patient sees finalized treatment plan');

reset role;
insert into public.appointments(id,patient_profile_id,booked_by,clinic_id,dentist_id,service_id,start_at,end_at,duration_minutes,price_bdt,deposit_bdt,status,completed_at) values
('44000000-0000-4000-8000-000000000002',(select id from public.patient_profiles where account_owner_id='41000000-0000-4000-8000-000000000003'),'41000000-0000-4000-8000-000000000003','42000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000008','43000000-0000-4000-8000-000000000002',now()-interval '2 days',now()-interval '2 days'+interval '30 minutes',30,1000,200,'completed',now()-interval '2 days');

set local role authenticated;
set local "request.jwt.claim.sub"='41000000-0000-4000-8000-000000000008';
set local "request.jwt.claim.role"='authenticated';
select results_eq($$select count(*)::bigint from public.clinical_encounters where clinic_id='42000000-0000-4000-8000-000000000001'$$,$$values(0::bigint)$$,'second clinic dentist cannot read prior clinic history without consent');

reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='41000000-0000-4000-8000-000000000003';
set local "request.jwt.claim.role"='authenticated';
select ok(length(set_config('test.consent_two',public.set_patient_clinic_consent((select id from public.patient_profiles where account_owner_id='41000000-0000-4000-8000-000000000003'),'42000000-0000-4000-8000-000000000002',(select id from public.consent_templates where consent_key='cross_clinic_history' and active),'{"understand_scope":true,"authorize_clinic":true,"understand_revocation":true}'::jsonb)::text,true))=36,'patient grants second clinic explicit consent');

reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='41000000-0000-4000-8000-000000000008';
set local "request.jwt.claim.role"='authenticated';
select results_eq($$select count(*)::bigint from public.clinical_encounters where clinic_id='42000000-0000-4000-8000-000000000001'$$,$$values(1::bigint)$$,'second treating dentist reads finalized prior history after consent');

reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='41000000-0000-4000-8000-000000000003';
set local "request.jwt.claim.role"='authenticated';
select lives_ok($$select public.revoke_patient_clinic_consent(current_setting('test.consent_two')::uuid,'Care completed')$$,'patient revokes clinic consent');

reset role;
set local role authenticated;
set local "request.jwt.claim.sub"='41000000-0000-4000-8000-000000000008';
set local "request.jwt.claim.role"='authenticated';
select results_eq($$select count(*)::bigint from public.clinical_encounters where clinic_id='42000000-0000-4000-8000-000000000001'$$,$$values(0::bigint)$$,'revocation blocks future cross-clinic reads');

reset role;
select ok((select count(*)>=4 from public.clinical_record_versions),'clinical edits preserve before and after versions');

set local role authenticated;
set local "request.jwt.claim.sub"='41000000-0000-4000-8000-000000000007';
set local "request.jwt.claim.role"='authenticated';
select results_eq($$select count(*)::bigint from public.clinical_encounters$$,$$values(0::bigint)$$,'Super Admin direct table reads are denied to preserve auditability');
select is(jsonb_typeof(public.super_admin_clinical_snapshot((select id from public.patient_profiles where account_owner_id='41000000-0000-4000-8000-000000000003'),'Investigating authorized patient support request')),'object','Super Admin reads a complete snapshot through audited RPC');

reset role;
select results_eq($$select count(*)::bigint from public.audit_logs where action='clinical.super_admin_read'$$,$$values(1::bigint)$$,'Super Admin clinical read is audited');
select results_eq($$select count(*)::bigint from storage.buckets where id in ('clinical-media','prescriptions') and public=false$$,$$values(2::bigint)$$,'clinical media and prescription buckets are private');

select * from finish();
rollback;
