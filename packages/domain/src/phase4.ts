import { z } from 'zod'

const trimmed = (maximum: number) => z.string().trim().max(maximum)

export const allergySchema = z.object({
  patientProfileId: z.uuid(),
  allergen: z.string().trim().min(1).max(160),
  reaction: trimmed(500).default(''),
  severity: z.enum(['unknown', 'mild', 'moderate', 'severe']).default('unknown'),
})

export const medicalHistorySchema = z.object({
  patientProfileId: z.uuid(),
  conditions: z.array(z.string().trim().min(1).max(160)).max(50),
  currentMedications: z.array(z.string().trim().min(1).max(200)).max(50),
  priorSurgeries: z.array(z.string().trim().min(1).max(200)).max(30),
  pregnancyStatus: trimmed(100).nullable(),
  tobaccoUse: trimmed(100).nullable(),
  notes: trimmed(5000),
})

export const clinicConsentSchema = z.object({
  patientProfileId: z.uuid(),
  clinicId: z.uuid(),
  templateId: z.uuid(),
  acceptedCheckboxes: z.record(z.string(), z.literal(true)),
}).refine((value) => Object.keys(value.acceptedCheckboxes).length > 0, 'Consent checkboxes are required')

export const clinicalEncounterSchema = z.object({
  encounterId: z.uuid(),
  chiefComplaint: trimmed(2000),
  subjectiveNotes: trimmed(10000),
  objectiveNotes: trimmed(10000),
  assessment: trimmed(10000),
  plan: trimmed(10000),
  changeReason: z.string().trim().min(3).max(500),
})

export const clinicalDiagnosisSchema = z.object({
  encounterId: z.uuid(),
  code: trimmed(50),
  diagnosis: z.string().trim().min(1).max(1000),
  notes: trimmed(5000),
})

export const dentitionSchema = z.enum(['adult', 'primary'])
export const toothSurfaceSchema = z.enum(['whole', 'mesial', 'distal', 'buccal', 'lingual', 'occlusal', 'incisal'])

export function isValidFdiCode(dentition: z.infer<typeof dentitionSchema>, code: string): boolean {
  return dentition === 'adult' ? /^[1-4][1-8]$/.test(code) : /^[5-8][1-5]$/.test(code)
}

export const toothObservationSchema = z.object({
  encounterId: z.uuid(),
  dentition: dentitionSchema,
  fdiToothCode: z.string(),
  surface: toothSurfaceSchema,
  finding: z.string().trim().min(1).max(1000),
  changeReason: z.string().trim().min(3).max(500),
}).refine((value) => isValidFdiCode(value.dentition, value.fdiToothCode), { path: ['fdiToothCode'], message: 'Invalid FDI tooth code for dentition' })

export const prescriptionItemSchema = z.object({
  medicineName: z.string().trim().min(1).max(300),
  strength: trimmed(100),
  dosage: z.string().trim().min(1).max(300),
  route: z.string().trim().min(1).max(100).default('oral'),
  frequency: z.string().trim().min(1).max(300),
  duration: z.string().trim().min(1).max(300),
  instructions: trimmed(1000),
})

export const prescriptionDraftSchema = z.object({
  encounterId: z.uuid(),
  prescriptionId: z.uuid().nullable(),
  instructions: trimmed(5000),
  items: z.array(prescriptionItemSchema).min(1).max(30),
  changeReason: z.string().trim().min(3).max(500),
})

export const treatmentPlanSchema = z.object({
  encounterId: z.uuid(),
  title: z.string().trim().min(1).max(500),
  notes: trimmed(5000),
  items: z.array(z.object({
    description: z.string().trim().min(1).max(1000),
    fdiToothCode: z.string().trim().max(2).nullable(),
    estimatedPriceBdt: z.number().min(0).max(100_000_000).nullable(),
  })).min(1).max(100),
})

export type AllergyInput = z.infer<typeof allergySchema>
export type MedicalHistoryInput = z.infer<typeof medicalHistorySchema>
export type ClinicConsentInput = z.infer<typeof clinicConsentSchema>
export type ClinicalEncounterInput = z.infer<typeof clinicalEncounterSchema>
export type ClinicalDiagnosisInput = z.infer<typeof clinicalDiagnosisSchema>
export type ToothObservationInput = z.infer<typeof toothObservationSchema>
export type PrescriptionDraftInput = z.infer<typeof prescriptionDraftSchema>
export type TreatmentPlanInput = z.infer<typeof treatmentPlanSchema>
