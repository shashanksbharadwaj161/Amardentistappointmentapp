import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { createRotateAiKeyHandler } from './handler.ts'
const config={supabaseUrl:'https://project.test',publishableKey:'public',serviceRoleKey:'service'}
function assert(value:boolean,message:string){if(!value)throw new Error(message)}
function req(body:unknown){return new Request('https://project.test/functions/v1/ai-key-rotate',{method:'POST',headers:{authorization:'Bearer token','content-type':'application/json'},body:JSON.stringify(body)})}
function factory(superAdmin=true){const caller={auth:{getUser:async()=>({data:{user:{id:'user'}},error:null})}};const service={from:()=>({select:()=>({eq:async()=>({data:superAdmin?[{role:'super_admin'}]:[{role:'admin'}],error:null})})}),rpc:async()=>({data:'•••• 1234',error:null})};return((_u:string,key:string)=>key==='public'?caller:service) as unknown as typeof createClient}
Deno.test('key rotation rejects short secrets',async()=>assert((await createRotateAiKeyHandler(config,factory())(req({provider:'openai',model:'gpt-5-mini',apiKey:'short'}))).status===400,'400'))
Deno.test('key rotation requires super admin',async()=>assert((await createRotateAiKeyHandler(config,factory(false))(req({provider:'openai',model:'gpt-5-mini',apiKey:'key-value-long-enough-1234'}))).status===403,'403'))
Deno.test('key rotation returns only masked hint',async()=>{const response=await createRotateAiKeyHandler(config,factory())(req({provider:'openai',model:'gpt-5-mini',apiKey:'key-value-long-enough-1234'}));const text=await response.text();assert(response.status===200,'200');assert(text.includes('•••• 1234'),'masked');assert(!text.includes('key-value-long'),'no secret')})
