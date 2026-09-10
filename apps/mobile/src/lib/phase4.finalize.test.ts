jest.mock('./supabase', () => ({ supabase: { rpc: jest.fn() } }))
import { supabase } from './supabase'
import { saveAndFinalizeEncounter } from './phase4'

const input = { encounterId: '11111111-1111-4111-8111-111111111111', chiefComplaint: 'edited complaint', subjectiveNotes: 'subjective', objectiveNotes: 'exam', assessment: 'assessment', plan: 'plan', changeReason: 'Fields reviewed' }
const expected = { complaint: 'server complaint', subjective: 'subjective', objective: 'exam', assessment: 'assessment', plan: 'plan' }
beforeEach(() => jest.clearAllMocks())

it('sends one atomic RPC with exact expected server fields and separate submitted values', async () => {
  jest.mocked(supabase!.rpc).mockResolvedValue({ error: null } as never)
  await saveAndFinalizeEncounter(input, expected)
  expect(supabase!.rpc).toHaveBeenCalledTimes(1)
  expect(supabase!.rpc).toHaveBeenCalledWith('save_and_finalize_clinical_encounter', {
    target_encounter_id: input.encounterId, expected_notes: expected, complaint: input.chiefComplaint,
    subjective: input.subjectiveNotes, objective: input.objectiveNotes, assessment_text: input.assessment,
    plan_text: input.plan, change_reason: input.changeReason,
  })
})

it('propagates the machine-readable changed-record condition without raw database details', async () => {
  jest.mocked(supabase!.rpc).mockResolvedValue({ error: { code: '40001', message: 'private database detail' } } as never)
  await expect(saveAndFinalizeEncounter(input, expected)).rejects.toThrow('CLINICAL_RECORD_CHANGED')
})

it('fails closed with a generic error on permission or provider failure', async () => {
  jest.mocked(supabase!.rpc).mockResolvedValue({ error: { code: '42501', message: 'private database detail' } } as never)
  await expect(saveAndFinalizeEncounter(input, expected)).rejects.toThrow('CLINICAL_FINALIZATION_FAILED')
})
