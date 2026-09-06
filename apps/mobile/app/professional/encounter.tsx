import { clinicalDiagnosisSchema, clinicalEncounterSchema, prescriptionDraftSchema, toothObservationSchema, treatmentPlanSchema } from '@amar-dentist/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as DocumentPicker from 'expo-document-picker'
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router'
import { BrainCircuit, CheckCircle2, CircleDot, ClipboardPenLine, ImagePlus, Pill, Stethoscope } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Field } from '../../src/components/Field'
import { Screen } from '../../src/components/Screen'
import { SectionCard } from '../../src/components/SectionCard'
import { addDiagnosis, createAndFinalizeTreatmentPlan, finalizeEncounter, finalizePrescription, getClinicalMediaDownloadUrl, openClinicalEncounter, saveEncounter, savePrescription, saveToothObservation, uploadClinicalMedia } from '../../src/lib/phase4'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, radius, spacing } from '../../src/theme'

export default function ClinicalEncounterScreen() {
  const { appointmentId, patientName } = useLocalSearchParams<{ appointmentId: string; patientName?: string }>()
  const { profile, loading } = useAuth()
  const { t } = useLocale()
  const { width } = useWindowDimensions()
  const queryClient = useQueryClient()
  const record = useQuery({ queryKey: ['clinical-encounter', appointmentId], queryFn: () => openClinicalEncounter(appointmentId!), enabled: Boolean(profile && appointmentId) })
  const [complaint, setComplaint] = useState('')
  const [subjective, setSubjective] = useState('')
  const [objective, setObjective] = useState('')
  const [assessment, setAssessment] = useState('')
  const [plan, setPlan] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [diagnosisCode, setDiagnosisCode] = useState('')
  const [toothCode, setToothCode] = useState('')
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

  useEffect(() => {
    const encounter = record.data?.encounter
    if (!encounter) return
    setComplaint(encounter.chiefComplaint); setSubjective(encounter.subjectiveNotes); setObjective(encounter.objectiveNotes); setAssessment(encounter.assessment); setPlan(encounter.plan)
  }, [record.data?.encounter])

  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null

  const refresh = async () => { await queryClient.invalidateQueries({ queryKey: ['clinical-encounter', appointmentId] }) }
  const persistNotes = async (): Promise<boolean> => {
    const encounterId = record.data?.encounter.id
    const parsed = clinicalEncounterSchema.safeParse({ encounterId, chiefComplaint: complaint, subjectiveNotes: subjective, objectiveNotes: objective, assessment, plan, changeReason: 'Clinical note reviewed' })
    if (!parsed.success) { setMessage(t('checkClinicalFields')); return false }
    try { await saveEncounter(parsed.data); return true } catch { setMessage(t('clinicalActionFailed')); return false }
  }
  const saveNotes = async () => {
    setBusy('notes'); setMessage(null)
    const saved = await persistNotes()
    if (saved) { setMessage(t('clinicalDraftSaved')); await refresh() }
    setBusy(null)
  }
  const addDx = async () => {
    const parsed = clinicalDiagnosisSchema.safeParse({ encounterId: record.data?.encounter.id, code: diagnosisCode, diagnosis, notes: '' })
    if (!parsed.success) return setMessage(t('checkClinicalFields'))
    setBusy('diagnosis'); setMessage(null)
    try { await addDiagnosis(parsed.data); setDiagnosis(''); setDiagnosisCode(''); await refresh() } catch { setMessage(t('clinicalActionFailed')) } finally { setBusy(null) }
  }
  const chartTooth = async () => {
    const parsed = toothObservationSchema.safeParse({ encounterId: record.data?.encounter.id, dentition: 'adult', fdiToothCode: toothCode, surface: 'whole', finding, changeReason: 'Odontogram reviewed' })
    if (!parsed.success) return setMessage(t('invalidFdiTooth'))
    setBusy('tooth'); setMessage(null)
    try { await saveToothObservation(parsed.data); setToothCode(''); setFinding(''); await refresh() } catch { setMessage(t('clinicalActionFailed')) } finally { setBusy(null) }
  }
  const prescribe = async () => {
    const parsed = prescriptionDraftSchema.safeParse({ encounterId: record.data?.encounter.id, prescriptionId: null, instructions: t('takeAsDirected'), changeReason: 'Prescription reviewed', items: [{ medicineName: medicine, strength, dosage, route: 'oral', frequency, duration, instructions: '' }] })
    if (!parsed.success) return setMessage(t('checkClinicalFields'))
    setBusy('prescription'); setMessage(null)
    try { const prescriptionId = await savePrescription(parsed.data); await finalizePrescription(prescriptionId); setMedicine(''); setStrength(''); setDosage(''); setFrequency(''); setDuration(''); setMessage(t('prescriptionFinalized')); await refresh() } catch { setMessage(t('clinicalActionFailed')) } finally { setBusy(null) }
  }
  const saveTreatmentPlan = async () => {
    const price = estimatedPrice.trim() ? Number(estimatedPrice) : null
    const parsed = treatmentPlanSchema.safeParse({ encounterId: record.data?.encounter.id, title: treatmentTitle, notes: '', items: [{ description: treatmentItem, fdiToothCode: treatmentTooth.trim() || null, estimatedPriceBdt: Number.isFinite(price) ? price : null }] })
    if (!parsed.success) return setMessage(t('checkClinicalFields'))
    setBusy('treatment'); setMessage(null)
    try { await createAndFinalizeTreatmentPlan(parsed.data); setTreatmentTitle(''); setTreatmentItem(''); setTreatmentTooth(''); setEstimatedPrice(''); setMessage(t('treatmentPlanFinalized')); await refresh() } catch { setMessage(t('clinicalActionFailed')) } finally { setBusy(null) }
  }
  const attachMedia = async (kind: 'photograph' | 'xray') => {
    const encounterId = record.data?.encounter.id
    if (!encounterId) return
    const picked = await DocumentPicker.getDocumentAsync({ type: ['image/jpeg', 'image/png', 'application/dicom'], copyToCacheDirectory: true, multiple: false })
    const asset = picked.assets?.[0]
    if (picked.canceled || !asset) return
    setBusy(`media-${kind}`); setMessage(null)
    try { await uploadClinicalMedia(encounterId, kind, asset, mediaCaption); setMediaCaption(''); setMessage(t('mediaUploaded')); await refresh() } catch { setMessage(t('clinicalActionFailed')) } finally { setBusy(null) }
  }
  const viewMedia = async (storagePath: string) => {
    setBusy(storagePath); setMessage(null)
    try { const url = await getClinicalMediaDownloadUrl(storagePath); if (url) await Linking.openURL(url) } catch { setMessage(t('clinicalActionFailed')) } finally { setBusy(null) }
  }
  const finalize = async () => {
    if (!record.data) return
    setBusy('finalize'); setMessage(null)
    try { const saved = await persistNotes(); if (!saved) return; await finalizeEncounter(record.data.encounter.id); setMessage(t('encounterFinalized')); await refresh() } catch { setMessage(t('clinicalActionFailed')) } finally { setBusy(null) }
  }

  if (record.isLoading) return <Screen><ActivityIndicator color={colors.teal} /></Screen>
  if (record.isError || !record.data) return <Screen><SectionCard title={t('clinicalActionFailed')}><Button label={t('retry')} onPress={() => void record.refetch()} /></SectionCard></Screen>
  const editable = record.data.encounter.status === 'draft'

  return <Screen maxWidth={1040} style={styles.screen}>
    <Stack.Screen options={{ title: t('clinicalEncounter'), headerBackTitle: t('back') }} />
    <View style={styles.heading}><Stethoscope size={29} color={colors.teal} /><View style={styles.headingCopy}><Text style={styles.kicker}>{t('clinicalLedger')}</Text><Text style={styles.title}>{patientName || t('clinicalEncounter')}</Text><Text style={styles.subtitle}>{editable ? t('draftPrivateToDentist') : t('finalizedVisibleToPatient')}</Text></View></View>
    {message ? <Text accessibilityRole="alert" style={styles.notice}>{message}</Text> : null}
    {record.data?.encounter.status === 'draft' ? <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/professional/ai-review', params: { appointmentId: record.data!.encounter.appointmentId } })} style={styles.aiCard}><BrainCircuit size={24} color={colors.mint} /><View style={styles.flex}><Text style={styles.aiTitle}>{t('aiReviewWorkspace')}</Text><Text style={styles.aiBody}>{t('aiDentistSafety')}</Text></View></Pressable> : null}
    <View style={[styles.columns, width >= 800 && styles.columnsWide]}>
      <View style={styles.column}><SectionCard eyebrow={t('progressNotes').toUpperCase()} title={t('structuredClinicalNote')}>
        <Field label={t('chiefComplaint')} value={complaint} onChangeText={setComplaint} editable={editable} multiline />
        <Field label={t('subjective')} value={subjective} onChangeText={setSubjective} editable={editable} multiline />
        <Field label={t('objective')} value={objective} onChangeText={setObjective} editable={editable} multiline />
        <Field label={t('assessment')} value={assessment} onChangeText={setAssessment} editable={editable} multiline />
        <Field label={t('carePlan')} value={plan} onChangeText={setPlan} editable={editable} multiline />
        {editable ? <Button label={t('saveDraft')} loading={busy === 'notes'} onPress={() => void saveNotes()} /> : <View style={styles.finalBadge}><CheckCircle2 size={17} color={colors.success} /><Text style={styles.finalText}>{t('finalizedRecord')}</Text></View>}
      </SectionCard></View>
      <View style={styles.column}>
        <SectionCard eyebrow={t('diagnoses').toUpperCase()} title={t('diagnoses')}>
          {record.data.diagnoses.map((item) => <View key={item.id} style={styles.item}><ClipboardPenLine size={17} color={colors.teal} /><Text style={styles.itemText}>{item.code ? `${item.code} · ` : ''}{item.diagnosis}</Text></View>)}
          {editable ? <><View style={styles.rowFields}><View style={styles.codeField}><Field label={t('codeOptional')} value={diagnosisCode} onChangeText={setDiagnosisCode} /></View><View style={styles.flex}><Field label={t('diagnosis')} value={diagnosis} onChangeText={setDiagnosis} /></View></View><Button label={t('addDiagnosis')} variant="secondary" loading={busy === 'diagnosis'} onPress={() => void addDx()} /></> : null}
        </SectionCard>
        <SectionCard eyebrow="FDI" title={t('odontogram')}>
          {record.data.teeth.map((item) => <View key={item.id} style={styles.item}><CircleDot size={17} color={colors.teal} /><Text style={styles.itemText}>{item.fdiToothCode} · {item.surface} · {item.finding}</Text></View>)}
          {editable ? <><View style={styles.rowFields}><View style={styles.codeField}><Field label={t('fdiTooth')} value={toothCode} onChangeText={setToothCode} keyboardType="number-pad" maxLength={2} /></View><View style={styles.flex}><Field label={t('finding')} value={finding} onChangeText={setFinding} /></View></View><Button label={t('chartTooth')} variant="secondary" loading={busy === 'tooth'} onPress={() => void chartTooth()} /></> : null}
        </SectionCard>
      </View>
    </View>
    <SectionCard eyebrow={t('prescription').toUpperCase()} title={t('reviewEachMedicine')}>
      {record.data.prescriptions.flatMap((prescription) => prescription.items).map((item) => <View key={item.id} style={styles.item}><Pill size={17} color={colors.teal} /><Text style={styles.itemText}>{item.medicineName} {item.strength} · {item.dosage} · {item.frequency} · {item.duration}</Text></View>)}
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
  screen: { paddingTop: spacing.xl, gap: spacing.xl }, heading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, headingCopy: { flex: 1, gap: 5 }, kicker: { color: colors.teal, fontSize: 11, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' }, title: { color: colors.inkDeep, fontSize: 31, fontWeight: '800', letterSpacing: -0.9 }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20 }, notice: { color: colors.teal, backgroundColor: colors.mintSoft, padding: spacing.md, borderRadius: radius.md }, aiCard:{flexDirection:'row',alignItems:'flex-start',gap:spacing.md,padding:spacing.lg,borderRadius:radius.lg,backgroundColor:colors.inkDeep},aiTitle:{color:colors.paper,fontSize:16,fontWeight:'800'},aiBody:{color:'#B8C8D3',fontSize:12,lineHeight:18,marginTop:4}, columns: { gap: spacing.xl }, columnsWide: { flexDirection: 'row', alignItems: 'flex-start' }, column: { flex: 1, minWidth: 0, gap: spacing.xl }, rowFields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, codeField: { width: 110 }, flex: { flex: 1, minWidth: 160 }, item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, itemText: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 18 }, medicineGrid: { gap: spacing.sm }, mediaIntro: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }, mediaActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, finalBadge: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, finalText: { color: colors.success, fontWeight: '800' }, finalize: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, padding: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.inkDeep }, finalizeTitle: { color: colors.paper, fontSize: 18, fontWeight: '800' }, finalizeBody: { color: '#B8C8D3', fontSize: 12, lineHeight: 18, marginTop: 4 },
})
