import { listSupportCases, openSupportCase, supportInputSchema } from './support'
import { supabase } from './supabase'

jest.mock('./supabase', () => ({ supabase: { rpc: jest.fn(), from: jest.fn() } }))
const backend = supabase as unknown as { rpc: jest.Mock; from: jest.Mock }
const user = '20000000-0000-4000-8000-000000000001'
const preview = '00000000-0000-4000-8000-000000000001'
beforeEach(() => jest.clearAllMocks())

it('validates categories and trimmed description boundaries', () => {
  for (const summary of ['', '    ', 'abcd', 'x'.repeat(1001)]) {
    expect(supportInputSchema.safeParse({ category: 'technical', summary }).success).toBe(false)
  }
  expect(supportInputSchema.parse({ category: 'privacy', summary: '  Hello  ' }).summary).toBe('Hello')
  expect(supportInputSchema.safeParse({ category: 'clinical', summary: 'Hello' }).success).toBe(false)
})
it('does not send or invent saved cases for preview accounts', async () => {
  expect(await openSupportCase(preview, { category: 'technical', summary: 'Sample issue' })).toEqual({ preview: true, id: null })
  expect(await listSupportCases(preview)).toEqual([])
  expect(backend.rpc).not.toHaveBeenCalled()
  expect(backend.from).not.toHaveBeenCalled()
})
it('requires an account before sending or reading', async () => {
  await expect(openSupportCase('', { category: 'technical', summary: 'Sample issue' })).rejects.toThrow('SIGN_IN_REQUIRED')
  await expect(listSupportCases('')).rejects.toThrow('SIGN_IN_REQUIRED')
})
it('uses the authenticated RPC without accepting client role or opener fields', async () => {
  backend.rpc.mockResolvedValue({ data: user, error: null })
  expect(await openSupportCase(user, { category: 'refund', summary: '  Please help  ' })).toEqual({ preview: false, id: user })
  expect(backend.rpc).toHaveBeenCalledWith('open_support_case', { case_category: 'refund', case_summary: 'Please help' })
})
it('does not claim success on server errors or malformed responses', async () => {
  backend.rpc.mockResolvedValueOnce({ error: { message: 'private backend detail' }, data: null })
  await expect(openSupportCase(user, { category: 'technical', summary: 'Sample issue' })).rejects.toThrow('SUPPORT_SUBMIT_FAILED')
  backend.rpc.mockResolvedValueOnce({ error: null, data: null })
  await expect(openSupportCase(user, { category: 'technical', summary: 'Sample issue' })).rejects.toThrow()
})
it('filters request history to the account and reports load failures', async () => {
  const query = { select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(), limit: jest.fn().mockResolvedValue({ data: [], error: null }) }
  backend.from.mockReturnValue(query)
  expect(await listSupportCases(user)).toEqual([])
  expect(query.eq).toHaveBeenCalledWith('opened_by', user)
  expect(query.limit).toHaveBeenCalledWith(50)
  query.limit.mockResolvedValueOnce({ data: null, error: {} })
  await expect(listSupportCases(user)).rejects.toThrow('SUPPORT_LOAD_FAILED')
})
