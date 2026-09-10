// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import type { Session } from '@supabase/supabase-js'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import App from './App'

const mocks = vi.hoisted(() => ({
  intent: null as 'invite' | 'recovery' | null,
  roles: ['super_admin'],
  listener: (_event: string, _session: Session | null) => {},
  getSession: vi.fn(), getUser: vi.fn(), from: vi.fn(), signOut: vi.fn(),
}))
vi.mock('./lib/supabase', () => ({
  demoAllowed: true,
  get adminPasswordCallbackIntent() { return mocks.intent },
  supabase: {
    from: mocks.from,
    auth: { getSession: mocks.getSession, getUser: mocks.getUser, signOut: mocks.signOut,
      onAuthStateChange: (callback: typeof mocks.listener) => { mocks.listener = callback; return { data: { subscription: { unsubscribe: vi.fn() } } } },
    },
  },
}))
vi.mock('./components/OperationalOverview', () => ({ OperationalOverview: () => <p>Verified overview</p>, OversightWorkspace: () => <p>Oversight</p> }))
vi.mock('./components/CompleteAdminAccess', () => ({ CompleteAdminAccess: ({ onComplete }: { onComplete: () => void }) => <button onClick={onComplete}>Verified password setup</button> }))
vi.mock('./components/AiConfiguration', () => ({ AiConfiguration: () => <p>Protected AI settings</p> }))
const user = { id: 'admin-id', email_confirmed_at: '2026-09-10', invited_at: '2026-09-10' }
const session = { user } as unknown as Session
beforeEach(() => {
  vi.clearAllMocks(); mocks.intent = null; mocks.roles = ['super_admin']
  mocks.getSession.mockResolvedValue({ data: { session }, error: null })
  mocks.getUser.mockResolvedValue({ data: { user }, error: null })
  mocks.signOut.mockResolvedValue({ error: null })
  mocks.from.mockImplementation((table: string) => {
    const query = { select: () => query, eq: () => query, single: () => query,
      then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: table === 'profiles' ? { full_name: 'Administrator', email: 'admin@example.test' } : mocks.roles.map(role => ({ role })), error: null }).then(resolve),
    }
    return query
  })
  Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) })
})
afterEach(cleanup)

it('requires verified auth and database roles before entering the console', async () => {
  render(<App />)
  expect(await screen.findByText('Verified overview')).toBeInTheDocument()
  expect(mocks.getUser).toHaveBeenCalled()
  expect(screen.queryByRole('button', { name: 'Preview admin console' })).not.toBeInTheDocument()
})

it('callback intent cannot grant administrator access to a patient', async () => {
  mocks.intent = 'invite'; mocks.roles = ['patient']
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'This account cannot open the admin console.' })).toBeInTheDocument()
  expect(screen.queryByText('Verified password setup')).not.toBeInTheDocument()
})

it('refuses a session not confirmed by the auth server', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { ...user, email_confirmed_at: null } }, error: null })
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'This account cannot open the admin console.' })).toBeInTheDocument()
  expect(mocks.from).not.toHaveBeenCalled()
})

it('routes verified invitation Admin access through password setup before console', async () => {
  mocks.intent = 'invite'
  render(<App />)
  fireEvent.click(await screen.findByRole('button', { name: 'Verified password setup' }))
  expect(await screen.findByText('Verified overview')).toBeInTheDocument()
})

it('routes SDK password recovery events through password setup', async () => {
  render(<App />)
  await screen.findByText('Verified overview')
  act(() => mocks.listener('PASSWORD_RECOVERY', session))
  expect(await screen.findByRole('button', { name: 'Verified password setup' })).toBeInTheDocument()
})

it('handles session failures without remaining on the loading screen', async () => {
  mocks.getSession.mockRejectedValue(new Error('private error'))
  render(<App />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Secure access could not be verified')
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  expect(screen.queryByText('private error')).not.toBeInTheDocument()
})

it('closes privileged content immediately when roles downgrade', async () => {
  render(<App />)
  await screen.findByText('Verified overview')
  fireEvent.click(screen.getByRole('button', { name: 'AI provider' }))
  expect(screen.getByText('Protected AI settings')).toBeInTheDocument()
  mocks.roles = ['admin']
  act(() => mocks.listener('TOKEN_REFRESHED', session))
  expect(screen.queryByText('Protected AI settings')).not.toBeInTheDocument()
  await screen.findByText('Verified overview')
  expect(screen.getByRole('button', { name: 'AI provider' })).toBeDisabled()
})

it('does not let stale identity promises restore access after sign-out', async () => {
  let finishVerification!: (result: unknown) => void
  mocks.getUser.mockImplementation(() => new Promise(resolve => { finishVerification = resolve }))
  render(<App />)
  await waitFor(() => expect(mocks.getUser).toHaveBeenCalled())
  act(() => mocks.listener('SIGNED_OUT', null))
  await screen.findByRole('heading', { name: 'Sign in' })
  await act(async () => finishVerification({ data: { user }, error: null }))
  expect(screen.queryByText('Verified overview')).not.toBeInTheDocument()
})
