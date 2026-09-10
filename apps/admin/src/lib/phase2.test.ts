import { afterEach, expect, it, vi } from 'vitest'
import type { VerificationQueueItem } from '@amar-dentist/domain'
import { loadVerificationDetails } from './phase2'
const mocks = vi.hoisted(() => ({ signed: vi.fn(), from: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { from: mocks.from, storage: { from: () => ({ createSignedUrl: mocks.signed }) } } }))
const applicant = { id: '60000000-0000-4000-8000-000000000001', targetType: 'dentist' } as VerificationQueueItem
afterEach(() => vi.resetAllMocks())
function prepare() {
  mocks.from.mockImplementation((table: string) => {
    const chain = { select: () => chain, eq: () => chain, order: async () => ({ error: null, data: table === 'verification_documents' ? [{ id: 'doc', original_filename: 'Credential.pdf', document_kind: 'bmdc_card', storage_path: 'private/credential.pdf', created_at: '2026-09-10T00:00:00Z' }] : [] }) }
    return chain
  })
}
it.each([{ data: null, error: { message: 'denied' } }, { data: { signedUrl: '' }, error: null }])('fails closed when a private file cannot be signed: %j', async result => {
  prepare(); mocks.signed.mockResolvedValue(result)
  await expect(loadVerificationDetails(applicant)).rejects.toThrow('PRIVATE_EVIDENCE_UNAVAILABLE')
})
it('returns a valid private evidence link', async () => {
  prepare(); mocks.signed.mockResolvedValue({ data: { signedUrl: 'https://example.test/private' }, error: null })
  const result = await loadVerificationDetails(applicant)
  expect(result.evidence[0]?.signedUrl).toBe('https://example.test/private')
  expect(mocks.signed).toHaveBeenCalledWith('private/credential.pdf', 300)
})
