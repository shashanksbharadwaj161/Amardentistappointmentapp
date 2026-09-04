import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { hmacHex } from '../_shared/payment.ts'
import { createRevenueCatHandler } from './handler.ts'

const now=1_799_000_000_000
const timestamp=String(now/1000)
const config={supabaseUrl:'https://project.test',serviceRoleKey:'service',authorizationToken:'auth-secret',signingSecret:'signing-secret'}
const payload={event:{id:'event-1',type:'INITIAL_PURCHASE',app_user_id:'90000000-0000-4000-8000-000000000001',product_id:'patient-plus-monthly',original_transaction_id:'transaction-1',environment:'SANDBOX',purchased_at_ms:now,expiration_at_ms:now+86400000}}
function assert(value:boolean,message:string){if(!value)throw new Error(message)}
async function request(auth='auth-secret',body:unknown=payload,overrideSignature?:string){const raw=JSON.stringify(body);const signature=overrideSignature??await hmacHex('signing-secret',`${timestamp}.${raw}`);return new Request('https://project.test/functions/v1/revenuecat-webhook',{method:'POST',headers:{authorization:`Bearer ${auth}`,'content-type':'application/json','x-revenuecat-webhook-signature':`t=${timestamp},v1=${signature}`},body:raw})}
function factory(value=true){return (()=>({rpc:async()=>({data:value,error:null})})) as unknown as typeof createClient}
Deno.test('revenuecat fails closed without config',async()=>assert((await createRevenueCatHandler({})(await request())).status===503,'503'))
Deno.test('revenuecat rejects invalid authorization',async()=>assert((await createRevenueCatHandler(config,factory(),()=>now)(await request('wrong'))).status===401,'401'))
Deno.test('revenuecat rejects invalid HMAC signatures',async()=>assert((await createRevenueCatHandler(config,factory(),()=>now)(await request('auth-secret',payload,'bad'))).status===401,'401'))
Deno.test('revenuecat rejects stale signatures',async()=>assert((await createRevenueCatHandler(config,factory(),()=>now+600_000)(await request())).status===401,'401'))
Deno.test('revenuecat rejects malformed signed events',async()=>assert((await createRevenueCatHandler(config,factory(),()=>now)(await request('auth-secret',{}))).status===400,'400'))
Deno.test('revenuecat applies and deduplicates signed events',async()=>{const first=await createRevenueCatHandler(config,factory(),()=>now)(await request());const replay=await createRevenueCatHandler(config,factory(false),()=>now)(await request());assert(first.status===200&&replay.status===200,'200');assert((await replay.json()).data.processed===false,'replay')})
