// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AiConfiguration } from './AiConfiguration'

const mocks = vi.hoisted(() => ({ preview: false, from: vi.fn(), rpc: vi.fn(), invoke: vi.fn() }))
vi.mock('../lib/supabase', () => ({ get supabase() { return mocks.preview ? null : { from: mocks.from, rpc: mocks.rpc, functions: { invoke: mocks.invoke } } } }))
const flag = { flag_key: 'patient_ai', description: 'Patient guidance', enabled: true, audience: 'patient' }
const limit = { limit_key: 'patient_ai_daily', description: 'Patient requests', free_value: 5, paid_value: 40 }
const provider = { provider: 'openai', model: 'test-model', key_hint: 'Not configured', enabled: false, configured_at: null as string | null, active_provider: false }
const anthropic = { ...provider, provider: 'anthropic', model: 'claude-haiku-4-5-20251001' }
const configureLoad = (reject = false, providers = [provider, anthropic]) => mocks.from.mockImplementation((table: string) => {
  const result = () => reject ? Promise.reject(new Error('private server detail')) : Promise.resolve({ data: table === 'ai_provider_settings' ? providers : table === 'feature_flags' ? [flag] : [limit], error: null })
  const query = { select: () => query, eq: () => query, order: result, maybeSingle: result }
  return query
})
beforeEach(() => { mocks.preview = false; vi.clearAllMocks(); configureLoad(); mocks.rpc.mockResolvedValue({ error: null }) })
afterEach(cleanup)

it('renders distinct section destinations without exposing the other controls', async () => {
  render(<AiConfiguration section="flags" />)
  expect(await screen.findByRole('button', { name: 'Disable Patient guidance' })).toBeInTheDocument()
  expect(screen.queryByLabelText('New API key')).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Daily usage limits' })).not.toBeInTheDocument()
})

it('handles rejected loading, blocks mutations, and supports retry', async () => {
  configureLoad(true)
  render(<AiConfiguration />)
  expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded')
  expect(screen.getByLabelText('New API key')).toBeDisabled()
  expect(screen.queryByText('private server detail')).not.toBeInTheDocument()
  configureLoad()
  fireEvent.click(screen.getByRole('button', { name: 'Refresh live settings' }))
  expect(await screen.findByRole('button', { name: 'Disable Patient guidance' })).toBeEnabled()
})

it.each(['', '-1', '1.5', '2147483648'])('rejects invalid quota input %s without a mutation', async (value) => {
  render(<AiConfiguration section="limits" />)
  fireEvent.change(await screen.findByLabelText('Free limit for Patient requests'), { target: { value } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Patient requests' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('whole numbers')
  expect(mocks.rpc).not.toHaveBeenCalled()
})

it('rejects a paid allowance smaller than free and accepts zero limits', async () => {
  render(<AiConfiguration section="limits" />)
  fireEvent.change(await screen.findByLabelText('Paid limit for Patient requests'), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Patient requests' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('paid limit must be at least')
  expect(mocks.rpc).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Free limit for Patient requests'), { target: { value: '0' } })
  fireEvent.change(screen.getByLabelText('Paid limit for Patient requests'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Patient requests' }))
  await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith('set_platform_usage_limit', { target_key: 'patient_ai_daily', target_free: 0, target_paid: 0 }))
})

it('locks all mutation controls while a flag request is pending and recovers from rejection', async () => {
  let rejectRequest!: (reason: Error) => void
  mocks.rpc.mockImplementation(() => new Promise((_, reject) => { rejectRequest = reject }))
  render(<AiConfiguration />)
  const toggle = await screen.findByRole('button', { name: 'Disable Patient guidance' })
  fireEvent.click(toggle); fireEvent.click(toggle)
  expect(screen.getByRole('button', { name: 'Save Patient requests' })).toBeDisabled()
  expect(screen.getByLabelText('New API key')).toBeDisabled()
  expect(mocks.rpc).toHaveBeenCalledTimes(1)
  rejectRequest(new Error('private server detail'))
  expect(await screen.findByRole('alert')).toHaveTextContent('Feature flag update is unconfirmed')
  expect(toggle).toBeEnabled()
  expect(toggle).toHaveAttribute('aria-pressed', 'true')
  expect(screen.queryByText('private server detail')).not.toBeInTheDocument()
})

it('clears the key and recovers safely when rotation throws', async () => {
  mocks.invoke.mockRejectedValue(new Error('private server detail'))
  render(<AiConfiguration section="provider" />)
  await waitFor(() => expect(screen.getByLabelText('New API key')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('New API key'), { target: { value: 'test-only-not-a-real-key-12345' } })
  fireEvent.click(screen.getByRole('button', { name: 'Rotate sealed credential' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('rotation is unconfirmed')
  expect(screen.getByLabelText('New API key')).toHaveValue('')
  expect(screen.getByRole('button', { name: 'Rotate sealed credential' })).toBeEnabled()
  expect(screen.queryByText('private server detail')).not.toBeInTheDocument()
})

it('confirms successful rotation with a mask, never the returned raw hint', async () => {
  mocks.invoke.mockResolvedValue({ data: { ok: true, data: { provider: 'openai', model: 'test-model', keyHint: 'unexpected-private-response' } }, error: null })
  render(<AiConfiguration section="provider" />)
  await waitFor(() => expect(screen.getByLabelText('New API key')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('Model'), { target: { value: '  test-model  ' } })
  fireEvent.change(screen.getByLabelText('New API key'), { target: { value: '  test-only-not-a-real-key-12345  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Rotate sealed credential' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Provider credential rotated')
  expect(screen.getByLabelText('New API key')).toHaveValue('')
  expect(screen.queryByText(/unexpected-private-response/)).not.toBeInTheDocument()
  expect(screen.getByText(/•••• 2345/)).toBeInTheDocument()
  expect(mocks.invoke).toHaveBeenCalledWith('ai-key-rotate', { body: { provider: 'openai', model: 'test-model', apiKey: 'test-only-not-a-real-key-12345' } })
})

it('keeps preview credential entry disabled and labels flag updates as unsaved', async () => {
  mocks.preview = true
  render(<AiConfiguration />)
  const input = screen.getByLabelText('New API key')
  expect(input).toBeDisabled()
  fireEvent.change(input, { target: { value: 'test-only-not-a-real-key-12345' } })
  expect(input).toHaveValue('')
  fireEvent.click(screen.getByRole('button', { name: 'Disable Patient guidance assistant' }))
  expect(await screen.findByRole('status')).toHaveTextContent('nothing was saved or audited')
  expect(mocks.invoke).not.toHaveBeenCalled()
  expect(mocks.rpc).not.toHaveBeenCalled()
})

it('preserves quota input and does not claim success when the server rejects a save', async () => {
  mocks.rpc.mockResolvedValue({ error: { message: 'private server detail' } })
  render(<AiConfiguration section="limits" />)
  fireEvent.change(await screen.findByLabelText('Free limit for Patient requests'), { target: { value: '7' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save Patient requests' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Usage limit update is unconfirmed')
  expect(screen.getByLabelText('Free limit for Patient requests')).toHaveValue(7)
  expect(screen.getByRole('button', { name: 'Save Patient requests' })).toBeEnabled()
  expect(screen.queryByText('Usage limit updated and audited.')).not.toBeInTheDocument()
})

it('marks preview quota saves as temporary without calling a server', async () => {
  mocks.preview = true
  render(<AiConfiguration section="limits" />)
  fireEvent.click(screen.getByRole('button', { name: 'Save Patient AI requests per day' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Preview only. This usage limit changed on this screen; nothing was saved or audited.')
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(screen.queryByLabelText('New API key')).not.toBeInTheDocument()
})

it('shows both providers separately, clears keys when switching, and lets Claude model be edited', async () => {
  render(<AiConfiguration section="provider" />)
  await waitFor(() => expect(screen.getByLabelText('New API key')).toBeEnabled())
  expect(screen.getByText('OpenAI (GPT) · Waiting for key')).toBeInTheDocument()
  expect(screen.getByText('Anthropic (Claude) · Waiting for key')).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText('New API key'), { target: { value: 'test-only-not-a-real-key-12345' } })
  fireEvent.change(screen.getByLabelText('Provider to configure'), { target: { value: 'anthropic' } })
  expect(screen.getByLabelText('New API key')).toHaveValue('')
  expect(screen.getByLabelText('Model')).toHaveValue('claude-haiku-4-5-20251001')
  fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'claude-custom-available-model' } })
  expect(screen.getByLabelText('Model')).toHaveValue('claude-custom-available-model')
  expect(screen.getByRole('button', { name: 'Make active provider' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled()
})

it('rotates the chosen Claude key and model without activating it', async () => {
  configureLoad(false, [{ ...provider, enabled: true, configured_at: '2026-09-12', active_provider: true }, anthropic])
  mocks.invoke.mockResolvedValue({ data: { ok: true, data: { provider: 'anthropic', model: 'claude-custom-model', keyHint: 'safe-mask' } }, error: null })
  render(<AiConfiguration section="provider" />)
  await waitFor(() => expect(screen.getByLabelText('New API key')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('Provider to configure'), { target: { value: 'anthropic' } })
  fireEvent.change(screen.getByLabelText('Model'), { target: { value: '  claude-custom-model  ' } })
  fireEvent.change(screen.getByLabelText('New API key'), { target: { value: 'test-only-not-a-real-key-12345' } })
  fireEvent.click(screen.getByRole('button', { name: 'Rotate sealed credential' }))
  expect(await screen.findByRole('status')).toHaveTextContent('active provider has not changed')
  expect(mocks.invoke).toHaveBeenCalledWith('ai-key-rotate', { body: { provider: 'anthropic', model: 'claude-custom-model', apiKey: 'test-only-not-a-real-key-12345' } })
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(screen.getByLabelText('New API key')).toHaveValue('')
  expect(screen.getByRole('button', { name: 'Make active provider' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'Test connection' })).toBeEnabled()
})

it('changes active selection only after the protected RPC confirms it', async () => {
  configureLoad(false, [{ ...provider, enabled: true, configured_at: '2026-09-12', active_provider: true }, { ...anthropic, enabled: true, configured_at: '2026-09-12' }])
  render(<AiConfiguration section="provider" />)
  await waitFor(() => expect(screen.getByLabelText('Provider to configure')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('Provider to configure'), { target: { value: 'anthropic' } })
  fireEvent.click(screen.getByRole('button', { name: 'Make active provider' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Anthropic (Claude) is now selected')
  expect(mocks.rpc).toHaveBeenCalledWith('select_ai_provider', { target_provider: 'anthropic' })
  expect(screen.getByRole('button', { name: 'Currently active provider' })).toBeDisabled()
  expect(mocks.invoke).not.toHaveBeenCalled()
})

it('preserves selection on denied activation and hides raw server errors', async () => {
  configureLoad(false, [{ ...provider, enabled: true, configured_at: '2026-09-12' }, anthropic])
  mocks.rpc.mockResolvedValue({ error: { message: 'private server detail' } })
  render(<AiConfiguration section="provider" />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Make active provider' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Make active provider' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Provider selection is unconfirmed')
  expect(screen.queryByRole('button', { name: 'Currently active provider' })).not.toBeInTheDocument()
  expect(screen.queryByText('private server detail')).not.toBeInTheDocument()
})

it('tests saved provider settings without transmitting draft key/model, and clears verification when switching', async () => {
  configureLoad(false, [{ ...provider, enabled: true, configured_at: '2026-09-12' }, anthropic])
  mocks.invoke.mockResolvedValue({ data: { ok: true, data: { provider: 'openai', model: 'test-model', verified: true } }, error: null })
  render(<AiConfiguration section="provider" />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Test connection' })).toBeEnabled())
  fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'unsaved-draft-model' } })
  fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
  expect(await screen.findByRole('status')).toHaveTextContent('using saved model test-model')
  expect(mocks.invoke).toHaveBeenCalledWith('ai-provider-test', { body: { provider: 'openai' } })
  expect(mocks.rpc).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Provider to configure'), { target: { value: 'anthropic' } })
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

it('handles failed connection tests without success or changing the active provider', async () => {
  configureLoad(false, [{ ...provider, enabled: true, configured_at: '2026-09-12', active_provider: true }, anthropic])
  mocks.invoke.mockRejectedValue(new Error('private provider error'))
  render(<AiConfiguration section="provider" />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Test connection' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: 'Test connection' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Connection could not be verified')
  expect(screen.getByRole('button', { name: 'Test connection' })).toBeEnabled()
  expect(screen.queryByText('private provider error')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Currently active provider' })).toBeDisabled()
})

it('never enables real credential, activation, or connection actions for either preview provider', () => {
  mocks.preview = true
  render(<AiConfiguration section="provider" />)
  fireEvent.change(screen.getByLabelText('Provider to configure'), { target: { value: 'anthropic' } })
  expect(screen.getByLabelText('New API key')).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Make active provider' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled()
  expect(mocks.invoke).not.toHaveBeenCalled()
  expect(mocks.rpc).not.toHaveBeenCalled()
})

it('saves a custom model without repasting a key or changing the active provider', async () => {
  configureLoad(false, [provider, { ...anthropic, enabled: true, configured_at: '2026-09-12', active_provider: true }])
  render(<AiConfiguration section="provider" />)
  await waitFor(() => expect(screen.getByLabelText('Provider to configure')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('Provider to configure'), { target: { value: 'anthropic' } })
  fireEvent.change(screen.getByLabelText('Model'), { target: { value: ' claude-custom-model ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save model' }))
  expect(await screen.findByRole('status')).toHaveTextContent('key and active provider have not changed')
  expect(mocks.rpc).toHaveBeenCalledWith('set_ai_provider_model', { target_provider: 'anthropic', target_model: 'claude-custom-model' })
  expect(mocks.invoke).not.toHaveBeenCalled()
  expect(screen.getByLabelText('New API key')).toHaveValue('')
  expect(screen.getByRole('button', { name: 'Currently active provider' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Save model' })).toBeDisabled()
})

it('does not claim a denied model save succeeded and preserves the draft', async () => {
  mocks.rpc.mockRejectedValue(new Error('private server detail'))
  render(<AiConfiguration section="provider" />)
  await waitFor(() => expect(screen.getByLabelText('Model')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('Model'), { target: { value: 'different-model' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save model' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Model update is unconfirmed')
  expect(screen.getByLabelText('Model')).toHaveValue('different-model')
  expect(screen.getByRole('button', { name: 'Save model' })).toBeEnabled()
  expect(screen.queryByText('private server detail')).not.toBeInTheDocument()
})

it.each([
  { provider: 'anthropic', model: 'test-model' },
  { provider: 'openai', model: 'unexpected-model' },
  { provider: undefined, model: undefined },
])('does not confirm rotation for a mismatched provider/model response: %j', async (response) => {
  mocks.invoke.mockResolvedValue({ data: { ok: true, data: { ...response, keyHint: 'masked' } }, error: null })
  render(<AiConfiguration section="provider" />)
  await waitFor(() => expect(screen.getByLabelText('New API key')).toBeEnabled())
  fireEvent.change(screen.getByLabelText('New API key'), { target: { value: 'test-only-not-a-real-key-12345' } })
  fireEvent.click(screen.getByRole('button', { name: 'Rotate sealed credential' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Credential rotation is unconfirmed')
  expect(screen.queryByText(/Provider credential rotated/)).not.toBeInTheDocument()
  expect(screen.getByText('OpenAI (GPT) · Waiting for key')).toBeInTheDocument()
  expect(screen.getByLabelText('New API key')).toHaveValue('')
  expect(screen.getByRole('button', { name: 'Make active provider' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Rotate sealed credential' })).toBeEnabled()
})
