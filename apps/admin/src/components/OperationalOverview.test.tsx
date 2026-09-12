// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { invitationDisplayStatus, loadOversight, OperationalOverview, OversightWorkspace } from './OperationalOverview'

type Result = { data: Record<string, unknown>[] | null; error: unknown; count?: number | null }
const mocks = vi.hoisted(() => ({ preview: false, from: vi.fn() }))
vi.mock('../lib/supabase', () => ({ get supabase() { return mocks.preview ? null : { from: mocks.from } } }))
const chains = new Map<string, ReturnType<typeof chain>>()
function chain(result: Result | Promise<Result>) {
  const query = { select: vi.fn(), order: vi.fn(), limit: vi.fn(), in: vi.fn(), eq: vi.fn(), gt: vi.fn(), gte: vi.fn(), lte: vi.fn(), then: (resolve: (value: Result) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result).then(resolve, reject) }
  for (const fn of [query.select, query.order, query.limit, query.in, query.eq, query.gt, query.gte, query.lte]) fn.mockReturnValue(query)
  return query
}
function configure(results: Record<string, Result | Promise<Result>> = {}) {
  mocks.from.mockImplementation((table: string) => {
    const query = chain(results[table] ?? { data: [], error: null, count: 0 })
    chains.set(table, query)
    return query
  })
}
beforeEach(() => { mocks.preview = false; vi.clearAllMocks(); chains.clear(); configure() })
afterEach(() => { cleanup(); vi.useRealTimers() })

it('reads only bounded invitation metadata and derives pending expiry', async () => {
  configure({ admin_invitations: { data: [{ id: 'invite', email: 'admin@example.test', display_name: 'Demo Administrator', status: 'pending', expires_at: '2000-01-01T00:00:00Z', delivery_confirmed_at: '1999-12-25T00:00:00Z' }], error: null } })
  const rows = await loadOversight('invitations')
  expect(chains.get('admin_invitations')!.select).toHaveBeenCalledWith('id,email,display_name,status,expires_at,delivery_confirmed_at')
  expect(chains.get('admin_invitations')!.limit).toHaveBeenCalledWith(100)
  expect(rows[0]).toMatchObject({ status: 'expired', detail: 'admin@example.test · invitation email sent' })
})

it('loads delivery metadata without recipients or message payload', async () => {
  await loadOversight('delivery')
  expect(chains.get('notification_deliveries')!.select).toHaveBeenCalledWith('id,channel,template_key,status,attempt_count,created_at')
  expect(chains.get('notification_deliveries')!.limit).toHaveBeenCalledWith(100)
})

it('caps AI usage reads to 500 safe rows across exactly 30 inclusive UTC dates', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-10T12:00:00Z'))
  await loadOversight('usage')
  const query = chains.get('ai_usage_daily')!
  expect(query.select).toHaveBeenCalledWith('usage_date,task_type,request_count,estimated_cost_usd')
  expect(query.gte).toHaveBeenCalledWith('usage_date', '2026-08-12')
  expect(query.lte).toHaveBeenCalledWith('usage_date', '2026-09-10')
  expect(query.limit).toHaveBeenCalledWith(500)
})

it.each(['accepted', 'revoked', 'expired'])('does not override stored %s invitation status', status => {
  expect(invitationDisplayStatus(status, '2000-01-01', Date.parse('2026-09-10'))).toBe(status)
})

it('expires a pending invite exactly at its boundary', () => {
  const now = Date.parse('2026-09-10T00:00:00Z')
  expect(invitationDisplayStatus('pending', '2026-09-10T00:00:00Z', now)).toBe('expired')
  expect(invitationDisplayStatus('pending', '2026-09-10T00:00:01Z', now)).toBe('pending')
})

it('shows pending loading, then empty data without a fake success record', async () => {
  let finish!: (value: Result) => void
  configure({ notification_deliveries: new Promise(resolve => { finish = resolve }) })
  render(<OversightWorkspace view="delivery" query="" onInvite={vi.fn()} />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading records')
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeDisabled()
  await act(async () => finish({ data: [], error: null }))
  expect(await screen.findByText('No records available.')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled()
})

it('shows failed live reads honestly and retries without exposing server details', async () => {
  configure({ admin_invitations: { data: null, error: { message: 'private server detail' } } })
  render(<OversightWorkspace view="invitations" query="" onInvite={vi.fn()} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Records could not be loaded')
  expect(screen.queryByText('Demo Administrator')).not.toBeInTheDocument()
  expect(screen.queryByText('private server detail')).not.toBeInTheDocument()
  configure()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(await screen.findByText('No records available.')).toBeInTheDocument()
})

it('does not query invitations for an ordinary Admin and uses exact scoped counts', async () => {
  render(<OperationalOverview superAdmin={false} navigate={vi.fn()} />)
  await screen.findByText('Dentists awaiting review')
  expect(mocks.from).toHaveBeenCalledTimes(2)
  expect(mocks.from).not.toHaveBeenCalledWith('admin_invitations')
  expect(chains.get('dentist_profiles')!.select).toHaveBeenCalledWith('user_id', { count: 'exact', head: true })
  expect(chains.get('dentist_profiles')!.in).toHaveBeenCalledWith('status', ['submitted', 'under_review'])
  expect(chains.get('support_cases')!.in).toHaveBeenCalledWith('status', ['open', 'investigating'])
  expect(screen.getAllByText('0 currently waiting')).toHaveLength(2)
})

it('queries only unexpired pending invitations for Super Admin and navigates to their queue', async () => {
  const navigate = vi.fn()
  render(<OperationalOverview superAdmin navigate={navigate} />)
  fireEvent.click(await screen.findByRole('button', { name: 'View invitations' }))
  expect(navigate).toHaveBeenCalledWith('invitations')
  const query = chains.get('admin_invitations')!
  expect(query.select).toHaveBeenCalledWith('id', { count: 'exact', head: true })
  expect(query.eq).toHaveBeenCalledWith('status', 'pending')
  expect(query.gt).toHaveBeenCalledWith('expires_at', expect.any(String))
})

it.each([{ data: null, error: { message: 'unavailable' }, count: null }, { data: null, error: null, count: null }])('does not report zero when an exact count is unavailable: %j', async result => {
  configure({ dentist_profiles: result })
  render(<OperationalOverview superAdmin={false} navigate={vi.fn()} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Current counts are unavailable')
  expect(screen.queryByText('0 currently waiting')).not.toBeInTheDocument()
  configure()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh overview' }))
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  expect(await screen.findByText('Dentists awaiting review')).toBeInTheDocument()
})

it('preserves explicit sample data without contacting the database in preview', async () => {
  mocks.preview = true
  render(<OperationalOverview superAdmin navigate={vi.fn()} />)
  expect(await screen.findByText('2 in sample data')).toBeInTheDocument()
  expect(mocks.from).not.toHaveBeenCalled()
})

it('uses concise action labels without changing destination semantics', async () => {
  const navigate = vi.fn()
  render(<OperationalOverview superAdmin={false} navigate={navigate} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Review dentists' }))
  fireEvent.click(screen.getByRole('button', { name: 'View cases' }))
  expect(navigate.mock.calls).toEqual([['verification'], ['cases']])
  expect(screen.queryByRole('button', { name: /Open open|Open dentists/ })).not.toBeInTheDocument()
})
