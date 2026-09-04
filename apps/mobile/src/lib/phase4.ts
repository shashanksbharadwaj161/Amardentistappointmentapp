import type { AllergyInput, ClinicConsentInput, ClinicalDiagnosisInput, ClinicalEncounterInput, MedicalHistoryInput, PrescriptionDraftInput, ToothObservationInput, TreatmentPlanInput } from '@amar-dentist/domain'
import { supabase } from './supabase'

const previewEnabled = process.env.EXPO_PUBLIC_DEMO_MODE === 'true'
const previewPatientId = '00000000-0000-4000-8000-000000000001'
const previewClinicId = '30000000-0000-4000-8000-000000000001'
const previewAppointmentId = '73000000-0000-4000-8000-000000000002'
const previewEncounterId = '81000000-0000-4000-8000-000000000001'
const id = () => `clinical-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export type ClinicalEncounterSummary = {
  id: string
  appointmentId: string
  patientProfileId: string
  clinicId: string
  treatingDentistId: string
  status: 'draft' | 'finalized' | 'amended'
  chiefComplaint: string
  subjectiveNotes: string
  objectiveNotes: string
  assessment: string
  plan: string
  finalizedAt: string | null
}

export type ClinicalDiagnosisSummary = { id: string; code: string | null; diagnosis: string; notes: string; finalizedAt: string | null }
export type ToothObservationSummary = { id: string; dentition: 'adult' | 'primary'; fdiToothCode: string; surface: string; finding: string; finalizedAt: string | null }
export type PrescriptionSummary = { id: string; status: string; instructions: string; finalizedAt: string | null; documentPath: string | null; items: Array<{ id: string; medicineName: string; strength: string; dosage: string; route: string; frequency: string; duration: string; instructions: string }> }
export type TreatmentPlanSummary = { id: string; title: string; status: string; recordStatus: string; notes: string; finalizedAt: string | null; items: Array<{ id: string; description: string; fdiToothCode: string | null; sequenceNumber: number; status: string; estimatedPriceBdt: number | null }> }
export type MedicalHistorySummary = { conditions: string[]; currentMedications: string[]; priorSurgeries: string[]; pregnancyStatus: string | null; tobaccoUse: string | null; notes: string }
export type AllergySummary = { id: string; allergen: string; reaction: string; severity: string; active: boolean }
export type ClinicalMediaSummary = { id: string; kind: 'photograph' | 'xray'; storagePath: string; filename: string; contentType: string; caption: string; finalizedAt: string | null }
export type ClinicalRecordBundle = { encounter: ClinicalEncounterSummary; diagnoses: ClinicalDiagnosisSummary[]; teeth: ToothObservationSummary[]; prescriptions: PrescriptionSummary[]; treatmentPlans: TreatmentPlanSummary[]; media: ClinicalMediaSummary[] }
export type ConsentTemplateSummary = { id: string; version: number; titleEn: string; titleBn: string; bodyEn: string; bodyBn: string; checkboxKeys: string[] }
export type ConsentSummary = { id: string; clinicId: string; clinicName: string; templateVersion: number; status: string; acceptedAt: string; revokedAt: string | null }

const previewEncounter = (): ClinicalEncounterSummary => ({ id: previewEncounterId, appointmentId: previewAppointmentId, patientProfileId: previewPatientId, clinicId: previewClinicId, treatingDentistId: '20000000-0000-4000-8000-000000000002', status: 'draft', chiefComplaint: 'Sensitivity to cold', subjectiveNotes: 'Intermittent sensitivity for one week.', objectiveNotes: 'Occlusal caries visible on tooth 16.', assessment: 'Dentinal caries, tooth 16.', plan: 'Composite restoration and preventive guidance.', finalizedAt: null })

function mapEncounter(row: Record<string, unknown>): ClinicalEncounterSummary {
  return { id: String(row.id), appointmentId: String(row.appointment_id), patientProfileId: String(row.patient_profile_id), clinicId: String(row.clinic_id), treatingDentistId: String(row.treating_dentist_id), status: row.status as ClinicalEncounterSummary['status'], chiefComplaint: String(row.chief_complaint ?? ''), subjectiveNotes: String(row.subjective_notes ?? ''), objectiveNotes: String(row.objective_notes ?? ''), assessment: String(row.assessment ?? ''), plan: String(row.plan ?? ''), finalizedAt: row.finalized_at ? String(row.finalized_at) : null }
}

export async function openClinicalEncounter(appointmentId: string): Promise<ClinicalRecordBundle> {
  if (!supabase || previewEnabled) return { encounter: previewEncounter(), diagnoses: [{ id: '82000000-0000-4000-8000-000000000001', code: 'K02.9', diagnosis: 'Dental caries', notes: 'Tooth 16', finalizedAt: null }], teeth: [{ id: '83000000-0000-4000-8000-000000000001', dentition: 'adult', fdiToothCode: '16', surface: 'occlusal', finding: 'Caries', finalizedAt: null }], prescriptions: [], treatmentPlans: [], media: [] }
  const { data: encounterId, error: startError } = await supabase.rpc('start_clinical_encounter', { target_appointment_id: appointmentId })
  if (startError) throw new Error(startError.message)
  const [encounterResult, diagnosisResult, toothResult, prescriptionResult, planResult, mediaResult] = await Promise.all([
    supabase.from('clinical_encounters').select('*').eq('id', encounterId).single(),
    supabase.from('clinical_diagnoses').select('*').eq('encounter_id', encounterId).order('created_at'),
    supabase.from('odontogram_observations').select('*').eq('encounter_id', encounterId).order('fdi_tooth_code'),
    supabase.from('prescriptions').select('*,prescription_items(*)').eq('encounter_id', encounterId).order('created_at'),
    supabase.from('treatment_plans').select('*,treatment_plan_items(*)').eq('encounter_id', encounterId).order('created_at'),
    supabase.from('clinical_media').select('*').eq('encounter_id', encounterId).order('created_at'),
  ])
  const error = encounterResult.error ?? diagnosisResult.error ?? toothResult.error ?? prescriptionResult.error ?? planResult.error ?? mediaResult.error
  if (error) throw new Error(error.message)
  return mapBundle(encounterResult.data as Record<string, unknown>, diagnosisResult.data ?? [], toothResult.data ?? [], prescriptionResult.data ?? [], planResult.data ?? [], mediaResult.data ?? [])
}

function mapBundle(encounter: Record<string, unknown>, diagnoses: Array<Record<string, unknown>>, teeth: Array<Record<string, unknown>>, prescriptions: Array<Record<string, unknown>>, plans: Array<Record<string, unknown>>, media: Array<Record<string, unknown>>): ClinicalRecordBundle {
  return {
    encounter: mapEncounter(encounter),
    diagnoses: diagnoses.map((row) => ({ id: String(row.id), code: row.code ? String(row.code) : null, diagnosis: String(row.diagnosis), notes: String(row.notes ?? ''), finalizedAt: row.finalized_at ? String(row.finalized_at) : null })),
    teeth: teeth.map((row) => ({ id: String(row.id), dentition: row.dentition as 'adult' | 'primary', fdiToothCode: String(row.fdi_tooth_code), surface: String(row.surface), finding: String(row.finding), finalizedAt: row.finalized_at ? String(row.finalized_at) : null })),
    prescriptions: prescriptions.map((row) => ({ id: String(row.id), status: String(row.status), instructions: String(row.instructions ?? ''), finalizedAt: row.finalized_at ? String(row.finalized_at) : null, documentPath: row.document_path ? String(row.document_path) : null, items: ((row.prescription_items as Array<Record<string, unknown>> | undefined) ?? []).map((item) => ({ id: String(item.id), medicineName: String(item.medicine_name), strength: String(item.strength ?? ''), dosage: String(item.dosage), route: String(item.route), frequency: String(item.frequency), duration: String(item.duration), instructions: String(item.instructions ?? '') })) })),
    treatmentPlans: plans.map((row) => ({ id: String(row.id), title: String(row.title), status: String(row.status), recordStatus: String(row.record_status), notes: String(row.notes ?? ''), finalizedAt: row.finalized_at ? String(row.finalized_at) : null, items: ((row.treatment_plan_items as Array<Record<string, unknown>> | undefined) ?? []).map((item) => ({ id: String(item.id), description: String(item.description), fdiToothCode: item.fdi_tooth_code ? String(item.fdi_tooth_code) : null, sequenceNumber: Number(item.sequence_number), status: String(item.status), estimatedPriceBdt: item.estimated_price_bdt === null ? null : Number(item.estimated_price_bdt) })) })),
    media: media.map((row) => ({ id: String(row.id), kind: row.kind as 'photograph' | 'xray', storagePath: String(row.storage_path), filename: String(row.filename), contentType: String(row.content_type), caption: String(row.caption ?? ''), finalizedAt: row.finalized_at ? String(row.finalized_at) : null })),
  }
}

export async function saveEncounter(input: ClinicalEncounterInput): Promise<void> {
  if (!supabase || previewEnabled) return
  const { error } = await supabase.rpc('save_clinical_encounter', { target_encounter_id: input.encounterId, complaint: input.chiefComplaint, subjective: input.subjectiveNotes, objective: input.objectiveNotes, assessment_text: input.assessment, plan_text: input.plan, change_reason: input.changeReason })
  if (error) throw new Error(error.message)
}

export async function addDiagnosis(input: ClinicalDiagnosisInput): Promise<string> {
  if (!supabase || previewEnabled) return id()
  const { data, error } = await supabase.rpc('add_clinical_diagnosis', { target_encounter_id: input.encounterId, diagnosis_code: input.code, diagnosis_text: input.diagnosis, diagnosis_notes: input.notes })
  if (error) throw new Error(error.message)
  return data as string
}

export async function saveToothObservation(input: ToothObservationInput): Promise<string> {
  if (!supabase || previewEnabled) return id()
  const { data, error } = await supabase.rpc('save_tooth_observation', { target_encounter_id: input.encounterId, target_dentition: input.dentition, tooth_code: input.fdiToothCode, tooth_surface: input.surface, finding_text: input.finding, change_reason: input.changeReason })
  if (error) throw new Error(error.message)
  return data as string
}

export async function savePrescription(input: PrescriptionDraftInput): Promise<string> {
  if (!supabase || previewEnabled) return id()
  const { data, error } = await supabase.rpc('save_prescription_draft', { target_encounter_id: input.encounterId, target_prescription_id: input.prescriptionId, prescription_instructions: input.instructions, items: input.items, change_reason: input.changeReason })
  if (error) throw new Error(error.message)
  return data as string
}

export async function finalizePrescription(prescriptionId: string): Promise<void> {
  if (!supabase || previewEnabled) return
  const { error } = await supabase.rpc('finalize_prescription', { target_prescription_id: prescriptionId, change_reason: 'Medication, dosage, allergies, and instructions reviewed' })
  if (error) throw new Error(error.message)
}

export async function getPrescriptionDownloadUrl(prescriptionId: string): Promise<string | null> {
  if (!supabase || previewEnabled) return null
  const { data, error } = await supabase.functions.invoke('generate-prescription', { body: { prescriptionId } })
  if (error || !data?.ok || typeof data.data?.url !== 'string') throw new Error(error?.message ?? 'PRESCRIPTION_DOWNLOAD_FAILED')
  return data.data.url
}

export async function finalizeEncounter(encounterId: string): Promise<void> {
  if (!supabase || previewEnabled) return
  const { error } = await supabase.rpc('finalize_clinical_encounter', { target_encounter_id: encounterId, change_reason: 'Clinical fields reviewed and finalized' })
  if (error) throw new Error(error.message)
}

export async function getPatientClinicalRecords(patientProfileId: string): Promise<{ history: MedicalHistorySummary | null; allergies: AllergySummary[]; records: ClinicalRecordBundle[] }> {
  if (!supabase || previewEnabled) {
    const encounter = { ...previewEncounter(), status: 'finalized' as const, finalizedAt: new Date().toISOString() }
    return { history: { conditions: ['Hypertension'], currentMedications: ['Medicine A'], priorSurgeries: [], pregnancyStatus: null, tobaccoUse: null, notes: 'Stable' }, allergies: [{ id: '84000000-0000-4000-8000-000000000001', allergen: 'Penicillin', reaction: 'Rash', severity: 'moderate', active: true }], records: [{ encounter, diagnoses: [{ id: '82000000-0000-4000-8000-000000000001', code: 'K02.9', diagnosis: 'Dental caries', notes: 'Tooth 16', finalizedAt: encounter.finalizedAt }], teeth: [{ id: '83000000-0000-4000-8000-000000000001', dentition: 'adult', fdiToothCode: '16', surface: 'occlusal', finding: 'Caries', finalizedAt: encounter.finalizedAt }], prescriptions: [{ id: '85000000-0000-4000-8000-000000000001', status: 'finalized', instructions: 'Take after food.', finalizedAt: encounter.finalizedAt, documentPath: null, items: [{ id: '86000000-0000-4000-8000-000000000001', medicineName: 'Paracetamol', strength: '500 mg', dosage: '1 tablet', route: 'oral', frequency: 'Twice daily', duration: '3 days', instructions: 'After food' }] }], treatmentPlans: [{ id: '87000000-0000-4000-8000-000000000001', title: 'Restore tooth 16', status: 'proposed', recordStatus: 'finalized', notes: 'Discussed alternatives.', finalizedAt: encounter.finalizedAt, items: [{ id: '88000000-0000-4000-8000-000000000001', description: 'Composite restoration', fdiToothCode: '16', sequenceNumber: 1, status: 'proposed', estimatedPriceBdt: 2500 }] }], media: [] }] }
  }
  const client = supabase
  const [historyResult, allergyResult, encounterResult] = await Promise.all([
    client.from('patient_medical_histories').select('*').eq('patient_profile_id', patientProfileId).maybeSingle(),
    client.from('patient_allergies').select('*').eq('patient_profile_id', patientProfileId).eq('active', true).order('created_at'),
    client.from('clinical_encounters').select('*').eq('patient_profile_id', patientProfileId).order('created_at', { ascending: false }),
  ])
  const error = historyResult.error ?? allergyResult.error ?? encounterResult.error
  if (error) throw new Error(error.message)
  const records = await Promise.all((encounterResult.data ?? []).map(async (encounter) => {
    const [diagnoses, teeth, prescriptions, plans, media] = await Promise.all([
      client.from('clinical_diagnoses').select('*').eq('encounter_id', encounter.id),
      client.from('odontogram_observations').select('*').eq('encounter_id', encounter.id),
      client.from('prescriptions').select('*,prescription_items(*)').eq('encounter_id', encounter.id),
      client.from('treatment_plans').select('*,treatment_plan_items(*)').eq('encounter_id', encounter.id),
      client.from('clinical_media').select('*').eq('encounter_id', encounter.id),
    ])
    const nestedError = diagnoses.error ?? teeth.error ?? prescriptions.error ?? plans.error ?? media.error
    if (nestedError) throw new Error(nestedError.message)
    return mapBundle(encounter as Record<string, unknown>, diagnoses.data ?? [], teeth.data ?? [], prescriptions.data ?? [], plans.data ?? [], media.data ?? [])
  }))
  const history = historyResult.data ? { conditions: historyResult.data.conditions, currentMedications: historyResult.data.current_medications, priorSurgeries: historyResult.data.prior_surgeries, pregnancyStatus: historyResult.data.pregnancy_status, tobaccoUse: historyResult.data.tobacco_use, notes: historyResult.data.notes } : null
  return { history, allergies: (allergyResult.data ?? []).map((row) => ({ id: row.id, allergen: row.allergen, reaction: row.reaction, severity: row.severity, active: row.active })), records }
}

export async function saveMedicalHistory(input: MedicalHistoryInput): Promise<void> {
  if (!supabase || previewEnabled) return
  const { error } = await supabase.rpc('save_patient_medical_history', { target_patient_profile_id: input.patientProfileId, condition_list: input.conditions, medication_list: input.currentMedications, surgery_list: input.priorSurgeries, pregnancy: input.pregnancyStatus, tobacco: input.tobaccoUse, history_notes: input.notes, change_reason: 'Patient medical history reviewed' })
  if (error) throw new Error(error.message)
}

export async function addPatientAllergy(input: AllergyInput): Promise<string> {
  if (!supabase || previewEnabled) return id()
  const { data, error } = await supabase.rpc('add_patient_allergy', { target_patient_profile_id: input.patientProfileId, allergen_name: input.allergen, reaction_text: input.reaction, allergy_severity: input.severity })
  if (error) throw new Error(error.message)
  return data as string
}

export async function createAndFinalizeTreatmentPlan(input: TreatmentPlanInput): Promise<string> {
  if (!supabase || previewEnabled) return id()
  const { data, error } = await supabase.rpc('create_treatment_plan', { target_encounter_id: input.encounterId, plan_title: input.title, plan_notes: input.notes, items: input.items })
  if (error) throw new Error(error.message)
  const treatmentPlanId = data as string
  const { error: finalizeError } = await supabase.rpc('finalize_treatment_plan', { target_treatment_plan_id: treatmentPlanId, change_reason: 'Treatment plan reviewed and finalized' })
  if (finalizeError) throw new Error(finalizeError.message)
  return treatmentPlanId
}

export async function uploadClinicalMedia(encounterId: string, kind: 'photograph' | 'xray', asset: { uri: string; name: string; mimeType?: string; size?: number }, caption: string): Promise<string> {
  if (!supabase || previewEnabled) return id()
  const { data: userResult, error: userError } = await supabase.auth.getUser()
  if (userError || !userResult.user) throw new Error(userError?.message ?? 'AUTH_REQUIRED')
  const safeName = asset.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-120)
  const objectPath = `${userResult.user.id}/${encounterId}/${Date.now()}-${safeName}`
  const response = await fetch(asset.uri)
  if (!response.ok) throw new Error('CLINICAL_MEDIA_READ_FAILED')
  const body = await response.blob()
  const contentType = asset.mimeType ?? body.type ?? 'application/octet-stream'
  const { error: uploadError } = await supabase.storage.from('clinical-media').upload(objectPath, body, { contentType, upsert: false })
  if (uploadError) throw new Error(uploadError.message)
  const { data, error } = await supabase.rpc('register_clinical_media', { target_encounter_id: encounterId, media_kind: kind, object_path: objectPath, original_filename: asset.name, mime_type: contentType, content_size: asset.size ?? body.size, media_caption: caption })
  if (error) {
    await supabase.storage.from('clinical-media').remove([objectPath])
    throw new Error(error.message)
  }
  return data as string
}

export async function getClinicalMediaDownloadUrl(storagePath: string): Promise<string | null> {
  if (!supabase || previewEnabled) return null
  const { data, error } = await supabase.storage.from('clinical-media').createSignedUrl(storagePath, 120)
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'CLINICAL_MEDIA_DOWNLOAD_FAILED')
  return data.signedUrl
}

export async function getClinicalConsentContext(patientProfileId: string): Promise<{ template: ConsentTemplateSummary | null; consents: ConsentSummary[]; clinics: Array<{ id: string; name: string }> }> {
  if (!supabase || previewEnabled) return { template: { id: '89000000-0000-4000-8000-000000000001', version: 1, titleEn: 'Share dental history with this clinic', titleBn: 'এই ক্লিনিকের সঙ্গে ডেন্টাল ইতিহাস শেয়ার করুন', bodyEn: 'Allow verified treating dentists at this clinic to view prior finalized records.', bodyBn: 'এই ক্লিনিকের যাচাইকৃত চিকিৎসারত ডেন্টিস্টকে আগের চূড়ান্ত রেকর্ড দেখার অনুমতি দিন।', checkboxKeys: ['understand_scope', 'authorize_clinic', 'understand_revocation'] }, consents: [], clinics: [{ id: previewClinicId, name: 'Shapla Dental Studio' }] }
  const [templateResult, consentResult, appointmentResult] = await Promise.all([
    supabase.from('consent_templates').select('*').eq('consent_key', 'cross_clinic_history').eq('active', true).order('version', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('patient_clinic_consents').select('*,clinics(name)').eq('patient_profile_id', patientProfileId).order('accepted_at', { ascending: false }),
    supabase.from('appointments').select('clinic_id,clinics(name)').eq('patient_profile_id', patientProfileId),
  ])
  const error = templateResult.error ?? consentResult.error ?? appointmentResult.error
  if (error) throw new Error(error.message)
  const clinicMap = new Map<string, string>()
  for (const row of appointmentResult.data ?? []) { const value = row.clinics as unknown; const clinic = (Array.isArray(value) ? value[0] : value) as { name: string } | null; if (clinic) clinicMap.set(row.clinic_id, clinic.name) }
  const template = templateResult.data ? { id: templateResult.data.id, version: templateResult.data.version, titleEn: templateResult.data.title_en, titleBn: templateResult.data.title_bn, bodyEn: templateResult.data.body_en, bodyBn: templateResult.data.body_bn, checkboxKeys: templateResult.data.checkbox_keys } : null
  return { template, clinics: [...clinicMap].map(([clinicId, name]) => ({ id: clinicId, name })), consents: (consentResult.data ?? []).map((row) => { const value = row.clinics as unknown; const clinic = (Array.isArray(value) ? value[0] : value) as { name: string } | null; return { id: row.id, clinicId: row.clinic_id, clinicName: clinic?.name ?? '', templateVersion: row.template_version, status: row.status, acceptedAt: row.accepted_at, revokedAt: row.revoked_at } }) }
}

export async function grantClinicalConsent(input: ClinicConsentInput): Promise<string> {
  if (!supabase || previewEnabled) return id()
  const { data, error } = await supabase.rpc('set_patient_clinic_consent', { target_patient_profile_id: input.patientProfileId, target_clinic_id: input.clinicId, target_template_id: input.templateId, checkbox_values: input.acceptedCheckboxes })
  if (error) throw new Error(error.message)
  return data as string
}

export async function revokeClinicalConsent(consentId: string): Promise<void> {
  if (!supabase || previewEnabled) return
  const { error } = await supabase.rpc('revoke_patient_clinic_consent', { target_consent_id: consentId, reason: 'Revoked by patient' })
  if (error) throw new Error(error.message)
}
