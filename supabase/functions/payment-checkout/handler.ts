import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { json } from '../_shared/http.ts'
import { isProvider, isUuid, type Provider } from '../_shared/payment.ts'

type Checkout = { paymentId: string; amountBdt: number; currency: string }
export type CheckoutGateway = (input: Checkout & { provider: Provider; callbackUrl: string; idempotencyKey: string }) => Promise<{ checkoutUrl: string; providerPaymentId: string; raw: unknown }>
export type CheckoutConfig = { supabaseUrl?: string; publishableKey?: string; serviceRoleKey?: string; appUrl?: string; bkashApiUrl?: string; bkashToken?: string; nagadApiUrl?: string; nagadToken?: string }
function isCheckoutUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password } catch { return false }
}

function liveGateway(config: CheckoutConfig): CheckoutGateway {
  return async ({ provider, paymentId, amountBdt, currency, callbackUrl, idempotencyKey }) => {
    const endpoint = provider === 'bkash' ? config.bkashApiUrl : config.nagadApiUrl
    const token = provider === 'bkash' ? config.bkashToken : config.nagadToken
    if (!endpoint || !token) throw new Error('PROVIDER_NOT_CONFIGURED')
    const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000), headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify({ amount: amountBdt.toFixed(2), currency, merchantInvoiceNumber: paymentId, callbackURL: callbackUrl }) })
    const raw = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) throw new Error('PROVIDER_CHECKOUT_FAILED')
    const checkoutUrl = String(raw.bkashURL ?? raw.callBackUrl ?? raw.checkoutUrl ?? '')
    const providerPaymentId = String(raw.paymentID ?? raw.paymentId ?? raw.orderId ?? '')
    if (!checkoutUrl || !providerPaymentId) throw new Error('PROVIDER_RESPONSE_INVALID')
    return { checkoutUrl, providerPaymentId, raw }
  }
}

export function createCheckoutHandler(config: CheckoutConfig, clientFactory: typeof createClient = createClient, gateway = liveGateway(config)) {
  return async (request: Request) => {
    if (!config.supabaseUrl || !config.publishableKey || !config.serviceRoleKey || !config.appUrl) return json(503, { ok: false, error: { code: 'SERVICE_NOT_CONFIGURED' } })
    if (request.method !== 'POST') return json(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED' } })
    const authorization = request.headers.get('authorization'); if (!authorization) return json(401, { ok: false, error: { code: 'UNAUTHENTICATED' } })
    let body: { appointmentId?: string; provider?: unknown; idempotencyKey?: string }
    try { body = await request.json() } catch { return json(400, { ok: false, error: { code: 'INVALID_INPUT' } }) }
    if (!body || !isUuid(body.appointmentId) || !isProvider(body.provider) || typeof body.idempotencyKey !== 'string' || body.idempotencyKey.trim().length < 12) return json(400, { ok: false, error: { code: 'INVALID_INPUT' } })
    const caller = clientFactory(config.supabaseUrl, config.publishableKey, { global: { headers: { authorization } } })
    const auth = await caller.auth.getUser(); if (auth.error || !auth.data.user) return json(401, { ok: false, error: { code: 'UNAUTHENTICATED' } })
    const prepared = await caller.rpc('prepare_payment_checkout', { target_appointment_id: body.appointmentId, target_provider: body.provider, request_key: body.idempotencyKey.trim() })
    if (prepared.error || !prepared.data?.[0]) {
      const code = prepared.error?.message
      if (code === 'PAYMENT_ALREADY_FINALIZED' || code === 'APPOINTMENT_NOT_PAYABLE') return json(409, { ok: false, error: { code } })
      return json(403, { ok: false, error: { code: 'PAYMENT_PREPARATION_FAILED' } })
    }
    const row = prepared.data[0] as { payment_id: string; amount_bdt: number; currency: string }
    const service = clientFactory(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false } })
    const storedCheckout = async () => {
      const stored = await service.from('payment_transactions').select('status,provider_checkout_url,provider_payment_id').eq('id', row.payment_id).single()
      if (stored.error || !stored.data) throw new Error('CHECKOUT_STATE_UNAVAILABLE')
      if (!['created', 'pending'].includes(stored.data.status)) throw new Error('PAYMENT_ALREADY_FINALIZED')
      if (stored.data.provider_checkout_url && !isCheckoutUrl(stored.data.provider_checkout_url)) throw new Error('CHECKOUT_STATE_UNAVAILABLE')
      return stored.data.status === 'pending' && typeof stored.data.provider_checkout_url === 'string' && stored.data.provider_checkout_url.trim()
        && typeof stored.data.provider_payment_id === 'string' && stored.data.provider_payment_id.trim() ? stored.data.provider_checkout_url as string : null
    }
    const checkoutResponse = (checkoutUrl: string) => json(200, { ok: true, data: { paymentId: row.payment_id, checkoutUrl, amountBdt: Number(row.amount_bdt), currency: row.currency } })
    try {
      const existingUrl = await storedCheckout()
      if (existingUrl) return checkoutResponse(existingUrl)
      const result = await gateway({ provider: body.provider, paymentId: row.payment_id, amountBdt: Number(row.amount_bdt), currency: row.currency, callbackUrl: `${config.appUrl}/payments/return`, idempotencyKey: body.idempotencyKey.trim() })
      if (!isCheckoutUrl(result.checkoutUrl) || typeof result.providerPaymentId !== 'string' || !result.providerPaymentId.trim()) throw new Error('PROVIDER_RESPONSE_INVALID')
      const saved = await service.rpc('set_payment_checkout_result', { target_payment_id: row.payment_id, checkout_url: result.checkoutUrl, provider_reference: result.providerPaymentId, event_payload: result.raw })
      if (saved.error?.message === 'PAYMENT_ALREADY_FINALIZED') return json(409, { ok: false, error: { code: 'PAYMENT_ALREADY_FINALIZED' } })
      if (saved.error && saved.error.message !== 'PAYMENT_CHECKOUT_ALREADY_CREATED') return json(500, { ok: false, error: { code: 'CHECKOUT_SAVE_FAILED' } })
      const persistedUrl = await storedCheckout()
      if (!persistedUrl) return json(500, { ok: false, error: { code: 'CHECKOUT_SAVE_FAILED' } })
      return checkoutResponse(persistedUrl)
    } catch (error) {
      const allowed = new Set(['PROVIDER_NOT_CONFIGURED', 'PROVIDER_CHECKOUT_FAILED', 'PROVIDER_RESPONSE_INVALID', 'PAYMENT_ALREADY_FINALIZED', 'CHECKOUT_STATE_UNAVAILABLE'])
      const code = error instanceof Error && allowed.has(error.message) ? error.message : 'PROVIDER_CHECKOUT_FAILED'
      return json(code === 'PAYMENT_ALREADY_FINALIZED' ? 409 : code === 'CHECKOUT_STATE_UNAVAILABLE' ? 503 : 502, { ok: false, error: { code } })
    }
  }
}
