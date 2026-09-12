import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { createAiProviderTestHandler } from './handler.ts'
const config = { supabaseUrl: 'https://project.test', publishableKey: 'public', serviceRoleKey: 'service' }
function assert(value: boolean) { if (!value) throw new Error('Assertion failed') }
function request(body: unknown = { provider: 'anthropic' }) { return new Request('https://project.test/functions/v1/ai-provider-test', { method: 'POST', headers: { authorization: 'Bearer token', 'content-type': 'application/json' }, body: JSON.stringify(body) }) }
function factory(options: { admin?: boolean; authError?: boolean; limited?: boolean; missing?: boolean; limitError?: boolean; auditError?: boolean } = {}) {
  const calls: string[] = []
  const caller = { auth: { getUser: async () => ({ data: { user: options.authError ? null : { id: 'user' } }, error: null }) } }
  const service = {
    from: () => ({ select: () => ({ eq: async () => ({ data: [{ role: options.admin === false ? 'admin' : 'super_admin' }], error: null }) }) , insert: async () => ({ error: options.auditError ? 'failed' : null }) }),
    rpc: async (name: string) => {
      calls.push(name)
      if (name === 'consume_api_limit') return { data: !options.limited, error: options.limitError ? 'failed' : null }
      return { data: options.missing ? [] : [{ model: 'claude-haiku-4-5-20251001', secret: 'fictional-secret-never-output' }], error: null }
    },
  }
  return { calls, client: ((_url: string, key: string) => key === 'public' ? caller : service) as unknown as typeof createClient }
}
for (const provider of ['openai', 'anthropic']) Deno.test(`connection test uses saved ${provider} key and returns metadata only`, async () => {
  const f = factory(); let invoked = false
  const response = await createAiProviderTestHandler(config, f.client, async (actualProvider, model, secret) => { invoked = true; assert(actualProvider === provider && !!model && secret === 'fictional-secret-never-output') })(request({ provider }))
  const text = await response.text()
  assert(response.status === 200 && invoked && text.includes('"verified":true') && !text.includes('fictional-secret'))
})
for (const [name, options, status] of [
  ['ordinary admin', { admin: false }, 403], ['signed out', { authError: true }, 401], ['rate limit', { limited: true }, 429], ['limit failure', { limitError: true }, 503], ['missing key', { missing: true }, 409], ['audit failure', { auditError: true }, 503],
] as const) Deno.test(`connection test blocks ${name} before provider request`, async () => {
  const f = factory(options); let invoked = false
  const response = await createAiProviderTestHandler(config, f.client, async () => { invoked = true })(request())
  assert(response.status === status && !invoked)
})
Deno.test('connection test refuses browser secrets and arbitrary prompts', async () => {
  const f = factory()
  for (const body of [{ provider: 'anthropic', apiKey: 'untrusted' }, { provider: 'openai', prompt: 'medical data' }, { provider: 'unknown' }, null]) {
    const result = await createAiProviderTestHandler(config, f.client)(request(body)); assert(result.status === 400)
  }
  assert(f.calls.length === 0)
})
Deno.test('connection failure never echoes provider errors or saved secret', async () => {
  const f = factory()
  const result = await createAiProviderTestHandler(config, f.client, async () => { throw new Error('fictional-secret-never-output') })(request())
  assert(result.status === 502 && !(await result.text()).includes('fictional-secret'))
})
