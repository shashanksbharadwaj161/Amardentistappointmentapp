// Opt-in, server-only live smoke. Never pass a secret as a command argument.
// Run with Deno env permission for ANTHROPIC_API_KEY and network permission for
// api.anthropic.com only. Output is metadata; no key or raw model content is logged.
import { requestHaikuDraft } from '../supabase/functions/ai-task/anthropic.ts'
const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
if (!apiKey) { console.error('BLOCKED: ANTHROPIC_API_KEY is not configured in the server environment.'); Deno.exit(2) }
try {
  const result = await requestHaikuDraft({ apiKey, maxTokens: 256, systemPrompt: 'You are running a synthetic connectivity test. Return the requested status using the provided tool. No patient data is involved.', message: 'Return status ok.', schema: { type: 'object', properties: { status: { type: 'string', const: 'ok' } }, required: ['status'], additionalProperties: false } }, value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1 || (value as { status?: unknown }).status !== 'ok') throw new Error('Invalid status')
    return true
  })
  console.log(JSON.stringify({ passed: result.output, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens }))
} catch (error) { console.error(error instanceof Error ? error.message : 'AI_TEST_FAILED'); Deno.exit(1) }
