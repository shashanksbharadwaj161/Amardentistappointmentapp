import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { json } from '../_shared/http.ts'
import { hmacHex, isProvider, isUuid, timingSafeEqual } from '../_shared/payment.ts'

export type WebhookConfig={supabaseUrl?:string;serviceRoleKey?:string;bkashWebhookSecret?:string;nagadWebhookSecret?:string}
export function createPaymentWebhookHandler(config:WebhookConfig,clientFactory:typeof createClient=createClient){return async(request:Request)=>{
  if(!config.supabaseUrl||!config.serviceRoleKey)return json(503,{ok:false,error:{code:'SERVICE_NOT_CONFIGURED'}})
  if(request.method!=='POST')return json(405,{ok:false,error:{code:'METHOD_NOT_ALLOWED'}})
  const provider=request.headers.get('x-payment-provider'); if(!isProvider(provider))return json(400,{ok:false,error:{code:'PROVIDER_INVALID'}})
  const secret=provider==='bkash'?config.bkashWebhookSecret:config.nagadWebhookSecret; if(!secret)return json(503,{ok:false,error:{code:'PROVIDER_NOT_CONFIGURED'}})
  const raw=await request.text(); const signature=request.headers.get('x-webhook-signature')??''; const expected=await hmacHex(secret,raw)
  if(!timingSafeEqual(signature.toLowerCase(),expected))return json(401,{ok:false,error:{code:'SIGNATURE_INVALID'}})
  let body:{eventId?:string;paymentId?:string;providerPaymentId?:string;status?:string};try{body=JSON.parse(raw)}catch{return json(400,{ok:false,error:{code:'INVALID_INPUT'}})}
  const states=['pending','succeeded','failed','refunded','partially_refunded'];if(!body.eventId||!isUuid(body.paymentId)||!states.includes(body.status??''))return json(400,{ok:false,error:{code:'INVALID_INPUT'}})
  const service=clientFactory(config.supabaseUrl,config.serviceRoleKey,{auth:{persistSession:false}});const result=await service.rpc('apply_payment_event',{target_provider:provider,target_event_id:body.eventId,target_payment_id:body.paymentId,target_provider_payment_id:body.providerPaymentId??'',target_status:body.status,event_payload:body,signature_hash:expected})
  if(result.error)return json(500,{ok:false,error:{code:'WEBHOOK_PROCESSING_FAILED'}})
  return json(200,{ok:true,data:{processed:Boolean(result.data)}})
}}

