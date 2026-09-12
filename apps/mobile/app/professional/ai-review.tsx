// THESIS: AI appears as a pencilled clinical draft beside the ledger. OWN-WORLD: ink review rail, mint confirmations, explicit experimental warning. STORY: choose task, supply facts, inspect each field, accept only after all checks. FIRST VIEWPORT: safety boundary and task selector. FORM: review folio.
import { aiReviewSchema, aiTaskRequestSchema } from '@amar-dentist/domain'
import { useQueryClient } from '@tanstack/react-query'
import { Redirect, Stack, useLocalSearchParams } from 'expo-router'
import { BrainCircuit, Check, FlaskConical, ShieldAlert } from 'lucide-react-native'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Field } from '../../src/components/Field'
import { Screen } from '../../src/components/Screen'
import { SectionCard } from '../../src/components/SectionCard'
import { openClinicalEncounter } from '../../src/lib/phase4'
import { subscribeToAccessRefresh } from '../../src/lib/access-refresh'
import { getAiFeatureFlags, reviewAiTask, runAiTask, type AiTaskResult } from '../../src/lib/phase6'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, radius, spacing } from '../../src/theme'

type DentistTask='clinical_note'|'prescription'|'photo_quality'|'oral_photo_observation'|'xray_observation'
export default function AiReviewScreen(){
  const {profile,loading}=useAuth()
  const {appointmentId}=useLocalSearchParams<{appointmentId:string}>()
  if(loading)return null
  if(!profile)return <Redirect href="/"/>
  if(!profile.roles.includes('dentist'))return <Redirect href="/dashboard"/>
  return <AiReviewEditor key={`${profile.id}:${appointmentId ?? ''}`}/>
}

function AiReviewEditor(){
  const{appointmentId}=useLocalSearchParams<{appointmentId:string}>();const{profile,loading}=useAuth();const{t,locale}=useLocale();const[taskType,setTaskType]=useState<DentistTask>('clinical_note');const[input,setInput]=useState('');const[result,setResult]=useState<AiTaskResult|null>(null);const[values,setValues]=useState<Record<string,string>>({});const[reviewed,setReviewed]=useState<Record<string,boolean>>({});const[busy,setBusy]=useState(false);const[message,setMessage]=useState<string|null>(null);const[aiEnabled,setAiEnabled]=useState(false);const[xrayEnabled,setXrayEnabled]=useState(false)
  const queryClient=useQueryClient()
  const mounted=useRef(true)
  const generation=useRef(0);const pendingOperation=useRef(false);const currentTask=useRef<DentistTask>('clinical_note')
  const features=useRef({dentist:false,xray:false})
  const[flagState,setFlagState]=useState<'loading'|'ready'|'error'>('loading')
  const permitted=()=>features.current.dentist&&(currentTask.current!=='xray_observation'||features.current.xray)
  const discard=()=>{++generation.current;pendingOperation.current=false;setBusy(false);setResult(null);setValues({});setReviewed({});setMessage(null)}
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;++generation.current}},[])
  const complete=useMemo(()=>Boolean(result)&&result!.requiredFields.every((field)=>reviewed[field]),[result,reviewed])
  const changeTask=(next:DentistTask)=>{if(next===currentTask.current)return;currentTask.current=next;discard();setTaskType(next)}
  useEffect(()=>{
    let cancelled=false;let pending=false
    const refresh=async()=>{
      if(pending)return;pending=true
      try{const flags=await getAiFeatureFlags();if(!cancelled){
        features.current={dentist:flags.dentistAi,xray:flags.dentistAi&&flags.experimentalXrayAi}
        setAiEnabled(features.current.dentist);setXrayEnabled(features.current.xray);setFlagState('ready')
        if(!permitted())discard()
      }}
      catch{if(!cancelled){features.current={dentist:false,xray:false};setAiEnabled(false);setXrayEnabled(false);setFlagState('error');discard()}}finally{pending=false}
    }
    void refresh();const stop=subscribeToAccessRefresh(()=>{void refresh()})
    return()=>{cancelled=true;stop()}
  },[profile?.id])
  if(!loading&&!profile)return<Redirect href="/"/>;if(!profile)return null
  const canUseTask=aiEnabled&&(taskType!=='xray_observation'||xrayEnabled)
  const generate=async()=>{
    if(!mounted.current||pendingOperation.current)return
    if(!permitted())return setMessage(t('aiFeatureDisabled'))
    const ticket=++generation.current;const task=currentTask.current
    const current=()=>mounted.current&&ticket===generation.current&&task===currentTask.current&&permitted()
    pendingOperation.current=true
    setBusy(true);setMessage(null)
    try{
      if(!appointmentId)throw new Error('ENCOUNTER_REQUIRED')
      const record=await openClinicalEncounter(appointmentId)
      if(!current())return
      const mediaTask=!['clinical_note','prescription'].includes(taskType)
      const media=mediaTask?record.media.find((item)=>taskType==='xray_observation'?item.kind==='xray':item.kind==='photograph'):null
      const parsed=aiTaskRequestSchema.safeParse({taskType,encounterId:record.encounter.id,patientProfileId:null,mediaId:media?.id??null,input,locale})
      if(!parsed.success)return setMessage(mediaTask&&!media?t('aiMediaRequired'):t('aiDescribeMore'))
      const next=await runAiTask(parsed.data)
      if(!current())return
      setResult(next);setValues(Object.fromEntries(Object.entries(next.output).map(([key,value])=>[key,typeof value==='string'?value:JSON.stringify(value,null,2)])));setReviewed({})
    }catch(error){if(current())setMessage(error instanceof Error&&error.message==='AI_PROVIDER_NOT_CONFIGURED'?t('aiNotConfigured'):error instanceof Error&&error.message==='AI_FEATURE_DISABLED'?t('aiFeatureDisabled'):t('aiUnavailable'))}
    finally{if(current()){pendingOperation.current=false;setBusy(false)}}
  }
  const accept=async()=>{
    if(!mounted.current||pendingOperation.current||!permitted()||!result||!complete)return
    const ticket=++generation.current;const task=currentTask.current
    const current=()=>mounted.current&&ticket===generation.current&&task===currentTask.current&&permitted()
    pendingOperation.current=true
    setBusy(true);setMessage(null)
    try{
      const finalOutput=Object.fromEntries(Object.entries(values).map(([key,value])=>{try{return[key,JSON.parse(value)]}catch{return[key,value]}}))
      const parsed=aiReviewSchema.parse({taskId:result.taskId,reviewedFields:reviewed,finalOutput,changeSummary:'Every required field reviewed by the treating dentist'})
      await reviewAiTask(parsed)
      if(!current())return
      if(appointmentId)await queryClient.invalidateQueries({queryKey:['clinical-encounter',appointmentId]})
      if(!current())return
      setMessage(t('aiDraftAccepted'));setResult(null)
    }catch{if(current())setMessage(t('aiUnavailable'))}finally{if(current()){pendingOperation.current=false;setBusy(false)}}
  }
  const tasks:[DentistTask,string][]=[['clinical_note',t('aiClinicalNote')],['prescription',t('aiPrescription')],['photo_quality',t('aiPhotoQuality')],['oral_photo_observation',t('aiOralPhoto')],...(xrayEnabled?([['xray_observation',t('aiXrayExperimental')]] as [DentistTask,string][]):[])]
  return<Screen maxWidth={900} style={styles.screen}><Stack.Screen options={{title:t('aiReviewWorkspace'),headerBackTitle:t('back')}}/><View style={styles.hero}><View style={styles.icon}><BrainCircuit size={28} color={colors.mint}/></View><Text style={styles.kicker}>{t('aiDentistEyebrow')}</Text><Text style={styles.title}>{t('aiReviewWorkspace')}</Text><Text style={styles.subtitle}>{t('aiDentistBody')}</Text></View><View style={styles.warning}><ShieldAlert size={19} color={colors.teal}/><Text style={styles.warningText}>{t('aiDentistSafety')}</Text></View>
    <View style={styles.tabs}>{tasks.map(([value,label])=><Pressable key={value} onPress={()=>changeTask(value)} accessibilityRole="tab" accessibilityState={{selected:taskType===value}} style={[styles.tab,taskType===value&&styles.tabActive]}><Text style={[styles.tabText,taskType===value&&styles.tabTextActive]}>{label}</Text></Pressable>)}</View>
    {taskType==='xray_observation'?<View style={styles.experimental}><FlaskConical size={18} color={colors.danger}/><Text style={styles.experimentalText}>{t('aiXrayWarning')}</Text></View>:null}
    <SectionCard eyebrow={t('aiFactsOnly').toUpperCase()} title={t('aiDraftRequest')}><Field label={t('aiClinicalContext')} value={input} onChangeText={setInput} editable={canUseTask} multiline numberOfLines={5} textAlignVertical="top" placeholder={t('aiClinicalPromptPlaceholder')}/>{flagState==='loading'?<ActivityIndicator color={colors.teal}/>:!canUseTask?<Text accessibilityRole="alert" style={styles.message}>{t(flagState==='error'?'aiUnavailable':'aiFeatureDisabled')}</Text>:message?<Text accessibilityRole="alert" style={styles.message}>{message}</Text>:null}<Button label={t('aiGenerateDraft')} disabled={!canUseTask} loading={busy} onPress={()=>void generate()}/></SectionCard>
    {result?<SectionCard eyebrow={t('aiRequiresReview').toUpperCase()} title={t('aiReviewEveryField')}>{result.requiredFields.map((field)=><View key={field} style={styles.fieldReview}><Field label={field.replace(/([A-Z])/g,' $1')} value={values[field]??''} onChangeText={(value)=>{setValues((current)=>({...current,[field]:value}));setReviewed((current)=>({...current,[field]:false}))}} multiline numberOfLines={field==='items'?7:4} textAlignVertical="top"/><Pressable accessibilityRole="checkbox" accessibilityState={{checked:Boolean(reviewed[field])}} onPress={()=>setReviewed((current)=>({...current,[field]:!current[field]}))} style={[styles.check,reviewed[field]&&styles.checkActive]}>{reviewed[field]?<Check size={18} color={colors.paper}/>:null}<Text style={[styles.checkText,reviewed[field]&&styles.checkTextActive]}>{reviewed[field]?t('aiFieldReviewed'):t('aiMarkReviewed')}</Text></Pressable></View>)}<Button label={t('aiAcceptReviewed')} disabled={!complete} loading={busy} onPress={()=>void accept()}/></SectionCard>:null}
  </Screen>
}
const styles=StyleSheet.create({screen:{paddingTop:spacing.xl,gap:spacing.lg},hero:{gap:spacing.sm},icon:{width:54,height:54,borderRadius:27,backgroundColor:colors.inkDeep,alignItems:'center',justifyContent:'center'},kicker:{color:colors.teal,fontSize:11,fontWeight:'800',letterSpacing:1.2},title:{color:colors.inkDeep,fontSize:34,lineHeight:39,fontWeight:'800',letterSpacing:-1.1},subtitle:{color:colors.muted,fontSize:14,lineHeight:22},warning:{flexDirection:'row',gap:spacing.sm,padding:spacing.md,backgroundColor:colors.mintSoft,borderRadius:radius.md},warningText:{flex:1,color:colors.teal,fontSize:12,lineHeight:18},tabs:{flexDirection:'row',flexWrap:'wrap',gap:spacing.sm},tab:{minHeight:44,justifyContent:'center',paddingHorizontal:13,borderWidth:1,borderColor:colors.line,borderRadius:radius.pill,backgroundColor:colors.paper},tabActive:{backgroundColor:colors.inkDeep,borderColor:colors.inkDeep},tabText:{color:colors.text,fontSize:12,fontWeight:'700'},tabTextActive:{color:colors.paper},experimental:{flexDirection:'row',gap:spacing.sm,padding:spacing.md,borderRadius:radius.md,backgroundColor:'#FFF0F0'},experimentalText:{flex:1,color:colors.danger,fontSize:12,lineHeight:18,fontWeight:'700'},message:{color:colors.teal,fontSize:12,lineHeight:18},fieldReview:{gap:spacing.sm,paddingBottom:spacing.md,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:colors.line},check:{minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:spacing.sm,borderRadius:radius.md,borderWidth:1,borderColor:colors.line,backgroundColor:colors.paper},checkActive:{backgroundColor:colors.teal,borderColor:colors.teal},checkText:{color:colors.text,fontWeight:'700'},checkTextActive:{color:colors.paper}})
