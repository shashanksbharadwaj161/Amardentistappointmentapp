import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ClinicalEncounterScreen, { isPrescriptionFinalized, reconcileEncounterNotes } from '../../app/professional/encounter'
import { finalizePrescription, openClinicalEncounter } from '../lib/phase4'

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }))
jest.mock('expo-router', () => ({ Redirect: () => null, Stack: { Screen: () => null }, router: { push: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => ({ appointmentId: 'appt1' }) }))
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }))
jest.mock('../providers/AuthProvider', () => ({ useAuth: () => ({ profile: { id: '20000000-0000-4000-8000-000000000001' }, loading: false }) }))
jest.mock('../providers/LocaleProvider', () => ({ useLocale: () => ({ t: (key: string) => key, locale: 'en' }) }))
jest.mock('../components/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }))
jest.mock('../lib/phase4', () => ({
  openClinicalEncounter: jest.fn(), saveEncounter: jest.fn(), addDiagnosis: jest.fn(), saveToothObservation: jest.fn(),
  savePrescription: jest.fn(), finalizePrescription: jest.fn(), createAndFinalizeTreatmentPlan: jest.fn(),
  getClinicalMediaDownloadUrl: jest.fn(), uploadClinicalMedia: jest.fn(), finalizeEncounter: jest.fn(),
}))

const item = { id: 'i1', medicineName: 'Amoxicillin', strength: '500 mg', dosage: '1 capsule', route: 'oral', frequency: 'Every 8 hours', duration: '5 days', instructions: '' }
const baseEncounter = { id: '11111111-1111-4111-8111-111111111111', appointmentId: 'appt1', chiefComplaint: '', subjectiveNotes: '', objectiveNotes: '', assessment: '', plan: '', finalizedAt: null }
function bundle(overrides: Record<string, unknown>) {
  return { encounter: { ...baseEncounter, status: 'draft', ...(overrides.encounter as object) }, diagnoses: [], teeth: [], prescriptions: [], treatmentPlans: [], media: [], ...overrides }
}
function show() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><ClinicalEncounterScreen /></QueryClientProvider>)
}
beforeEach(() => jest.clearAllMocks())

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
