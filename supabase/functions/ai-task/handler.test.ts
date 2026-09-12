import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { createAiTaskHandler, type AiProvider } from './handler.ts'
const config={supabaseUrl:'https://project.test',publishableKey:'public',serviceRoleKey:'service'};const task='a0000000-0000-4000-8000-000000000001';const patient='a0000000-0000-4000-8000-000000000002'
function assert(value:boolean,message:string){if(!value)throw new Error(message)}
function request(body:unknown,auth=true){return new Request('https://project.test/functions/v1/ai-task',{method:'POST',headers:{'content-type':'application/json',...(auth?{authorization:'Bearer user'}:{})},body:JSON.stringify(body)})}
type Options={selected?:string;model?:string;secretMissing?:boolean;mediaType?:string;calls?:Array<{name:string;args:Record<string,unknown>}>}
function factory(audience:'dentist'|'patient'='dentist',auditFails=false,options:Options={}){
  const caller={auth:{getUser:async()=>({data:{user:{id:'user'}},error:null})},rpc:async()=>({data:[{task_id:task,prompt_text:'safe',output_schema:{},context:options.mediaType?{mediaPath:'private/photo'}:{},required_fields:audience==='dentist'?['subjective']:[],audience}],error:null})}
  const service={rpc:async(name:string,args:Record<string,unknown>)=>{
    options.calls?.push({name,args})
    return name==='ai_daily_limit'?{data:audience==='patient'?5:15,error:null}:name==='consume_api_limit'?{data:true,error:null}:name==='ai_task_provider_secret'?{data:options.secretMissing?[]:[{provider:options.selected??'openai',model:options.model??(options.selected==='anthropic'?'claude-haiku-4-5-20251001':'model'),secret:'secret-value-long-enough'}],error:null}:name==='complete_ai_task'&&auditFails?{data:null,error:{message:'write failed'}}:{data:null,error:null}
  },storage:{from:()=>({download:async()=>({data:new Blob(['fixture'],{type:options.mediaType}),error:null})})}}
  return((_u:string,key:string)=>key==='public'?caller:service) as unknown as typeof createClient
}
const dentistProvider:AiProvider=async()=>({output:{subjective:'Pain reported',objective:'Not supplied',assessment:'Needs review',plan:'Examine',cautions:[]},requestId:'r1',inputTokens:10,outputTokens:20})
const patientProvider:AiProvider=async()=>({output:{summary:'Your information has been organized.',urgency:'soon',guidance:['Book a dental visit.'],redFlags:['Seek urgent care for breathing difficulty.'],bookingRecommended:true,disclaimer:'This is general information, not a diagnosis or prescription.'},requestId:'r2',inputTokens:10,outputTokens:20})
Deno.test('ai task fails closed without config',async()=>assert((await createAiTaskHandler({})(request({}))).status===503,'503'))
Deno.test('ai task rejects invalid input',async()=>assert((await createAiTaskHandler(config,factory(),dentistProvider)(request({taskType:'bad'}))).status===400,'400'))
Deno.test('dentist receives reviewable draft',async()=>{const response=await createAiTaskHandler(config,factory(),dentistProvider)(request({taskType:'clinical_note',encounterId:patient,input:'Draft from these facts'}));const body=await response.json();assert(response.status===200,'200');assert(body.data.status==='awaiting_review','review')})
Deno.test('patient receives only safe output',async()=>{const response=await createAiTaskHandler(config,factory('patient'),patientProvider)(request({taskType:'symptom_intake',patientProfileId:patient,input:'Pain for two days'}));const body=await response.json();assert(response.status===200,'200');assert(body.data.output.urgency==='soon','safe')})
Deno.test('patient diagnostic output is blocked',async()=>{const unsafe:AiProvider=async()=>({...(await patientProvider({} as never)),output:{summary:'You have an abscess.',urgency:'urgent',guidance:['Book now'],redFlags:[],bookingRecommended:true,disclaimer:'This is general information, not medical advice.'}});assert((await createAiTaskHandler(config,factory('patient'),unsafe)(request({taskType:'symptom_intake',patientProfileId:patient,input:'Pain for two days'}))).status===422,'422')})
Deno.test('Bangla diagnostic and medicine language is blocked',async()=>{const unsafe:AiProvider=async()=>({...(await patientProvider({} as never)),output:{summary:'এটি রোগ নির্ণয়।',urgency:'urgent',guidance:['এই ওষুধ খান।'],redFlags:[],bookingRecommended:true,disclaimer:'এটি শুধু সাধারণ তথ্য, রোগ নির্ণয় বা প্রেসক্রিপশন নয়।'}});assert((await createAiTaskHandler(config,factory('patient'),unsafe)(request({taskType:'symptom_intake',patientProfileId:patient,input:'দুই দিন ধরে দাঁতে ব্যথা',locale:'bn'}))).status===422,'422')})
Deno.test('AI output is withheld when audit persistence fails',async()=>assert((await createAiTaskHandler(config,factory('patient',true),patientProvider)(request({taskType:'symptom_intake',patientProfileId:patient,input:'Pain for two days'}))).status===500,'500'))

for(const selected of ['openai','anthropic'])Deno.test(selected+' routes strictly from task-bound credentials and persists review audit',async()=>{
  const calls:Array<{name:string;args:Record<string,unknown>}>=[];let open=0,claude=0
  const openProvider:AiProvider=async input=>{open++;return await dentistProvider(input)}
  const claudeProvider:AiProvider=async input=>{claude++;assert(input.model==='claude-haiku-4-5-20251001','pinned');return await dentistProvider(input)}
  const response=await createAiTaskHandler(config,factory('dentist',false,{selected,calls}),openProvider,claudeProvider)(request({taskType:'clinical_note',encounterId:patient,input:'Draft recorded facts'}))
  const body=await response.json();assert(response.status===200&&body.data.status==='awaiting_review','draft only')
  assert(open===(selected==='openai'?1:0)&&claude===(selected==='anthropic'?1:0),'no other provider')
  assert(calls.some(call=>call.name==='ai_task_provider_secret'&&call.args.target_task_id===task),'task-bound lookup')
  assert(!calls.some(call=>call.name==='ai_provider_secret'),'no global lookup')
  assert(calls.some(call=>call.name==='complete_ai_task'&&call.args.target_provider_request_id==='r1'),'audit persisted')
})
for(const selected of ['openai','anthropic'])Deno.test(selected+' validates output schema locally before releasing drafts',async()=>{
  const malformed:AiProvider=async()=>({output:{subjective:42},requestId:'r',inputTokens:1,outputTokens:1})
  const response=await createAiTaskHandler(config,factory('dentist',false,{selected}),malformed,malformed)(request({taskType:'clinical_note',encounterId:patient,input:'Draft recorded facts'}))
  assert(response.status===502&&(await response.json()).error.code==='AI_OUTPUT_INVALID','schema fail closed')
})
Deno.test('Anthropic patient safety and audit persistence gates match OpenAI',async()=>{
  const unsafe:AiProvider=async()=>({...await patientProvider({} as never),output:{...((await patientProvider({} as never)).output),summary:'You have an abscess.'}})
  const body={taskType:'symptom_intake',patientProfileId:patient,input:'Pain for two days'}
  assert((await createAiTaskHandler(config,factory('patient',false,{selected:'anthropic'}),patientProvider,unsafe)(request(body))).status===422,'diagnosis blocked')
  assert((await createAiTaskHandler(config,factory('patient',true,{selected:'anthropic'}),patientProvider,patientProvider)(request(body))).status===500,'audit fail closed')
})
Deno.test('Anthropic failures are sanitized and never fall back to OpenAI',async()=>{
  let open=0;const calls:Array<{name:string;args:Record<string,unknown>}>=[]
  const response=await createAiTaskHandler(config,factory('dentist',false,{selected:'anthropic',calls}),async input=>{open++;return await dentistProvider(input)},()=>{throw new Error('private upstream detail')})(request({taskType:'clinical_note',encounterId:patient,input:'Draft recorded facts'}))
  assert(response.status===502&&open===0,'no fallback');assert(!(await response.text()).includes('private'),'sanitized response');assert(!JSON.stringify(calls).includes('private upstream'),'sanitized audit')
})
for(const options of [{secretMissing:true},{selected:'unknown'},{selected:'anthropic',model:'wrong-model'}])Deno.test('invalid task provider configuration fails closed '+JSON.stringify(options),async()=>{
  let invoked=false;const provider:AiProvider=async input=>{invoked=true;return await dentistProvider(input)}
  const response=await createAiTaskHandler(config,factory('dentist',false,options),provider,provider)(request({taskType:'clinical_note',encounterId:patient,input:'Draft recorded facts'}))
  assert(response.status===503&&!invoked,'provider not contacted')
})
Deno.test('raw DICOM is rejected and its failure is audited',async()=>{
  let invoked=false;const calls:Array<{name:string;args:Record<string,unknown>}>=[];const provider:AiProvider=async input=>{invoked=true;return await dentistProvider(input)}
  const response=await createAiTaskHandler(config,factory('dentist',false,{selected:'anthropic',mediaType:'application/dicom',calls}),provider,provider)(request({taskType:'xray_observation',encounterId:patient,mediaId:patient,input:'Review image quality'}))
  assert(response.status===502&&!invoked,'unsupported media');assert(calls.some(call=>call.name==='complete_ai_task'&&call.args.target_error==='AI_MEDIA_UNSUPPORTED'),'audited failure')
})
for(const contentType of ['image/jpeg','image/png'])Deno.test('Anthropic receives validated '+contentType+' photos',async()=>{
  const provider:AiProvider=async input=>{assert(input.image?.contentType===contentType&&Boolean(input.image.data),'image included');return{output:{quality:'limited',qualityNotes:[],visibleObservations:[],limitations:['Clinician review required'],experimental:false},requestId:'photo',inputTokens:1,outputTokens:2}}
  assert((await createAiTaskHandler(config,factory('dentist',false,{selected:'anthropic',mediaType:contentType}),dentistProvider,provider)(request({taskType:'photo_quality',encounterId:patient,mediaId:patient,input:'Check image quality'}))).status===200,'photo draft')
})
Deno.test('null AI request is rejected cleanly',async()=>assert((await createAiTaskHandler(config,factory(),dentistProvider)(request(null))).status===400,'400'))
Deno.test('Anthropic task preserves a dynamically configured Claude model',async()=>{
  const model='claude-sonnet-4-5-20250929';let received=''
  const provider:AiProvider=async input=>{received=input.model;return await dentistProvider(input)}
  const response=await createAiTaskHandler(config,factory('dentist',false,{selected:'anthropic',model}),dentistProvider,provider)(request({taskType:'clinical_note',encounterId:patient,input:'Draft recorded facts'}))
  assert(response.status===200&&received===model,'configured model preserved')
})
