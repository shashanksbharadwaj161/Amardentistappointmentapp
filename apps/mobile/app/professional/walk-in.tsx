import { guestWalkInSchema } from '@amar-dentist/domain'
import { useQuery } from '@tanstack/react-query'
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router'
import { CheckCircle2, ShieldCheck, UserPlus } from 'lucide-react-native'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Field } from '../../src/components/Field'
import { Screen } from '../../src/components/Screen'
import { SectionCard } from '../../src/components/SectionCard'
import { createGuestWalkIn, getClinicOperationsContext } from '../../src/lib/phase3'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, radius, spacing } from '../../src/theme'

export default function ProfessionalWalkInScreen() {
  const { clinicId } = useLocalSearchParams<{ clinicId?: string }>()
  const { profile, loading } = useAuth()
  const { t } = useLocale()
  const context = useQuery({ queryKey: ['clinic-operations', profile?.id, clinicId], queryFn: () => getClinicOperationsContext(profile!.id, clinicId), enabled: Boolean(profile), refetchInterval: 10_000 })
  const [dentistId, setDentistId] = useState<string | null>(null)
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appointmentId, setAppointmentId] = useState<string | null>(null)
  useEffect(() => {
    const data = context.data
    if (!data) return
    const nextDentist = dentistId && data.dentists.some((dentist) => dentist.id === dentistId) ? dentistId : data.dentistId
    setDentistId(nextDentist)
    const available = data.services.filter((service) => !service.dentistId || service.dentistId === nextDentist)
    if (!serviceId || !available.some((service) => service.id === serviceId)) setServiceId(available[0]?.id ?? null)
  }, [context.data, dentistId, serviceId])
  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null

  const create = async () => {
    const data = context.data
    const parsed = guestWalkInSchema.safeParse({ clinicId: data?.clinic?.id, dentistId, serviceId, fullName, phone, startAt: new Date().toISOString() })
    if (!parsed.success) return setError(t('checkDetails'))
    setBusy(true); setError(null)
    try { setAppointmentId(await createGuestWalkIn(parsed.data)) } catch { setError(t('walkInFailed')) } finally { setBusy(false) }
  }

  if (appointmentId) return <Screen maxWidth={640} style={styles.screen}>
    <Stack.Screen options={{ title: t('walkInCreated'), headerBackTitle: t('back') }} />
    <View style={styles.success}><CheckCircle2 size={46} color={colors.success} /></View>
    <Text style={styles.successTitle}>{t('walkInCreated')}</Text>
    <Text style={styles.successBody}>{t('walkInCreatedBody')}</Text>
    <Button label={t('clinicOperations')} onPress={() => router.replace({ pathname: '/professional/operations', params: clinicId ? { clinicId } : {} })} />
  </Screen>

  return <Screen maxWidth={680} style={styles.screen}>
    <Stack.Screen options={{ title: t('newWalkIn'), headerBackTitle: t('back') }} />
    <View style={styles.heading}><UserPlus size={28} color={colors.teal} /><View style={styles.headingCopy}><Text style={styles.title}>{t('newWalkIn')}</Text><Text style={styles.subtitle}>{t('newWalkInBody')}</Text></View></View>
    <View style={styles.privacy}><ShieldCheck size={17} color={colors.teal} /><Text style={styles.privacyText}>{t('guestProfilePrivacy')}</Text></View>
    {context.isLoading ? <ActivityIndicator color={colors.teal} /> : context.isError || !context.data?.clinic || !dentistId || !serviceId ? <SectionCard title={t('scheduleNeedsApproval')}><Text style={styles.body}>{t('walkInSetupMissing')}</Text><Button label={t('retry')} variant="secondary" onPress={() => void context.refetch()} /></SectionCard> : <SectionCard eyebrow={context.data.clinic.name.toUpperCase()} title={t('newWalkIn')}>
      <Text style={styles.label}>{t('dentist')}</Text><View style={styles.choices}>{context.data.dentists.map((dentist) => <Pressable key={dentist.id} accessibilityRole="radio" accessibilityState={{ checked: dentistId === dentist.id }} onPress={() => { setDentistId(dentist.id); setServiceId(null) }} style={[styles.choice, dentistId === dentist.id && styles.choiceActive]}><Text style={[styles.choiceText, dentistId === dentist.id && styles.choiceTextActive]}>{dentist.name}</Text></Pressable>)}</View>
      <Text style={styles.label}>{t('serviceName')}</Text><View style={styles.choices}>{context.data.services.filter((service) => !service.dentistId || service.dentistId === dentistId).map((service) => <Pressable key={service.id} accessibilityRole="radio" accessibilityState={{ checked: serviceId === service.id }} onPress={() => setServiceId(service.id)} style={[styles.choice, serviceId === service.id && styles.choiceActive]}><Text style={[styles.choiceText, serviceId === service.id && styles.choiceTextActive]}>{service.name}</Text></Pressable>)}</View>
      <Field label={t('patientName')} value={fullName} onChangeText={setFullName} autoCapitalize="words" />
      <Field label={t('phoneOptional')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Text style={styles.body}>{t('walkInTiming')}</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Button label={t('createWalkIn')} loading={busy} onPress={() => void create()} />
    </SectionCard>}
  </Screen>
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xl, gap: spacing.xl }, heading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, headingCopy: { flex: 1, gap: 5 }, title: { color: colors.inkDeep, fontSize: 31, fontWeight: '800', letterSpacing: -0.9 }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20 }, privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.mintSoft }, privacyText: { flex: 1, color: colors.teal, fontSize: 12, lineHeight: 18 }, body: { color: colors.muted, fontSize: 13, lineHeight: 20 }, label: { color: colors.inkDeep, fontSize: 12, fontWeight: '800' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, choice: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, backgroundColor: colors.pearl }, choiceActive: { borderColor: colors.mint, backgroundColor: colors.mintSoft }, choiceText: { color: colors.muted, fontSize: 12, fontWeight: '700' }, choiceTextActive: { color: colors.teal }, error: { color: colors.danger, fontSize: 13 },
  success: { width: 86, height: 86, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 43, backgroundColor: colors.mintSoft }, successTitle: { color: colors.inkDeep, fontSize: 30, fontWeight: '800', textAlign: 'center' }, successBody: { color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: 'center' },
})
