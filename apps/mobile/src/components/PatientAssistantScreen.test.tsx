import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import PatientAssistantScreen from '../../app/patient/assistant'
import { getPatientProfiles } from '../lib/phase3'
import { getAiFeatureFlags, runAiTask, type AiTaskResult } from '../lib/phase6'

let mockActor = 'actor-A'
let mockRefresh: () => void
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }))
jest.mock('expo-router', () => ({ Redirect: () => null, Stack: { Screen: () => null }, router: { push: jest.fn() } }))
jest.mock('../providers/AuthProvider', () => ({ useAuth: () => ({ profile: { id: mockActor }, loading: false }) }))
jest.mock('../providers/LocaleProvider', () => ({ useLocale: () => ({ t: (key: string) => key, locale: 'en' }) }))
jest.mock('../components/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }))
jest.mock('../lib/access-refresh', () => ({ subscribeToAccessRefresh: (refresh: () => void) => { mockRefresh = refresh; return jest.fn() } }))
jest.mock('../lib/phase3', () => ({ getPatientProfiles: jest.fn() }))
jest.mock('../lib/phase6', () => ({ getAiFeatureFlags: jest.fn(), runAiTask: jest.fn() }))

const guidance: AiTaskResult = { taskId: 'task', status: 'completed', requiredFields: [], output: { summary: 'Private guidance result', urgency: 'soon', guidance: ['Arrange a visit'], redFlags: [], bookingRecommended: false, disclaimer: 'General information' } }
const flags = { patientAi: true, dentistAi: true, experimentalXrayAi: false }
beforeEach(() => {
  jest.clearAllMocks(); mockActor = 'actor-A'
  jest.mocked(getPatientProfiles).mockResolvedValue([{ id: '11111111-1111-4111-8111-111111111111' }] as never)
  jest.mocked(getAiFeatureFlags).mockResolvedValue(flags)
  jest.mocked(runAiTask).mockResolvedValue(guidance)
})
async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const tree = () => <QueryClientProvider client={client}><PatientAssistantScreen /></QueryClientProvider>
  await act(async () => { render(tree()) })
  return async () => { await act(async () => { await screen.rerender(tree()) }) }
}
async function submit() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'aiGetGuidance' })).toBeEnabled())
  await fireEvent.changeText(screen.getByLabelText('aiYourMessage'), 'Private patient concern')
  await fireEvent.press(screen.getByRole('button', { name: 'aiGetGuidance' }))
}

it('keeps generation disabled while flags load and when configuration fails', async () => {
  let reject!: (error: Error) => void
  jest.mocked(getAiFeatureFlags).mockImplementation(() => new Promise((_resolve, fail) => { reject = fail }))
  await mount()
  expect(screen.getByRole('button', { name: 'aiGetGuidance' })).toBeDisabled()
  await act(async () => { reject(new Error('private config error')) })
  expect(screen.getByRole('button', { name: 'aiGetGuidance' })).toBeDisabled()
  expect(screen.getByText('aiUnavailable')).toBeTruthy()
  expect(runAiTask).not.toHaveBeenCalled()
})

it('refreshes disabled flags and preserves input across unchanged account refreshes', async () => {
  const rerender = await mount()
  await fireEvent.changeText(screen.getByLabelText('aiYourMessage'), 'Unsaved patient concern')
  await act(async () => { mockRefresh() })
  await rerender()
  expect(screen.getByDisplayValue('Unsaved patient concern')).toBeTruthy()
  jest.mocked(getAiFeatureFlags).mockResolvedValue({ ...flags, patientAi: false })
  await act(async () => { mockRefresh() })
  expect(screen.getByRole('button', { name: 'aiGetGuidance' })).toBeDisabled()
  expect(screen.getByText('aiFeatureDisabled')).toBeTruthy()
  expect(screen.getByDisplayValue('Unsaved patient concern')).toBeTruthy()
})

it('clears displayed input and guidance when the account changes', async () => {
  const rerender = await mount()
  await submit()
  await waitFor(() => expect(screen.getByText('Private guidance result')).toBeTruthy())
  mockActor = 'actor-B'; await rerender()
  expect(screen.queryByText('Private guidance result')).toBeNull()
  expect(screen.queryByDisplayValue('Private patient concern')).toBeNull()
  expect(getPatientProfiles).toHaveBeenCalledWith('actor-B')
})

it.each(['account', 'task', 'disabled', 'error'])('ignores a late response after %s changes', async change => {
  let finish!: (result: AiTaskResult) => void
  jest.mocked(runAiTask).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  const rerender = await mount()
  await submit()
  await waitFor(() => expect(runAiTask).toHaveBeenCalled())
  if (change === 'account') { mockActor = 'actor-B'; await rerender() }
  else if (change === 'task') await fireEvent.press(screen.getByRole('tab', { name: 'aiGeneralGuidance' }))
  else {
    if (change === 'disabled') jest.mocked(getAiFeatureFlags).mockResolvedValue({ ...flags, patientAi: false })
    else jest.mocked(getAiFeatureFlags).mockRejectedValue(new Error('private configuration failure'))
    await act(async () => { mockRefresh() })
    jest.mocked(getAiFeatureFlags).mockResolvedValue(flags)
    await act(async () => { mockRefresh() })
  }
  await act(async () => { finish(guidance) })
  expect(screen.queryByText('Private guidance result')).toBeNull()
})
