// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { CompleteAdminAccess } from './CompleteAdminAccess'

const mocks = vi.hoisted(() => ({ preview: false, getUser: vi.fn(), updateUser: vi.fn() }))
vi.mock('../lib/supabase', () => ({ get supabase() { return mocks.preview ? null : { auth: { getUser: mocks.getUser, updateUser: mocks.updateUser } } } }))
const user = { id: 'admin-user', email_confirmed_at: '2026-09-10T00:00:00Z', invited_at: '2026-09-10T00:00:00Z' }
beforeEach(() => { mocks.preview = false; vi.clearAllMocks(); mocks.getUser.mockResolvedValue({ data: { user }, error: null }); mocks.updateUser.mockResolvedValue({ data: { user }, error: null }) })
afterEach(cleanup)
async function fill(value = 'TestOnlyStrong1', confirmation = value) {
  await waitFor(() => expect(screen.getByLabelText('New password')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('New password'), { target: { value } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirmation } })
}

it.each([null, { id: 'user', invited_at: 'today' }, { id: 'user', email_confirmed_at: 'today' }])('rejects absent, unverified, or ordinary sessions', async (sessionUser) => {
  mocks.getUser.mockResolvedValue({ data: { user: sessionUser }, error: null })
  render(<CompleteAdminAccess onComplete={vi.fn()} />)
  expect(await screen.findByRole('alert')).toHaveTextContent('verified invitation or recovery session is required')
  expect(screen.getByLabelText('New password')).toBeDisabled()
  expect(mocks.updateUser).not.toHaveBeenCalled()
})

it('does not support preview password setup', async () => {
  mocks.preview = true
  render(<CompleteAdminAccess onComplete={vi.fn()} />)
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save password' })).toBeDisabled()
  expect(mocks.getUser).not.toHaveBeenCalled()
})

it('validates domain password strength and matching confirmation before calling auth', async () => {
  render(<CompleteAdminAccess onComplete={vi.fn()} />)
  await fill('short', 'different')
  fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
  expect(screen.getByLabelText('New password')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText('Confirm password')).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByText('Passwords do not match.')).toBeInTheDocument()
  expect(mocks.updateUser).not.toHaveBeenCalled()
})

it('rechecks identity and never changes a different signed-in account', async () => {
  mocks.getUser.mockResolvedValueOnce({ data: { user }, error: null }).mockResolvedValue({ data: { user: { ...user, id: 'other-admin' } }, error: null })
  render(<CompleteAdminAccess onComplete={vi.fn()} />)
  await fill()
  fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Password setup is unconfirmed')
  expect(mocks.updateUser).not.toHaveBeenCalled()
  expect(screen.getByLabelText('New password')).toHaveValue('')
})

it('saves once, clears form, and continues only after confirmed success', async () => {
  let resolveUpdate!: (value: unknown) => void
  mocks.updateUser.mockImplementation(() => new Promise(resolve => { resolveUpdate = resolve }))
  const done = vi.fn()
  render(<CompleteAdminAccess onComplete={done} />)
  await fill()
  const save = screen.getByRole('button', { name: 'Save password' })
  fireEvent.click(save); fireEvent.click(save)
  await waitFor(() => expect(mocks.updateUser).toHaveBeenCalledTimes(1))
  expect(mocks.updateUser).toHaveBeenCalledWith({ password: 'TestOnlyStrong1' })
  expect(screen.getByLabelText('New password')).toBeDisabled()
  expect(done).not.toHaveBeenCalled()
  resolveUpdate({ data: { user }, error: null })
  expect(await screen.findByRole('status')).toHaveTextContent('password has been saved')
  expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Continue to console' }))
  expect(done).toHaveBeenCalledOnce()
})

it('supports verified recovery sessions and catches thrown update errors without raw messages', async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { ...user, invited_at: undefined, recovery_sent_at: 'today' } }, error: null })
  mocks.updateUser.mockRejectedValue(new Error('private server detail'))
  render(<CompleteAdminAccess onComplete={vi.fn()} />)
  await fill()
  fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Password setup is unconfirmed')
  expect(screen.queryByText('private server detail')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Save password' })).toBeEnabled()
})

it('can retry failed session verification', async () => {
  mocks.getUser.mockRejectedValueOnce(new Error('network'))
  render(<CompleteAdminAccess onComplete={vi.fn()} />)
  expect(await screen.findByRole('alert')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Check session again' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save password' })).toBeEnabled())
})
