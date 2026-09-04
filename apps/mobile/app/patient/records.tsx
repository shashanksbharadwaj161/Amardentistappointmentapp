import { allergySchema, medicalHistorySchema } from '@amar-dentist/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Redirect, router, Stack } from 'expo-router'
import { AlertTriangle, ClipboardList, FileCheck2, Pill, Stethoscope } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Field } from '../../src/components/Field'
import { Screen } from '../../src/components/Screen'
import { SectionCard } from '../../src/components/SectionCard'
import { getPatientProfiles } from '../../src/lib/phase3'
import { addPatientAllergy, getClinicalMediaDownloadUrl, getPatientClinicalRecords, getPrescriptionDownloadUrl, saveMedicalHistory } from '../../src/lib/phase4'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, hitTarget, radius, spacing } from '../../src/theme'

const splitList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean)

export default function PatientRecordsScreen() {
  const { profile, loading } = useAuth()
  const { locale, t } = useLocale()
  const queryClient = useQueryClient()
  const profiles = useQuery({ queryKey: ['patient-profiles', profile?.id], queryFn: () => getPatientProfiles(profile!.id), enabled: Boolean(profile) })
  const [patientProfileId, setPatientProfileId] = useState<string | null>(null)
  const records = useQuery({ queryKey: ['patient-clinical-records', patientProfileId], queryFn: () => getPatientClinicalRecords(patientProfileId!), enabled: Boolean(patientProfileId) })
  const [conditions, setConditions] = useState('')
  const [medicines, setMedicines] = useState('')
  const [surgeries, setSurgeries] = useState('')
  const [pregnancy, setPregnancy] = useState('')
  const [tobacco, setTobacco] = useState('')
  const [notes, setNotes] = useState('')
  const [allergen, setAllergen] = useState('')
  const [reaction, setReaction] = useState('')
  const [severity, setSeverity] = useState<'unknown' | 'mild' | 'moderate' | 'severe'>('unknown')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => { if (!patientProfileId && profiles.data?.[0]) setPatientProfileId(profiles.data[0].id) }, [patientProfileId, profiles.data])
  useEffect(() => {
    const history = records.data?.history
    setConditions(history?.conditions.join(', ') ?? '')
    setMedicines(history?.currentMedications.join(', ') ?? '')
    setSurgeries(history?.priorSurgeries.join(', ') ?? '')
    setPregnancy(history?.pregnancyStatus ?? '')
    setTobacco(history?.tobaccoUse ?? '')
    setNotes(history?.notes ?? '')
  }, [records.data?.history, patientProfileId])

  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ['patient-clinical-records', patientProfileId] })
  const saveHistory = async () => {
    const parsed = medicalHistorySchema.safeParse({ patientProfileId, conditions: splitList(conditions), currentMedications: splitList(medicines), priorSurgeries: splitList(surgeries), pregnancyStatus: pregnancy.trim() || null, tobaccoUse: tobacco.trim() || null, notes })
    if (!parsed.success) return setMessage(t('checkClinicalFields'))
    setBusy('history'); setMessage(null)
    try { await saveMedicalHistory(parsed.data); setMessage(t('historySaved')); await refresh() } catch { setMessage(t('clinicalActionFailed')) } finally { setBusy(null) }
  }
  const addAllergy = async () => {
    const parsed = allergySchema.safeParse({ patientProfileId, allergen, reaction, severity })
    if (!parsed.success) return setMessage(t('checkClinicalFields'))
    setBusy('allergy'); setMessage(null)
    try { await addPatientAllergy(parsed.data); setAllergen(''); setReaction(''); setSeverity('unknown'); setMessage(t('allergySaved')); await refresh() } catch { setMessage(t('clinicalActionFailed')) } finally { setBusy(null) }
  }
  const downloadPrescription = async (prescriptionId: string) => {
    setBusy(prescriptionId); setMessage(null)
    try { const url = await getPrescriptionDownloadUrl(prescriptionId); if (url) await Linking.openURL(url); setMessage(t('prescriptionReady')) } catch { setMessage(t('clinicalActionFailed')) } finally { setBusy(null) }
  }
  const viewMedia = async (storagePath: string) => {
    setBusy(storagePath); setMessage(null)
    try { const url = await getClinicalMediaDownloadUrl(storagePath); if (url) await Linking.openURL(url) } catch { setMessage(t('clinicalActionFailed')) } finally { setBusy(null) }
  }
  const formatter = new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Dhaka' })

  return <Screen maxWidth={860} style={styles.screen}>
    <Stack.Screen options={{ title: t('medicalRecords'), headerBackTitle: t('back') }} />
    <View style={styles.heading}><ClipboardList size={29} color={colors.teal} /><View style={styles.headingCopy}><Text style={styles.title}>{t('medicalRecords')}</Text><Text style={styles.subtitle}>{t('recordsPrivacy')}</Text></View></View>
    {profiles.data && profiles.data.length > 1 ? <View accessibilityRole="radiogroup" style={styles.profileChoices}>{profiles.data.map((patient) => <Pressable key={patient.id} accessibilityRole="radio" accessibilityState={{ checked: patientProfileId === patient.id }} onPress={() => setPatientProfileId(patient.id)} style={[styles.profileChoice, patientProfileId === patient.id && styles.profileChoiceActive]}><Text style={[styles.profileText, patientProfileId === patient.id && styles.profileTextActive]}>{patient.fullName}</Text></Pressable>)}</View> : null}
    {message ? <Text accessibilityRole="alert" style={styles.notice}>{message}</Text> : null}
    {profiles.isLoading || records.isLoading ? <ActivityIndicator color={colors.teal} /> : records.isError || !patientProfileId ? <SectionCard title={t('clinicalActionFailed')}><Button label={t('retry')} onPress={() => void records.refetch()} /></SectionCard> : <>
      <View style={styles.grid}>
        <View style={styles.column}><SectionCard eyebrow={t('medicalHistory').toUpperCase()} title={t('medicalHistory')}>
          <Field label={t('medicalConditions')} hint={t('commaSeparated')} value={conditions} onChangeText={setConditions} />
          <Field label={t('currentMedications')} hint={t('commaSeparated')} value={medicines} onChangeText={setMedicines} />
          <Field label={t('priorSurgeries')} hint={t('commaSeparated')} value={surgeries} onChangeText={setSurgeries} />
          <Field label={t('pregnancyStatus')} value={pregnancy} onChangeText={setPregnancy} />
          <Field label={t('tobaccoUse')} value={tobacco} onChangeText={setTobacco} />
          <Field label={t('clinicalNotes')} value={notes} onChangeText={setNotes} multiline />
          <Button label={t('saveHistory')} loading={busy === 'history'} onPress={() => void saveHistory()} />
        </SectionCard></View>
        <View style={styles.column}><SectionCard eyebrow={t('allergies').toUpperCase()} title={t('allergies')}>
          {records.data?.allergies.map((item) => <View key={item.id} style={styles.item}><AlertTriangle size={17} color={item.severity === 'severe' ? colors.danger : colors.warning} /><View style={styles.itemCopy}><Text style={styles.itemTitle}>{item.allergen}</Text><Text style={styles.itemMeta}>{item.reaction || t('unknown')} · {t(item.severity as 'unknown' | 'mild' | 'moderate' | 'severe')}</Text></View></View>)}
          <Field label={t('allergen')} value={allergen} onChangeText={setAllergen} />
          <Field label={t('reaction')} value={reaction} onChangeText={setReaction} />
          <Text style={styles.label}>{t('severity')}</Text><View accessibilityRole="radiogroup" style={styles.profileChoices}>{(['unknown', 'mild', 'moderate', 'severe'] as const).map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: severity === value }} onPress={() => setSeverity(value)} style={[styles.profileChoice, severity === value && styles.profileChoiceActive]}><Text style={[styles.profileText, severity === value && styles.profileTextActive]}>{t(value)}</Text></Pressable>)}</View>
          <Button label={t('addAllergy')} variant="secondary" loading={busy === 'allergy'} onPress={() => void addAllergy()} />
        </SectionCard></View>
      </View>
      <Button label={t('shareHistory')} variant="secondary" onPress={() => router.push({ pathname: '/patient/consent', params: { patientProfileId } })} />
      <SectionCard eyebrow={t('finalizedVisits').toUpperCase()} title={t('finalizedVisits')}>
        {records.data?.records.length ? records.data.records.map((record) => <View key={record.encounter.id} style={styles.record}>
          <View style={styles.recordHeader}><View style={styles.recordIcon}><FileCheck2 size={19} color={colors.success} /></View><View style={styles.itemCopy}><Text style={styles.itemTitle}>{formatter.format(new Date(record.encounter.finalizedAt!))}</Text><Text style={styles.itemMeta}>{record.encounter.chiefComplaint || t('clinicalEncounter')}</Text></View></View>
          {record.diagnoses.map((item) => <View key={item.id} style={styles.detail}><Stethoscope size={15} color={colors.teal} /><Text style={styles.detailText}>{item.code ? `${item.code} · ` : ''}{item.diagnosis}</Text></View>)}
          {record.prescriptions.map((rx) => <View key={rx.id} style={styles.prescriptionBlock}>{rx.items.map((item) => <View key={item.id} style={styles.detail}><Pill size={15} color={colors.teal} /><Text style={styles.detailText}>{item.medicineName} {item.strength} · {item.dosage} · {item.frequency} · {item.duration}</Text></View>)}<View style={styles.download}><Button label={t('downloadPrescription')} variant="ghost" loading={busy === rx.id} onPress={() => void downloadPrescription(rx.id)} /></View></View>)}
          {record.treatmentPlans.flatMap((plan) => plan.items.map((item) => <View key={item.id} style={styles.detail}><ClipboardList size={15} color={colors.teal} /><Text style={styles.detailText}>{plan.title} · {item.description}</Text></View>))}
          {record.media.map((item) => <View key={item.id} style={styles.detail}><FileCheck2 size={15} color={colors.teal} /><View style={styles.itemCopy}><Text style={styles.detailText}>{item.caption || item.filename}</Text><View style={styles.download}><Button label={t('viewClinicalMedia')} variant="ghost" loading={busy === item.storagePath} onPress={() => void viewMedia(item.storagePath)} /></View></View></View>)}
        </View>) : <View style={styles.empty}><FileCheck2 size={30} color={colors.teal} /><Text style={styles.itemMeta}>{t('noFinalizedRecords')}</Text></View>}
      </SectionCard>
    </>}
  </Screen>
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xl, gap: spacing.xl }, heading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, headingCopy: { flex: 1, gap: 5 }, title: { color: colors.inkDeep, fontSize: 30, lineHeight: 37, fontWeight: '800', letterSpacing: -0.8 }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20 }, notice: { color: colors.teal, backgroundColor: colors.mintSoft, padding: spacing.md, borderRadius: radius.md }, grid: { gap: spacing.xl }, column: { minWidth: 0 }, profileChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, profileChoice: { minHeight: hitTarget, justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, backgroundColor: colors.paper }, profileChoiceActive: { borderColor: colors.mint, backgroundColor: colors.mintSoft }, profileText: { color: colors.muted, fontSize: 12, fontWeight: '700' }, profileTextActive: { color: colors.teal }, label: { color: colors.text, fontSize: 14, fontWeight: '700' }, item: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, itemCopy: { flex: 1, gap: 3 }, itemTitle: { color: colors.inkDeep, fontSize: 14, fontWeight: '800' }, itemMeta: { color: colors.muted, fontSize: 12, lineHeight: 18 }, record: { gap: spacing.sm, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, recordHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, recordIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintSoft }, prescriptionBlock: { gap: spacing.xs }, detail: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingLeft: 52 }, detailText: { flex: 1, color: colors.text, fontSize: 12, lineHeight: 18 }, download: { alignSelf: 'flex-start', paddingLeft: 44 }, empty: { minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
})
