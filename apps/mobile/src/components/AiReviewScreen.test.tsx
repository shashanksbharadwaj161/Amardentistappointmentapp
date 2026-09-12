import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AiReviewScreen from '../../app/professional/ai-review'
import { getAiFeatureFlags, reviewAiTask, runAiTask } from '../lib/phase6'
import { openClinicalEncounter } from '../lib/phase4'

let mockRefreshAccess: () => void
let mockProfile = { id: '20000000-0000-4000-8000-000000000001', roles: ['dentist'] }
let mockAppointmentId = 'appt1'
jest.mock('../lib/access-refresh', () => ({ subscribeToAccessRefresh: (refresh: () => void) => { mockRefreshAccess = refresh; return jest.fn() } }))

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }))
jest.mock('expo-router', () => ({ Redirect: () => null, Stack: { Screen: () => null }, useLocalSearchParams: () => ({ appointmentId: mockAppointmentId }) }))
jest.mock('../providers/AuthProvider', () => ({ useAuth: () => ({ profile: mockProfile, loading: false }) }))
jest.mock('../providers/LocaleProvider', () => ({ useLocale: () => ({ t: (key: string) => key, locale: 'en' }) }))
jest.mock('../components/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }))
jest.mock('../lib/phase4', () => ({ openClinicalEncounter: jest.fn() }))
jest.mock('../lib/phase6', () => ({ getAiFeatureFlags: jest.fn(), runAiTask: jest.fn(), reviewAiTask: jest.fn() }))

beforeEach(() => {
  jest.clearAllMocks()
  mockProfile = { id: '20000000-0000-4000-8000-000000000001', roles: ['dentist'] }; mockAppointmentId = 'appt1'
  jest.mocked(getAiFeatureFlags).mockResolvedValue({ dentistAi: true, patientAi: true, experimentalXrayAi: false })
  jest.mocked(openClinicalEncounter).mockResolvedValue({ encounter: { id: '11111111-1111-4111-8111-111111111111', appointmentId: 'appt1' }, media: [] } as never)
  jest.mocked(runAiTask).mockResolvedValue({ taskId: '22222222-2222-4222-8222-222222222222', status: 'awaiting_review', requiredFields: ['subjective', 'objective', 'assessment', 'plan'], output: { subjective: 's', objective: 'o', assessment: 'a', plan: 'p' } })
  jest.mocked(reviewAiTask).mockResolvedValue(undefined)
})

it('refreshes feature controls without discarding the current clinical input', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  await act(async () => { render(<QueryClientProvider client={client}><AiReviewScreen /></QueryClientProvider>) })
  await fireEvent.changeText(screen.getByLabelText('aiClinicalContext'), 'Unsaved clinical context')
  jest.mocked(getAiFeatureFlags).mockResolvedValue({ dentistAi: false, patientAi: true, experimentalXrayAi: false })
  await act(async () => { mockRefreshAccess() })
  expect(screen.getByDisplayValue('Unsaved clinical context')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'aiGenerateDraft' })).toBeDisabled()
  expect(screen.getByText('aiFeatureDisabled')).toBeTruthy()
})

it('keeps AI output a draft and invalidates the encounter query on accept so the encounter cannot show stale notes', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const invalidate = jest.spyOn(client, 'invalidateQueries')
  await act(async () => { render(<QueryClientProvider client={client}><AiReviewScreen /></QueryClientProvider>) })

  await fireEvent.changeText(screen.getByLabelText('aiClinicalContext'), 'Persistent lower left molar pain for three days')
  await fireEvent.press(screen.getByRole('button', { name: 'aiGenerateDraft' }))

  // Each required field must be individually reviewed before the draft can be accepted.
  await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBe(4))
  for (let i = 0; i < 4; i++) await fireEvent.press(screen.getAllByRole('checkbox')[i]!)

  await fireEvent.press(screen.getByRole('button', { name: 'aiAcceptReviewed' }))

  await waitFor(() => expect(reviewAiTask).toHaveBeenCalledTimes(1))
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ['clinical-encounter', 'appt1'] })
  // Copy explicitly tells the dentist it is still a draft until the record is finalized.
  expect(screen.getByText('aiDraftAccepted')).toBeTruthy()
})

it('does not accept or invalidate until every required field is reviewed', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const invalidate = jest.spyOn(client, 'invalidateQueries')
  await act(async () => { render(<QueryClientProvider client={client}><AiReviewScreen /></QueryClientProvider>) })

  await fireEvent.changeText(screen.getByLabelText('aiClinicalContext'), 'Persistent lower left molar pain for three days')
  await fireEvent.press(screen.getByRole('button', { name: 'aiGenerateDraft' }))
  await waitFor(() => expect(screen.getAllByRole('checkbox').length).toBe(4))

  // Review only two of four, then attempt to accept.
  await fireEvent.press(screen.getAllByRole('checkbox')[0]!)
  await fireEvent.press(screen.getAllByRole('checkbox')[1]!)
  await fireEvent.press(screen.getByRole('button', { name: 'aiAcceptReviewed' }))

  expect(reviewAiTask).not.toHaveBeenCalled()
  expect(invalidate).not.toHaveBeenCalled()
})

it('unmounts visible draft fields when the dentist role is revoked', async () => {
  const client = new QueryClient()
  const tree = () => <QueryClientProvider client={client}><AiReviewScreen /></QueryClientProvider>
  await act(async () => { render(tree()) })
  await fireEvent.changeText(screen.getByLabelText('aiClinicalContext'), 'Private clinical context')
  await fireEvent.press(screen.getByRole('button', { name: 'aiGenerateDraft' }))
  await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(4))
  mockProfile = { ...mockProfile, roles: ['patient'] }
  await act(async () => { await screen.rerender(tree()) })
  expect(screen.queryByLabelText('aiClinicalContext')).toBeNull()
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  mockProfile = { ...mockProfile, roles: ['dentist'] }
  await act(async () => { await screen.rerender(tree()) })
  expect(screen.queryByDisplayValue('Private clinical context')).toBeNull()
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
})

it('does not restore a late AI result after role loss and renewed access', async () => {
  let finish!: (result: unknown) => void
  const output = { taskId: 'late', status: 'awaiting_review', requiredFields: ['subjective'], output: { subjective: 'Private late draft' } }
  jest.mocked(runAiTask).mockImplementation(() => new Promise(resolve => { finish = resolve as typeof finish }))
  const client = new QueryClient()
  const tree = () => <QueryClientProvider client={client}><AiReviewScreen /></QueryClientProvider>
  await act(async () => { render(tree()) })
  await fireEvent.changeText(screen.getByLabelText('aiClinicalContext'), 'Private clinical context')
  await fireEvent.press(screen.getByRole('button', { name: 'aiGenerateDraft' }))
  await waitFor(() => expect(runAiTask).toHaveBeenCalled())
  mockProfile = { ...mockProfile, roles: ['patient'] }
  await act(async () => { await screen.rerender(tree()) })
  mockProfile = { ...mockProfile, roles: ['dentist'] }
  await act(async () => { await screen.rerender(tree()); finish(output) })
  expect(screen.queryByDisplayValue('Private late draft')).toBeNull()
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
})

it('preserves same-actor draft on profile refresh and clears it on actor or appointment change', async () => {
  const client = new QueryClient()
  const tree = () => <QueryClientProvider client={client}><AiReviewScreen /></QueryClientProvider>
  await act(async () => { render(tree()) })
  await fireEvent.changeText(screen.getByLabelText('aiClinicalContext'), 'Unsaved draft')
  mockProfile = { ...mockProfile, roles: ['dentist', 'patient'] }
  await act(async () => { await screen.rerender(tree()) })
  expect(screen.getByDisplayValue('Unsaved draft')).toBeTruthy()
  mockAppointmentId = 'appt2'
  await act(async () => { await screen.rerender(tree()) })
  expect(screen.queryByDisplayValue('Unsaved draft')).toBeNull()
  await fireEvent.changeText(screen.getByLabelText('aiClinicalContext'), 'Second unsaved draft')
  mockProfile = { ...mockProfile, id: 'another-dentist' }
  await act(async () => { await screen.rerender(tree()) })
  expect(screen.queryByDisplayValue('Second unsaved draft')).toBeNull()
})

it('starts disabled while configuration loads and stays disabled on a configuration error', async () => {
  let fail!: (error: Error) => void
  jest.mocked(getAiFeatureFlags).mockImplementation(() => new Promise((_resolve, reject) => { fail = reject }))
  const client = new QueryClient()
  await act(async () => { render(<QueryClientProvider client={client}><AiReviewScreen /></QueryClientProvider>) })
  expect(screen.getByRole('button', { name: 'aiGenerateDraft' })).toBeDisabled()
  await act(async () => { fail(new Error('private configuration error')) })
  expect(screen.getByRole('button', { name: 'aiGenerateDraft' })).toBeDisabled()
  expect(screen.getByText('aiUnavailable')).toBeTruthy()
  expect(runAiTask).not.toHaveBeenCalled()
})

it.each(['task', 'disabled', 'error'])('discards delayed AI output after %s changes', async change => {
  let finish!: (result: Awaited<ReturnType<typeof runAiTask>>) => void
  jest.mocked(runAiTask).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const client = new QueryClient()
  await act(async () => { render(<QueryClientProvider client={client}><AiReviewScreen /></QueryClientProvider>) })
  await fireEvent.changeText(screen.getByLabelText('aiClinicalContext'), 'Private clinical context')
  await fireEvent.press(screen.getByRole('button', { name: 'aiGenerateDraft' }))
  await waitFor(() => expect(runAiTask).toHaveBeenCalled())
  if(change==='task')await fireEvent.press(screen.getByRole('tab', { name: 'aiPrescription' }))
  else {
    if(change==='disabled')jest.mocked(getAiFeatureFlags).mockResolvedValue({ dentistAi:false, patientAi:true, experimentalXrayAi:false })
    else jest.mocked(getAiFeatureFlags).mockRejectedValue(new Error('private failure'))
    await act(async () => { mockRefreshAccess() })
    jest.mocked(getAiFeatureFlags).mockResolvedValue({ dentistAi:true, patientAi:true, experimentalXrayAi:false })
    await act(async () => { mockRefreshAccess() })
  }
  await act(async () => { finish({ taskId:'late',status:'awaiting_review',requiredFields:['subjective'],output:{subjective:'Old private draft'} }) })
  expect(screen.queryByDisplayValue('Old private draft')).toBeNull()
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
})

it('preserves reviewed fields on unchanged flags but removes acceptance when disabled', async () => {
  const client = new QueryClient()
  await act(async () => { render(<QueryClientProvider client={client}><AiReviewScreen /></QueryClientProvider>) })
  await fireEvent.changeText(screen.getByLabelText('aiClinicalContext'), 'Private clinical context')
  await fireEvent.press(screen.getByRole('button', { name: 'aiGenerateDraft' }))
  await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(4))
  for(let index=0;index<4;index++)await fireEvent.press(screen.getAllByRole('checkbox')[index]!)
  await act(async () => { mockRefreshAccess() })
  expect(screen.getAllByRole('checkbox').every(box => box.props.accessibilityState.checked)).toBe(true)
  expect(screen.getByRole('button', { name:'aiAcceptReviewed' })).toBeEnabled()
  jest.mocked(getAiFeatureFlags).mockResolvedValue({ dentistAi:false,patientAi:true,experimentalXrayAi:false })
  await act(async () => { mockRefreshAccess() })
  expect(screen.queryByRole('button', { name:'aiAcceptReviewed' })).toBeNull()
  expect(reviewAiTask).not.toHaveBeenCalled()
})

it('does not continue an encounter lookup into AI generation after task change', async () => {
  let finish!: (record: Awaited<ReturnType<typeof openClinicalEncounter>>) => void
  jest.mocked(openClinicalEncounter).mockImplementation(() => new Promise(resolve => { finish=resolve }))
  const client = new QueryClient()
  await act(async () => { render(<QueryClientProvider client={client}><AiReviewScreen /></QueryClientProvider>) })
  await fireEvent.changeText(screen.getByLabelText('aiClinicalContext'), 'Private clinical context')
  await fireEvent.press(screen.getByRole('button', { name:'aiGenerateDraft' }))
  await fireEvent.press(screen.getByRole('tab', { name:'aiPrescription' }))
  await act(async () => { finish({ encounter:{id:'11111111-1111-4111-8111-111111111111'},media:[] } as never) })
  expect(runAiTask).not.toHaveBeenCalled()
})

it('does not trigger acceptance follow-ons after a pending review loses feature access', async () => {
  let finish!: () => void
  jest.mocked(reviewAiTask).mockImplementation(() => new Promise(resolve => { finish=resolve }))
  const client = new QueryClient()
  const invalidate=jest.spyOn(client,'invalidateQueries')
  await act(async () => { render(<QueryClientProvider client={client}><AiReviewScreen /></QueryClientProvider>) })
  await fireEvent.changeText(screen.getByLabelText('aiClinicalContext'), 'Private clinical context')
  await fireEvent.press(screen.getByRole('button', { name:'aiGenerateDraft' }))
  await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(4))
  for(let index=0;index<4;index++)await fireEvent.press(screen.getAllByRole('checkbox')[index]!)
  await fireEvent.press(screen.getByRole('button', { name:'aiAcceptReviewed' }))
  jest.mocked(getAiFeatureFlags).mockResolvedValue({ dentistAi:false,patientAi:true,experimentalXrayAi:false })
  await act(async () => { mockRefreshAccess() })
  await act(async () => { finish() })
  expect(invalidate).not.toHaveBeenCalled()
  expect(screen.queryByText('aiDraftAccepted')).toBeNull()
})
