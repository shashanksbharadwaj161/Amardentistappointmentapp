// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { VerificationQueueItem } from '@amar-dentist/domain'
import { VerificationWorkspace } from './VerificationWorkspace'
import { loadVerificationDetails, loadVerificationQueue, reviewVerification, type VerificationDetails } from '../lib/phase2'

vi.mock('../lib/phase2', () => ({ loadVerificationDetails: vi.fn(), loadVerificationQueue: vi.fn(), reviewVerification: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: {} }))
const queue: VerificationQueueItem[] = ['A', 'B'].map((title, index) => ({ id: `60000000-0000-4000-8000-00000000000${index + 1}`, targetType: 'dentist', title: `Dentist ${title}`, subtitle: 'Application', status: 'submitted', submittedAt: '2026-09-10T00:00:00Z', documentCount: 1 }))
const details = (name: string): VerificationDetails => ({ evidence: [{ id: name, name, kind: 'credential', createdAt: '2026-09-10T00:00:00Z', signedUrl: 'https://example.test/private' }], history: [] })
beforeEach(() => { vi.mocked(loadVerificationQueue).mockResolvedValue(queue) })
afterEach(() => { cleanup(); vi.resetAllMocks() })

it('never shows previous evidence or enables decisions during a new applicant load; supports retry', async () => {
  let rejectSecond!: (error: Error) => void
  vi.mocked(loadVerificationDetails).mockResolvedValueOnce(details('A credential')).mockImplementationOnce(() => new Promise((_, reject) => { rejectSecond = reject })).mockResolvedValueOnce(details('B credential'))
  render(<VerificationWorkspace query="" />)
  expect(await screen.findByText('A credential')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /Dentist B/ }))
  expect(screen.queryByText('A credential')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
  await act(async () => rejectSecond(new Error('offline')))
  expect(await screen.findByRole('alert')).toHaveTextContent('Private evidence could not be loaded')
  expect(screen.getByRole('button', { name: 'Approve' })).toBeDisabled()
  expect(screen.queryByText('Preview fixture')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry private evidence' }))
  expect(await screen.findByText('B credential')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Approve' })).toBeEnabled()
  expect(reviewVerification).not.toHaveBeenCalled()
})

it('ignores a late evidence response after changing applicants', async () => {
  let finishFirst!: (value: VerificationDetails) => void
  vi.mocked(loadVerificationDetails).mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve })).mockResolvedValueOnce(details('B credential'))
  render(<VerificationWorkspace query="" />)
  fireEvent.click(await screen.findByRole('button', { name: /Dentist B/ }))
  expect(await screen.findByText('B credential')).toBeInTheDocument()
  await act(async () => finishFirst(details('A credential')))
  expect(screen.queryByText('A credential')).not.toBeInTheDocument()
  expect(screen.getByText('B credential')).toBeInTheDocument()
})

it('locks all decisions and selection while saving and sends only one decision', async () => {
  vi.mocked(loadVerificationDetails).mockResolvedValue(details('Credential'))
  vi.mocked(reviewVerification).mockImplementation(() => new Promise(() => {}))
  render(<VerificationWorkspace query="" />)
  await screen.findByText('Credential')
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Evidence verified and registration checked' } })
  fireEvent.click(screen.getByRole('button', { name: 'Approve' }))
  fireEvent.click(screen.getByRole('button', { name: 'Reject' }))
  await waitFor(() => expect(reviewVerification).toHaveBeenCalledTimes(1))
  expect(screen.getByRole('button', { name: /Dentist B/ })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Reject' })).toBeDisabled()
})
