import { describe, expect, it } from 'vitest'
import { clinicConsentSchema, clinicalEncounterSchema, isValidFdiCode, prescriptionDraftSchema, toothObservationSchema } from './phase4'

const id = '00000000-0000-4000-8000-000000000001'

describe('Phase 4 clinical boundaries', () => {
  it('distinguishes adult and primary FDI tooth codes', () => {
    expect(isValidFdiCode('adult', '18')).toBe(true)
    expect(isValidFdiCode('adult', '55')).toBe(false)
    expect(isValidFdiCode('primary', '55')).toBe(true)
    expect(isValidFdiCode('primary', '58')).toBe(false)
  })

  it('requires a reason for clinical note edits', () => {
    expect(clinicalEncounterSchema.safeParse({ encounterId: id, chiefComplaint: '', subjectiveNotes: '', objectiveNotes: 'Exam', assessment: 'Caries', plan: 'Restore', changeReason: '' }).success).toBe(false)
  })

  it('requires explicit checked consent values', () => {
    expect(clinicConsentSchema.safeParse({ patientProfileId: id, clinicId: id, templateId: id, acceptedCheckboxes: {} }).success).toBe(false)
    expect(clinicConsentSchema.safeParse({ patientProfileId: id, clinicId: id, templateId: id, acceptedCheckboxes: { authorize_clinic: true } }).success).toBe(true)
  })

  it('rejects an odontogram code from the wrong dentition', () => {
    expect(toothObservationSchema.safeParse({ encounterId: id, dentition: 'primary', fdiToothCode: '18', surface: 'occlusal', finding: 'Caries', changeReason: 'Initial chart' }).success).toBe(false)
  })

  it('requires a complete prescription item', () => {
    expect(prescriptionDraftSchema.safeParse({ encounterId: id, prescriptionId: null, instructions: '', changeReason: 'Initial draft', items: [{ medicineName: 'Medicine', strength: '500 mg', dosage: '1 tablet', route: 'oral', frequency: '', duration: '5 days', instructions: '' }] }).success).toBe(false)
  })
})
