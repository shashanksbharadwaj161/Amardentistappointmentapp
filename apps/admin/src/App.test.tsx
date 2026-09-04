// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  it('reveals Super Admin-only actions in the local preview', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview admin console' }))

    expect(screen.getByRole('heading', { name: 'Good morning, Administrator.' })).toBeInTheDocument()
    const inviteButton = screen.getByRole('button', { name: 'Invite admin' })
    expect(inviteButton).toBeInTheDocument()
    expect(screen.getByText('Database-enforced')).toBeInTheDocument()

    fireEvent.click(inviteButton)
    expect(await screen.findByRole('dialog', { name: 'Invite an administrator' })).toBeInTheDocument()
  })

  it('reviews a submitted dentist from the private verification queue', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview admin console' }))
    fireEvent.click(screen.getByRole('button', { name: 'Verification' }))

    expect(await screen.findByRole('heading', { name: 'Verification queue' })).toBeInTheDocument()
    expect(await screen.findByRole('region', { name: /Review Dr\./ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
    expect(await screen.findByText('Application approved and access updated.')).toBeInTheDocument()
  })

  it('opens Super Admin revenue controls without exposing provider keys', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Preview admin console' }))
    fireEvent.click(screen.getByRole('button', { name: 'Configuration' }))
    expect(screen.getByRole('heading', { name: 'Plans and commission' })).toBeInTheDocument()
    expect(screen.getByText('Clinic Pro')).toBeInTheDocument()
    expect(screen.queryByText(/API token/i)).not.toBeInTheDocument()
  })
})
