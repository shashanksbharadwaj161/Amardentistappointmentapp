import { HAIKU_45_MODEL, requestHaikuDraft } from './anthropic.ts'
const input = { apiKey: 'synthetic-test-only', systemPrompt: 'Return a test status.', message: 'Synthetic connection check.', schema: { type: 'object', properties: { status: { type: 'string', const: 'ok' } }, required: ['status'], additionalProperties: false } }
const valid = () => ({ id: 'msg_fixture', model: HAIKU_45_MODEL, stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'return_draft', input: { status: 'ok' } }], usage: { input_tokens: 10, output_tokens: 5 } })
function validate(value: unknown) { if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || (value as { status?: unknown }).status !== 'ok') throw new Error('private provider data'); return { status: 'ok' } }
const mock = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch
async function rejects(run: () => Promise<unknown>, code: string) { try { await run() } catch (error) { if (error instanceof Error && error.message === code) return; throw error } throw new Error('Expected rejection') }
Deno.test('Haiku uses fixed TLS endpoint, pinned model, bounded output and structured draft', async () => {
  const transport = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    if (url !== 'https://api.anthropic.com/v1/messages' || init?.redirect !== 'error' || body.model !== HAIKU_45_MODEL || body.max_tokens !== 2048 || body.tool_choice.name !== 'return_draft') throw new Error('Invalid request')
    if (new Headers(init?.headers).get('x-api-key') !== input.apiKey || !init?.signal) throw new Error('Missing auth/timeout')
    return new Response(JSON.stringify(valid()))
  }) as typeof fetch
  const result = await requestHaikuDraft(input, validate, transport)
  if (result.output.status !== 'ok' || result.inputTokens !== 10 || result.requestId !== 'msg_fixture') throw new Error('Invalid result')
})
for (const [status, code] of [[401, 'AI_PROVIDER_AUTH_FAILED'], [403, 'AI_PROVIDER_AUTH_FAILED'], [429, 'AI_PROVIDER_RATE_LIMITED'], [500, 'AI_PROVIDER_FAILED']] as const) Deno.test(`Haiku sanitizes HTTP ${status}`, () => rejects(() => requestHaikuDraft(input, validate, mock({ error: input.apiKey }, status)), code))
for (const [name, change] of [
  ['truncation', { stop_reason: 'max_tokens' }], ['refusal', { stop_reason: 'refusal' }], ['wrong model', { model: 'unexpected' }],
  ['missing usage', { usage: null }], ['missing content', { content: [] }],
  ['invalid schema', { content: [{ type: 'tool_use', name: 'return_draft', input: { status: 'wrong' } }] }],
] as const) Deno.test(`Haiku rejects ${name}`, () => rejects(() => requestHaikuDraft(input, validate, mock({ ...valid(), ...change })), 'AI_OUTPUT_INVALID'))
Deno.test('Haiku sanitizes network failures', () => rejects(() => requestHaikuDraft(input, validate, (() => { throw new Error(input.apiKey) }) as typeof fetch), 'AI_PROVIDER_UNAVAILABLE'))
Deno.test('Haiku requires credentials', () => rejects(() => requestHaikuDraft({ ...input, apiKey: '' }, validate, mock(valid())), 'AI_PROVIDER_NOT_CONFIGURED'))
Deno.test('Haiku caps response budget', () => rejects(() => requestHaikuDraft({ ...input, maxTokens: 99999 }, validate, mock(valid())), 'AI_INPUT_INVALID'))
for (const contentType of ['image/jpeg','image/png']) Deno.test('Haiku encodes '+contentType+' as a private image block', async () => {
  const transport = (async (_url: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body))
    const image = body.messages[0].content[0]
    if (image.type !== 'image' || image.source.type !== 'base64' || image.source.media_type !== contentType || image.source.data !== 'Zml4dHVyZQ==') throw new Error('Wrong image block')
    return new Response(JSON.stringify(valid()))
  }) as typeof fetch
  await requestHaikuDraft({ ...input, image: { contentType, data: 'Zml4dHVyZQ==' } }, validate, transport)
})
Deno.test('Haiku rejects unsupported raw clinical media before transport', () => rejects(() => requestHaikuDraft({ ...input, image: { contentType: 'application/dicom', data: 'fixture' } }, validate, mock(valid())), 'AI_MEDIA_UNSUPPORTED'))
Deno.test('Anthropic uses the configured exact model without replacing it with Haiku', async () => {
  const model = 'claude-sonnet-4-5-20250929'
  const transport = (async (_url: unknown, init?: RequestInit) => {
    if (JSON.parse(String(init?.body)).model !== model) throw new Error('Wrong configured model')
    return new Response(JSON.stringify({ ...valid(), model }))
  }) as typeof fetch
  const result = await requestHaikuDraft({ ...input, model }, validate, transport)
  if (result.model !== model) throw new Error('Wrong audited model')
})
Deno.test('Anthropic rejects configured-model mismatch without returning output', () => rejects(() => requestHaikuDraft({ ...input, model: 'claude-sonnet-4-5-20250929' }, validate, mock(valid())), 'AI_OUTPUT_INVALID'))
Deno.test('Anthropic rejects a non-Claude model identifier', () => rejects(() => requestHaikuDraft({ ...input, model: 'gpt-5-mini' }, validate, mock(valid())), 'AI_INPUT_INVALID'))
