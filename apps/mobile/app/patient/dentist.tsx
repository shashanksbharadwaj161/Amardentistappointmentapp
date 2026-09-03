import type { MarketplaceDentist } from '@amar-dentist/domain'
import { useQuery } from '@tanstack/react-query'
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router'
import { CalendarClock, CheckCircle2, Clock3, ReceiptText, ShieldCheck, Star } from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Screen } from '../../src/components/Screen'
import { SectionCard } from '../../src/components/SectionCard'
import { confirmMockBooking, createBookingHold, getBookingSlots, getPatientProfiles, type BookingConfirmation, type BookingHold } from '../../src/lib/phase3'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, hitTarget, radius, spacing } from '../../src/theme'

export default function DentistBookingScreen() {
  const { item: encoded } = useLocalSearchParams<{ item?: string }>()
  const { profile, loading } = useAuth()
  const { locale, t } = useLocale()
  const item = useMemo(() => { try { return encoded ? JSON.parse(encoded) as MarketplaceDentist : null } catch { return null } }, [encoded])
  const profiles = useQuery({ queryKey: ['patient-profiles', profile?.id], queryFn: () => getPatientProfiles(profile!.id), enabled: Boolean(profile) })
  const slots = useQuery({ queryKey: ['booking-slots', item?.clinicId, item?.serviceId, item?.dentistId], queryFn: () => getBookingSlots(item!), enabled: Boolean(profile && item) })
  const [patientId, setPatientId] = useState<string | null>(null)
  const [selectedStart, setSelectedStart] = useState<string | null>(null)
  const [hold, setHold] = useState<BookingHold | null>(null)
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  useEffect(() => { if (!patientId && profiles.data?.[0]) setPatientId(profiles.data[0].id) }, [patientId, profiles.data])
  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null
  if (!item) return <Redirect href="/patient/discover" />
  const formatter = new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dhaka' })

  const reserve = async () => {
    if (!patientId || !selectedStart) return setMessage(t('checkDetails'))
    setBusy(true); setMessage(null)
    try { setHold(await createBookingHold(patientId, item, selectedStart)) } catch { setMessage(t('authUnavailable')) } finally { setBusy(false) }
  }
  const confirm = async () => {
    if (!hold) return
    setBusy(true); setMessage(null)
    try { setConfirmation(await confirmMockBooking(hold.id)) } catch { setMessage(t('authUnavailable')) } finally { setBusy(false) }
  }

  if (confirmation) return <Screen maxWidth={680} style={styles.screen}>
    <Stack.Screen options={{ title: t('bookingConfirmed'), headerBackTitle: t('back') }} />
    <View style={styles.successIcon}><CheckCircle2 size={48} color={colors.success} /></View><Text style={styles.successTitle}>{t('bookingConfirmed')}</Text><Text style={styles.successBody}>{t('bookingConfirmedBody')}</Text>
    <SectionCard eyebrow={t('receipt').toUpperCase()} title={confirmation.receiptNumber}><View style={styles.receiptRow}><ReceiptText size={20} color={colors.teal} /><Text style={styles.receiptText}>{item.clinicName}</Text></View><Text style={styles.receiptMeta}>{selectedStart ? formatter.format(new Date(selectedStart)) : ''} · {item.durationMinutes} min</Text><Text style={styles.receiptMeta}>৳{hold?.depositBdt.toLocaleString()} {t('depositBdt').toLowerCase()}</Text></SectionCard>
    <Button label={t('discoverDentists')} onPress={() => router.replace('/patient/discover')} />
  </Screen>

  return <Screen maxWidth={760} style={styles.screen}>
    <Stack.Screen options={{ title: item.dentistName, headerBackTitle: t('back') }} />
    <View style={styles.profile}><View style={styles.avatar}><Text style={styles.avatarText}>{item.dentistName.split(' ').at(-1)?.slice(0, 1)}</Text></View><View style={styles.profileCopy}><View style={styles.verified}><Text style={styles.title}>{item.dentistName}</Text><CheckCircle2 size={18} color={colors.teal} /></View><Text style={styles.subtitle}>{item.professionalTitle} · {item.clinicName}</Text><View style={styles.rating}><Star size={14} color={colors.warning} fill={colors.warning} /><Text style={styles.ratingText}>{item.rating.toFixed(1)} · {item.reviewCount} {t('reviews')}</Text></View></View></View>
    <View style={styles.trust}><ShieldCheck size={18} color={colors.teal} /><Text style={styles.trustText}>{t('trustedPrice')}</Text></View>
    <SectionCard eyebrow={t('profileFamily').toUpperCase()} title={t('profileFamilyBody')}>
      {profiles.isLoading ? <ActivityIndicator color={colors.teal} /> : <View style={styles.profileChoices}>{profiles.data?.map((patient) => <Pressable key={patient.id} accessibilityRole="radio" accessibilityState={{ checked: patientId === patient.id }} style={[styles.choice, patientId === patient.id && styles.choiceActive]} onPress={() => setPatientId(patient.id)}><Text style={[styles.choiceText, patientId === patient.id && styles.choiceTextActive]}>{patient.fullName}</Text><Text style={styles.choiceMeta}>{t(patient.relationship)}</Text></Pressable>)}</View>}
      <Button label={t('manageProfiles')} variant="ghost" onPress={() => router.push('/patient/profiles')} />
    </SectionCard>
    <SectionCard eyebrow={t('availableSlots').toUpperCase()} title={t('chooseTime')}><Text style={styles.body}>{t('chooseTimeBody')}</Text>{slots.isLoading ? <ActivityIndicator color={colors.teal} /> : slots.data?.length ? <View style={styles.slots}>{slots.data.map((slot) => <Pressable key={slot.startAt} accessibilityRole="radio" accessibilityState={{ checked: selectedStart === slot.startAt }} style={[styles.slot, selectedStart === slot.startAt && styles.slotActive]} onPress={() => { setSelectedStart(slot.startAt); setHold(null) }}><Clock3 size={16} color={selectedStart === slot.startAt ? colors.paper : colors.teal} /><Text style={[styles.slotText, selectedStart === slot.startAt && styles.slotTextActive]}>{formatter.format(new Date(slot.startAt))}</Text></Pressable>)}</View> : <View style={styles.empty}><CalendarClock size={28} color={colors.teal} /><Text style={styles.body}>{t('noAvailability')}</Text></View>}</SectionCard>
    {hold ? <SectionCard eyebrow={t('bookingHoldActive').toUpperCase()} title={`৳${hold.depositBdt.toLocaleString()} ${t('depositBdt').toLowerCase()}`}><Text style={styles.body}>{t('trustedPrice')}</Text><Button label={t('confirmDeposit')} loading={busy} onPress={() => void confirm()} /></SectionCard> : <Button label={t('holdThisTime')} loading={busy} disabled={!selectedStart || !patientId} onPress={() => void reserve()} />}
    {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
  </Screen>
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xl, gap: spacing.lg }, profile: { flexDirection: 'row', gap: spacing.lg, alignItems: 'center' }, avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintSoft }, avatarText: { color: colors.teal, fontSize: 28, fontWeight: '800' }, profileCopy: { flex: 1, gap: 5 }, verified: { flexDirection: 'row', alignItems: 'center', gap: 7 }, title: { flexShrink: 1, color: colors.inkDeep, fontSize: 24, fontWeight: '800', letterSpacing: -0.6 }, subtitle: { color: colors.muted, fontSize: 13 }, rating: { flexDirection: 'row', alignItems: 'center', gap: 5 }, ratingText: { color: colors.ink, fontSize: 12, fontWeight: '700' }, trust: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, backgroundColor: colors.mintSoft, borderRadius: radius.md }, trustText: { flex: 1, color: colors.teal, fontSize: 11, lineHeight: 17 }, profileChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, choice: { minHeight: hitTarget, minWidth: 130, flexGrow: 1, paddingHorizontal: spacing.md, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.pearl }, choiceActive: { borderColor: colors.mint, backgroundColor: colors.mintSoft }, choiceText: { color: colors.ink, fontWeight: '800' }, choiceTextActive: { color: colors.teal }, choiceMeta: { color: colors.muted, fontSize: 10 }, body: { color: colors.muted, fontSize: 12, lineHeight: 18 }, slots: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, slot: { minHeight: hitTarget, flexGrow: 1, flexBasis: '47%', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.pearl }, slotActive: { borderColor: colors.inkDeep, backgroundColor: colors.inkDeep }, slotText: { flex: 1, color: colors.ink, fontSize: 11, fontWeight: '700' }, slotTextActive: { color: colors.paper }, empty: { minHeight: 120, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, error: { color: colors.danger, fontSize: 12 }, successIcon: { width: 88, height: 88, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 44, backgroundColor: colors.mintSoft }, successTitle: { textAlign: 'center', color: colors.inkDeep, fontSize: 32, fontWeight: '800', letterSpacing: -1 }, successBody: { textAlign: 'center', color: colors.muted, fontSize: 14, lineHeight: 21 }, receiptRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, receiptText: { color: colors.ink, fontWeight: '800' }, receiptMeta: { color: colors.muted, fontSize: 12 },
})
