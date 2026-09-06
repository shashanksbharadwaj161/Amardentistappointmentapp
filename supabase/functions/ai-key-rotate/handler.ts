import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { json } from '../_shared/http.ts'
export type RotateConfig={supabaseUrl?:string;publishableKey?:string;serviceRoleKey?:string}
export function createRotateAiKeyHandler(config:RotateConfig,clientFactory:typeof createClient=createClient){return async(request:Request)=>{
  if(!config.supabaseUrl||!config.publishableKey||!config.serviceRoleKey)return json(503,{ok:false,error:{code:'SERVICE_NOT_CONFIGURED'}})
  if(request.method!=='POST')return json(405,{ok:false,error:{code:'METHOD_NOT_ALLOWED'}})
  const authorization=request.headers.get('authorization');if(!authorization)return json(401,{ok:false,error:{code:'UNAUTHENTICATED'}})
  let body:{provider?:string;model?:string;apiKey?:string};try{body=await request.json()}catch{return json(400,{ok:false,error:{code:'INVALID_INPUT'}})}
  if(body.provider!=='openai'||typeof body.model!=='string'||body.model.trim().length<3||typeof body.apiKey!=='string'||body.apiKey.trim().length<20)return json(400,{ok:false,error:{code:'INVALID_INPUT'}})
  const caller=clientFactory(config.supabaseUrl,config.publishableKey,{global:{headers:{authorization}}});const auth=await caller.auth.getUser();if(auth.error||!auth.data.user)return json(401,{ok:false,error:{code:'UNAUTHENTICATED'}})
  const service=clientFactory(config.supabaseUrl,config.serviceRoleKey,{auth:{persistSession:false}});const roles=await service.from('user_roles').select('role').eq('user_id',auth.data.user.id);if(roles.error||!roles.data?.some((row:{role:string})=>row.role==='super_admin'))return json(403,{ok:false,error:{code:'SUPER_ADMIN_REQUIRED'}})
  const rotated=await service.rpc('rotate_ai_provider_secret',{actor:auth.data.user.id,target_provider:'openai',target_model:body.model.trim(),new_secret:body.apiKey.trim()});if(rotated.error)return json(500,{ok:false,error:{code:'AI_KEY_ROTATION_FAILED'}})
  return json(200,{ok:true,data:{provider:'openai',model:body.model.trim(),keyHint:rotated.data}})
}}
