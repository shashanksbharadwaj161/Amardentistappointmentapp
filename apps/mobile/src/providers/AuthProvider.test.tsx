import { act, render, screen } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Text } from 'react-native'
import { AuthProvider, useAuth } from './AuthProvider'

let mockListener: (event: string, session: unknown) => void
let mockRefresh: () => void
let mockRoles = ['patient']
let mockFailRoles = false
const mockGetSession = jest.fn()
const mockProfile = jest.fn()
const mockSignOut = jest.fn()
const mockDentistStatus = jest.fn()
let latestAuth: ReturnType<typeof useAuth>
jest.mock('expo-linking', () => ({ getInitialURL: () => Promise.resolve(null), addEventListener: () => ({ remove: jest.fn() }), createURL: () => '' }))
jest.mock('../lib/access-refresh', () => ({ subscribeToAccessRefresh: (callback: () => void) => { mockRefresh = callback; return jest.fn() } }))
jest.mock('../lib/supabase', () => ({ isSupabaseConfigured: true, supabase: {
  auth: { signOut: () => mockSignOut(), getSession: () => mockGetSession(), onAuthStateChange: (callback: typeof mockListener) => { mockListener = callback; return { data: { subscription: { unsubscribe: jest.fn() } } } } },
  from: (table: string) => { let id: string; const query = { select: () => query, eq: (_key: string, value: string) => { id = value; return query }, single: () => query, maybeSingle: () => query,
    then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) => (table === 'profiles' ? mockProfile(id) : table === 'dentist_profiles' ? mockDentistStatus(id) : Promise.resolve({ data: mockRoles.map(role => ({ role })), error: mockFailRoles ? { message: 'private failure' } : null })).then(resolve, reject),
  }; return query },
} }))
const session = (id: string) => ({ user: { id } })
const profile = (id: string) => ({ data: { id, full_name: id, email: `${id}@example.test`, locale: 'en', active_mode: 'patient' }, error: null })
function Probe() { const auth = useAuth(); latestAuth = auth; return <Text>{auth.profile ? `${auth.profile.id}:${auth.profile.roles.join(',')}` : 'no-profile'}</Text> }
async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  await act(async () => { render(<QueryClientProvider client={client}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>) })
  return client
}
beforeEach(() => {
  jest.clearAllMocks(); mockRoles = ['patient']; mockFailRoles = false
  mockGetSession.mockResolvedValue({ data: { session: session('A') }, error: null })
  mockProfile.mockImplementation((id: string) => Promise.resolve(profile(id)))
  mockSignOut.mockResolvedValue({ error: null })
  mockDentistStatus.mockResolvedValue({ data: { status: 'approved' }, error: null })
})

it('does not restore a delayed A profile after sign-out', async () => {
  let finish!: (value: unknown) => void
  mockProfile.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  await mount()
  await act(async () => { mockListener('SIGNED_OUT', null); finish(profile('A')) })
  expect(screen.getByText('no-profile')).toBeTruthy()
})

it('clears account caches and ignores delayed A after B signs in', async () => {
  let finish!: (value: unknown) => void
  mockProfile.mockImplementation((id: string) => id === 'A' ? new Promise(resolve => { finish = resolve }) : Promise.resolve(profile(id)))
  const client = await mount()
  client.setQueryData(['private-record'], 'A private data')
  await act(async () => { mockListener('SIGNED_IN', session('B')) })
  expect(client.getQueryData(['private-record'])).toBeUndefined()
  expect(screen.getByText('B:patient')).toBeTruthy()
  await act(async () => { finish(profile('A')) })
  expect(screen.getByText('B:patient')).toBeTruthy()
})

it('reconciles roles without auth events while retaining same-user cache', async () => {
  const client = await mount()
  client.setQueryData(['private-record'], 'saved cache')
  mockRoles = ['patient', 'dentist']
  await act(async () => { mockRefresh() })
  expect(screen.getByText('A:patient,dentist')).toBeTruthy()
  expect(client.getQueryData(['private-record'])).toBe('saved cache')
})

it('fails closed on role-query errors and clears previously cached data', async () => {
  const client = await mount()
  client.setQueryData(['private-record'], 'saved cache'); mockFailRoles = true
  await act(async () => { mockRefresh() })
  expect(screen.getByText('no-profile')).toBeTruthy()
  expect(client.getQueryData(['private-record'])).toBeUndefined()
})

it('clears cached clinical data when a role is revoked in an open session', async () => {
  mockRoles = ['patient', 'dentist']
  const client = await mount()
  client.setQueryData(['clinical-record'], 'private clinical data')
  mockRoles = ['patient']
  await act(async () => { mockRefresh() })
  expect(screen.getByText('A:patient')).toBeTruthy()
  expect(client.getQueryData(['clinical-record'])).toBeUndefined()
})

it('locally signs out during a pending profile load and reports remote failure', async () => {
  let finish!: (value: unknown) => void
  mockProfile.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  mockSignOut.mockResolvedValue({ error: { message: 'private error' } })
  await mount()
  await act(async () => { await expect(latestAuth.signOut()).rejects.toThrow('Sign-out could not be confirmed') })
  expect(latestAuth.loading).toBe(false)
  expect(latestAuth.passwordSetupMode).toBeNull()
  await act(async () => { finish(profile('A')); mockRefresh() })
  expect(screen.getByText('no-profile')).toBeTruthy()
})

it('removes suspended clinical access on refresh even when the assigned dentist role remains', async () => {
  mockRoles = ['patient', 'dentist', 'clinic_owner']
  const client = await mount()
  expect(latestAuth.profile?.roles).toContain('dentist')
  client.setQueryData(['clinical-record'], 'private clinical data')
  mockDentistStatus.mockResolvedValue({ data: { status: 'suspended' }, error: null })
  await act(async () => { mockRefresh() })
  expect(mockRoles).toContain('dentist')
  expect(latestAuth.profile?.roles).toEqual(['patient', 'clinic_owner'])
  expect(latestAuth.profile?.id).toBe('A')
  expect(client.getQueryData(['clinical-record'])).toBeUndefined()
})

it('enables approved clinical access on refresh and preserves cache on unchanged approval', async () => {
  mockRoles = ['patient', 'dentist']
  mockDentistStatus.mockResolvedValue({ data: { status: 'submitted' }, error: null })
  const client = await mount()
  expect(latestAuth.profile?.roles).toEqual(['patient'])
  mockDentistStatus.mockResolvedValue({ data: { status: 'approved' }, error: null })
  await act(async () => { mockRefresh() })
  expect(latestAuth.profile?.roles).toEqual(['patient', 'dentist'])
  client.setQueryData(['clinical-record'], 'approved clinical data')
  await act(async () => { mockRefresh() })
  expect(latestAuth.profile?.roles).toEqual(['patient', 'dentist'])
  expect(client.getQueryData(['clinical-record'])).toBe('approved clinical data')
  expect(mockDentistStatus).toHaveBeenCalledWith('A')
})

it.each(['missing', 'query-error', 'rejected-request'])('fails closed for %s verification while retaining application access', async failure => {
  mockRoles = ['patient', 'dentist']
  const client = await mount()
  client.setQueryData(['clinical-record'], 'private clinical data')
  if (failure === 'rejected-request') mockDentistStatus.mockRejectedValue(new Error('private transport failure'))
  else mockDentistStatus.mockResolvedValue({ data: failure === 'missing' ? null : { status: 'approved' }, error: failure === 'query-error' ? { message: 'private query failure' } : null })
  await act(async () => { mockRefresh() })
  expect(latestAuth.profile?.id).toBe('A')
  expect(latestAuth.profile?.roles).toEqual(['patient'])
  expect(client.getQueryData(['clinical-record'])).toBeUndefined()
})
