begin;
select plan(51);

select has_type('public','clinical_record_status','clinical record lifecycle enum exists');
select has_type('public','consent_status','consent lifecycle enum exists');
select has_type('public','dentition_type','adult and primary dentition enum exists');
select has_type('public','tooth_surface','tooth surface enum exists');
select has_type('public','treatment_plan_status','treatment plan lifecycle enum exists');
select has_type('public','clinical_media_kind','clinical media kind enum exists');

select has_table('public','patient_medical_histories','medical histories exist');
select has_table('public','patient_allergies','allergies exist');
select has_table('public','consent_templates','versioned bilingual consent templates exist');
select has_table('public','patient_clinic_consents','patient clinic consent records exist');
select has_table('public','clinical_encounters','clinical encounters exist');
select has_table('public','clinical_diagnoses','diagnoses exist');
select has_table('public','odontogram_observations','FDI odontogram observations exist');
select has_table('public','treatment_plans','treatment plans exist');
select has_table('public','treatment_plan_items','treatment steps exist');
select has_table('public','clinical_media','private photos and x-rays metadata exist');
select has_table('public','prescriptions','prescriptions exist');
select has_table('public','prescription_items','prescription items exist');
select has_table('public','clinical_record_versions','clinical before and after versions exist');

select has_function('public','is_treating_dentist','treating dentist boundary exists');
select has_function('public','has_active_clinical_consent','active consent helper exists');
select has_function('public','can_read_clinical_record','clinical record authorization helper exists');
select has_function('public','can_read_patient_history','patient history authorization helper exists');
select has_function('public','save_patient_medical_history','medical history RPC exists');
select has_function('public','add_patient_allergy','allergy RPC exists');
select has_function('public','set_patient_clinic_consent','consent grant RPC exists');
select has_function('public','revoke_patient_clinic_consent','consent revocation RPC exists');
select has_function('public','start_clinical_encounter','encounter start RPC exists');
select has_function('public','save_clinical_encounter','structured notes RPC exists');
select has_function('public','finalize_clinical_encounter','encounter finalization RPC exists');
select has_function('public','add_clinical_diagnosis','diagnosis RPC exists');
select has_function('public','save_tooth_observation','odontogram RPC exists');
select has_function('public','create_treatment_plan','treatment plan RPC exists');
select has_function('public','finalize_treatment_plan','treatment plan finalization RPC exists');
select has_function('public','register_clinical_media','private media registration RPC exists');
select has_function('public','save_prescription_draft','prescription drafting RPC exists');
select has_function('public','finalize_prescription','prescription finalization RPC exists');
select has_function('public','set_prescription_document','private prescription document registration RPC exists');
select has_function('public','super_admin_clinical_snapshot','audited Super Admin read RPC exists');

select policies_are('public','patient_medical_histories',array['medical_history_read_clinical']);
select policies_are('public','patient_allergies',array['allergies_read_clinical']);
select policies_are('public','patient_clinic_consents',array['consents_read_owner_or_treating']);
select policies_are('public','clinical_encounters',array['encounters_read_clinical']);
select policies_are('public','clinical_diagnoses',array['diagnoses_read_clinical']);
select policies_are('public','odontogram_observations',array['odontogram_read_clinical']);
select policies_are('public','treatment_plans',array['treatment_plans_read_clinical']);
select policies_are('public','clinical_media',array['clinical_media_read_clinical']);
select policies_are('public','prescriptions',array['prescriptions_read_clinical']);
select policies_are('public','clinical_record_versions',array['clinical_versions_read_dentist']);

select ok(not has_table_privilege('authenticated','public.clinical_encounters','INSERT'),'clients cannot directly insert encounters');
select ok(not has_table_privilege('authenticated','public.prescriptions','UPDATE'),'clients cannot directly finalize prescriptions');

select * from finish();
rollback;
