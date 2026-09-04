import { createClient } from 'npm:@supabase/supabase-js@2.112.4';import { hmacHex } from '../_shared/payment.ts';import { createPaymentWebhookHandler } from './handler.ts'
const config={supabaseUrl:'https://project.test',serviceRoleKey:'service',bkashWebhookSecret:'secret'};const body=JSON.stringify({eventId:'event-1',paymentId:'90000000-0000-4000-8000-000000000001',providerPaymentId:'provider-1',status:'succeeded'})
function assert(v:boolean,m:string){if(!v)throw new Error(m)}
async function req(signature?:string){return new Request('https://project.test/functions/v1/payment-webhook',{method:'POST',headers:{'x-payment-provider':'bkash','x-webhook-signature':signature??await hmacHex('secret',body)},body})}
function factory(value=true){return (()=>({rpc:async()=>({data:value,error:null})})) as unknown as typeof createClient}
Deno.test('webhook fails closed without config',async()=>assert((await createPaymentWebhookHandler({})(await req())).status===503,'503'))
Deno.test('webhook rejects an invalid signature',async()=>assert((await createPaymentWebhookHandler(config,factory())(await req('bad'))).status===401,'401'))
Deno.test('webhook processes signed payment',async()=>{const r=await createPaymentWebhookHandler(config,factory())(await req());assert(r.status===200,'200')})
Deno.test('webhook reports idempotent replay',async()=>{const r=await createPaymentWebhookHandler(config,factory(false))(await req());const data=await r.json();assert(data.data.processed===false,'replay')})

