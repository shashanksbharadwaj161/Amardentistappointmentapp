// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it, vi } from 'vitest'
import { RevokeAdminDialog } from './RevokeAdminDialog'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({ supabase: { rpc: vi.fn() } }))
afterEach(() => { cleanup(); vi.clearAllMocks() })
const target = { id: '20000000-0000-4000-8000-000000000001', email: 'admin@example.test' }

it('sends only the target and trimmed audit reason to the protected RPC', async () => {
  vi.mocked(supabase!.rpc).mockResolvedValue({ error: null } as never)
  const removed = vi.fn()
  render(<RevokeAdminDialog target={target} onClose={vi.fn()} onRemoved={removed} />)
  fireEvent.change(await screen.findByLabelText('Reason for removal'), { target: { value: '  Access no longer needed  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }))
  await vi.waitFor(() => expect(removed).toHaveBeenCalledWith(false))
  expect(supabase!.rpc).toHaveBeenCalledWith('revoke_operational_admin', { target_user_id: target.id, action_reason: 'Access no longer needed' })
})

it('does not claim removal if the server denies it', async () => {
  vi.mocked(supabase!.rpc).mockResolvedValue({ error: { message: 'SUPER_ADMIN_PROTECTED' } } as never)
  const removed = vi.fn()
  render(<RevokeAdminDialog target={target} onClose={vi.fn()} onRemoved={removed} />)
  fireEvent.change(await screen.findByLabelText('Reason for removal'), { target: { value: 'Access no longer needed' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }))
  expect(await screen.findByText(/Access removal is unconfirmed/)).toBeInTheDocument()
  expect(removed).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Confirm removal' })).not.toBeDisabled()
})
