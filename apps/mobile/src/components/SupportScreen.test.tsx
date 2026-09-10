import { fireEvent, render, screen, waitFor, act } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SupportScreen from '../../app/patient/support'
import { listSupportCases, openSupportCase } from '../lib/support'

jest.mock('expo-router', () => ({ Redirect: () => null, Stack: { Screen: () => null } }))
jest.mock('../providers/AuthProvider', () => ({ useAuth: () => ({ profile: { id: '20000000-0000-4000-8000-000000000001' }, loading: false }) }))
jest.mock('../providers/LocaleProvider', () => ({ useLocale: () => ({ locale: 'en' }) }))
jest.mock('../components/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => children }))
jest.mock('../lib/support', () => ({ ...jest.requireActual('../lib/support'), listSupportCases: jest.fn(), openSupportCase: jest.fn() }))
jest.mock('../lib/supabase', () => ({ supabase: null }))

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(listSupportCases).mockResolvedValue([])
})
async function show() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><SupportScreen /></QueryClientProvider>)
}
it('validates before sending and preserves the entered description on failure', async () => {
  await show()
  await fireEvent.press(screen.getByRole('button', { name: 'Send request' }))
  expect(screen.getByText('Enter a description between 5 and 1,000 characters.')).toBeTruthy()
  expect(openSupportCase).not.toHaveBeenCalled()
  jest.mocked(openSupportCase).mockRejectedValue(new Error('Offline'))
  await fireEvent.changeText(screen.getByLabelText('Describe the issue'), 'Please help with my visit')
  await fireEvent.press(screen.getByRole('button', { name: 'Send request' }))
  await waitFor(() => expect(screen.getByText(/We could not confirm submission/)).toBeTruthy())
  expect(screen.getByLabelText('Describe the issue').props.value).toBe('Please help with my visit')
})
it('prevents duplicate submission and distinguishes a preview from a saved request', async () => {
  let resolve!: (value: { preview: boolean; id: null }) => void
  jest.mocked(openSupportCase).mockReturnValue(new Promise(done => { resolve = done }))
  await show()
  await fireEvent.changeText(screen.getByLabelText('Describe the issue'), 'Please help with my visit')
  const button = screen.getByRole('button', { name: 'Send request' })
  await fireEvent.press(button); await fireEvent.press(button)
  expect(openSupportCase).toHaveBeenCalledTimes(1)
  await act(async () => resolve({ preview: true, id: null }))
  expect(screen.getByText('Preview only — this request was not sent or saved.')).toBeTruthy()
  expect(screen.queryByText('Request sent to the support team. You can check its status below.')).toBeNull()
})
it('shows a persisted Admin response in patient history', async () => {
  jest.mocked(listSupportCases).mockResolvedValue([{ id: '20000000-0000-4000-8000-000000000001', category: 'technical', status: 'resolved', summary: 'An account issue', resolution: 'The account issue is resolved.', created_at: '2026-09-10T00:00:00Z' }])
  await show()
  await waitFor(() => expect(screen.getByText('The account issue is resolved.')).toBeTruthy())
  expect(screen.getByText('App or account · Resolved')).toBeTruthy()
})
