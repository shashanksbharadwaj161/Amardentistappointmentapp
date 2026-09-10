import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AiReviewScreen from '../../app/professional/ai-review'
import { getAiFeatureFlags, reviewAiTask, runAiTask } from '../lib/phase6'
import { openClinicalEncounter } from '../lib/phase4'

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }))
jest.mock('expo-router', () => ({ Redirect: () => null, Stack: { Screen: () => null }, useLocalSearchParams: () => ({ appointmentId: 'appt1' }) }))
jest.mock('../providers/AuthProvider', () => ({ useAuth: () => ({ profile: { id: '20000000-0000-4000-8000-000000000001' }, loading: false }) }))
jest.mock('../providers/LocaleProvider', () => ({ useLocale: () => ({ t: (key: string) => key, locale: 'en' }) }))
jest.mock('../components/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }))
jest.mock('../lib/phase4', () => ({ openClinicalEncounter: jest.fn() }))
jest.mock('../lib/phase6', () => ({ getAiFeatureFlags: jest.fn(), runAiTask: jest.fn(), reviewAiTask: jest.fn() }))

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getAiFeatureFlags).mockResolvedValue({ dentistAi: true, patientAi: true, experimentalXrayAi: false })
  jest.mocked(openClinicalEncounter).mockResolvedValue({ encounter: { id: '11111111-1111-4111-8111-111111111111', appointmentId: 'appt1' }, media: [] } as never)
  jest.mocked(runAiTask).mockResolvedValue({ taskId: '22222222-2222-4222-8222-222222222222', status: 'awaiting_review', requiredFields: ['subjective', 'objective', 'assessment', 'plan'], output: { subjective: 's', objective: 'o', assessment: 'a', plan: 'p' } })
  jest.mocked(reviewAiTask).mockResolvedValue(undefined)
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
