import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { json } from '../_shared/http.ts'
import { isProvider, isUuid, type Provider } from '../_shared/payment.ts'

type Checkout = { paymentId: string; amountBdt: number; currency: string }
export type CheckoutGateway = (input: Checkout & { provider: Provider; callbackUrl: string; idempotencyKey: string }) => Promise<{ checkoutUrl: string; providerPaymentId: string; raw: unknown }>
export type CheckoutConfig = { supabaseUrl?: string; publishableKey?: string; serviceRoleKey?: string; appUrl?: string; bkashApiUrl?: string; bkashToken?: string; nagadApiUrl?: string; nagadToken?: string }

function liveGateway(config: CheckoutConfig): CheckoutGateway {
  return async ({ provider, paymentId, amountBdt, currency, callbackUrl, idempotencyKey }) => {
    const endpoint = provider === 'bkash' ? config.bkashApiUrl : config.nagadApiUrl
    const token = provider === 'bkash' ? config.bkashToken : config.nagadToken
    if (!endpoint || !token) throw new Error('PROVIDER_NOT_CONFIGURED')
    const response = await fetch(endpoint, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': idempotencyKey }, body: JSON.stringify({ amount: amountBdt.toFixed(2), currency, merchantInvoiceNumber: paymentId, callbackURL: callbackUrl }) })
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
    if (!isUuid(body.appointmentId) || !isProvider(body.provider) || typeof body.idempotencyKey !== 'string' || body.idempotencyKey.trim().length < 12) return json(400, { ok: false, error: { code: 'INVALID_INPUT' } })
    const caller = clientFactory(config.supabaseUrl, config.publishableKey, { global: { headers: { authorization } } })
    const auth = await caller.auth.getUser(); if (auth.error || !auth.data.user) return json(401, { ok: false, error: { code: 'UNAUTHENTICATED' } })
    const prepared = await caller.rpc('prepare_payment_checkout', { target_appointment_id: body.appointmentId, target_provider: body.provider, request_key: body.idempotencyKey.trim() })
    if (prepared.error || !prepared.data?.[0]) return json(403, { ok: false, error: { code: 'PAYMENT_PREPARATION_FAILED' } })
    const row = prepared.data[0] as { payment_id: string; amount_bdt: number; currency: string }
    try {
      const result = await gateway({ provider: body.provider, paymentId: row.payment_id, amountBdt: Number(row.amount_bdt), currency: row.currency, callbackUrl: `${config.appUrl}/payments/return`, idempotencyKey: body.idempotencyKey.trim() })
      const service = clientFactory(config.supabaseUrl, config.serviceRoleKey, { auth: { persistSession: false } })
      const saved = await service.rpc('set_payment_checkout_result', { target_payment_id: row.payment_id, checkout_url: result.checkoutUrl, provider_reference: result.providerPaymentId, event_payload: result.raw })
      if (saved.error) return json(500, { ok: false, error: { code: 'CHECKOUT_SAVE_FAILED' } })
      return json(200, { ok: true, data: { paymentId: row.payment_id, checkoutUrl: result.checkoutUrl, amountBdt: Number(row.amount_bdt), currency: row.currency } })
    } catch (error) { return json(502, { ok: false, error: { code: error instanceof Error ? error.message : 'PROVIDER_CHECKOUT_FAILED' } }) }
  }
}

