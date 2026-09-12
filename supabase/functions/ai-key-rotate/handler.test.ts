import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { createRotateAiKeyHandler } from './handler.ts'
const config={supabaseUrl:'https://project.test',publishableKey:'public',serviceRoleKey:'service'}
function assert(value:boolean,message:string){if(!value)throw new Error(message)}
function req(body:unknown){return new Request('https://project.test/functions/v1/ai-key-rotate',{method:'POST',headers:{authorization:'Bearer token','content-type':'application/json'},body:JSON.stringify(body)})}
function factory(superAdmin=true){const caller={auth:{getUser:async()=>({data:{user:{id:'user'}},error:null})}};const service={from:()=>({select:()=>({eq:async()=>({data:superAdmin?[{role:'super_admin'}]:[{role:'admin'}],error:null})})}),rpc:async()=>({data:'•••• 1234',error:null})};return((_u:string,key:string)=>key==='public'?caller:service) as unknown as typeof createClient}
Deno.test('key rotation rejects short secrets',async()=>assert((await createRotateAiKeyHandler(config,factory())(req({provider:'openai',model:'gpt-5-mini',apiKey:'short'}))).status===400,'400'))
Deno.test('key rotation requires super admin',async()=>assert((await createRotateAiKeyHandler(config,factory(false))(req({provider:'openai',model:'gpt-5-mini',apiKey:'key-value-long-enough-1234'}))).status===403,'403'))
Deno.test('key rotation returns only masked hint',async()=>{const response=await createRotateAiKeyHandler(config,factory())(req({provider:'openai',model:'gpt-5-mini',apiKey:'key-value-long-enough-1234'}));const text=await response.text();assert(response.status===200,'200');assert(text.includes('•••• 1234'),'masked');assert(!text.includes('key-value-long'),'no secret')})
for(const model of ['claude-haiku-4-5-20251001','claude-sonnet-4-5-20250929'])Deno.test('Anthropic key rotation accepts configured model '+model,async()=>{
  const calls:Array<{name:string;args:Record<string,unknown>}>=[]
  const caller={auth:{getUser:async()=>({data:{user:{id:'super'}},error:null})}}
  const service={from:()=>({select:()=>({eq:async()=>({data:[{role:'super_admin'}],error:null})})}),rpc:async(name:string,args:Record<string,unknown>)=>{calls.push({name,args});return{data:'•••• 1234',error:null}}}
  const client=((_u:string,key:string)=>key==='public'?caller:service) as unknown as typeof createClient
  const response=await createRotateAiKeyHandler(config,client)(req({provider:'anthropic',model,apiKey:'synthetic-test-only-1234'}))
  const body=await response.json();assert(response.status===200&&body.data.provider==='anthropic'&&body.data.model===model,'provider and model preserved')
  assert(calls.length===1&&calls[0].name==='rotate_ai_provider_secret'&&calls[0].args.target_provider==='anthropic','only rotates requested provider, never selects')
})
for(const body of [null,{provider:'anthropic',model:'gpt-5-mini',apiKey:'synthetic-test-only-1234'},{provider:'other',model:'test-model',apiKey:'synthetic-test-only-1234'},{provider:'openai',model:'unsafe model',apiKey:'synthetic-test-only-1234'}])Deno.test('key rotation rejects invalid provider/model payload '+JSON.stringify(body),async()=>assert((await createRotateAiKeyHandler(config,factory())(req(body))).status===400,'400'))
Deno.test('Anthropic rotation denies ordinary Admins',async()=>assert((await createRotateAiKeyHandler(config,factory(false))(req({provider:'anthropic',model:'claude-haiku-4-5-20251001',apiKey:'synthetic-test-only-1234'}))).status===403,'403'))
