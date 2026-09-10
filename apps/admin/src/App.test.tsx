// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

afterEach(cleanup)

describe('admin access shell', () => {
  it('offers a scoped operational Admin preview without privileged controls', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview operational Admin' }))
    expect(screen.getByRole('button', { name: 'Verification' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cases' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'AI provider' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Admin invitations' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Invite admin' })).not.toBeInTheDocument()
  })

  it('exposes independent AI settings destinations in Super Admin preview', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview admin console' }))
    fireEvent.click(screen.getByRole('button', { name: 'Feature controls' }))
    expect(screen.getByRole('heading', { name: 'Feature flags', level: 1 })).toBeInTheDocument()
    expect(screen.queryByLabelText('New API key')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Usage limits' }))
    expect(screen.getByRole('heading', { name: 'Daily usage limits', level: 1 })).toBeInTheDocument()
  })

  it('reveals Super Admin-only actions in the local preview', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview admin console' }))

    expect(screen.getByRole('heading', { name: 'Good morning, Administrator.' })).toBeInTheDocument()
    const inviteButton = screen.getByRole('button', { name: 'Invite admin' })
    expect(inviteButton).toBeInTheDocument()
    expect(screen.getByText('Manage dentist verification, patient support, and platform safety.')).toBeInTheDocument()

    fireEvent.click(inviteButton)
    expect(await screen.findByRole('dialog', { name: 'Invite an administrator' })).toBeInTheDocument()
  })

  it('reviews a submitted dentist from the private verification queue', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview admin console' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verification' }))

    expect(await screen.findByRole('heading', { name: 'Verification queue' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: /Review Dr\./ })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText('Preview only: sample decision updated. No real access or audit records changed.')).toBeInTheDocument()
  })

  it('opens Super Admin revenue controls without exposing provider keys', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview admin console' }))
    fireEvent.click(screen.getByRole('button', { name: 'Configuration' }))
    expect(screen.getByRole('heading', { name: 'Plans and commission' })).toBeInTheDocument()
    expect(screen.getByText('Clinic Pro')).toBeInTheDocument()
    expect(screen.queryByText(/API token/i)).not.toBeInTheDocument()
  })

  it('shows assigned roles separately from the selected workspace mode', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview admin console' }))
    fireEvent.click(screen.getByRole('button', { name: 'Users' }))
    expect(screen.getByText('Roles and mode')).toBeInTheDocument()
    expect(screen.getByText('dentist', { exact: true })).toBeInTheDocument()
    expect(screen.getByText('professional mode')).toBeInTheDocument()
  })

  it('does not claim preview case decisions were saved or audited', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview admin console' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cases' }))
    fireEvent.click(screen.getByRole('button', { name: /moderation · open/ }))
    fireEvent.change(screen.getByLabelText('Decision and reason'), { target: { value: 'Reviewed sample report' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save case decision' }))
    expect(await screen.findByText('Preview only: sample case updated for this visit. Nothing was saved or audited.')).toBeInTheDocument()
  })

  it('does not claim a preview administrator invitation was sent', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview admin console' }))
    fireEvent.click(screen.getByRole('button', { name: 'Invite admin' }))
    fireEvent.change(await screen.findByLabelText('Display name'), { target: { value: 'Demo Administrator' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'admin@example.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(await screen.findByText('Preview only: no email was sent and no administrator access was created.')).toBeInTheDocument()
  })

  it('requires a reason and preserves other roles when removing sample Admin access', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview admin console' }))
    fireEvent.click(screen.getByRole('button', { name: 'Users' }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove Admin access for admin@example.test' }))
    const reason = await screen.findByLabelText('Reason for removal')
    fireEvent.change(reason, { target: { value: 'x' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }))
    expect(await screen.findByText('Explain why access is being removed in 5–500 characters.')).toBeInTheDocument()
    fireEvent.change(reason, { target: { value: 'Sample access no longer needed' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm removal' }))
    expect(await screen.findByText('Preview only: sample Admin role removed. No real permissions changed.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove Admin access for admin@example.test' })).not.toBeInTheDocument()
    expect(screen.getByText('admin@example.test')).toBeInTheDocument()
  })
})
