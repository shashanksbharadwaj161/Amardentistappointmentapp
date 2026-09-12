// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EmergencyClinicalAccess } from './EmergencyClinicalAccess'
import { supabase } from '../lib/supabase'

vi.mock('../lib/supabase', () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }))
const account = { id: 'account-1', email: 'owner@example.test' }
const patients = [{ id: 'patient-1', full_name: 'Account Owner', relationship: 'self' }, { id: 'patient-2', full_name: 'Dependent Patient', relationship: 'child' }]
const snapshot = { medicalHistory: { conditions: ['Asthma'], private_token: 'SECRET' }, allergies: [{ allergen: 'Penicillin', severity: 'severe' }], encounters: [{ chief_complaint: 'Tooth pain', status: 'draft' }], diagnoses: [{ diagnosis: 'Caries' }], prescriptions: [{ instructions: 'Follow dentist instructions', document_path: 'SECRET_PATH' }] }
let eq: ReturnType<typeof vi.fn>
beforeEach(() => {
  eq = vi.fn().mockReturnValue({ order: vi.fn().mockResolvedValue({ data: patients, error: null }) })
  vi.mocked(supabase!.from).mockReturnValue({ select: vi.fn().mockReturnValue({ eq }) } as never)
  vi.mocked(supabase!.rpc).mockResolvedValue({ data: snapshot, error: null } as never)
})
afterEach(() => { cleanup(); vi.resetAllMocks() })
async function choose(id = 'patient-2', reason = '  Investigate patient support escalation  ') {
  await screen.findByRole('option', { name: 'Dependent Patient · child' })
  fireEvent.change(screen.getByLabelText('Patient profile'), { target: { value: id } })
  fireEvent.change(screen.getByLabelText('Reason for clinical access'), { target: { value: reason } })
}
function submit() { fireEvent.click(screen.getByRole('button', { name: 'View audited snapshot' })) }

it('binds discovery to account and snapshot to the selected dependent, rendering only supported fields', async () => {
  render(<EmergencyClinicalAccess account={account} onClose={vi.fn()} />)
  await choose(); submit()
  expect(await screen.findByText('Asthma')).toBeInTheDocument()
  expect(eq).toHaveBeenCalledWith('account_owner_id', account.id)
  expect(supabase!.rpc).toHaveBeenCalledExactlyOnceWith('super_admin_clinical_snapshot', { target_patient_profile_id: 'patient-2', access_reason: 'Investigate patient support escalation' })
  for (const text of ['Penicillin', 'Tooth pain', 'Caries', 'Follow dentist instructions']) expect(screen.getByText(text)).toBeInTheDocument()
  expect(screen.queryByText(/SECRET/)).not.toBeInTheDocument()
})

it.each(['   ', 'short', 'x'.repeat(501)])('rejects a reason outside the trimmed server bounds (%s)', async reason => {
  render(<EmergencyClinicalAccess account={account} onClose={vi.fn()} />)
  await choose('patient-1', reason); submit()
  expect(await screen.findByText('Explain the access need in 10–500 characters.')).toBeInTheDocument()
  expect(supabase!.rpc).not.toHaveBeenCalled()
})

it.each(['SUPER_ADMIN_REQUIRED', 'AUDIT_WRITE_FAILED'])('does not expose any returned data on server denial or audit failure: %s', async message => {
  vi.mocked(supabase!.rpc).mockResolvedValue({ data: snapshot, error: { message } } as never)
  render(<EmergencyClinicalAccess account={account} onClose={vi.fn()} />)
  await choose(); submit()
  expect(await screen.findByText(/Clinical access could not be confirmed/)).toBeInTheDocument()
  expect(screen.queryByText('Asthma')).not.toBeInTheDocument()
})

it('clears previous content before retrying and keeps it cleared after failure', async () => {
  render(<EmergencyClinicalAccess account={account} onClose={vi.fn()} />)
  await choose(); submit(); await screen.findByText('Asthma')
  vi.mocked(supabase!.rpc).mockRejectedValueOnce(new Error('offline'))
  submit()
  expect(screen.queryByText('Asthma')).not.toBeInTheDocument()
  await screen.findByText(/Clinical access could not be confirmed/)
})

it('ignores in-flight results after changing patient and permits a new audited request', async () => {
  let resolve!: (value: never) => void
  vi.mocked(supabase!.rpc).mockImplementationOnce(() => new Promise(done => { resolve = done }) as never)
  render(<EmergencyClinicalAccess account={account} onClose={vi.fn()} />)
  await choose(); submit()
  await choose('patient-1')
  await act(async () => { resolve({ data: snapshot, error: null } as never) })
  expect(screen.queryByText('Asthma')).not.toBeInTheDocument()
  submit(); await screen.findByText('Asthma')
  expect(supabase!.rpc).toHaveBeenLastCalledWith('super_admin_clinical_snapshot', { target_patient_profile_id: 'patient-1', access_reason: 'Investigate patient support escalation' })
})

it('clears data on close and reopening requires a new selection and reason', async () => {
  const onClose = vi.fn()
  const view = render(<EmergencyClinicalAccess account={account} onClose={onClose} />)
  await choose(); submit(); await screen.findByText('Asthma')
  fireEvent.click(screen.getByRole('button', { name: 'Close clinical access' }))
  expect(screen.queryByText('Asthma')).not.toBeInTheDocument()
  expect(onClose).toHaveBeenCalledOnce()
  view.unmount()
  render(<EmergencyClinicalAccess account={account} onClose={onClose} />)
  await screen.findByLabelText('Reason for clinical access')
  expect(screen.getByLabelText('Reason for clinical access')).toHaveValue('')
  expect(screen.getByLabelText('Patient profile')).toHaveValue('')
  expect(screen.queryByText('Asthma')).not.toBeInTheDocument()
})

it.each(['close', 'account change'])('ignores in-flight results after %s', async action => {
  let resolve!: (value: never) => void
  vi.mocked(supabase!.rpc).mockImplementationOnce(() => new Promise(done => { resolve = done }) as never)
  const view = render(<EmergencyClinicalAccess account={account} onClose={vi.fn()} />)
  await choose(); submit()
  if (action === 'close') fireEvent.click(screen.getByRole('button', { name: 'Close clinical access' }))
  else view.rerender(<EmergencyClinicalAccess account={{ id: 'another-account', email: 'other@example.test' }} onClose={vi.fn()} />)
  await act(async () => { resolve({ data: snapshot, error: null } as never) })
  expect(screen.queryByText('Asthma')).not.toBeInTheDocument()
})

it('displays profile load errors and never falls back to sample clinical records', async () => {
  eq.mockReturnValue({ order: vi.fn().mockRejectedValue(new Error('offline')) })
  render(<EmergencyClinicalAccess account={account} onClose={vi.fn()} />)
  expect(await screen.findByText(/Patient profiles could not be loaded/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'View audited snapshot' })).toBeDisabled()
  expect(supabase!.rpc).not.toHaveBeenCalled()
})
