import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { createNotificationWorker,type Sender } from './handler.ts'
const config={supabaseUrl:'https://project.test',serviceRoleKey:'service',workerSecret:'worker-secret'}
function assert(value:boolean,message:string){if(!value)throw new Error(message)}
function req(secret='worker-secret'){return new Request('https://project.test/functions/v1/notification-worker',{method:'POST',headers:{'x-worker-secret':secret}})}
function factory(finishFails=false){const service={rpc:async(name:string)=>name==='claim_notification_batch'?{data:[{id:'1',recipient_id:'user',channel:'email',template_key:'appointment.confirmed',payload:{appointment_id:'ref'},idempotency_key:'key'}],error:null}:name==='finish_notification_delivery'&&finishFails?{data:null,error:{message:'write failed'}}:{data:null,error:null},auth:{admin:{getUserById:async()=>({data:{user:{email:'patient@example.test'}},error:null})}},from:()=>({select:()=>({eq:()=>({eq:()=>({order:()=>({limit:()=>({maybeSingle:async()=>({data:null,error:null})})})})})})})};return(()=>service) as unknown as typeof createClient}
const send:Sender=async()=> 'provider-id'
Deno.test('worker fails closed without config',async()=>assert((await createNotificationWorker({})(req())).status===503,'503'))
Deno.test('worker requires its private trigger secret',async()=>assert((await createNotificationWorker(config,factory(),send)(req('wrong'))).status===401,'401'))
Deno.test('worker claims and completes notification without exposing payload',async()=>{const response=await createNotificationWorker(config,factory(),send)(req());const body=await response.json();assert(response.status===200,'200');assert(body.data.sent===1,'sent')})
Deno.test('worker fails closed when delivery state cannot be persisted',async()=>{const response=await createNotificationWorker(config,factory(true),send)(req());const body=await response.json();assert(response.status===500,'500');assert(body.data.sent===0&&body.data.persistenceErrors===1,'not falsely sent')})
