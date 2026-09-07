import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { json } from '../_shared/http.ts'
import { isProvider, isUuid, type Provider } from '../_shared/payment.ts'

export type RefundGateway = (input: { provider:Provider; providerPaymentId:string; amountBdt:number; idempotencyKey:string }) => Promise<{ providerRefundId:string; raw:unknown }>
export type RefundConfig = { supabaseUrl?:string; publishableKey?:string; serviceRoleKey?:string; bkashRefundUrl?:string; bkashToken?:string; nagadRefundUrl?:string; nagadToken?:string }
function liveGateway(config:RefundConfig):RefundGateway {
  return async ({ provider, providerPaymentId, amountBdt, idempotencyKey }) => {
    const endpoint = provider === 'bkash' ? config.bkashRefundUrl : config.nagadRefundUrl
    const token = provider === 'bkash' ? config.bkashToken : config.nagadToken
    if (!endpoint || !token) throw new Error('PROVIDER_NOT_CONFIGURED')
    const response = await fetch(endpoint, { method:'POST', signal:AbortSignal.timeout(25000), headers:{ authorization:'Bearer '+token, 'content-type':'application/json', 'idempotency-key':idempotencyKey }, body:JSON.stringify({ paymentId:providerPaymentId, amount:amountBdt.toFixed(2) }) })
    const raw = await response.json().catch(() => ({})) as Record<string,unknown>
    if (!response.ok) throw new Error('PROVIDER_REFUND_FAILED')
    const providerRefundId = String(raw.refundTrxID ?? raw.refundId ?? '')
    if (!providerRefundId) throw new Error('PROVIDER_RESPONSE_INVALID')
    return { providerRefundId, raw }
  }
}
export function createRefundHandler(config:RefundConfig, clientFactory:typeof createClient = createClient, gateway = liveGateway(config)) {
  return async (request:Request) => {
    if (!config.supabaseUrl || !config.publishableKey || !config.serviceRoleKey) return json(503,{ok:false,error:{code:'SERVICE_NOT_CONFIGURED'}})
    if (request.method !== 'POST') return json(405,{ok:false,error:{code:'METHOD_NOT_ALLOWED'}})
    const authorization = request.headers.get('authorization')
    if (!authorization) return json(401,{ok:false,error:{code:'UNAUTHENTICATED'}})
    let body:{paymentId?:unknown;amountBdt?:unknown;reason?:unknown;idempotencyKey?:unknown}
    try { body = await request.json() } catch { return json(400,{ok:false,error:{code:'INVALID_INPUT'}}) }
    if (!body || !isUuid(body.paymentId) || typeof body.amountBdt !== 'number' || !Number.isFinite(body.amountBdt) || body.amountBdt <= 0 || typeof body.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 500 || typeof body.idempotencyKey !== 'string' || body.idempotencyKey.length < 12 || body.idempotencyKey.length > 200) return json(400,{ok:false,error:{code:'INVALID_INPUT'}})
    const caller = clientFactory(config.supabaseUrl,config.publishableKey,{global:{headers:{authorization}}})
    const auth = await caller.auth.getUser()
    if (auth.error || !auth.data.user) return json(401,{ok:false,error:{code:'UNAUTHENTICATED'}})
    const prepared = await caller.rpc('prepare_refund',{target_payment_id:body.paymentId,refund_amount:body.amountBdt,refund_reason:body.reason,request_key:body.idempotencyKey})
    if (prepared.error || !prepared.data) return json(403,{ok:false,error:{code:'REFUND_PREPARATION_FAILED'}})
    const service = clientFactory(config.supabaseUrl,config.serviceRoleKey,{auth:{persistSession:false}})
    const context = await service.rpc('refund_execution_context',{target_refund_id:prepared.data})
    const row = context.data?.[0]
    if (context.error || !row) return json(500,{ok:false,error:{code:'REFUND_CONTEXT_UNAVAILABLE'}})
    if (row.status === 'succeeded') return json(200,{ok:true,data:{refundId:prepared.data,status:'succeeded',replayed:true}})
    if (!isProvider(row.provider) || !row.provider_payment_id || !Number.isFinite(Number(row.amount_bdt))) return json(409,{ok:false,error:{code:'PAYMENT_NOT_PROVIDER_REFUNDABLE'}})
    try {
      const result = await gateway({provider:row.provider,providerPaymentId:row.provider_payment_id,amountBdt:Number(row.amount_bdt),idempotencyKey:row.idempotency_key})
      const applied = await service.rpc('apply_refund_result',{target_refund_id:prepared.data,target_status:'succeeded',provider_reference:result.providerRefundId,event_payload:result.raw})
      if (applied.error) return json(500,{ok:false,error:{code:'REFUND_SAVE_FAILED'}})
      return json(200,{ok:true,data:{refundId:prepared.data,status:'succeeded'}})
    } catch (error) {
      // Preserve the reservation on uncertain provider outcomes; retry the same key.
      return json(502,{ok:false,error:{code:error instanceof Error ? error.message : 'PROVIDER_REFUND_FAILED'}})
    }
  }
}
