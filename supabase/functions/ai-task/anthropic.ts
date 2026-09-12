// Transport only. Provider selection, Vault access, clinical validation and audit
// remain the server handler's responsibility. Never expose this result directly.
export const HAIKU_45_MODEL = 'claude-haiku-4-5-20251001'
type Input = {
  apiKey: string
  systemPrompt: string
  message: string
  schema: Record<string, unknown>
  maxTokens?: number
  model?: string
  image?: { contentType: string; data: string }
}
export async function requestHaikuDraft<T>(
  input: Input,
  validate: (value: unknown) => T,
  transport: typeof fetch = fetch,
): Promise<{ output: T; requestId: string; inputTokens: number; outputTokens: number; model: string }> {
  if (!input.apiKey.trim()) throw new Error('AI_PROVIDER_NOT_CONFIGURED')
  const model = input.model ?? HAIKU_45_MODEL
  if (model.length > 120 || !/^claude-[a-z0-9][a-z0-9._-]*$/.test(model)) throw new Error('AI_INPUT_INVALID')
  const maxTokens = input.maxTokens ?? 2048
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 4096) throw new Error('AI_INPUT_INVALID')
  if (input.image && (!['image/jpeg', 'image/png'].includes(input.image.contentType) || !input.image.data || input.image.data.length > 7 * 1024 * 1024)) throw new Error('AI_MEDIA_UNSUPPORTED')
  let response: Response
  try {
    response = await transport('https://api.anthropic.com/v1/messages', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: { 'x-api-key': input.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model, max_tokens: maxTokens, system: input.systemPrompt,
        messages: [{ role: 'user', content: input.image ? [{ type: 'image', source: { type: 'base64', media_type: input.image.contentType, data: input.image.data } }, { type: 'text', text: input.message }] : input.message }],
        tools: [{ name: 'return_draft', description: 'Return structured draft data for server validation, not an external action.', input_schema: input.schema }],
        tool_choice: { type: 'tool', name: 'return_draft', disable_parallel_tool_use: true },
      }),
    })
  } catch { throw new Error('AI_PROVIDER_UNAVAILABLE') }
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(response.status === 429 ? 'AI_PROVIDER_RATE_LIMITED' : response.status === 401 || response.status === 403 ? 'AI_PROVIDER_AUTH_FAILED' : 'AI_PROVIDER_FAILED')
  }
  try {
    const body = await response.json()
    if (body.stop_reason !== 'tool_use' || body.model !== model || typeof body.id !== 'string' || !body.id) throw new Error()
    if (!Array.isArray(body.content) || body.content.length !== 1) throw new Error()
    const block = body.content[0]
    if (block?.type !== 'tool_use' || block.name !== 'return_draft') throw new Error()
    const usage = body.usage
    if (!usage || !Number.isSafeInteger(usage.input_tokens) || usage.input_tokens < 0 || !Number.isSafeInteger(usage.output_tokens) || usage.output_tokens < 0) throw new Error()
    return { output: validate(block.input), requestId: body.id, inputTokens: usage.input_tokens, outputTokens: usage.output_tokens, model: body.model }
  } catch { throw new Error('AI_OUTPUT_INVALID') }
}
