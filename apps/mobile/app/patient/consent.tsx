import { clinicConsentSchema } from '@amar-dentist/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Redirect, Stack, useLocalSearchParams } from 'expo-router'
import { Check, LockKeyhole, ShieldCheck } from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Screen } from '../../src/components/Screen'
import { SectionCard } from '../../src/components/SectionCard'
import { getClinicalConsentContext, grantClinicalConsent, revokeClinicalConsent } from '../../src/lib/phase4'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, hitTarget, radius, spacing } from '../../src/theme'

export default function PatientConsentScreen() {
  const { patientProfileId } = useLocalSearchParams<{ patientProfileId: string }>()
  const { profile, loading } = useAuth()
  const { locale, t } = useLocale()
  const queryClient = useQueryClient()
  const consent = useQuery({ queryKey: ['clinical-consent', patientProfileId], queryFn: () => getClinicalConsentContext(patientProfileId!), enabled: Boolean(profile && patientProfileId) })
  const [clinicId, setClinicId] = useState<string | null>(null)
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null
  const refresh = async () => queryClient.invalidateQueries({ queryKey: ['clinical-consent', patientProfileId] })
  const grant = async () => {
    const template = consent.data?.template
    const selectedClinicId = clinicId ?? consent.data?.clinics[0]?.id
    const acceptedCheckboxes = Object.fromEntries((template?.checkboxKeys ?? []).map((key) => [key, checks[key] === true]))
    const parsed = clinicConsentSchema.safeParse({ patientProfileId, clinicId: selectedClinicId, templateId: template?.id, acceptedCheckboxes })
    if (!parsed.success || !template?.checkboxKeys.every((key) => checks[key])) return setMessage(t('allConsentChecks'))
    setBusy('grant'); setMessage(null)
    try { await grantClinicalConsent(parsed.data); setMessage(t('consentGranted')); setChecks({}); await refresh() } catch { setMessage(t('clinicalActionFailed')) } finally { setBusy(null) }
  }
  const revoke = async (id: string) => {
    setBusy(id); setMessage(null)
    try { await revokeClinicalConsent(id); setMessage(t('consentRevoked')); await refresh() } catch { setMessage(t('clinicalActionFailed')) } finally { setBusy(null) }
  }
  const labels = [t('consentUnderstandScope'), t('consentAuthorizeClinic'), t('consentUnderstandRevocation')]
  return <Screen maxWidth={720} style={styles.screen}>
    <Stack.Screen options={{ title: t('clinicalConsent'), headerBackTitle: t('back') }} />
    <View style={styles.heading}><ShieldCheck size={29} color={colors.teal} /><View style={styles.headingCopy}><Text style={styles.title}>{t('clinicalConsent')}</Text><Text style={styles.subtitle}>{t('clinicalConsentBody')}</Text></View></View>
    {message ? <Text accessibilityRole="alert" style={styles.notice}>{message}</Text> : null}
    {consent.isLoading ? <ActivityIndicator color={colors.teal} /> : consent.isError || !consent.data?.template ? <SectionCard title={t('clinicalActionFailed')}><Button label={t('retry')} onPress={() => void consent.refetch()} /></SectionCard> : <>
      <SectionCard eyebrow={`${locale === 'bn' ? 'সংস্করণ' : 'VERSION'} ${consent.data.template.version}`} title={locale === 'bn' ? consent.data.template.titleBn : consent.data.template.titleEn}>
        <Text style={styles.body}>{locale === 'bn' ? consent.data.template.bodyBn : consent.data.template.bodyEn}</Text>
        <Text style={styles.label}>{t('selectClinic')}</Text><View accessibilityRole="radiogroup" style={styles.choices}>{consent.data.clinics.map((clinic) => <Pressable key={clinic.id} accessibilityRole="radio" accessibilityState={{ checked: (clinicId ?? consent.data.clinics[0]?.id) === clinic.id }} onPress={() => setClinicId(clinic.id)} style={[styles.choice, (clinicId ?? consent.data.clinics[0]?.id) === clinic.id && styles.choiceActive]}><Text style={styles.choiceText}>{clinic.name}</Text></Pressable>)}</View>
        {consent.data.template.checkboxKeys.map((key, index) => <Pressable key={key} accessibilityRole="checkbox" accessibilityState={{ checked: checks[key] === true }} onPress={() => setChecks((value) => ({ ...value, [key]: !value[key] }))} style={styles.checkRow}><View style={[styles.checkbox, checks[key] && styles.checkboxActive]}>{checks[key] ? <Check size={16} color={colors.inkDeep} /> : null}</View><Text style={styles.checkText}>{labels[index] ?? key}</Text></Pressable>)}
        <Button label={t('grantConsent')} loading={busy === 'grant'} onPress={() => void grant()} />
      </SectionCard>
      {consent.data.consents.filter((item) => item.status === 'active').map((item) => <View key={item.id} style={styles.activeConsent}><LockKeyhole size={18} color={colors.success} /><View style={styles.activeCopy}><Text style={styles.activeTitle}>{item.clinicName}</Text><Text style={styles.activeMeta}>{locale === 'bn' ? 'সক্রিয় সম্মতি' : 'Active consent'} · v{item.templateVersion}</Text></View><Button label={t('revokeConsent')} variant="ghost" loading={busy === item.id} onPress={() => void revoke(item.id)} /></View>)}
    </>}
  </Screen>
}

const styles = StyleSheet.create({ screen: { paddingTop: spacing.xl, gap: spacing.xl }, heading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, headingCopy: { flex: 1, gap: 5 }, title: { color: colors.inkDeep, fontSize: 30, lineHeight: 37, fontWeight: '800', letterSpacing: -0.8 }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20 }, notice: { color: colors.teal, backgroundColor: colors.mintSoft, padding: spacing.md, borderRadius: radius.md }, body: { color: colors.text, fontSize: 14, lineHeight: 22 }, label: { color: colors.inkDeep, fontWeight: '800' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, choice: { minHeight: hitTarget, justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill }, choiceActive: { borderColor: colors.mint, backgroundColor: colors.mintSoft }, choiceText: { color: colors.teal, fontSize: 12, fontWeight: '700' }, checkRow: { minHeight: hitTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.md }, checkbox: { width: 24, height: 24, borderWidth: 1, borderColor: colors.line, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }, checkboxActive: { borderColor: colors.mint, backgroundColor: colors.mint }, checkText: { flex: 1, color: colors.text, fontSize: 13, lineHeight: 19 }, activeConsent: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg }, activeCopy: { flex: 1, minWidth: 140, gap: 3 }, activeTitle: { color: colors.inkDeep, fontWeight: '800' }, activeMeta: { color: colors.muted, fontSize: 11 } })
