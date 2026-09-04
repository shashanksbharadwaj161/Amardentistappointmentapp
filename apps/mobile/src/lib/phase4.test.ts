jest.mock('./supabase', () => ({ supabase: null }))

import { getClinicalConsentContext, getPatientClinicalRecords, getPrescriptionDownloadUrl, openClinicalEncounter } from './phase4'

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
})
