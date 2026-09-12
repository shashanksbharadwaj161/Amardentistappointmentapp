// Connected-query tests: exercise getPrescribingSafetyContext against a mocked Supabase client
// (not the supabase=null preview path) to verify patient filtering, the active-allergy filter, and
// error handling. Preview/demo is off here, so this is the real query path.
const mockDb: {
  history: { data: unknown; error: unknown }
  allergies: { data: unknown; error: unknown }
  calls: { history: Array<[string, unknown]>; allergies: Array<[string, unknown]> }
  rpcCalls: Array<[string, unknown]>
  createResult: Promise<{ data: unknown; error: unknown }>
} = {
  history: { data: { current_medications: [] }, error: null },
  allergies: { data: [], error: null },
  calls: { history: [], allergies: [] },
  rpcCalls: [],
  createResult: Promise.resolve({ data: 'plan-1', error: null }),
}

jest.mock('./supabase', () => ({
  supabase: {
    from(table: string) {
      if (table === 'patient_medical_histories') {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: (column: string, value: unknown) => { mockDb.calls.history.push([column, value]); return builder },
          maybeSingle: async () => mockDb.history,
        }
        return builder
      }
      if (table === 'patient_allergies') {
        const builder: Record<string, unknown> = {
          select: () => builder,
          eq: (column: string, value: unknown) => { mockDb.calls.allergies.push([column, value]); return builder },
          order: async () => mockDb.allergies,
        }
        return builder
      }
      throw new Error(`unexpected table ${table}`)
    },
    rpc: (name: string, args: unknown) => {
      mockDb.rpcCalls.push([name, args])
      if (name === 'create_treatment_plan') return mockDb.createResult
      return Promise.resolve({ data: 'ok', error: null })
    },
  },
}))

import { createAndFinalizeTreatmentPlan, getPrescribingSafetyContext } from './phase4'

const patientId = '00000000-0000-4000-8000-000000000001'

beforeEach(() => {
  mockDb.history = { data: { current_medications: [] }, error: null }
  mockDb.allergies = { data: [], error: null }
  mockDb.calls = { history: [], allergies: [] }
  mockDb.rpcCalls = []
  mockDb.createResult = Promise.resolve({ data: 'plan-1', error: null })
})

describe('getPrescribingSafetyContext (connected query)', () => {
  it('filters by the patient and reads only active allergies plus current medications', async () => {
    mockDb.history = { data: { current_medications: ['Warfarin'] }, error: null }
    mockDb.allergies = { data: [{ id: 'a1', allergen: 'Penicillin', reaction: 'Rash', severity: 'moderate', active: true }], error: null }
    const context = await getPrescribingSafetyContext(patientId)
    expect(context.historyRecorded).toBe(true)
    expect(context.currentMedications).toEqual(['Warfarin'])
    expect(context.allergies).toEqual([{ id: 'a1', allergen: 'Penicillin', reaction: 'Rash', severity: 'moderate', active: true }])
    expect(mockDb.calls.history).toContainEqual(['patient_profile_id', patientId])
    expect(mockDb.calls.allergies).toContainEqual(['patient_profile_id', patientId])
    expect(mockDb.calls.allergies).toContainEqual(['active', true])
  })

  it('treats a missing (or access-denied) history row as not recorded and returns no fabricated data', async () => {
    mockDb.history = { data: null, error: null }
    mockDb.allergies = { data: [], error: null }
    const context = await getPrescribingSafetyContext(patientId)
    expect(context.historyRecorded).toBe(false)
    expect(context.allergies).toEqual([])
    expect(context.currentMedications).toEqual([])
  })

  it('rejects when the allergy read fails', async () => {
    mockDb.allergies = { data: null, error: { message: 'allergy read denied' } }
    await expect(getPrescribingSafetyContext(patientId)).rejects.toThrow('allergy read denied')
  })

  it('rejects when the history read fails', async () => {
    mockDb.history = { data: null, error: { message: 'history read denied' } }
    await expect(getPrescribingSafetyContext(patientId)).rejects.toThrow('history read denied')
  })

  it('applies each patient id as its own filter when switching patients', async () => {
    await getPrescribingSafetyContext('patient-A')
    await getPrescribingSafetyContext('patient-B')
    expect(mockDb.calls.allergies).toContainEqual(['patient_profile_id', 'patient-A'])
    expect(mockDb.calls.allergies).toContainEqual(['patient_profile_id', 'patient-B'])
    expect(mockDb.calls.history).toContainEqual(['patient_profile_id', 'patient-A'])
    expect(mockDb.calls.history).toContainEqual(['patient_profile_id', 'patient-B'])
  })
})

describe('createAndFinalizeTreatmentPlan (connected) honours editor validity', () => {
  it('creates but does not finalize when the editor becomes invalid before finalize', async () => {
    let valid = true
    let resolveCreate: () => void = () => {}
    mockDb.createResult = new Promise((resolve) => { resolveCreate = () => resolve({ data: 'plan-1', error: null }) })
    const pending = createAndFinalizeTreatmentPlan({ encounterId: 'enc', title: 'Plan', notes: '', items: [] } as never, () => valid)
    // Access is revoked while the create RPC is still in flight.
    valid = false
    resolveCreate()
    const result = await pending
    expect(result).toBe('plan-1')
    const names = mockDb.rpcCalls.map((call) => call[0])
    expect(names).toContain('create_treatment_plan')
    expect(names).not.toContain('finalize_treatment_plan')
  })

  it('finalizes when the editor stays valid, preserving default behaviour for existing callers', async () => {
    mockDb.createResult = Promise.resolve({ data: 'plan-2', error: null })
    const result = await createAndFinalizeTreatmentPlan({ encounterId: 'enc', title: 'Plan', notes: '', items: [] } as never)
    expect(result).toBe('plan-2')
    expect(mockDb.rpcCalls.map((call) => call[0])).toContain('finalize_treatment_plan')
  })
})
