// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it, vi } from 'vitest'
import { PlatformWorkspace } from './PlatformWorkspace'

vi.mock('../lib/supabase', () => ({ supabase: null }))
afterEach(cleanup)

it('opens audited access from an account and explicitly disables clinical requests in preview', async () => {
  render(<PlatformWorkspace view="users" query="" />)
  fireEvent.click(screen.getByRole('button', { name: 'Audited clinical access for patient@example.test' }))
  expect(await screen.findByRole('dialog')).toHaveTextContent('patient@example.test')
  expect(screen.getByText(/Preview only: clinical access requires a connected Super Admin session/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'View audited snapshot' })).toBeDisabled()
  expect(screen.getByLabelText('Reason for clinical access')).toBeDisabled()
  expect(screen.queryByLabelText('Clinical snapshot')).not.toBeInTheDocument()
})

it.each(['audit', 'cases'] as const)('does not offer clinical actions in the %s view', view => {
  render(<PlatformWorkspace view={view} query="" />)
  expect(screen.queryByRole('button', { name: /Audited clinical access for/ })).not.toBeInTheDocument()
})
