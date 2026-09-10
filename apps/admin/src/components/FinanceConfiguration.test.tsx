// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, expect, it, vi } from 'vitest'
import { FinanceConfiguration } from './FinanceConfiguration'

vi.mock('../lib/supabase', () => ({ supabase: null }))
afterEach(cleanup)

it('labels sample plans and commission changes as preview, not persisted or audited', async () => {
  render(<FinanceConfiguration />)
  expect(screen.getByText(/Preview plans are fictional samples/)).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: 'Rate percent' }), { target: { value: '5.5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Preview rate change' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Preview only: sample commission changed for this visit. Nothing was saved or audited.')
  expect(screen.queryByText('Default platform commission saved and audited.')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Save audited rate' })).not.toBeInTheDocument()
})

it('preserves rate validation without claiming a preview save on invalid input', async () => {
  render(<FinanceConfiguration />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Rate percent' }), { target: { value: '-5' } })
  fireEvent.click(screen.getByRole('button', { name: 'Preview rate change' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Enter a commission from 0% to 100%.')
  expect(screen.queryByText(/sample commission changed/)).not.toBeInTheDocument()
})
