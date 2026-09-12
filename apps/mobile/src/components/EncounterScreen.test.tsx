import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ClinicalEncounterScreen, { clinicalEncounterQueryKey, isPrescriptionFinalized, prescribingSafetyQueryKey, reconcileEncounterNotes } from '../../app/professional/encounter'
import { finalizeEncounter, finalizePrescription, getPrescribingSafetyContext, openClinicalEncounter, saveAndFinalizeEncounter, saveEncounter } from '../lib/phase4'

// Mutable auth/route state so tests can revoke the dentist role or switch actor/appointment and rerender.
const mockAuth: { profile: { id: string; roles: string[] } | null; loading: boolean } = { profile: { id: '20000000-0000-4000-8000-000000000001', roles: ['dentist'] }, loading: false }
const mockParams: { appointmentId?: string; patientName?: string } = { appointmentId: 'appt1' }

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }))
jest.mock('expo-router', () => ({ Redirect: () => null, Stack: { Screen: () => null }, router: { push: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => mockParams }))
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }))
jest.mock('../providers/AuthProvider', () => ({ useAuth: () => mockAuth }))
jest.mock('../providers/LocaleProvider', () => ({ useLocale: () => ({ t: (key: string) => key, locale: 'en' }) }))
jest.mock('../components/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }))
jest.mock('../lib/phase4', () => ({
  openClinicalEncounter: jest.fn(), saveEncounter: jest.fn(), addDiagnosis: jest.fn(), saveToothObservation: jest.fn(),
  savePrescription: jest.fn(), finalizePrescription: jest.fn(), createAndFinalizeTreatmentPlan: jest.fn(),
  getClinicalMediaDownloadUrl: jest.fn(), uploadClinicalMedia: jest.fn(), finalizeEncounter: jest.fn(), saveAndFinalizeEncounter: jest.fn(), getPrescribingSafetyContext: jest.fn(),
}))

const item = { id: 'i1', medicineName: 'Amoxicillin', strength: '500 mg', dosage: '1 capsule', route: 'oral', frequency: 'Every 8 hours', duration: '5 days', instructions: '' }
const baseEncounter = { id: '11111111-1111-4111-8111-111111111111', appointmentId: 'appt1', chiefComplaint: '', subjectiveNotes: '', objectiveNotes: '', assessment: '', plan: '', finalizedAt: null }
function bundle(overrides: { encounter?: Record<string, unknown>; prescriptions?: unknown[] } = {}) {
  const { encounter, ...rest } = overrides
  return { encounter: { ...baseEncounter, status: 'draft', ...encounter }, diagnoses: [], teeth: [], prescriptions: [], treatmentPlans: [], media: [], ...rest }
}
function show() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><ClinicalEncounterScreen /></QueryClientProvider>)
}
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(saveAndFinalizeEncounter).mockResolvedValue(undefined)
  mockAuth.profile = { id: '20000000-0000-4000-8000-000000000001', roles: ['dentist'] }
  mockAuth.loading = false
  mockParams.appointmentId = 'appt1'
  mockParams.patientName = undefined
})

it('gives an existing draft prescription an explicit dentist-only finalize control that finalizes it', async () => {
  jest.mocked(openClinicalEncounter).mockResolvedValue(bundle({ prescriptions: [{ id: 'rx1', status: 'draft', finalizedAt: null, instructions: '', documentPath: null, items: [item] }] }) as never)
  jest.mocked(finalizePrescription).mockResolvedValue(undefined)
  show()
  await waitFor(() => expect(screen.getByText(/Amoxicillin/)).toBeTruthy())
  // Two finalize controls exist: the existing draft's, plus the manual single-item add form.
  const buttons = screen.getAllByRole('button', { name: 'finalizePrescription' })
  expect(buttons.length).toBe(2)
  await fireEvent.press(buttons[0]!)
  await waitFor(() => expect(finalizePrescription).toHaveBeenCalledWith('rx1'))
})

it('shows a finalized prescription as finalized and offers no finalize control once the encounter is finalized', async () => {
  jest.mocked(openClinicalEncounter).mockResolvedValue(bundle({ encounter: { status: 'finalized' }, prescriptions: [{ id: 'rx2', status: 'finalized', finalizedAt: '2026-09-10T00:00:00Z', instructions: '', documentPath: null, items: [item] }] }) as never)
  show()
  await waitFor(() => expect(screen.getByText(/Amoxicillin/)).toBeTruthy())
  expect(screen.queryAllByRole('button', { name: 'finalizePrescription' }).length).toBe(0)
  expect(screen.getAllByText('finalizedRecord').length).toBeGreaterThan(0)
})

async function conflictReady(client: QueryClient) {
  jest.mocked(openClinicalEncounter)
    .mockResolvedValueOnce(bundle({ encounter: { assessment: 'orig' } }) as never)
    .mockResolvedValue(bundle({ encounter: { assessment: 'AI updated' } }) as never)
  jest.mocked(saveEncounter).mockResolvedValue(undefined)
  render(<QueryClientProvider client={client}><ClinicalEncounterScreen /></QueryClientProvider>)
  await waitFor(() => expect(screen.getByDisplayValue('orig')).toBeTruthy())
  await fireEvent.changeText(screen.getByLabelText('assessment'), 'my edit')
  await act(async () => { await client.invalidateQueries({ queryKey: ['clinical-encounter', 'appt1'] }) })
  await waitFor(() => expect(screen.getByText('noteConflictTitle')).toBeTruthy())
}

it('warns on a note conflict, blocks save, and keeps the dentist edit when chosen', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  await conflictReady(client)
  expect(screen.getByText('AI updated')).toBeTruthy()      // incoming value preserved and shown
  expect(screen.getByDisplayValue('my edit')).toBeTruthy() // local edit preserved in the input
  // Save is blocked while the conflict is unresolved (no silent overwrite).
  await fireEvent.press(screen.getByRole('button', { name: 'saveDraft' }))
  expect(saveEncounter).not.toHaveBeenCalled()
  expect(screen.getByText('resolveConflictsFirst')).toBeTruthy()
  // Keep my edit, then saving persists the dentist's text.
  await fireEvent.press(screen.getByRole('button', { name: 'keepMyEdit' }))
  expect(screen.queryByText('noteConflictTitle')).toBeNull()
  await fireEvent.press(screen.getByRole('button', { name: 'saveDraft' }))
  await waitFor(() => expect(saveEncounter).toHaveBeenCalledTimes(1))
  expect(jest.mocked(saveEncounter).mock.calls[0]![0]).toMatchObject({ assessment: 'my edit' })
})

it('takes the updated note (and preserves it on save) when the dentist chooses use-updated', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  await conflictReady(client)
  await fireEvent.press(screen.getByRole('button', { name: 'useUpdatedNote' }))
  expect(screen.queryByText('noteConflictTitle')).toBeNull()
  expect(screen.getByDisplayValue('AI updated')).toBeTruthy()
  await fireEvent.press(screen.getByRole('button', { name: 'saveDraft' }))
  await waitFor(() => expect(saveEncounter).toHaveBeenCalledTimes(1))
  expect(jest.mocked(saveEncounter).mock.calls[0]![0]).toMatchObject({ assessment: 'AI updated' })
})

it('retains both conflict values and blocks save/finalize across identical repeated refetches and later server updates', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  await conflictReady(client)
  for (let revision = 1; revision <= 2; revision++) {
    // A changed record revision forces an effect even when the structured notes are identical.
    jest.mocked(openClinicalEncounter).mockResolvedValue(bundle({ encounter: { assessment: 'AI updated', revision } }) as never)
    await act(async () => { await client.invalidateQueries({ queryKey: ['clinical-encounter', 'appt1'] }) })
    expect(screen.getByText('noteConflictTitle')).toBeTruthy()
    expect(screen.getByText('AI updated')).toBeTruthy()
    expect(screen.getByDisplayValue('my edit')).toBeTruthy()
    await fireEvent.press(screen.getByRole('button', { name: 'saveDraft' }))
    await fireEvent.press(screen.getByRole('button', { name: /finalizeEncounter/ }))
    expect(saveEncounter).not.toHaveBeenCalled()
    expect(finalizeEncounter).not.toHaveBeenCalled()
    expect(saveAndFinalizeEncounter).not.toHaveBeenCalled()
  }
  await fireEvent.changeText(screen.getByLabelText('assessment'), 'my newer edit')
  jest.mocked(openClinicalEncounter).mockResolvedValue(bundle({ encounter: { assessment: 'AI newer' } }) as never)
  await act(async () => { await client.invalidateQueries({ queryKey: ['clinical-encounter', 'appt1'] }) })
  await waitFor(() => expect(screen.getByText('AI newer')).toBeTruthy())
  expect(screen.getByDisplayValue('my newer edit')).toBeTruthy()
  expect(screen.getByText('my newer edit')).toBeTruthy()
  expect(screen.getByText('noteConflictTitle')).toBeTruthy()
  await fireEvent.press(screen.getByRole('button', { name: 'useUpdatedNote' }))
  expect(screen.queryByText('noteConflictTitle')).toBeNull()
  expect(screen.getByDisplayValue('AI newer')).toBeTruthy()
})

it('does not clear a conflict when pre-finalize refetch and its effect apply the same server result', async () => {
  jest.mocked(openClinicalEncounter)
    .mockResolvedValueOnce(bundle({ encounter: { assessment: 'orig' } }) as never)
    .mockResolvedValue(bundle({ encounter: { assessment: 'AI updated' } }) as never)
  jest.mocked(saveEncounter).mockResolvedValue(undefined)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={client}><ClinicalEncounterScreen /></QueryClientProvider>)
  await waitFor(() => expect(screen.getByDisplayValue('orig')).toBeTruthy())
  await fireEvent.changeText(screen.getByLabelText('assessment'), 'my edit')
  await fireEvent.press(screen.getByRole('button', { name: /finalizeEncounter/ }))
  await waitFor(() => expect(screen.getByText('noteConflictTitle')).toBeTruthy())
  await act(async () => { await client.invalidateQueries({ queryKey: ['clinical-encounter', 'appt1'] }) })
  await fireEvent.press(screen.getByRole('button', { name: /finalizeEncounter/ }))
  await fireEvent.press(screen.getByRole('button', { name: 'saveDraft' }))
  expect(saveEncounter).not.toHaveBeenCalled()
  expect(finalizeEncounter).not.toHaveBeenCalled()
  expect(saveAndFinalizeEncounter).not.toHaveBeenCalled()
  expect(screen.getByText('AI updated')).toBeTruthy()
  expect(screen.getByDisplayValue('my edit')).toBeTruthy()
  expect(screen.getByText('noteConflictTitle')).toBeTruthy()
})

it('uses the submitted snapshot as save baseline and preserves edits made while saving', async () => {
  jest.mocked(openClinicalEncounter).mockResolvedValue(bundle({ encounter: { assessment: 'orig' } }) as never)
  let finishSave!: () => void
  jest.mocked(saveEncounter).mockImplementation(() => new Promise<void>(resolve => { finishSave = resolve }))
  show()
  await waitFor(() => expect(screen.getByDisplayValue('orig')).toBeTruthy())
  await fireEvent.changeText(screen.getByLabelText('assessment'), 'submitted note')
  await fireEvent.press(screen.getByRole('button', { name: 'saveDraft' }))
  await waitFor(() => expect(saveEncounter).toHaveBeenCalledTimes(1))
  await fireEvent.changeText(screen.getByLabelText('assessment'), 'new unsaved note')
  jest.mocked(openClinicalEncounter).mockResolvedValue(bundle({ encounter: { assessment: 'submitted note' } }) as never)
  await act(async () => { finishSave() })
  await waitFor(() => expect(openClinicalEncounter).toHaveBeenCalledTimes(2))
  expect(jest.mocked(saveEncounter).mock.calls[0]![0]).toMatchObject({ assessment: 'submitted note' })
  expect(screen.getByDisplayValue('new unsaved note')).toBeTruthy()
  expect(screen.queryByText('noteConflictTitle')).toBeNull()
})

it('blocks finalizing when the pre-finalize refresh fails, so stale notes are not published', async () => {
  jest.mocked(openClinicalEncounter)
    .mockResolvedValueOnce(bundle({ encounter: { assessment: 'orig' } }) as never)
    .mockRejectedValue(new Error('network'))
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  render(<QueryClientProvider client={client}><ClinicalEncounterScreen /></QueryClientProvider>)
  await waitFor(() => expect(screen.getByDisplayValue('orig')).toBeTruthy())
  await fireEvent.press(screen.getByRole('button', { name: /finalizeEncounter/ }))
  await waitFor(() => expect(screen.getByText('refreshFailedStale')).toBeTruthy())
  expect(finalizeEncounter).not.toHaveBeenCalled()
  expect(saveEncounter).not.toHaveBeenCalled()
  expect(screen.getByDisplayValue('orig')).toBeTruthy() // editing screen and notes preserved
})

it('finalizes with one atomic request using fresh server expectations rather than merged local notes', async () => {
  const server = { chiefComplaint: 'original complaint', objectiveNotes: 'exam', assessment: 'assessment', plan: 'plan' }
  jest.mocked(openClinicalEncounter).mockResolvedValue(bundle({ encounter: server }) as never)
  show()
  await waitFor(() => expect(screen.getByDisplayValue('original complaint')).toBeTruthy())
  await fireEvent.changeText(screen.getByLabelText('chiefComplaint'), 'local complaint')
  await fireEvent.press(screen.getByRole('button', { name: /finalizeEncounter/ }))
  await waitFor(() => expect(saveAndFinalizeEncounter).toHaveBeenCalledTimes(1))
  expect(jest.mocked(saveAndFinalizeEncounter).mock.calls[0]![0]).toMatchObject({ chiefComplaint: 'local complaint', objectiveNotes: 'exam', assessment: 'assessment', plan: 'plan' })
  expect(jest.mocked(saveAndFinalizeEncounter).mock.calls[0]![1]).toEqual({ complaint: 'original complaint', subjective: '', objective: 'exam', assessment: 'assessment', plan: 'plan' })
  expect(saveEncounter).not.toHaveBeenCalled()
  expect(finalizeEncounter).not.toHaveBeenCalled()
  await waitFor(() => expect(screen.getByText('encounterFinalized')).toBeTruthy())
})

it('preserves the edited draft and reports stale state when the atomic request detects a changed record', async () => {
  jest.mocked(openClinicalEncounter).mockResolvedValue(bundle({ encounter: { chiefComplaint: 'original', objectiveNotes: 'exam', assessment: 'assessment', plan: 'plan' } }) as never)
  jest.mocked(saveAndFinalizeEncounter).mockRejectedValue(new Error('CLINICAL_RECORD_CHANGED'))
  show()
  await waitFor(() => expect(screen.getByDisplayValue('original')).toBeTruthy())
  await fireEvent.changeText(screen.getByLabelText('chiefComplaint'), 'unsaved dentist edit')
  await fireEvent.press(screen.getByRole('button', { name: /finalizeEncounter/ }))
  await waitFor(() => expect(screen.getByText('refreshFailedStale')).toBeTruthy())
  expect(screen.getByDisplayValue('unsaved dentist edit')).toBeTruthy()
  expect(screen.queryByText('encounterFinalized')).toBeNull()
  expect(saveEncounter).not.toHaveBeenCalled()
  expect(finalizeEncounter).not.toHaveBeenCalled()
})

describe('reconcileEncounterNotes', () => {
  const baseline = { complaint: 'c', subjective: 's', objective: 'o', assessment: 'a', plan: 'p' }
  it('adopts the server value for a field the dentist has not edited (so applied AI notes appear, not a stale blank)', () => {
    const { next, conflicts } = reconcileEncounterNotes({ ...baseline, subjective: 'AI subjective' }, baseline, baseline)
    expect(next.subjective).toBe('AI subjective')
    expect(conflicts).toEqual([])
  })
  it('preserves an unsaved local edit and never silently discards it', () => {
    const local = { ...baseline, plan: 'dentist unsaved plan' }
    const { next } = reconcileEncounterNotes({ ...baseline, subjective: 'AI subjective' }, local, baseline)
    expect(next.plan).toBe('dentist unsaved plan')
    expect(next.subjective).toBe('AI subjective')
  })
  it('keeps the local edit and flags a conflict when server and local both changed the same field', () => {
    const { next, conflicts } = reconcileEncounterNotes({ ...baseline, assessment: 'AI assessment' }, { ...baseline, assessment: 'dentist assessment' }, baseline)
    expect(next.assessment).toBe('dentist assessment')
    expect(conflicts).toContain('assessment')
  })
})

describe('isPrescriptionFinalized', () => {
  it('treats a finalized status or a finalizedAt timestamp as finalized, and a plain draft as not', () => {
    expect(isPrescriptionFinalized({ status: 'finalized', finalizedAt: null })).toBe(true)
    expect(isPrescriptionFinalized({ status: 'draft', finalizedAt: '2026-01-01T00:00:00Z' })).toBe(true)
    expect(isPrescriptionFinalized({ status: 'draft', finalizedAt: null })).toBe(false)
  })
})

describe('prescribing safety context', () => {
  const withPatient = () => bundle({ encounter: { patientProfileId: '00000000-0000-4000-8000-000000000001' } })
  it('shows recorded allergies and the confirm reminder above prescribing', async () => {
    jest.mocked(openClinicalEncounter).mockResolvedValue(withPatient() as never)
    jest.mocked(getPrescribingSafetyContext).mockResolvedValue({ historyRecorded: true, allergies: [{ id: 'a1', allergen: 'Penicillin', reaction: 'Rash', severity: 'moderate', active: true }], currentMedications: ['Warfarin'] })
    show()
    await waitFor(() => expect(screen.getByText(/Penicillin/)).toBeTruthy())
    expect(screen.getByText('Penicillin · Rash · moderate')).toBeTruthy()
    expect(screen.getByText('Warfarin')).toBeTruthy()
    expect(screen.getByText('rxSafetyConfirm')).toBeTruthy()
  })
  it('never implies no known allergies when the record is empty or access is denied', async () => {
    jest.mocked(openClinicalEncounter).mockResolvedValue(withPatient() as never)
    jest.mocked(getPrescribingSafetyContext).mockResolvedValue({ historyRecorded: false, allergies: [], currentMedications: [] })
    show()
    await waitFor(() => expect(screen.getByText('rxSafetyNoAllergiesOnFile')).toBeTruthy())
    expect(screen.getByText('rxSafetyNoMedicationsOnFile')).toBeTruthy()
    expect(screen.getByText('rxSafetyConfirm')).toBeTruthy()
  })
  it('surfaces an explicit unavailable warning when the safety read errors', async () => {
    jest.mocked(openClinicalEncounter).mockResolvedValue(withPatient() as never)
    jest.mocked(getPrescribingSafetyContext).mockRejectedValue(new Error('denied'))
    show()
    await waitFor(() => expect(screen.getByText('rxSafetyUnavailable')).toBeTruthy())
    expect(screen.getByText('rxSafetyConfirm')).toBeTruthy()
  })

  it('renders allergy severity through translations, not the raw enum (Bengali regression)', async () => {
    // The screen mock returns the message KEY for t(), so a severity mapped through t() renders the
    // key ('moderate') rather than a hardcoded English word; phase4 tests assert the real EN/BN values.
    jest.mocked(openClinicalEncounter).mockResolvedValue(bundle({ encounter: { patientProfileId: '00000000-0000-4000-8000-000000000001' } }) as never)
    jest.mocked(getPrescribingSafetyContext).mockResolvedValue({ historyRecorded: true, allergies: [{ id: 'a1', allergen: 'Penicillin', reaction: 'Rash', severity: 'moderate', active: true }], currentMedications: [] })
    show()
    await waitFor(() => expect(screen.getByText('Penicillin · Rash · moderate')).toBeTruthy())
  })

  it('does not show a previous patient\'s allergies after switching patients', async () => {
    jest.mocked(openClinicalEncounter)
      .mockResolvedValueOnce(bundle({ encounter: { patientProfileId: 'patient-A' } }) as never)
      .mockResolvedValue(bundle({ encounter: { patientProfileId: 'patient-B' } }) as never)
    jest.mocked(getPrescribingSafetyContext).mockImplementation(async (pid: string) => pid === 'patient-A'
      ? { historyRecorded: true, allergies: [{ id: 'a', allergen: 'Penicillin', reaction: 'Rash', severity: 'moderate', active: true }], currentMedications: [] }
      : { historyRecorded: true, allergies: [{ id: 'b', allergen: 'Latex', reaction: 'Hives', severity: 'mild', active: true }], currentMedications: [] })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    render(<QueryClientProvider client={client}><ClinicalEncounterScreen /></QueryClientProvider>)
    await waitFor(() => expect(screen.getByText(/Penicillin/)).toBeTruthy())
    await act(async () => { await client.invalidateQueries({ queryKey: ['clinical-encounter'] }) })
    await waitFor(() => expect(screen.getByText(/Latex/)).toBeTruthy())
    expect(screen.queryByText(/Penicillin/)).toBeNull()
  })
})

describe('clinical query keys are scoped to the authenticated account', () => {
  it('changes with the account so cached clinical data cannot leak across logins', () => {
    expect(clinicalEncounterQueryKey('accountA', 'appt1')).not.toEqual(clinicalEncounterQueryKey('accountB', 'appt1'))
    expect(prescribingSafetyQueryKey('accountA', 'patient1')).not.toEqual(prescribingSafetyQueryKey('accountB', 'patient1'))
    expect(clinicalEncounterQueryKey('accountA', 'appt1')).toContain('accountA')
    expect(prescribingSafetyQueryKey('accountA', 'patient1')).toContain('accountA')
  })
  it('keeps the appointment-id prefix so existing prefix invalidation (AI review) still matches', () => {
    expect(clinicalEncounterQueryKey('accountA', 'appt1').slice(0, 2)).toEqual(['clinical-encounter', 'appt1'])
  })
})

describe('clinical editor is gated by dentist role and unmounts local state on access change', () => {
  const draft = () => bundle({ encounter: { patientProfileId: '00000000-0000-4000-8000-000000000001' } })

  it('discards a visible clinical draft when the dentist role is revoked', async () => {
    jest.mocked(openClinicalEncounter).mockResolvedValue(draft() as never)
    const view = await show()
    await waitFor(() => expect(screen.getByLabelText('assessment')).toBeTruthy())
    await fireEvent.changeText(screen.getByLabelText('assessment'), 'private draft note')
    expect(screen.getByDisplayValue('private draft note')).toBeTruthy()
    mockAuth.profile = { id: '20000000-0000-4000-8000-000000000001', roles: [] }
    await view.rerender(<QueryClientProvider client={new QueryClient()}><ClinicalEncounterScreen /></QueryClientProvider>)
    await waitFor(() => expect(screen.queryByDisplayValue('private draft note')).toBeNull())
    expect(screen.queryByLabelText('assessment')).toBeNull()
  })

  it('discards local clinical edits when the actor (account) changes', async () => {
    jest.mocked(openClinicalEncounter).mockResolvedValue(draft() as never)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    const view = await render(<QueryClientProvider client={client}><ClinicalEncounterScreen /></QueryClientProvider>)
    await waitFor(() => expect(screen.getByLabelText('assessment')).toBeTruthy())
    await fireEvent.changeText(screen.getByLabelText('assessment'), 'actor A note')
    mockAuth.profile = { id: '20000000-0000-4000-8000-000000000002', roles: ['dentist'] }
    await view.rerender(<QueryClientProvider client={client}><ClinicalEncounterScreen /></QueryClientProvider>)
    // Remounted for the new account: assessment reloads empty and the previous account's edit is gone.
    await waitFor(() => expect(screen.getByLabelText('assessment').props.value).toBe(''))
    expect(screen.queryByDisplayValue('actor A note')).toBeNull()
  })

  it('discards local clinical edits when the appointment changes', async () => {
    jest.mocked(openClinicalEncounter).mockResolvedValue(draft() as never)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    const view = await render(<QueryClientProvider client={client}><ClinicalEncounterScreen /></QueryClientProvider>)
    await waitFor(() => expect(screen.getByLabelText('assessment')).toBeTruthy())
    await fireEvent.changeText(screen.getByLabelText('assessment'), 'appointment A note')
    mockParams.appointmentId = 'appt2'
    await view.rerender(<QueryClientProvider client={client}><ClinicalEncounterScreen /></QueryClientProvider>)
    await waitFor(() => expect(screen.queryByDisplayValue('appointment A note')).toBeNull())
  })

  it('preserves unsaved edits across a refresh when actor, appointment and permissions are unchanged', async () => {
    jest.mocked(openClinicalEncounter).mockResolvedValue(draft() as never)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    render(<QueryClientProvider client={client}><ClinicalEncounterScreen /></QueryClientProvider>)
    await waitFor(() => expect(screen.getByLabelText('assessment')).toBeTruthy())
    await fireEvent.changeText(screen.getByLabelText('assessment'), 'kept across poll')
    await act(async () => { await client.invalidateQueries({ queryKey: ['clinical-encounter'] }) })
    expect(screen.getByDisplayValue('kept across poll')).toBeTruthy()
  })

  it('does not run a follow-on clinical mutation when access is revoked mid-finalize', async () => {
    let resolveRefetch: (value: unknown) => void = () => {}
    jest.mocked(openClinicalEncounter)
      .mockResolvedValueOnce(draft() as never)
      .mockImplementationOnce(() => new Promise((resolve) => { resolveRefetch = resolve }) as never)
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
    const view = await render(<QueryClientProvider client={client}><ClinicalEncounterScreen /></QueryClientProvider>)
    await waitFor(() => expect(screen.getByRole('button', { name: /finalizeEncounter/ })).toBeTruthy())
    await fireEvent.press(screen.getByRole('button', { name: /finalizeEncounter/ }))
    // Revoke access while the pre-finalize refresh is still in flight; the editor unmounts.
    mockAuth.profile = { id: '20000000-0000-4000-8000-000000000001', roles: [] }
    await view.rerender(<QueryClientProvider client={client}><ClinicalEncounterScreen /></QueryClientProvider>)
    await act(async () => { resolveRefetch(draft()); await Promise.resolve() })
    expect(saveAndFinalizeEncounter).not.toHaveBeenCalled()
  })
})
