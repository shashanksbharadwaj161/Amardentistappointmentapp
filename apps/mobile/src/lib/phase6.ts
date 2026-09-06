import type { AiReviewInput, AiTaskRequest, PatientGuidance } from '@amar-dentist/domain'
import { supabase } from './supabase'

const previewEnabled = process.env.EXPO_PUBLIC_DEMO_MODE === 'true'
const previewTaskId = 'a0000000-0000-4000-8000-000000000001'

export type AiTaskResult = { taskId:string; status:'awaiting_review'|'completed'; output:Record<string,unknown>; requiredFields:string[] }

function preview(request:AiTaskRequest):AiTaskResult {
  if(request.taskType==='clinical_note')return{taskId:previewTaskId,status:'awaiting_review',requiredFields:['subjective','objective','assessment','plan'],output:{subjective:request.input,objective:'Visible findings were not supplied; complete after examination.',assessment:'Insufficient information — dentist assessment required.',plan:'Complete examination, review history, and discuss the care plan.',cautions:['Demo draft: verify every statement against the patient and examination.']}}
  if(request.taskType==='prescription')return{taskId:previewTaskId,status:'awaiting_review',requiredFields:['rationale','allergyWarnings','items'],output:{rationale:'No medication suggested because clinical facts and contraindications require dentist review.',allergyWarnings:['Review the complete allergy and medication history.'],items:[]}}
  if(['photo_quality','oral_photo_observation','xray_observation'].includes(request.taskType))return{taskId:previewTaskId,status:'awaiting_review',requiredFields:['quality','qualityNotes','visibleObservations','limitations'],output:{quality:'limited',qualityNotes:['Keep the area centered and use even lighting.'],visibleObservations:['No diagnostic statement is generated in preview mode.'],limitations:['A photograph or X-ray cannot replace a clinical examination.'],experimental:request.taskType==='xray_observation'}}
  const output:PatientGuidance={summary:request.taskType==='record_explanation'?'Your finalized record can be explained here after a provider key is connected.':'Your symptoms have been organized for a dental visit.',urgency:'soon',guidance:['Arrange a dental appointment if symptoms continue or worsen.','Keep the area clean and avoid anything that clearly triggers pain.'],redFlags:['Seek urgent local care for trouble breathing, rapidly increasing swelling, uncontrolled bleeding, or major facial injury.'],bookingRecommended:true,disclaimer:'This is general information only. It is not a diagnosis or prescription.'}
  return{taskId:previewTaskId,status:'completed',requiredFields:[],output}
}

export async function runAiTask(request:AiTaskRequest):Promise<AiTaskResult>{
  if(!supabase||previewEnabled)return preview(request)
  const{data,error}=await supabase.functions.invoke('ai-task',{body:request})
  if(error||!data?.ok)throw new Error(data?.error?.code??error?.message??'AI_TASK_FAILED')
  return data.data as AiTaskResult
}

export async function reviewAiTask(input:AiReviewInput){
  if(!supabase||previewEnabled)return
  const{error}=await supabase.rpc('apply_reviewed_ai_task',{target_task_id:input.taskId,target_reviewed_fields:input.reviewedFields,target_final_output:input.finalOutput,change_summary:input.changeSummary})
  if(error)throw new Error(error.message)
}

export async function getAiFeatureFlags(){
  if(!supabase||previewEnabled)return{dentistAi:true,patientAi:true,experimentalXrayAi:false}
  const{data,error}=await supabase.from('feature_flags').select('flag_key,enabled').in('flag_key',['dentist_ai','patient_ai','experimental_xray_ai'])
  if(error)throw new Error(error.message)
  const enabled=(key:string)=>Boolean(data?.find((item)=>item.flag_key===key)?.enabled)
  return{dentistAi:enabled('dentist_ai'),patientAi:enabled('patient_ai'),experimentalXrayAi:enabled('experimental_xray_ai')}
}

export async function getPatientAiHistory(patientProfileId:string){
  if(!supabase||previewEnabled)return[]
  const{data,error}=await supabase.from('patient_ai_messages').select('id,user_message,safe_response,created_at').eq('patient_profile_id',patientProfileId).order('created_at',{ascending:false}).limit(10)
  if(error)throw new Error(error.message)
  return(data??[]).map((row)=>({id:row.id,userMessage:row.user_message,response:row.safe_response as PatientGuidance,createdAt:row.created_at}))
}
