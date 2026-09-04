import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { json } from '../_shared/http.ts'
import { hmacHex, timingSafeEqual } from '../_shared/payment.ts'

export type RevenueCatConfig={supabaseUrl?:string;serviceRoleKey?:string;authorizationToken?:string;signingSecret?:string}
const eventState:Record<string,string>={INITIAL_PURCHASE:'active',RENEWAL:'active',PRODUCT_CHANGE:'active',UNCANCELLATION:'active',CANCELLATION:'cancelled',EXPIRATION:'expired',BILLING_ISSUE:'billing_issue'}
export function createRevenueCatHandler(config:RevenueCatConfig,clientFactory:typeof createClient=createClient,now=()=>Date.now()){return async(request:Request)=>{
  if(!config.supabaseUrl||!config.serviceRoleKey||!config.authorizationToken||!config.signingSecret)return json(503,{ok:false,error:{code:'SERVICE_NOT_CONFIGURED'}})
  if(request.method!=='POST')return json(405,{ok:false,error:{code:'METHOD_NOT_ALLOWED'}})
  if(request.headers.get('authorization')!==`Bearer ${config.authorizationToken}`)return json(401,{ok:false,error:{code:'AUTHORIZATION_INVALID'}})
  const raw=await request.text();const signatureHeader=request.headers.get('x-revenuecat-webhook-signature')??'';const values=Object.fromEntries(signatureHeader.split(',').map((part)=>part.split('=',2) as[string,string]));const timestamp=Number(values.t)
  if(!Number.isFinite(timestamp)||Math.abs(now()-timestamp*1000)>300_000)return json(401,{ok:false,error:{code:'SIGNATURE_EXPIRED'}})
  const expected=await hmacHex(config.signingSecret,`${values.t}.${raw}`);if(!values.v1||!timingSafeEqual(values.v1.toLowerCase(),expected))return json(401,{ok:false,error:{code:'SIGNATURE_INVALID'}})
  let body:{event?:Record<string,unknown>};try{body=JSON.parse(raw)}catch{return json(400,{ok:false,error:{code:'INVALID_INPUT'}})}
  const event=body.event;const id=event?.id;const type=event?.type;const user=event?.app_user_id;const product=event?.product_id;const transaction=event?.original_transaction_id;const environment=String(event?.environment??'').toLowerCase()
  if(typeof id!=='string'||typeof type!=='string'||typeof user!=='string'||typeof product!=='string'||typeof transaction!=='string'||!['sandbox','production'].includes(environment))return json(400,{ok:false,error:{code:'INVALID_INPUT'}})
  const state=eventState[type]??'active';const iso=(value:unknown)=>typeof value==='number'?new Date(value).toISOString():null
  const service=clientFactory(config.supabaseUrl,config.serviceRoleKey,{auth:{persistSession:false}});const result=await service.rpc('apply_subscription_event',{target_event_id:id,target_event_type:type,target_app_user_id:user,target_product_id:product,target_original_transaction_id:transaction,target_status:state,target_period_start:iso(event?.purchased_at_ms),target_period_end:iso(event?.expiration_at_ms),target_expires_at:iso(event?.expiration_at_ms),target_environment:environment,event_payload:body})
  if(result.error)return json(500,{ok:false,error:{code:'WEBHOOK_PROCESSING_FAILED'}})
  return json(200,{ok:true,data:{processed:Boolean(result.data)}})
}}
