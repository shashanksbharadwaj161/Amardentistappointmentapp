import { waitlistRequestSchema, type MarketplaceDentist } from '@amar-dentist/domain'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router'
import { BellRing, CalendarClock, CheckCircle2, Clock3, ShieldCheck } from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Field } from '../../src/components/Field'
import { Screen } from '../../src/components/Screen'
import { SectionCard } from '../../src/components/SectionCard'
import { confirmWaitlistOffer, getPatientProfiles, getWaitlistEntries, joinWaitlist, type BookingConfirmation } from '../../src/lib/phase3'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, hitTarget, radius, spacing } from '../../src/theme'

function tomorrow(): string {
  const value = new Date(Date.now() + 86_400_000)
  return value.toISOString().slice(0, 10)
}

function maskDate(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean).join('-')
}

function maskTime(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 4)
  return [digits.slice(0, 2), digits.slice(2, 4)].filter(Boolean).join(':')
}

export default function PatientWaitlistScreen() {
  const { item: encoded } = useLocalSearchParams<{ item?: string }>()
  const { profile, loading } = useAuth()
  const { locale, t } = useLocale()
  const queryClient = useQueryClient()
  const item = useMemo(() => { try { return encoded ? JSON.parse(encoded) as MarketplaceDentist : null } catch { return null } }, [encoded])
  const profiles = useQuery({ queryKey: ['patient-profiles', profile?.id], queryFn: () => getPatientProfiles(profile!.id), enabled: Boolean(profile && item) })
  const entries = useQuery({ queryKey: ['patient-waitlist', profile?.id], queryFn: getWaitlistEntries, enabled: Boolean(profile), refetchInterval: 10_000 })
  const [patientId, setPatientId] = useState<string | null>(null)
  const [preferredDate, setPreferredDate] = useState(tomorrow)
  const [earliestTime, setEarliestTime] = useState('09:00')
  const [latestTime, setLatestTime] = useState('17:00')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null)
  useEffect(() => { if (!patientId && profiles.data?.[0]) setPatientId(profiles.data[0].id) }, [patientId, profiles.data])
  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null
  const formatter = new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dhaka' })
  const dateFormatter = new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Dhaka' })

  const join = async () => {
    if (!item || !patientId) return
    const parsed = waitlistRequestSchema.safeParse({ patientProfileId: patientId, clinicId: item.clinicId, dentistId: item.dentistId, serviceId: item.serviceId, preferredDate, earliestTime: earliestTime || null, latestTime: latestTime || null })
    if (!parsed.success) return setMessage(t('checkDetails'))
    setBusyId('join'); setMessage(null)
    try {
      await joinWaitlist(parsed.data)
      setMessage(t('waitlistJoined'))
      await queryClient.invalidateQueries({ queryKey: ['patient-waitlist', profile.id] })
    } catch { setMessage(t('authUnavailable')) } finally { setBusyId(null) }
  }

  const accept = async (id: string) => {
    setBusyId(id); setMessage(null)
    try {
      setConfirmation(await confirmWaitlistOffer(id))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['patient-waitlist', profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['appointments', profile.id] }),
      ])
    } catch { setMessage(t('waitlistOfferExpired')); await queryClient.invalidateQueries({ queryKey: ['patient-waitlist', profile.id] }) } finally { setBusyId(null) }
  }

  if (confirmation) return <Screen maxWidth={680} style={styles.screen}>
    <Stack.Screen options={{ title: t('waitlistConfirmed'), headerBackTitle: t('back') }} />
    <View style={styles.successIcon}><CheckCircle2 size={44} color={colors.success} /></View>
    <Text style={styles.successTitle}>{t('waitlistConfirmed')}</Text>
    <Text style={styles.successBody}>{t('waitlistConfirmedBody')}</Text>
    <SectionCard eyebrow={t('receipt').toUpperCase()} title={confirmation.receiptNumber}><Text style={styles.body}>{t('bookingConfirmedBody')}</Text></SectionCard>
    <Button label={t('appointments')} onPress={() => router.dismissTo('/patient/appointments')} />
  </Screen>

  return <Screen maxWidth={760} style={styles.screen}>
    <Stack.Screen options={{ title: t('waitlist'), headerBackTitle: t('back') }} />
    <View style={styles.heading}><BellRing size={27} color={colors.teal} /><View style={styles.headingCopy}><Text style={styles.title}>{t('waitlist')}</Text><Text style={styles.subtitle}>{t('waitlistBody')}</Text></View></View>
    <View style={styles.trust}><ShieldCheck size={17} color={colors.teal} /><Text style={styles.trustText}>{t('waitlistPolicy')}</Text></View>

    {item ? <SectionCard eyebrow={item.clinicName.toUpperCase()} title={item.serviceName}>
      <Text style={styles.body}>{t('waitlistJoinBody')}</Text>
      {profiles.isLoading ? <ActivityIndicator color={colors.teal} /> : <View style={styles.profileChoices}>{profiles.data?.map((patient) => <Pressable key={patient.id} accessibilityRole="radio" accessibilityState={{ checked: patientId === patient.id }} style={[styles.choice, patientId === patient.id && styles.choiceActive]} onPress={() => setPatientId(patient.id)}><Text style={[styles.choiceText, patientId === patient.id && styles.choiceTextActive]}>{patient.fullName}</Text><Text style={styles.choiceMeta}>{t(patient.relationship)}</Text></Pressable>)}</View>}
      <Field label={t('preferredDate')} value={preferredDate} onChangeText={(value) => setPreferredDate(maskDate(value))} placeholder="YYYY-MM-DD" autoCapitalize="none" keyboardType="number-pad" maxLength={10} />
      <View style={styles.timeFields}><View style={styles.timeField}><Field label={t('earliestTime')} value={earliestTime} onChangeText={(value) => setEarliestTime(maskTime(value))} placeholder="09:00" autoCapitalize="none" keyboardType="number-pad" maxLength={5} /></View><View style={styles.timeField}><Field label={t('latestTime')} value={latestTime} onChangeText={(value) => setLatestTime(maskTime(value))} placeholder="17:00" autoCapitalize="none" keyboardType="number-pad" maxLength={5} /></View></View>
      <Text style={styles.formatHint}>{t('dateTimeFormatHint')}</Text>
      <Button label={t('joinWaitlist')} loading={busyId === 'join'} disabled={!patientId} onPress={() => void join()} />
    </SectionCard> : null}

    <SectionCard eyebrow={t('activeRequests').toUpperCase()} title={t('waitlistUpdates')}>
      {entries.isLoading ? <ActivityIndicator color={colors.teal} /> : entries.data?.length ? <View style={styles.entries}>{entries.data.map((entry) => {
        const offerActive = entry.status === 'offered' && Boolean(entry.offerExpiresAt) && Date.parse(entry.offerExpiresAt!) > Date.now()
        return <View key={entry.id} style={styles.entry}><View style={styles.entryIcon}>{offerActive ? <BellRing size={18} color={colors.ink} /> : <CalendarClock size={18} color={colors.teal} />}</View><View style={styles.entryCopy}><Text style={styles.entryTitle}>{entry.clinicName}</Text><Text style={styles.entryMeta}>{entry.serviceName} · {dateFormatter.format(new Date(`${entry.preferredDate}T12:00:00+06:00`))}</Text>{entry.offeredStartAt ? <View style={styles.offerTime}><Clock3 size={14} color={offerActive ? colors.success : colors.danger} /><Text style={[styles.offerText, !offerActive && styles.offerExpired]}>{offerActive ? formatter.format(new Date(entry.offeredStartAt)) : t('offerExpired')}</Text></View> : <Text style={styles.waitingText}>{t('waitingForSlot')}</Text>}</View>{offerActive ? <Button label={t('acceptSlot')} loading={busyId === entry.id} onPress={() => void accept(entry.id)} /> : null}</View>
      })}</View> : <View style={styles.empty}><CalendarClock size={30} color={colors.teal} /><Text style={styles.body}>{t('noWaitlistRequests')}</Text></View>}
    </SectionCard>
    {message ? <Text accessibilityRole="alert" style={[styles.message, message === t('authUnavailable') || message === t('waitlistOfferExpired') ? styles.error : undefined]}>{message}</Text> : null}
  </Screen>
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xl, gap: spacing.lg }, heading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, headingCopy: { flex: 1, gap: 5 }, title: { color: colors.inkDeep, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  trust: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.mintSoft, borderRadius: radius.md }, trustText: { flex: 1, color: colors.teal, fontSize: 12, lineHeight: 18 }, body: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  profileChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, choice: { minHeight: hitTarget, minWidth: 130, flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.pearl }, choiceActive: { borderColor: colors.mint, backgroundColor: colors.mintSoft }, choiceText: { color: colors.ink, fontWeight: '800' }, choiceTextActive: { color: colors.teal }, choiceMeta: { color: colors.muted, fontSize: 10 },
  timeFields: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }, timeField: { flex: 1, minWidth: 160 }, formatHint: { marginTop: -spacing.sm, color: colors.muted, fontSize: 10, lineHeight: 15 }, entries: { gap: 0 }, entry: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, entryIcon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.mintSoft }, entryCopy: { flex: 1, gap: 4 }, entryTitle: { color: colors.inkDeep, fontSize: 14, fontWeight: '800' }, entryMeta: { color: colors.muted, fontSize: 11 }, offerTime: { flexDirection: 'row', alignItems: 'center', gap: 5 }, offerText: { color: colors.success, fontSize: 11, fontWeight: '800' }, offerExpired: { color: colors.danger }, waitingText: { color: colors.teal, fontSize: 11, fontWeight: '700' }, empty: { minHeight: 140, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  message: { color: colors.success, fontSize: 13, lineHeight: 19 }, error: { color: colors.danger }, successIcon: { width: 84, height: 84, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 42, backgroundColor: colors.mintSoft }, successTitle: { color: colors.inkDeep, fontSize: 30, fontWeight: '800', letterSpacing: -0.8, textAlign: 'center' }, successBody: { color: colors.muted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
})
