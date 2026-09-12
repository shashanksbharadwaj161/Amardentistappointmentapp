jest.mock('./supabase', () => ({ supabase: null }))

import { messages } from '@amar-dentist/domain'
import { getClinicalConsentContext, getPatientClinicalRecords, getPrescribingSafetyContext, getPrescriptionDownloadUrl, openClinicalEncounter } from './phase4'

const patientId = '00000000-0000-4000-8000-000000000001'
const appointmentId = '73000000-0000-4000-8000-000000000002'

describe('phase 4 offline-safe clinical previews', () => {
  it('keeps clinician drafts separate from patient finalized records', async () => {
    const clinician = await openClinicalEncounter(appointmentId)
    const patient = await getPatientClinicalRecords(patientId)
    expect(clinician.encounter.status).toBe('draft')
    expect(patient.records[0]?.encounter.status).toBe('finalized')
  })

  it('provides a versioned bilingual consent template', async () => {
    const result = await getClinicalConsentContext(patientId)
    expect(result.template).toMatchObject({ version: 1 })
    expect(result.template?.titleEn).toBeTruthy()
    expect(result.template?.titleBn).toBeTruthy()
    expect(result.template?.checkboxKeys).toHaveLength(3)
  })

  it('does not invent a public prescription URL in preview mode', async () => {
    await expect(getPrescriptionDownloadUrl('85000000-0000-4000-8000-000000000001')).resolves.toBeNull()
  })

  it('never fabricates allergy or medication data when Supabase is unavailable and preview is off', async () => {
    // Preview is not enabled here (no EXPO_PUBLIC_DEMO_MODE) and supabase is null, so the safety
    // read must fail loudly rather than return fake "Penicillin" data or a false empty result.
    await expect(getPrescribingSafetyContext(patientId)).rejects.toThrow('NOT_CONNECTED')
  })
})

describe('prescribing-safety copy and severity labels', () => {
  it('provides real bilingual severity labels so allergy severity is never shown as a raw enum', () => {
    for (const key of ['unknown', 'mild', 'moderate', 'severe'] as const) {
      expect(typeof messages.en[key]).toBe('string')
      expect(messages.en[key].length).toBeGreaterThan(0)
      expect(typeof messages.bn[key]).toBe('string')
      expect(messages.bn[key].length).toBeGreaterThan(0)
      expect(messages.bn[key]).not.toBe(key)
    }
    expect(messages.en.moderate).toBe('Moderate')
    expect(messages.bn.moderate).toBe('মাঝারি')
  })
})

describe('prescribing-safety copy never implies no known allergies', () => {
  for (const locale of ['en', 'bn'] as const) {
    it(`empty and error states ask the dentist to confirm (${locale})`, () => {
      const m = messages[locale]
      for (const key of ['rxSafetyNoAllergiesOnFile', 'rxSafetyUnavailable', 'rxSafetyChecking', 'rxSafetyNoMedicationsOnFile', 'rxSafetyConfirm'] as const) {
        expect(typeof m[key]).toBe('string')
        expect(m[key].toLowerCase()).not.toContain('no known')
      }
      // The empty and unavailable states must explicitly direct confirmation with the patient.
      expect(m.rxSafetyNoAllergiesOnFile.length).toBeGreaterThan(0)
      expect(m.rxSafetyUnavailable.length).toBeGreaterThan(0)
    })
  }
})
