import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { createRefundHandler, type RefundGateway } from './handler.ts'
const config={supabaseUrl:'https://project.test',publishableKey:'public',serviceRoleKey:'service'}
const paymentId='90000000-0000-4000-8000-000000000001'
const valid={paymentId,amountBdt:100,reason:'Patient cancellation',idempotencyKey:'refund-request-123'}
function assert(v:boolean,m:string){if(!v)throw new Error(m)}
function request(body:unknown,auth=true){return new Request('https://project.test/functions/v1/payment-refund',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer token'}:{})},body:JSON.stringify(body)})}
function factory(options:{auth?:boolean;status?:string;prepareError?:boolean;saveError?:boolean;contextError?:boolean}={}){
  const caller={auth:{getUser:async()=>({data:{user:options.auth===false?null:{id:'user'}},error:null})},rpc:async()=>({data:'91000000-0000-4000-8000-000000000001',error:options.prepareError?{message:'denied'}:null})}
  const service={rpc:async(name:string)=>name==='refund_execution_context'?{data:[{provider:'bkash',provider_payment_id:'trusted-payment',amount_bdt:'100',idempotency_key:'trusted-key-12345',status:options.status??'created'}],error:options.contextError?{}:null}:{data:true,error:options.saveError?{}:null}}
  return ((_u:string,key:string)=>key==='public'?caller:service) as unknown as typeof createClient
}
const gateway:RefundGateway=async()=>({providerRefundId:'refund-1',raw:{ok:true}})
Deno.test('refund fails closed without config',async()=>assert((await createRefundHandler({})(request(valid))).status===503,'503'))
Deno.test('refund validates positive amounts and null body',async()=>{for(const body of [null,{...valid,amountBdt:0},{...valid,amountBdt:-1}])assert((await createRefundHandler(config,factory(),gateway)(request(body))).status===400,'400')})
Deno.test('refund rejects invalid sessions',async()=>assert((await createRefundHandler(config,factory({auth:false}),gateway)(request(valid))).status===401,'401'))
Deno.test('refund records a provider-confirmed result',async()=>assert((await createRefundHandler(config,factory(),gateway)(request(valid))).status===200,'200'))
Deno.test('refund ignores forged provider details and uses database context',async()=>{
  let called=false
  const trusted:RefundGateway=async input=>{called=true;assert(input.provider==='bkash'&&input.providerPaymentId==='trusted-payment'&&input.amountBdt===100&&input.idempotencyKey==='trusted-key-12345','trusted context only');return gateway(input)}
  const response=await createRefundHandler(config,factory(),trusted)(request({...valid,provider:'nagad',providerPaymentId:'victim-payment'}))
  assert(response.status===200&&called,'provider called with trusted context')
})
Deno.test('successful refund replay never calls the provider again',async()=>{
  let calls=0;const response=await createRefundHandler(config,factory({status:'succeeded'}),async input=>{calls++;return gateway(input)})(request(valid))
  assert(response.status===200&&calls===0&&(await response.json()).data.replayed,'safe replay')
})
Deno.test('refund authorization failure never reaches provider',async()=>{
  let calls=0;const response=await createRefundHandler(config,factory({prepareError:true}),async input=>{calls++;return gateway(input)})(request(valid))
  assert(response.status===403&&calls===0,'no provider call')
})
Deno.test('refund context failure never reaches provider',async()=>{
  let calls=0;const response=await createRefundHandler(config,factory({contextError:true}),async input=>{calls++;return gateway(input)})(request(valid))
  assert(response.status===500&&calls===0,'no provider call')
})
Deno.test('refund database save failure is not reported as success',async()=>assert((await createRefundHandler(config,factory({saveError:true}),gateway)(request(valid))).status===500,'save failure'))
Deno.test('uncertain provider result is reported as unconfirmed',async()=>assert((await createRefundHandler(config,factory(),()=>Promise.reject(new Error('PROVIDER_REFUND_FAILED')))(request(valid))).status===502,'provider failure'))
