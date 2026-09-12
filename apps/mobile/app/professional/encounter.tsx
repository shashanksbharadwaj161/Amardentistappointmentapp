import { clinicalDiagnosisSchema, clinicalEncounterSchema, prescriptionDraftSchema, toothObservationSchema, treatmentPlanSchema } from '@amar-dentist/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as DocumentPicker from 'expo-document-picker'
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router'
import { AlertTriangle, BrainCircuit, CheckCircle2, CircleDot, ClipboardPenLine, ImagePlus, Pill, Stethoscope } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Field } from '../../src/components/Field'
import { Screen } from '../../src/components/Screen'
import { SectionCard } from '../../src/components/SectionCard'
import { addDiagnosis, createAndFinalizeTreatmentPlan, finalizePrescription, getClinicalMediaDownloadUrl, getPrescribingSafetyContext, openClinicalEncounter, saveAndFinalizeEncounter, saveEncounter, savePrescription, saveToothObservation, uploadClinicalMedia } from '../../src/lib/phase4'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, radius, spacing } from '../../src/theme'

// The structured clinical note fields the dentist edits locally. Kept as one object so
// server refreshes (including notes the dentist applied from the AI review workspace on a
// separate screen) can be merged without discarding unsaved manual edits.
export type EncounterNoteFields = { complaint: string; subjective: string; objective: string; assessment: string; plan: string }
// When a refetch brings server/AI notes that clash with an unsaved local edit, both values are
// held here (keyed by field) so the dentist can deliberately keep their edit or take the update.
export type NoteConflict = { mine: string; incoming: string }
export type NoteConflicts = Partial<Record<keyof EncounterNoteFields, NoteConflict>>
const NOTE_KEYS: (keyof EncounterNoteFields)[] = ['complaint', 'subjective', 'objective', 'assessment', 'plan']
const emptyNotes: EncounterNoteFields = { complaint: '', subjective: '', objective: '', assessment: '', plan: '' }
// Existing message keys naming each structured-note field, reused for the conflict warning.
const NOTE_FIELD_LABEL = { complaint: 'chiefComplaint', subjective: 'subjective', objective: 'objective', assessment: 'assessment', plan: 'carePlan' } as const

// Merge freshly loaded server notes with the dentist's current local edits, relative to the
// baseline the local edits were derived from. A field with no unsaved local edit takes the
// server value (so notes applied elsewhere — e.g. an accepted AI draft — appear instead of a
// stale blank). A field the dentist has edited is preserved and never silently overwritten;
// when the server also changed it, the clash is reported so it is not lost silently.
export function reconcileEncounterNotes(server: EncounterNoteFields, local: EncounterNoteFields, baseline: EncounterNoteFields): { next: EncounterNoteFields; conflicts: (keyof EncounterNoteFields)[] } {
  const next: EncounterNoteFields = { ...local }
  const conflicts: (keyof EncounterNoteFields)[] = []
  for (const key of NOTE_KEYS) {
    const dirty = local[key] !== baseline[key]
    if (!dirty) { next[key] = server[key]; continue }
    if (server[key] !== baseline[key]) conflicts.push(key)
  }
  return { next, conflicts }
}

// A prescription only reaches the patient once it is finalized; anything else is a private draft
// that still needs an explicit dentist finalize (including multi-item drafts applied from AI review).
export function isPrescriptionFinalized(prescription: { status: string; finalizedAt: string | null }): boolean {
  return prescription.status === 'finalized' || prescription.finalizedAt !== null
}

// Both clinical query keys carry the authenticated account id so cached clinical data can never be
// read across accounts (e.g. after signing out and into a different account on the same device).
// The account id is placed AFTER the appointment id so prefix invalidation like
// invalidateQueries(['clinical-encounter', appointmentId]) (used by the AI review screen) still matches.
export const clinicalEncounterQueryKey = (accountId: string | undefined, appointmentId: string | undefined) => ['clinical-encounter', appointmentId, accountId] as const
export const prescribingSafetyQueryKey = (accountId: string | undefined, patientProfileId: string | undefined) => ['prescribing-safety', patientProfileId, accountId] as const

// Permission wrapper: only a signed-in dentist may reach the clinical editor, and the inner editor is
// keyed by actor id + appointment id. Any change to those — role loss, account switch, or appointment
// switch — unmounts the inner editor so all local clinical state (notes, conflicts, medication fields)
// is discarded rather than lingering after access is lost. A stable actor+appointment with unchanged
// permissions keeps the same key, so background polling preserves unsaved drafts.
export default function ClinicalEncounterScreen() {
  const { appointmentId, patientName } = useLocalSearchParams<{ appointmentId: string; patientName?: string }>()
  const { profile, loading } = useAuth()
  const canAccess = Boolean(profile && profile.roles.includes('dentist'))
  if (!loading && !canAccess) return <Redirect href="/" />
  if (!canAccess || !profile) return null
  return <ClinicalEncounterEditor key={`${profile.id}:${appointmentId ?? ''}`} actorId={profile.id} appointmentId={appointmentId} patientName={patientName} />
}

function ClinicalEncounterEditor({ actorId, appointmentId, patientName }: { actorId: string; appointmentId?: string; patientName?: string }) {
  const { t } = useLocale()
  const { width } = useWindowDimensions()
  const queryClient = useQueryClient()
  // Query execution requires dentist access: this editor only mounts under the dentist wrapper, and
  // the key is scoped to the actor so a different (or de-authorized) account never reuses cached data.
  const record = useQuery({ queryKey: clinicalEncounterQueryKey(actorId, appointmentId), queryFn: () => openClinicalEncounter(appointmentId!), enabled: Boolean(actorId && appointmentId) })
  const safetyPatientProfileId = record.data?.encounter.patientProfileId
  // Narrow allergy/medication context for the prescribing banner. RLS-gated; an empty or denied
  // result must be shown as "unknown — confirm", never as "no known allergies" (see the band below).
  const safety = useQuery({ queryKey: prescribingSafetyQueryKey(actorId, safetyPatientProfileId), queryFn: () => getPrescribingSafetyContext(safetyPatientProfileId!), enabled: Boolean(actorId && safetyPatientProfileId) })
  const [notes, setNotes] = useState<EncounterNoteFields>(emptyNotes)
  const notesRef = useRef<EncounterNoteFields>(notes)
  notesRef.current = notes
  const baselineRef = useRef<EncounterNoteFields | null>(null)
  const [conflicts, setConflicts] = useState<NoteConflicts>({})
  const conflictsRef = useRef<NoteConflicts>({})
  const [diagnosis, setDiagnosis] = useState('')
  const [diagnosisCode, setDiagnosisCode] = useState('')
  const [toothCode, setToothCode] = useState('')
  const [dentition, setDentition] = useState<'adult'|'primary'>('adult')
  const [surface, setSurface] = useState<'whole'|'mesial'|'distal'|'buccal'|'lingual'|'occlusal'|'incisal'>('whole')
  const [finding, setFinding] = useState('')
  const [medicine, setMedicine] = useState('')
  const [strength, setStrength] = useState('')
  const [dosage, setDosage] = useState('')
  const [frequency, setFrequency] = useState('')
  const [duration, setDuration] = useState('')
  const [treatmentTitle, setTreatmentTitle] = useState('')
  const [treatmentItem, setTreatmentItem] = useState('')
  const [treatmentTooth, setTreatmentTooth] = useState('')
  const [estimatedPrice, setEstimatedPrice] = useState('')
  const [mediaCaption, setMediaCaption] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const finalizingRef = useRef(false)
  // Tracks whether this editor is still mounted, so async continuations that resume after the editor
  // is unmounted (role revoked, account/appointment switch mid-request) do not run follow-on clinical
  // mutations or surface results for a no-longer-authorized actor.
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  // Merge newly loaded server notes into the editable fields. Un-edited fields adopt the server
  // value (so applied AI notes surface); an edited field is preserved, and if the server also
  // changed it the clash is recorded so neither value is lost until the dentist resolves it.
  // Returns whether any unresolved conflict now exists.
  const applyServerNotes = (server: EncounterNoteFields): boolean => {
    if (!baselineRef.current) { baselineRef.current = server; notesRef.current = server; setNotes(server); conflictsRef.current = {}; setConflicts({}); return false }
    const { next, conflicts: conflicted } = reconcileEncounterNotes(server, notesRef.current, baselineRef.current)
    const map: NoteConflicts = {}
    for (const key of NOTE_KEYS) {
      // Once raised, a conflict requires an explicit dentist choice. Advancing the
      // server baseline or fetching identical data must never dismiss that choice.
      if (conflictsRef.current[key] || conflicted.includes(key)) {
        next[key] = notesRef.current[key]
        map[key] = { mine: notesRef.current[key], incoming: server[key] }
      }
    }
    baselineRef.current = server
    notesRef.current = next
    setNotes(next)
    conflictsRef.current = map; setConflicts(map)
    return Object.keys(map).length > 0
  }

  useEffect(() => {
    const encounter = record.data?.encounter
    if (!encounter) return
    applyServerNotes({ complaint: encounter.chiefComplaint, subjective: encounter.subjectiveNotes, objective: encounter.objectiveNotes, assessment: encounter.assessment, plan: encounter.plan })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.data?.encounter])

  const updateNote = (key: keyof EncounterNoteFields, value: string) => {
    if (finalizingRef.current) return
    const updated = { ...notesRef.current, [key]: value }; notesRef.current = updated; setNotes(updated)
    if (conflictsRef.current[key]) {
      const next = { ...conflictsRef.current, [key]: { ...conflictsRef.current[key]!, mine: value } }
      conflictsRef.current = next; setConflicts(next)
    }
  }
  const keepMine = (key: keyof EncounterNoteFields) => {
    const next = { ...conflictsRef.current }; delete next[key]
    conflictsRef.current = next; setConflicts(next)
  }
  const acceptUpdated = (key: keyof EncounterNoteFields) => {
    const incoming = conflictsRef.current[key]?.incoming
    if (incoming !== undefined) { const updated = { ...notesRef.current, [key]: incoming }; notesRef.current = updated; setNotes(updated) }
    keepMine(key)
  }
  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: clinicalEncounterQueryKey(actorId, appointmentId) }) }
  const persistNotes = async (): Promise<boolean> => {
    if (Object.keys(conflictsRef.current).length > 0) { setMessage(t('resolveConflictsFirst')); return false }
    const encounterId = record.data?.encounter.id
    const current = { ...notesRef.current }
    const parsed = clinicalEncounterSchema.safeParse({ encounterId, chiefComplaint: current.complaint, subjectiveNotes: current.subjective, objectiveNotes: current.objective, assessment: current.assessment, plan: current.plan, changeReason: 'Clinical note reviewed' })
    if (!parsed.success) { setMessage(t('checkClinicalFields')); return false }
    const submitted: EncounterNoteFields = { complaint: parsed.data.chiefComplaint, subjective: parsed.data.subjectiveNotes, objective: parsed.data.objectiveNotes, assessment: parsed.data.assessment, plan: parsed.data.plan }
    try { await saveEncounter(parsed.data); baselineRef.current = submitted; return true } catch { setMessage(t('clinicalActionFailed')); return false }
  }
  const saveNotes = async () => {
    if (busy || finalizingRef.current) return
    setBusy('notes'); setMessage(null)
    const saved = await persistNotes()
    if (!mountedRef.current) return
    if (saved) { setMessage(t('clinicalDraftSaved')); await refresh() }
    setBusy(null)
  }
  const addDx = async () => {
    const parsed = clinicalDiagnosisSchema.safeParse({ encounterId: record.data?.encounter.id, code: diagnosisCode, diagnosis, notes: '' })
    if (!parsed.success) return setMessage(t('checkClinicalFields'))
    setBusy('diagnosis'); setMessage(null)
    try { await addDiagnosis(parsed.data); if (!mountedRef.current) return; setDiagnosis(''); setDiagnosisCode(''); await refresh() } catch { setMessage(t('clinicalActionFailed')) } finally { setBusy(null) }
  }
  const chartTooth = async () => {
    const parsed = toothObservationSchema.safeParse({ encounterId: record.data?.encounter.id, dentition, fdiToothCode: toothCode, surface, finding, changeReason: 'Odontogram reviewed' })
    if (!parsed.success) return setMessage(t('invalidFdiTooth'))
    setBusy('tooth'); setMessage(null)
    try { await saveToothObservation(parsed.data); if (!mountedRef.current) return; setToothCode(''); setFinding(''); await refresh() } catch { setMessage(t('clinicalActionFailed')) } finally { setBusy(null) }
  }
  const prescribe = async () => {
    const parsed = prescriptionDraftSchema.safeParse({ encounterId: record.data?.encounter.id, prescriptionId: null, instructions: t('takeAsDirected'), changeReason: 'Prescription reviewed', items: [{ medicineName: medicine, strength, dosage, route: 'oral', frequency, duration, instructions: '' }] })
    if (!parsed.success) return setMessage(t('checkClinicalFields'))
    setBusy('prescription'); setMessage(null)
    try { const prescriptionId = await savePrescription(parsed.data); if (!mountedRef.current) return; await finalizePrescription(prescriptionId); setMedicine(''); setStrength(''); setDosage(''); setFrequency(''); setDuration(''); setMessage(t('prescriptionFinalized')); await refresh() } catch { setMessage(t('clinicalActionFailed')) } finally { setBusy(null) }
  }
  const finalizeExistingPrescription = async (prescriptionId: string) => {
    setBusy(`prescription-${prescriptionId}`); setMessage(null)
    try { await finalizePrescription(prescriptionId); if (!mountedRef.current) return; setMessage(t('prescriptionFinalized')); await refresh() } catch { setMessage(t('clinicalActionFailed')) } finally { setBusy(null) }
  }
  const saveTreatmentPlan = async () => {
    const price = estimatedPrice.trim() ? Number(estimatedPrice) : null
    const parsed = treatmentPlanSchema.safeParse({ encounterId: record.data?.encounter.id, title: treatmentTitle, notes: '', items: [{ description: treatmentItem, fdiToothCode: treatmentTooth.trim() || null, estimatedPriceBdt: Number.isFinite(price) ? price : null }] })
    if (!parsed.success) return setMessage(t('checkClinicalFields'))
    setBusy('treatment'); setMessage(null)
    try { await createAndFinalizeTreatmentPlan(parsed.data, () => mountedRef.current); if (!mountedRef.current) return; setTreatmentTitle(''); setTreatmentItem(''); setTreatmentTooth(''); setEstimatedPrice(''); setMessage(t('treatmentPlanFinalized')); await refresh() } catch { setMessage(t('clinicalActionFailed')) } finally { setBusy(null) }
  }
  const attachMedia = async (kind: 'photograph' | 'xray') => {
    const encounterId = record.data?.encounter.id
    if (!encounterId) return
    const picked = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'application/dicom'], copyToCacheDirectory: true, multiple: false })
    // Access may have been revoked (role/actor/appointment change) while the picker was open; do not
    // upload clinical media for an unmounted, no-longer-authorized editor.
    if (!mountedRef.current) return
    const asset = picked.assets?.[0]
    if (picked.canceled || !asset) return
    setBusy(`media-${kind}`); setMessage(null)
    try { await uploadClinicalMedia(encounterId, kind, asset, mediaCaption, () => mountedRef.current); if (!mountedRef.current) return; setMediaCaption(''); setMessage(t('mediaUploaded')); await refresh() } catch { setMessage(t('clinicalActionFailed')) } finally { setBusy(null) }
  }
  const viewMedia = async (storagePath: string) => {
    setBusy(storagePath); setMessage(null)
    // A signed clinical-media URL fetched before access was lost must not be opened afterwards.
    try { const url = await getClinicalMediaDownloadUrl(storagePath); if (!mountedRef.current) return; if (url) await Linking.openURL(url) } catch { setMessage(t('clinicalActionFailed')) } finally { setBusy(null) }
  }
  const finalize = async () => {
    if (!record.data || busy || finalizingRef.current) return
    finalizingRef.current = true
    setBusy('finalize'); setMessage(null)
    try {
      if (Object.keys(conflictsRef.current).length > 0) { setMessage(t('resolveConflictsFirst')); return }
      // Refresh before publishing; a failed refetch means we cannot prove the notes are current,
      // so finalizing is blocked rather than risk publishing a stale record to the patient.
      const latest = await record.refetch()
      // If access was lost (role revoked / switch) while the refresh was in flight, abort before any
      // follow-on clinical mutation or state update for the now-unmounted, unauthorized editor.
      if (!mountedRef.current) return
      if (latest.isError || !latest.data) { setMessage(t('refreshFailedStale')); return }
      const e = latest.data.encounter
      const expectedNotes: EncounterNoteFields = { complaint: e.chiefComplaint, subjective: e.subjectiveNotes, objective: e.objectiveNotes, assessment: e.assessment, plan: e.plan }
      const hasConflict = applyServerNotes(expectedNotes)
      if (hasConflict) { setMessage(t('resolveConflictsFirst')); return }
      const current = { ...notesRef.current }
      const parsed = clinicalEncounterSchema.safeParse({ encounterId: e.id, chiefComplaint: current.complaint, subjectiveNotes: current.subjective, objectiveNotes: current.objective, assessment: current.assessment, plan: current.plan, changeReason: 'Clinical fields reviewed and finalized' })
      if (!parsed.success) { setMessage(t('checkClinicalFields')); return }
      await saveAndFinalizeEncounter(parsed.data, expectedNotes)
      baselineRef.current = { complaint: parsed.data.chiefComplaint, subjective: parsed.data.subjectiveNotes, objective: parsed.data.objectiveNotes, assessment: parsed.data.assessment, plan: parsed.data.plan }
      setMessage(t('encounterFinalized')); await refresh()
    } catch (error) {
      setMessage(t(error instanceof Error && error.message === 'CLINICAL_RECORD_CHANGED' ? 'refreshFailedStale' : 'clinicalActionFailed'))
    } finally { finalizingRef.current = false; setBusy(null) }
  }

  if (record.isLoading) return <Screen><ActivityIndicator color={colors.teal} /></Screen>
  // Only fall back to the error card when there is no record to show at all (initial load failure).
  // A failed background/pre-finalize refetch keeps the editing screen so unsaved notes are never
  // discarded; that case is surfaced inline (see refreshFailedStale) instead.
  if (!record.data) return <Screen><SectionCard title={t('clinicalActionFailed')}><Button label={t('retry')} onPress={() => void record.refetch()} /></SectionCard></Screen>
  const editable = record.data.encounter.status === 'draft'
  const conflictKeys = Object.keys(conflicts) as (keyof EncounterNoteFields)[]

  return <Screen maxWidth={1040} style={styles.screen}>
    <Stack.Screen options={{ title: t('clinicalEncounter'), headerBackTitle: t('back') }} />
    <View style={styles.heading}><Stethoscope size={29} color={colors.teal} /><View style={styles.headingCopy}><Text style={styles.kicker}>{t('clinicalLedger')}</Text><Text style={styles.title}>{patientName || t('clinicalEncounter')}</Text><Text style={styles.subtitle}>{editable ? t('draftPrivateToDentist') : t('finalizedVisibleToPatient')}</Text></View></View>
    {message ? <Text accessibilityRole="alert" style={styles.notice}>{message}</Text> : null}
    {conflictKeys.length > 0 ? <View accessibilityRole="alert" style={styles.conflict}>
      <Text style={styles.conflictTitle}>{t('noteConflictTitle')}</Text>
      <Text style={styles.conflictBody}>{t('noteConflictBody')}</Text>
      {conflictKeys.map((key) => <View key={key} style={styles.conflictRow}>
        <Text style={styles.conflictField}>{t(NOTE_FIELD_LABEL[key])}</Text>
        <Text style={styles.conflictLabel}>{t('noteConflictMine')}</Text><Text style={styles.conflictValue}>{conflicts[key]!.mine || '—'}</Text>
        <Text style={styles.conflictLabel}>{t('noteConflictUpdated')}</Text><Text style={styles.conflictValue}>{conflicts[key]!.incoming || '—'}</Text>
        <View style={styles.conflictActions}>
          <Button label={t('keepMyEdit')} variant="secondary" onPress={() => keepMine(key)} />
          <Button label={t('useUpdatedNote')} variant="ghost" onPress={() => acceptUpdated(key)} />
        </View>
      </View>)}
    </View> : null}
    {record.data?.encounter.status === 'draft' ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/professional/ai-review', params: { appointmentId: record.data!.encounter.appointmentId } })} style={styles.aiCard}><BrainCircuit size={24} color={colors.mint} /><View style={styles.flex}><Text style={styles.aiTitle}>{t('aiReviewWorkspace')}</Text><Text style={styles.aiBody}>{t('aiDentistSafety')}</Text></View></Pressable> : null}
    <View style={[styles.columns, width >= 800 && styles.columnsWide]}>
      <View style={styles.column}><SectionCard eyebrow={t('progressNotes').toUpperCase()} title={t('structuredClinicalNote')}>
        <Field label={t('chiefComplaint')} value={notes.complaint} onChangeText={(value) => updateNote('complaint', value)} editable={editable && busy !== 'finalize'} multiline />
        <Field label={t('subjective')} value={notes.subjective} onChangeText={(value) => updateNote('subjective', value)} editable={editable && busy !== 'finalize'} multiline />
        <Field label={t('objective')} value={notes.objective} onChangeText={(value) => updateNote('objective', value)} editable={editable && busy !== 'finalize'} multiline />
        <Field label={t('assessment')} value={notes.assessment} onChangeText={(value) => updateNote('assessment', value)} editable={editable && busy !== 'finalize'} multiline />
        <Field label={t('carePlan')} value={notes.plan} onChangeText={(value) => updateNote('plan', value)} editable={editable && busy !== 'finalize'} multiline />
        {editable ? <Button label={t('saveDraft')} loading={busy === 'notes'} onPress={() => void saveNotes()} /> : <View style={styles.finalBadge}><CheckCircle2 size={17} color={colors.success} /><Text style={styles.finalText}>{t('finalizedRecord')}</Text></View>}
      </SectionCard></View>
      <View style={styles.column}>
        <SectionCard eyebrow={t('diagnoses').toUpperCase()} title={t('diagnoses')}>
          {record.data.diagnoses.map((item) => <View key={item.id} style={styles.item}><ClipboardPenLine size={17} color={colors.teal} /><Text style={styles.itemText}>{item.code ? `${item.code} · ` : ''}{item.diagnosis}</Text></View>)}
          {editable ? <><View style={styles.rowFields}><View style={styles.codeField}><Field label={t('codeOptional')} value={diagnosisCode} onChangeText={setDiagnosisCode} /></View><View style={styles.flex}><Field label={t('diagnosis')} value={diagnosis} onChangeText={setDiagnosis} /></View></View><Button label={t('addDiagnosis')} variant="secondary" loading={busy === 'diagnosis'} onPress={() => void addDx()} /></> : null}
        </SectionCard>
        <SectionCard eyebrow="FDI" title={t('odontogram')}>
          <View style={styles.rowFields}>{(['adult','primary'] as const).map(value=><Button key={value} label={t(value==='adult'?'adultTeeth':'primaryTeeth')} variant={dentition===value?'primary':'secondary'} accessibilityState={{selected:dentition===value}} onPress={()=>{setDentition(value);setToothCode('')}}/>)}</View>
          {(dentition==='adult'?[[18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28],[48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38]]:[[55,54,53,52,51,61,62,63,64,65],[85,84,83,82,81,71,72,73,74,75]]).map((arch,index)=><View key={index} style={styles.arch}><Text style={styles.itemText}>{t(index===0?'upperArch':'lowerArch')}</Text><View style={styles.rowFields}>{arch.map(code=><Pressable key={code} accessibilityRole="button" accessibilityLabel={`${t('fdiTooth')} ${code}`} accessibilityState={{selected:toothCode===String(code),disabled:!editable}} disabled={!editable} onPress={()=>setToothCode(String(code))} style={[styles.tooth,toothCode===String(code)&&styles.toothSelected]}><Text style={[styles.toothText,toothCode===String(code)&&styles.toothTextSelected]}>{code}</Text></Pressable>)}</View></View>)}
          {record.data.teeth.filter(item=>item.dentition===dentition).map((item) => <View key={item.id} style={styles.item}><CircleDot size={17} color={colors.teal} /><Text style={styles.itemText}>{item.fdiToothCode} · {t(item.surface)} · {item.finding}</Text></View>)}
          {editable?<><Text style={styles.itemText}>{t('toothSurface')}</Text><View style={styles.rowFields}>{(['whole','mesial','distal','buccal','lingual','occlusal','incisal'] as const).map(value=><Button key={value} label={t(value)} variant={surface===value?'primary':'secondary'} accessibilityState={{selected:surface===value}} onPress={()=>setSurface(value)}/>)}</View></>:null}
          {editable ? <><View style={styles.rowFields}><View style={styles.codeField}><Field label={t('fdiTooth')} value={toothCode} onChangeText={setToothCode} keyboardType="number-pad" maxLength={2} /></View><View style={styles.flex}><Field label={t('finding')} value={finding} onChangeText={setFinding} /></View></View><Button label={t('chartTooth')} variant="secondary" loading={busy === 'tooth'} onPress={() => void chartTooth()} /></> : null}
        </SectionCard>
      </View>
    </View>
    {safetyPatientProfileId ? <View accessibilityRole="alert" style={[styles.rxBand, (safety.data?.allergies.length ?? 0) > 0 && styles.rxBandAlert]}>
      <View style={styles.rxHeading}><AlertTriangle size={18} color={(safety.data?.allergies.length ?? 0) > 0 ? '#B83A3A' : colors.warning} /><Text style={styles.rxTitle}>{t('rxSafetyTitle')}</Text></View>
      {safety.isLoading ? <Text style={styles.rxValue}>{t('rxSafetyChecking')}</Text>
        : safety.isError ? <Text style={styles.rxValue}>{t('rxSafetyUnavailable')}</Text>
        : <>
          <Text style={styles.rxLabel}>{t('rxSafetyAllergiesLabel')}</Text>
          {safety.data && safety.data.allergies.length > 0
            ? safety.data.allergies.map((a) => <Text key={a.id} style={styles.rxValue}>{a.allergen}{a.reaction ? ` · ${a.reaction}` : ''}{a.severity && a.severity !== 'unknown' ? ` · ${t(a.severity as 'unknown' | 'mild' | 'moderate' | 'severe')}` : ''}</Text>)
            : <Text style={styles.rxValue}>{t('rxSafetyNoAllergiesOnFile')}</Text>}
          <Text style={styles.rxLabel}>{t('rxSafetyMedicationsLabel')}</Text>
          {safety.data && safety.data.currentMedications.length > 0
            ? safety.data.currentMedications.map((m, index) => <Text key={index} style={styles.rxValue}>{m}</Text>)
            : <Text style={styles.rxValue}>{t('rxSafetyNoMedicationsOnFile')}</Text>}
        </>}
      <Text style={styles.rxConfirm}>{t('rxSafetyConfirm')}</Text>
    </View> : null}
    <SectionCard eyebrow={t('prescription').toUpperCase()} title={t('reviewEachMedicine')}>
      {record.data.prescriptions.map((prescription) => {
        const finalized = isPrescriptionFinalized(prescription)
        return <View key={prescription.id} style={styles.prescriptionGroup}>
          {prescription.items.map((item) => <View key={item.id} style={styles.item}><Pill size={17} color={colors.teal} /><Text style={styles.itemText}>{item.medicineName} {item.strength} · {item.dosage} · {item.frequency} · {item.duration}</Text></View>)}
          {finalized
            ? <View style={styles.finalBadge}><CheckCircle2 size={16} color={colors.success} /><Text style={styles.finalText}>{t('finalizedRecord')}</Text></View>
            : <><Text style={styles.draftNote}>{t('draftPrivateToDentist')}</Text>{editable ? <Button label={t('finalizePrescription')} variant="secondary" loading={busy === `prescription-${prescription.id}`} onPress={() => void finalizeExistingPrescription(prescription.id)} /> : null}</>}
        </View>
      })}
      {editable ? <><View style={styles.medicineGrid}><Field label={t('medicine')} value={medicine} onChangeText={setMedicine} /><Field label={t('strength')} value={strength} onChangeText={setStrength} /><Field label={t('dosage')} value={dosage} onChangeText={setDosage} /><Field label={t('frequency')} value={frequency} onChangeText={setFrequency} /><Field label={t('duration')} value={duration} onChangeText={setDuration} /></View><Button label={t('finalizePrescription')} variant="secondary" loading={busy === 'prescription'} onPress={() => void prescribe()} /></> : null}
    </SectionCard>
    <View style={[styles.columns, width >= 800 && styles.columnsWide]}>
      <View style={styles.column}><SectionCard eyebrow={t('treatmentPlans').toUpperCase()} title={t('createTreatmentPlan')}>
        {record.data.treatmentPlans.flatMap((treatment) => treatment.items.map((item) => <View key={item.id} style={styles.item}><ClipboardPenLine size={17} color={colors.teal} /><Text style={styles.itemText}>{treatment.title} · {item.description}{item.fdiToothCode ? ` · ${item.fdiToothCode}` : ''}{item.estimatedPriceBdt !== null ? ` · ৳${item.estimatedPriceBdt.toLocaleString()}` : ''}</Text></View>))}
        {editable ? <><Field label={t('treatmentTitle')} value={treatmentTitle} onChangeText={setTreatmentTitle} /><Field label={t('treatmentItem')} value={treatmentItem} onChangeText={setTreatmentItem} /><View style={styles.rowFields}><View style={styles.codeField}><Field label={t('fdiTooth')} value={treatmentTooth} onChangeText={setTreatmentTooth} keyboardType="number-pad" maxLength={2} /></View><View style={styles.flex}><Field label={t('estimatedPrice')} value={estimatedPrice} onChangeText={setEstimatedPrice} keyboardType="numeric" /></View></View><Button label={t('createTreatmentPlan')} variant="secondary" loading={busy === 'treatment'} onPress={() => void saveTreatmentPlan()} /></> : null}
      </SectionCard></View>
      <View style={styles.column}><SectionCard eyebrow={t('clinicalMedia').toUpperCase()} title={t('clinicalMedia')}>
        <View style={styles.mediaIntro}><ImagePlus size={20} color={colors.teal} /><Text style={styles.itemText}>{t('mediaPrivacy')}</Text></View>
        {record.data.media.map((item) => <View key={item.id} style={styles.item}><ImagePlus size={17} color={colors.teal} /><View style={styles.flex}><Text style={styles.itemText}>{item.caption || item.filename}</Text><Button label={t('viewClinicalMedia')} variant="ghost" loading={busy === item.storagePath} onPress={() => void viewMedia(item.storagePath)} /></View></View>)}
        {editable ? <><Field label={t('mediaCaption')} value={mediaCaption} onChangeText={setMediaCaption} /><View style={styles.mediaActions}><Button label={t('attachClinicalMedia')} variant="secondary" loading={busy === 'media-photograph'} onPress={() => void attachMedia('photograph')} /><Button label="X-ray" variant="ghost" loading={busy === 'media-xray'} onPress={() => void attachMedia('xray')} /></View></> : null}
      </SectionCard></View>
    </View>
    {editable ? <Pressable accessibilityRole="button" onPress={() => void finalize()} style={styles.finalize}><CheckCircle2 size={22} color={colors.paper} /><View style={styles.flex}><Text style={styles.finalizeTitle}>{t('finalizeEncounter')}</Text><Text style={styles.finalizeBody}>{t('finalizeEncounterWarning')}</Text></View></Pressable> : null}
    <Button label={t('clinicOperations')} variant="ghost" onPress={() => router.back()} />
  </Screen>
}

const styles = StyleSheet.create({
  arch:{gap:spacing.sm,marginVertical:spacing.sm},tooth:{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:colors.line,borderRadius:radius.md,backgroundColor:colors.paper},toothSelected:{backgroundColor:colors.ink},toothText:{color:colors.ink,fontSize:15,fontWeight:'700'},toothTextSelected:{color:colors.paper},
  screen: { paddingTop: spacing.xl, gap: spacing.xl }, heading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, headingCopy: { flex: 1, gap: 5 }, kicker: { color: colors.teal, fontSize: 11, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' }, title: { color: colors.inkDeep, fontSize: 31, fontWeight: '800', letterSpacing: -0.9 }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20 }, notice: { color: colors.teal, backgroundColor: colors.mintSoft, padding: spacing.md, borderRadius: radius.md }, conflict: { gap: spacing.sm, padding: spacing.lg, borderRadius: radius.md, backgroundColor: '#FDECEC', borderWidth: 1, borderColor: '#B83A3A' }, conflictTitle: { color: '#B83A3A', fontSize: 15, fontWeight: '800' }, conflictBody: { color: colors.text, fontSize: 12, lineHeight: 18 }, conflictRow: { gap: 4, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, conflictField: { color: colors.inkDeep, fontSize: 13, fontWeight: '800' }, conflictLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 }, conflictValue: { color: colors.text, fontSize: 12, lineHeight: 18 }, conflictActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingTop: spacing.xs }, rxBand: { gap: 4, padding: spacing.lg, borderRadius: radius.md, backgroundColor: '#FFF7E6', borderWidth: 1, borderColor: colors.warning }, rxBandAlert: { backgroundColor: '#FDECEC', borderColor: '#B83A3A' }, rxHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, rxTitle: { color: colors.inkDeep, fontSize: 14, fontWeight: '800' }, rxLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: spacing.xs }, rxValue: { color: colors.text, fontSize: 12, lineHeight: 18 }, rxConfirm: { color: colors.inkDeep, fontSize: 12, lineHeight: 18, fontWeight: '700', marginTop: spacing.sm }, aiCard:{flexDirection:'row',alignItems:'flex-start',gap:spacing.md,padding:spacing.lg,borderRadius:radius.lg,backgroundColor:colors.inkDeep},aiTitle:{color:colors.paper,fontSize:16,fontWeight:'800'},aiBody:{color:'#B8C8D3',fontSize:12,lineHeight:18,marginTop:4}, columns: { gap: spacing.xl }, columnsWide: { flexDirection: 'row', alignItems: 'flex-start' }, column: { flex: 1, minWidth: 0, gap: spacing.xl }, rowFields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, codeField: { width: 110 }, flex: { flex: 1, minWidth: 160 }, item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, itemText: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 18 }, prescriptionGroup: { gap: spacing.sm, paddingBottom: spacing.md, marginBottom: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, draftNote: { color: colors.muted, fontSize: 12, lineHeight: 18 }, medicineGrid: { gap: spacing.sm }, mediaIntro: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }, mediaActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, finalBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, finalText: { color: colors.success, fontWeight: '800' }, finalize: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.inkDeep }, finalizeTitle: { color: colors.paper, fontSize: 18, fontWeight: '800' }, finalizeBody: { color: '#B8C8D3', fontSize: 12, lineHeight: 18, marginTop: 4 },
})
