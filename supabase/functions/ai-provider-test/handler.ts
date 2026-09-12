import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { json } from '../_shared/http.ts'
import { requestHaikuDraft } from '../ai-task/anthropic.ts'

type Config = { supabaseUrl?: string; publishableKey?: string; serviceRoleKey?: string }
type Probe = (provider: string, model: string, secret: string) => Promise<void>
const schema = { type: 'object', properties: { status: { type: 'string', const: 'ok' } }, required: ['status'], additionalProperties: false }
function validate(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || (value as { status?: unknown }).status !== 'ok') throw new Error('AI_OUTPUT_INVALID')
  return true
}
const liveProbe: Probe = async (provider, model, secret) => {
  if (provider === 'anthropic') {
    await requestHaikuDraft({ apiKey: secret, model, maxTokens: 256, systemPrompt: 'Synthetic connection test only. Return status ok using the tool. No patient information is involved.', message: 'Return status ok.', schema }, validate)
    return
  }
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, store: false, max_output_tokens: 1024, input: 'Synthetic connection test. Return JSON with status equal to ok. No patient information is involved.', text: { format: { type: 'json_schema', name: 'connection_test', strict: true, schema } } }),
  })
  if (!response.ok) { await response.body?.cancel(); throw new Error('AI_PROVIDER_UNAVAILABLE') }
  const body = await response.json()
  if (body.status !== 'completed') throw new Error('AI_OUTPUT_INVALID')
  const text = (body.output ?? []).flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? []).filter((item: { type: string }) => item.type === 'output_text').map((item: { text: string }) => item.text).join('')
  validate(JSON.parse(text))
}

// Tests use saved Vault credentials only: never accept a browser-supplied secret,
// clinical data, provider URL, prompt, or arbitrary output budget.
export function createAiProviderTestHandler(config: Config, clientFactory: typeof createClient = createClient, probe: Probe = liveProbe) {
  return async (request: Request) => {
    if (request.method !== 'POST') return json(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED' } })
    if (!config.supabaseUrl || !config.publishableKey || !config.serviceRoleKey) return json(503, { ok: false, error: { code: 'SERVICE_NOT_CONFIGURED' } })
    const authorization = request.headers.get('authorization')
    if (!authorization) return json(401, { ok: false, error: { code: 'UNAUTHENTICATED' } })
    let body: unknown
    try { body = await request.json() } catch { return json(400, { ok: false, error: { code: 'INVALID_INPUT' } }) }
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !['openai', 'anthropic'].includes((body as { provider: string }).provider)) return json(400, { ok: false, error: { code: 'INVALID_INPUT' } })
    const provider = (body as { provider: string }).provider
    const caller = clientFactory(config.supabaseUrl, config.publishableKey, { global: { headers: { authorization } } })
    const auth = await caller.auth.getUser()
    if (auth.error || !auth.data.user) return json(401, { ok: false, error: { code: 'UNAUTHENTICATED' } })
    const service = clientFactory(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false } })
    const roles = await service.from('user_roles').select('role').eq('user_id', auth.data.user.id)
    if (roles.error || !roles.data?.some((row: { role: string }) => row.role === 'super_admin')) return json(403, { ok: false, error: { code: 'SUPER_ADMIN_REQUIRED' } })
    const limit = await service.rpc('consume_api_limit', { actor: auth.data.user.id, target_scope: 'ai:connection-test', max_requests: 6, window_minutes: 60 })
    if (limit.error) return json(503, { ok: false, error: { code: 'AI_LIMIT_UNAVAILABLE' } })
    if (limit.data !== true) return json(429, { ok: false, error: { code: 'AI_RATE_LIMITED' } })
    const credential = await service.rpc('ai_provider_secret', { target_provider: provider })
    const saved = credential.data?.[0]
    if (credential.error || typeof saved?.secret !== 'string' || typeof saved?.model !== 'string') return json(409, { ok: false, error: { code: 'AI_PROVIDER_NOT_CONFIGURED' } })
    const audit = (action: string) => service.from('audit_logs').insert({ actor_id: auth.data.user!.id, action, target_type: 'ai_provider', target_id: provider, metadata: { model: saved.model, synthetic: true } })
    const started = await audit('ai.connection_test_started')
    if (started.error) return json(503, { ok: false, error: { code: 'AI_AUDIT_UNAVAILABLE' } })
    try { await probe(provider, saved.model, saved.secret) }
    catch { await audit('ai.connection_test_failed'); return json(502, { ok: false, error: { code: 'AI_CONNECTION_TEST_FAILED' } }) }
    const completed = await audit('ai.connection_test_passed')
    if (completed.error) return json(503, { ok: false, error: { code: 'AI_TEST_AUDIT_UNCONFIRMED' } })
    return json(200, { ok: true, data: { provider, model: saved.model, verified: true } })
  }
}
