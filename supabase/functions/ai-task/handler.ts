import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { json } from '../_shared/http.ts'
import { requestHaikuDraft } from './anthropic.ts'

const taskTypes = new Set(['clinical_note','prescription','photo_quality','oral_photo_observation','xray_observation','record_explanation','symptom_intake','general_guidance'])
const patientTasks = new Set(['record_explanation','symptom_intake','general_guidance'])
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const diagnosticTerms = /(?:\b(?:diagnos(?:e|ed|is)|you have|prescri(?:be|bed|ption)|take\s+\d+\s*(?:mg|tablet|capsule)|definitely|certainly)\b|রোগ\s*নির্ণ[য়য়]|প্রেসক্রাইব|প্রেসক্রিপশন|ওষুধ\s*(?:খান|খেতে)|ট্যাবলেট|মি\.?\s*গ্রা\.?|নিশ্চিত(?:ভাবে)?)/iu

type Prepared = { task_id:string; prompt_text:string; output_schema:Record<string,unknown>; context:Record<string,unknown>; required_fields:string[]; audience:'dentist'|'patient' }
type ProviderResult = { output:Record<string,unknown>; requestId:string; inputTokens:number; outputTokens:number }
export type AiConfig = { supabaseUrl?:string; publishableKey?:string; serviceRoleKey?:string; openAiUrl?:string }
export type AiProvider = (input:{apiKey:string;model:string;systemPrompt:string;message:string;context:Record<string,unknown>;schema:Record<string,unknown>;image?:{contentType:string;data:string};taskType:string})=>Promise<ProviderResult>

const schemas:Record<string,Record<string,unknown>>={
  clinical_note:{type:'object',additionalProperties:false,properties:{subjective:{type:'string'},objective:{type:'string'},assessment:{type:'string'},plan:{type:'string'},cautions:{type:'array',items:{type:'string'}}},required:['subjective','objective','assessment','plan','cautions']},
  prescription:{type:'object',additionalProperties:false,properties:{rationale:{type:'string'},allergyWarnings:{type:'array',items:{type:'string'}},items:{type:'array',items:{type:'object',additionalProperties:false,properties:{medicineName:{type:'string'},strength:{type:'string'},dosage:{type:'string'},route:{type:'string'},frequency:{type:'string'},duration:{type:'string'},instructions:{type:'string'}},required:['medicineName','strength','dosage','route','frequency','duration','instructions']}}},required:['rationale','allergyWarnings','items']},
  image:{type:'object',additionalProperties:false,properties:{quality:{type:'string',enum:['insufficient','limited','adequate']},qualityNotes:{type:'array',items:{type:'string'}},visibleObservations:{type:'array',items:{type:'string'}},limitations:{type:'array',items:{type:'string'}},experimental:{type:'boolean'}},required:['quality','qualityNotes','visibleObservations','limitations','experimental']},
  patient:{type:'object',additionalProperties:false,properties:{summary:{type:'string'},urgency:{type:'string',enum:['routine','soon','urgent','emergency']},guidance:{type:'array',items:{type:'string'},minItems:1},redFlags:{type:'array',items:{type:'string'}},bookingRecommended:{type:'boolean'},disclaimer:{type:'string'}},required:['summary','urgency','guidance','redFlags','bookingRecommended','disclaimer']},
}

function schemaFor(taskType:string){return taskType==='clinical_note'?schemas.clinical_note:taskType==='prescription'?schemas.prescription:patientTasks.has(taskType)?schemas.patient:schemas.image}
function patientSafe(value:Record<string,unknown>){const text=[value.summary,...(Array.isArray(value.guidance)?value.guidance:[]),...(Array.isArray(value.redFlags)?value.redFlags:[])].join(' ');return ['routine','soon','urgent','emergency'].includes(String(value.urgency))&&Array.isArray(value.guidance)&&value.guidance.length>0&&typeof value.disclaimer==='string'&&value.disclaimer.length>=20&&!diagnosticTerms.test(text)}

// Validate both providers locally; neither structured-output API nor injected
// transports are allowed to bypass the clinical/patient output contract.
function validateOutput(value:unknown,schema:Record<string,unknown>):Record<string,unknown>{
  const visit=(item:unknown,rule:Record<string,unknown>,depth=0):boolean=>{
    if(depth>8)return false
    if(rule.type==='string')return typeof item==='string'&&item.length<=12000&&(!Array.isArray(rule.enum)||rule.enum.includes(item))
    if(rule.type==='boolean')return typeof item==='boolean'
    if(rule.type==='array')return Array.isArray(item)&&item.length<=100&&item.length>=Number(rule.minItems??0)&&item.every(entry=>visit(entry,rule.items as Record<string,unknown>,depth+1))
    if(rule.type==='object'){
      if(!item||typeof item!=='object'||Array.isArray(item))return false
      const object=item as Record<string,unknown>, properties=rule.properties as Record<string,Record<string,unknown>>
      return (rule.required as string[]??[]).every(key=>Object.hasOwn(object,key))&&Object.entries(object).every(([key,entry])=>Object.hasOwn(properties,key)&&visit(entry,properties[key],depth+1))
    }
    return false
  }
  if(!visit(value,schema))throw new Error('AI_OUTPUT_INVALID')
  return value as Record<string,unknown>
}
function haikuProvider():AiProvider{return async input=>{
  return await requestHaikuDraft({
    apiKey:input.apiKey,model:input.model,systemPrompt:input.systemPrompt,
    message:JSON.stringify({request:input.message,clinicalContext:input.context}),
    schema:schemaFor(input.taskType),image:input.image,
  },value=>validateOutput(value,schemaFor(input.taskType)))
}}
function liveProvider(config:AiConfig):AiProvider{return async(input)=>{
  const format=schemaFor(input.taskType)
  const userContent:Array<Record<string,unknown>>=[{type:'input_text',text:JSON.stringify({request:input.message,clinicalContext:input.context})}]
  if(input.image)userContent.push({type:'input_image',image_url:`data:${input.image.contentType};base64,${input.image.data}`,detail:'high'})
  const response=await fetch(config.openAiUrl??'https://api.openai.com/v1/responses',{method:'POST',redirect:'error',signal:AbortSignal.timeout(30000),headers:{authorization:`Bearer ${input.apiKey}`,'content-type':'application/json'},body:JSON.stringify({model:input.model,store:false,input:[{role:'system',content:input.systemPrompt},{role:'user',content:userContent}],text:{format:{type:'json_schema',name:`amar_${input.taskType}`,strict:true,schema:format}}})})
  const body=await response.json().catch(()=>({})) as Record<string,unknown>
  if(!response.ok)throw new Error('AI_PROVIDER_FAILED')
  const outputText=typeof body.output_text==='string'?body.output_text:(body.output as Array<{content?:Array<{text?:string}>}>|undefined)?.flatMap((item)=>item.content??[]).map((item)=>item.text??'').join('')??''
  let output:Record<string,unknown>;try{output=JSON.parse(outputText)}catch{throw new Error('AI_OUTPUT_INVALID')}
  const usage=(body.usage??{}) as Record<string,number>
  return{output,requestId:String(body.id??''),inputTokens:Number(usage.input_tokens??0),outputTokens:Number(usage.output_tokens??0)}
}}

export function createAiTaskHandler(config:AiConfig,clientFactory:typeof createClient=createClient,provider:AiProvider=liveProvider(config),anthropicProvider:AiProvider=haikuProvider()){
  return async(request:Request)=>{
    if(!config.supabaseUrl||!config.publishableKey||!config.serviceRoleKey)return json(503,{ok:false,error:{code:'SERVICE_NOT_CONFIGURED'}})
    if(request.method!=='POST')return json(405,{ok:false,error:{code:'METHOD_NOT_ALLOWED'}})
    const authorization=request.headers.get('authorization');if(!authorization)return json(401,{ok:false,error:{code:'UNAUTHENTICATED'}})
    let body:{taskType?:string;encounterId?:string|null;patientProfileId?:string|null;mediaId?:string|null;input?:string;locale?:string};try{body=await request.json()}catch{return json(400,{ok:false,error:{code:'INVALID_INPUT'}})}
    if(!body||typeof body!=='object'||Array.isArray(body)||!body.taskType||!taskTypes.has(body.taskType)||typeof body.input!=='string'||body.input.trim().length<3||body.input.length>12000||!['en','bn'].includes(body.locale??'en')||[body.encounterId,body.patientProfileId,body.mediaId].some((value)=>value!=null&&!uuid.test(value)))return json(400,{ok:false,error:{code:'INVALID_INPUT'}})
    const caller=clientFactory(config.supabaseUrl,config.publishableKey,{global:{headers:{authorization}}});const auth=await caller.auth.getUser();if(auth.error||!auth.data.user)return json(401,{ok:false,error:{code:'UNAUTHENTICATED'}})
    const preparedResult=await caller.rpc('prepare_ai_task',{target_task_type:body.taskType,target_encounter_id:body.encounterId??null,target_patient_profile_id:body.patientProfileId??null,target_media_id:body.mediaId??null,user_input:body.input.trim(),target_locale:body.locale??'en'})
    const prepared=preparedResult.data?.[0] as Prepared|undefined;if(preparedResult.error||!prepared)return json(403,{ok:false,error:{code:preparedResult.error?.message??'AI_TASK_DENIED'}})
    const service=clientFactory(config.supabaseUrl,config.serviceRoleKey,{auth:{persistSession:false}})
    const configuredLimit=await service.rpc('ai_daily_limit',{actor:auth.data.user.id,target_audience:prepared.audience});if(configuredLimit.error||typeof configuredLimit.data!=='number')return json(503,{ok:false,error:{code:'AI_LIMIT_UNAVAILABLE'}})
    const limit=await service.rpc('consume_api_limit',{actor:auth.data.user.id,target_scope:`ai:${prepared.audience}`,max_requests:configuredLimit.data,window_minutes:1440});if(limit.error)return json(503,{ok:false,error:{code:'AI_LIMIT_UNAVAILABLE'}});if(limit.data!==true)return json(429,{ok:false,error:{code:'AI_RATE_LIMITED'}})
    const secretResult=await service.rpc('ai_task_provider_secret',{target_task_id:prepared.task_id});const secret=secretResult.data?.[0] as {provider:'openai'|'anthropic';model:string;secret:string}|undefined
    if(secretResult.error||!secret||!['openai','anthropic'].includes(secret.provider)||typeof secret.secret!=='string'||!secret.secret||typeof secret.model!=='string'||(secret.provider==='anthropic'&&(!/^claude-[a-z0-9][a-z0-9._-]*$/.test(secret.model)||secret.model.length>120))){const failed=await service.rpc('complete_ai_task',{target_task_id:prepared.task_id,provider_output:{},patient_safe_output:null,target_provider_request_id:'',target_input_tokens:0,target_output_tokens:0,target_cost:0,target_error:'AI_PROVIDER_NOT_CONFIGURED'});return json(failed.error?500:503,{ok:false,error:{code:failed.error?'AI_AUDIT_PERSIST_FAILED':'AI_PROVIDER_NOT_CONFIGURED'}})}
    try{
    let image:undefined|{contentType:string;data:string}
    const mediaPath=String((prepared.context as Record<string,unknown>).mediaPath??'');if(mediaPath){const downloaded=await service.storage.from('clinical-media').download(mediaPath);if(downloaded.error||!downloaded.data)throw new Error('AI_MEDIA_UNAVAILABLE');if(!['image/jpeg','image/png'].includes(downloaded.data.type)||downloaded.data.size>5*1024*1024)throw new Error('AI_MEDIA_UNSUPPORTED');const bytes=new Uint8Array(await downloaded.data.arrayBuffer());let binary='';for(let index=0;index<bytes.length;index+=0x8000)binary+=String.fromCharCode(...bytes.subarray(index,index+0x8000));image={contentType:downloaded.data.type||'image/jpeg',data:btoa(binary)}}
      const result=await (secret.provider==='anthropic'?anthropicProvider:provider)({apiKey:secret.secret,model:secret.model,systemPrompt:prepared.prompt_text,message:body.input.trim(),context:prepared.context,schema:prepared.output_schema,image,taskType:body.taskType})
      result.output=validateOutput(result.output,schemaFor(body.taskType))
      if(typeof result.requestId!=='string'||!result.requestId||!Number.isSafeInteger(result.inputTokens)||result.inputTokens<0||!Number.isSafeInteger(result.outputTokens)||result.outputTokens<0)throw new Error('AI_OUTPUT_INVALID')
      const safe=prepared.audience==='patient'&&patientSafe(result.output)?result.output:null;const unsafe=prepared.audience==='patient'&&!safe
      const completed=await service.rpc('complete_ai_task',{target_task_id:prepared.task_id,provider_output:result.output,patient_safe_output:safe,target_provider_request_id:result.requestId,target_input_tokens:result.inputTokens,target_output_tokens:result.outputTokens,target_cost:0,target_error:unsafe?'AI_UNSAFE_OUTPUT_FILTERED':null})
      if(completed.error)return json(500,{ok:false,error:{code:'AI_AUDIT_PERSIST_FAILED'}})
      if(unsafe)return json(422,{ok:false,error:{code:'AI_UNSAFE_OUTPUT_FILTERED'}})
      return json(200,{ok:true,data:{taskId:prepared.task_id,status:prepared.audience==='dentist'?'awaiting_review':'completed',output:prepared.audience==='dentist'?result.output:safe,requiredFields:prepared.required_fields}})
    }catch(error){const allowed=new Set(['AI_PROVIDER_FAILED','AI_PROVIDER_UNAVAILABLE','AI_PROVIDER_RATE_LIMITED','AI_PROVIDER_AUTH_FAILED','AI_OUTPUT_INVALID','AI_MEDIA_UNSUPPORTED','AI_MEDIA_UNAVAILABLE','AI_PROVIDER_NOT_CONFIGURED']);const code=error instanceof Error&&allowed.has(error.message)?error.message:'AI_PROVIDER_FAILED';const failed=await service.rpc('complete_ai_task',{target_task_id:prepared.task_id,provider_output:{},patient_safe_output:null,target_provider_request_id:'',target_input_tokens:0,target_output_tokens:0,target_cost:0,target_error:code});return json(failed.error?500:502,{ok:false,error:{code:failed.error?'AI_AUDIT_PERSIST_FAILED':code}})}
  }
}
