import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { createCheckoutHandler } from './handler.ts'
const config={supabaseUrl:'https://project.test',publishableKey:'public',serviceRoleKey:'service',appUrl:'https://app.test'}
const appointmentId='70000000-0000-4000-8000-000000000001'; const paymentId='90000000-0000-4000-8000-000000000001'
function assert(value:boolean,message:string){if(!value)throw new Error(message)}
function req(body:unknown,auth=true){return new Request('https://project.test/functions/v1/payment-checkout',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer token'}:{})},body:JSON.stringify(body)})}
type Options={prepareError?:string;status?:string;url?:string;reference?:string;saveError?:string;winnerUrl?:string;terminalAfterSave?:boolean;readError?:boolean;saves?:string[];preserveWinner?:boolean}
function factory(auth=true,options:Options={}){
  let state={status:options.status??'created',provider_checkout_url:options.url??null,provider_payment_id:options.reference??null}
  const caller={auth:{getUser:async()=>({data:{user:auth?{id:'user'}:null},error:null})},rpc:async()=>({data:[{payment_id:paymentId,amount_bdt:500,currency:'BDT'}],error:options.prepareError?{message:options.prepareError}:null})}
  const service={from:()=>({select:()=>({eq:()=>({single:async()=>({data:state,error:options.readError?{message:'private read error'}:null})})})}),rpc:async(name:string,args:Record<string,unknown>)=>{
    options.saves?.push(name)
    if(options.preserveWinner&&state.status==='pending'&&state.provider_payment_id!==args.provider_reference)return{error:{message:'PAYMENT_CHECKOUT_ALREADY_CREATED'}}
    if(options.winnerUrl)state={status:'pending',provider_checkout_url:options.winnerUrl,provider_payment_id:'winner-id'}
    else if(!options.saveError)state={status:options.terminalAfterSave?'succeeded':'pending',provider_checkout_url:String(args.checkout_url),provider_payment_id:String(args.provider_reference)}
    return{error:options.saveError?{message:options.saveError}:null}
  }}
  return ((_u:string,key:string)=>key==='public'?caller:service) as unknown as typeof createClient
}
const gateway=async()=>({checkoutUrl:'https://pay.test/checkout',providerPaymentId:'provider-1',raw:{ok:true}})
Deno.test('checkout fails closed without server config',async()=>assert((await createCheckoutHandler({})(req({}))).status===503,'503'))
Deno.test('checkout rejects invalid input',async()=>assert((await createCheckoutHandler(config,factory(),gateway)(req({appointmentId:'bad'}))).status===400,'400'))
Deno.test('checkout rejects invalid sessions',async()=>assert((await createCheckoutHandler(config,factory(false),gateway)(req({appointmentId,provider:'bkash',idempotencyKey:'request-key-123'}))).status===401,'401'))
Deno.test('checkout returns trusted server amount and provider URL',async()=>{const response=await createCheckoutHandler(config,factory(),gateway)(req({appointmentId,provider:'bkash',idempotencyKey:'request-key-123'}));const body=await response.json();assert(response.status===200,'200');assert(body.data.amountBdt===500,'trusted amount')})
const validBody={appointmentId,provider:'bkash',idempotencyKey:'request-key-123'}
Deno.test('known-key outsider preparation failure never invokes gateway',async()=>{
  let calls=0;const response=await createCheckoutHandler(config,factory(true,{prepareError:'APPOINTMENT_PAYMENT_DENIED'}),async()=>{calls++;return gateway()})(req(validBody))
  assert(response.status===403&&calls===0,'ownership failure stops checkout')
})
for(const code of ['PAYMENT_ALREADY_FINALIZED','APPOINTMENT_NOT_PAYABLE'])Deno.test(code+' retries have explicit conflict responses',async()=>{
  let calls=0;const response=await createCheckoutHandler(config,factory(true,{prepareError:code}),async()=>{calls++;return gateway()})(req(validBody))
  assert(response.status===409&&(await response.json()).error.code===code&&calls===0,'no new checkout')
})
Deno.test('pending checkout reuses the stored provider URL without gateway or setter',async()=>{
  let calls=0;const saves:string[]=[];const response=await createCheckoutHandler(config,factory(true,{status:'pending',url:'https://pay.test/existing',reference:'existing-id',saves}),async()=>{calls++;return gateway()})(req(validBody))
  assert(response.status===200&&(await response.json()).data.checkoutUrl==='https://pay.test/existing'&&calls===0&&saves.length===0,'stored checkout reused')
})
for(const status of ['succeeded','refunded','partially_refunded','failed'])Deno.test('terminal '+status+' observed after preparation blocks gateway',async()=>{
  let calls=0;const response=await createCheckoutHandler(config,factory(true,{status}),async()=>{calls++;return gateway()})(req(validBody))
  assert(response.status===409&&(await response.json()).error.code==='PAYMENT_ALREADY_FINALIZED'&&calls===0,'terminal state preserved')
})
Deno.test('terminal transition during gateway call returns conflict',async()=>{
  const response=await createCheckoutHandler(config,factory(true,{saveError:'PAYMENT_ALREADY_FINALIZED'}),gateway)(req(validBody))
  assert(response.status===409&&(await response.json()).error.code==='PAYMENT_ALREADY_FINALIZED','terminal setter failure is explicit')
})
Deno.test('concurrent stored winner is returned instead of the losing gateway URL',async()=>{
  const response=await createCheckoutHandler(config,factory(true,{saveError:'PAYMENT_CHECKOUT_ALREADY_CREATED',winnerUrl:'https://pay.test/winner'}),gateway)(req(validBody))
  assert(response.status===200&&(await response.json()).data.checkoutUrl==='https://pay.test/winner','canonical checkout returned')
})
Deno.test('terminal transition after setter withholds checkout URL',async()=>{
  const response=await createCheckoutHandler(config,factory(true,{terminalAfterSave:true}),gateway)(req(validBody))
  assert(response.status===409&&(await response.json()).error.code==='PAYMENT_ALREADY_FINALIZED','no stale checkout returned')
})
Deno.test('unknown provider transport details are sanitized',async()=>{
  const response=await createCheckoutHandler(config,factory(),()=>{throw new Error('private provider token and payload')})(req(validBody))
  assert(response.status===502&&(await response.json()).error.code==='PROVIDER_CHECKOUT_FAILED','no raw upstream error')
})
Deno.test('unavailable stored state fails closed before gateway',async()=>{
  let calls=0;const response=await createCheckoutHandler(config,factory(true,{readError:true}),async()=>{calls++;return gateway()})(req(validBody))
  assert(response.status===503&&(await response.json()).error.code==='CHECKOUT_STATE_UNAVAILABLE'&&calls===0,'state unavailable')
})
for(const checkoutUrl of ['javascript:alert(1)','http://pay.test/checkout','https://user:pass@pay.test/checkout','invalid'])Deno.test('unsafe checkout URL rejected '+checkoutUrl,async()=>{
  const saves:string[]=[];const response=await createCheckoutHandler(config,factory(true,{saves}),async()=>({...await gateway(),checkoutUrl}))(req(validBody))
  assert(response.status===502&&(await response.json()).error.code==='PROVIDER_RESPONSE_INVALID'&&saves.length===0,'invalid URL never persisted')
})
Deno.test('null checkout input rejected',async()=>assert((await createCheckoutHandler(config,factory(),gateway)(req(null))).status===400,'400'))
Deno.test('concurrent handler requests both return the persisted winner',async()=>{
  let calls=0;let release!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve})
  const handler=createCheckoutHandler(config,factory(true,{preserveWinner:true}),async()=>{
    const attempt=++calls;if(calls===2)release();await barrier
    return{checkoutUrl:`https://pay.test/attempt-${attempt}`,providerPaymentId:`provider-${attempt}`,raw:{attempt}}
  })
  const responses=await Promise.all([handler(req(validBody)),handler(req(validBody))])
  const bodies=await Promise.all(responses.map(response=>response.json()))
  assert(responses.every(response=>response.status===200)&&bodies[0].data.checkoutUrl===bodies[1].data.checkoutUrl,'both callers receive canonical persisted checkout')
  assert(calls===2,'concurrent outbound attempts remain possible before any URL is persisted')
})
