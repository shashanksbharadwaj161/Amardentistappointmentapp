import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { createCheckoutHandler } from './handler.ts'
const config={supabaseUrl:'https://project.test',publishableKey:'public',serviceRoleKey:'service',appUrl:'https://app.test'}
const appointmentId='70000000-0000-4000-8000-000000000001'; const paymentId='90000000-0000-4000-8000-000000000001'
function assert(value:boolean,message:string){if(!value)throw new Error(message)}
function req(body:unknown,auth=true){return new Request('https://project.test/functions/v1/payment-checkout',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer token'}:{})},body:JSON.stringify(body)})}
function factory(auth=true){const caller={auth:{getUser:async()=>({data:{user:auth?{id:'user'}:null},error:null})},rpc:async()=>({data:[{payment_id:paymentId,amount_bdt:500,currency:'BDT'}],error:null})};const service={rpc:async()=>({error:null})};return ((_u:string,key:string)=>key==='public'?caller:service) as unknown as typeof createClient}
const gateway=async()=>({checkoutUrl:'https://pay.test/checkout',providerPaymentId:'provider-1',raw:{ok:true}})
Deno.test('checkout fails closed without server config',async()=>assert((await createCheckoutHandler({})(req({}))).status===503,'503'))
Deno.test('checkout rejects invalid input',async()=>assert((await createCheckoutHandler(config,factory(),gateway)(req({appointmentId:'bad'}))).status===400,'400'))
Deno.test('checkout rejects invalid sessions',async()=>assert((await createCheckoutHandler(config,factory(false),gateway)(req({appointmentId,provider:'bkash',idempotencyKey:'request-key-123'}))).status===401,'401'))
Deno.test('checkout returns trusted server amount and provider URL',async()=>{const response=await createCheckoutHandler(config,factory(),gateway)(req({appointmentId,provider:'bkash',idempotencyKey:'request-key-123'}));const body=await response.json();assert(response.status===200,'200');assert(body.data.amountBdt===500,'trusted amount')})
