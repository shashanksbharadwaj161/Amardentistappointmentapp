import type { MarketplaceDentist } from '@amar-dentist/domain'
import { useQuery } from '@tanstack/react-query'
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router'
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, ShieldCheck } from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { Button } from '../../src/components/Button'
import { Screen } from '../../src/components/Screen'
import { SectionCard } from '../../src/components/SectionCard'
import { formatCalendarDate, formatClinicTime } from '../../src/lib/calendar-dates'
import { getPatientCalendarSlots, groupPatientSlots, patientBookingWindow, patientDateKey, patientMonthDays, patientSlotPeriod, releasePatientCalendarHold, shiftPatientMonth } from '../../src/lib/patient-calendar'
import { patientCalendarMessages } from '../../src/lib/patient-calendar-messages'
import { confirmMockBooking, createBookingHold, getPatientProfiles, isMarketplacePreview, rescheduleAppointment, type BookingConfirmation, type BookingHold } from '../../src/lib/phase3'
import { subscribeToAppointmentChanges } from '../../src/lib/phase2'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, radius, spacing } from '../../src/theme'

export default function DentistBookingScreen() {
  const { item: encoded, rescheduleId } = useLocalSearchParams<{ item?: string; rescheduleId?: string }>()
  const { profile, loading } = useAuth()
  const { locale, t } = useLocale()
  const m = patientCalendarMessages[locale === 'bn' ? 'bn' : 'en']
  const { width } = useWindowDimensions()
  const wide = width >= 900
  const item = useMemo(() => { try { return encoded ? JSON.parse(encoded) as MarketplaceDentist : null } catch { return null } }, [encoded])
  const [now, setNow] = useState(Date.now())
  const today = patientDateKey(new Date(now))
  const [month, setMonth] = useState(today.slice(0, 7))
  const [day, setDay] = useState<string | null>(null)
  const [patientId, setPatientId] = useState<string | null>(null)
  const [selectedStart, setSelectedStart] = useState<string | null>(null)
  const [hold, setHold] = useState<BookingHold | null>(null)
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const profiles = useQuery({ queryKey: ['patient-profiles', profile?.id], queryFn: () => getPatientProfiles(profile!.id), enabled: Boolean(profile) })
  const slots = useQuery({ queryKey: ['booking-calendar', item?.clinicId, item?.serviceId, item?.dentistId, month], queryFn: () => getPatientCalendarSlots(item!, month), enabled: Boolean(profile && item), refetchInterval: 30_000 })
  const grouped = useMemo(() => groupPatientSlots(slots.data ?? [], new Date(now)), [slots.data, now])
  const days = useMemo(() => patientMonthDays(month), [month])
  const locked = Boolean(hold) || busy
  const remaining = hold ? Math.max(0, Math.ceil((Date.parse(hold.expiresAt) - now) / 1000)) : 0
  const refetchSlots = slots.refetch
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), hold ? 1000 : 30_000); return () => clearInterval(timer) }, [hold?.id])
  useEffect(() => { if (!patientId && profiles.data?.[0]) setPatientId(profiles.data[0].id) }, [patientId, profiles.data])
  useEffect(() => {
    if (!locked && !slots.isFetching && slots.isSuccess && (!day || !grouped[day]?.length)) setDay(Object.keys(grouped).sort()[0] ?? null)
  }, [day, grouped, locked, slots.isFetching, slots.isSuccess])
  useEffect(() => {
    if (!locked && selectedStart && !Object.values(grouped).flat().some((slot) => slot.startAt === selectedStart)) setSelectedStart(null)
  }, [grouped, locked, selectedStart])
  useEffect(() => {
    if (hold && !remaining && !confirmation && !busy) { setHold(null); setSelectedStart(null); setMessage(m.expired); void refetchSlots() }
  }, [hold, remaining, confirmation, busy, m.expired, refetchSlots])
  useEffect(() => item ? subscribeToAppointmentChanges(item.dentistId, () => { void refetchSlots() }) : undefined, [item, refetchSlots])
  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null
  if (!item) return <Redirect href="/patient/discover" />
  const number = (value: number) => value.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-GB')
  const displayDate = (value: string) => formatCalendarDate(value, locale, { weekday: 'long', day: 'numeric', month: 'long' })
  const changeMonth = (value: string) => { setMonth(value); setDay(null); setSelectedStart(null); setMessage(null) }
  const reserve = async () => {
    if (!patientId || !selectedStart || locked || Date.parse(selectedStart) <= Date.now()) return
    setBusy(true); setMessage(null)
    try { const result = await createBookingHold(patientId, item, selectedStart); setNow(Date.now()); setHold(result) }
    catch (error) { setMessage(error instanceof Error && /SLOT|CONFLICT|OVERLAP|UNAVAILABLE/i.test(error.message) ? m.taken : m.bookingError); setSelectedStart(null); void slots.refetch() }
    finally { setBusy(false) }
  }
  const confirm = async () => {
    if (!hold || busy || Date.parse(hold.expiresAt) <= Date.now()) return
    setBusy(true); setMessage(null)
    try { setConfirmation(rescheduleId ? await rescheduleAppointment(rescheduleId, hold.id) : await confirmMockBooking(hold.id)) }
    catch { setMessage(m.confirmError) } finally { setBusy(false) }
  }
  const release = async () => {
    if (!hold || busy) return
    setBusy(true); setMessage(null)
    try { await releasePatientCalendarHold(hold.id); setHold(null); setSelectedStart(null); await slots.refetch() }
    catch { setMessage(m.releaseError) } finally { setBusy(false) }
  }
  if (confirmation) return <Screen maxWidth={680} style={styles.screen}>
    <Stack.Screen options={{ title: t('bookingConfirmed'), headerBackTitle: t('back') }} />
    <CheckCircle2 size={54} color={colors.teal} /><Text style={styles.title}>{t('bookingConfirmed')}</Text><Text style={styles.body}>{isMarketplacePreview ? m.demoConfirmation : t('bookingConfirmedBody')}</Text>
    <SectionCard eyebrow={t('receipt')} title={confirmation.receiptNumber}><Text style={styles.strong}>{item.clinicName}</Text><Text style={styles.body}>{selectedStart ? `${displayDate(patientDateKey(selectedStart))} · ${formatClinicTime(selectedStart, locale)}` : ''}</Text><Text style={styles.body}>{m.deposit}: ৳{number(hold?.depositBdt ?? 0)}</Text></SectionCard>
    <Button label={m.appointments} onPress={() => router.replace('/patient/appointments')} />
  </Screen>
  return <Screen maxWidth={1100} style={styles.screen}>
    <Stack.Screen options={{ title: rescheduleId ? t('rescheduleAppointment') : m.heading, headerBackTitle: t('back') }} />
    <View style={styles.intro}><View style={styles.avatar}><CalendarDays size={28} color={colors.teal} /></View><View style={styles.flex}><Text style={styles.kicker}>{item.clinicName}</Text><Text style={styles.title}>{item.dentistName}</Text><Text style={styles.body}>{item.serviceName} · {number(item.durationMinutes)} {m.minutes} · {item.reviewCount ? `${number(item.rating)} ★ (${number(item.reviewCount)})` : m.newClinic}</Text></View></View>
    {isMarketplacePreview ? <Text style={styles.preview}>{m.demo}</Text> : null}
    <View style={[styles.layout, wide && styles.row]}>
      <View style={styles.main}>
        <View style={styles.calendar}>
          <Text style={styles.sectionTitle}>{m.calendarTitle}</Text><Text style={styles.body}>{m.subtitle}</Text>
          <View style={styles.toolbar}>
            <Text accessibilityRole="header" style={styles.month}>{formatCalendarDate(`${month}-01`, locale, { month: 'long', year: 'numeric' })}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={m.previousMonth} disabled={locked || !patientBookingWindow(shiftPatientMonth(month, -1), new Date(now))} style={[styles.iconButton, (locked || !patientBookingWindow(shiftPatientMonth(month, -1), new Date(now))) && styles.disabled]} onPress={() => changeMonth(shiftPatientMonth(month, -1))}><ChevronLeft size={20} color={colors.ink} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={m.nextMonth} disabled={locked || !patientBookingWindow(shiftPatientMonth(month, 1), new Date(now))} style={[styles.iconButton, (locked || !patientBookingWindow(shiftPatientMonth(month, 1), new Date(now))) && styles.disabled]} onPress={() => changeMonth(shiftPatientMonth(month, 1))}><ChevronRight size={20} color={colors.ink} /></Pressable>
          </View>
          <View style={styles.weekdays}>{Array.from({ length: 7 }, (_, index) => <Text key={index} style={styles.weekday}>{formatCalendarDate(`2026-09-${String(6 + index).padStart(2, '0')}`, locale, { weekday: 'short' })}</Text>)}</View>
          <View style={styles.grid}>{days.map((date, index) => {
            const available = Boolean(date && grouped[date]?.length && !slots.isError && !slots.isFetching)
            const selected = date === day
            return <View key={date ?? `blank-${index}`} style={styles.dayCell}>{date ? <Pressable accessibilityRole="button" accessibilityLabel={`${displayDate(date)}${available ? `, ${number(grouped[date]!.length)} ${m.availableTimes}` : ''}`} accessibilityState={{ selected, disabled: locked || !available }} disabled={locked || !available} onPress={() => { setDay(date); setSelectedStart(null); setMessage(null) }} style={[styles.day, date === today && styles.today, !available && styles.unavailable, selected && styles.selectedDay]}><Text style={[styles.dayNumber, selected && styles.onDark]}>{formatCalendarDate(date, locale, { day: 'numeric' })}</Text><View style={[styles.dot, available && styles.availableDot, selected && styles.selectedDot]} /></Pressable> : null}</View>
          })}</View>
          <View style={styles.legend}><View style={styles.availableDot} /><Text style={styles.small}>{m.availableDay}</Text><View style={styles.flex} /><Button label={m.today} variant="ghost" disabled={locked} onPress={() => { changeMonth(today.slice(0, 7)); setDay(today) }} /></View>
          <View style={styles.timezone}><Clock3 size={15} color={colors.teal} /><Text style={styles.small}>{m.timezone}</Text></View>
          {slots.isFetching ? <View style={styles.status}><ActivityIndicator color={colors.teal} /><Text style={styles.body}>{m.loading}</Text></View> : slots.isError ? <View style={styles.status}><Text accessibilityRole="alert" style={styles.error}>{m.loadError}</Text><Button label={t('retry')} variant="secondary" onPress={() => void slots.refetch()} /></View> : !Object.keys(grouped).length ? <View style={styles.status}><Text style={styles.strong}>{m.noMonth}</Text><Text style={styles.body}>{m.noMonthBody}</Text><Button label={t('joinWaitlist')} variant="secondary" disabled={locked} onPress={() => router.push({ pathname: '/patient/waitlist', params: { item: encoded ?? JSON.stringify(item) } })} /></View> : null}
        </View>
        {day && !slots.isError ? <View style={styles.calendar}><Text style={styles.kicker}>{displayDate(day)}</Text><Text style={styles.sectionTitle}>{m.timesTitle}</Text>{(['morning', 'afternoon', 'evening'] as const).map((period) => {
          const times = (grouped[day] ?? []).filter((slot) => patientSlotPeriod(slot.startAt) === period)
          return times.length ? <View key={period} style={styles.period}><Text style={styles.small}>{m[period]}</Text><View style={styles.times}>{times.map((slot) => <Pressable key={slot.startAt} accessibilityRole="radio" accessibilityLabel={`${displayDate(day)}, ${formatClinicTime(slot.startAt, locale)}`} accessibilityState={{ checked: selectedStart === slot.startAt, disabled: locked || slots.isFetching }} disabled={locked || slots.isFetching} onPress={() => { setSelectedStart(slot.startAt); setMessage(null) }} style={[styles.time, selectedStart === slot.startAt && styles.selectedDay, locked && selectedStart !== slot.startAt && styles.disabled]}><Text style={[styles.strong, selectedStart === slot.startAt && styles.onDark]}>{formatClinicTime(slot.startAt, locale)}</Text></Pressable>)}</View></View> : null
        })}</View> : null}
      </View>
      <View style={[styles.summary, wide && styles.wideSummary]}>
        <SectionCard eyebrow={m.patient} title={t('profileFamily')}>
          {profiles.isLoading ? <ActivityIndicator color={colors.teal} /> : profiles.isError ? <><Text accessibilityRole="alert" style={styles.error}>{m.profilesError}</Text><Button label={t('retry')} variant="secondary" onPress={() => void profiles.refetch()} /></> : profiles.data?.length ? profiles.data.map((patient) => <Pressable key={patient.id} accessibilityRole="radio" accessibilityState={{ checked: patientId === patient.id, disabled: locked }} disabled={locked} style={[styles.patient, patientId === patient.id && styles.patientActive]} onPress={() => setPatientId(patient.id)}><Text style={styles.strong}>{patient.fullName}</Text><Text style={styles.small}>{t(patient.relationship)}</Text></Pressable>) : <Text style={styles.body}>{m.noProfiles}</Text>}
          <Button label={t('manageProfiles')} variant="ghost" disabled={locked} onPress={() => router.push('/patient/profiles')} />
        </SectionCard>
        <SectionCard title={m.selection}>
          <Text style={styles.strong}>{item.serviceName}</Text><Text style={styles.body}>{selectedStart ? `${displayDate(patientDateKey(selectedStart))}\n${formatClinicTime(selectedStart, locale)} · ${number(item.durationMinutes)} ${m.minutes}` : m.pickDay}</Text>
          <View style={styles.priceRow}><Text style={styles.body}>{m.visitTotal}</Text><Text style={styles.strong}>৳{number(hold?.priceBdt ?? item.priceBdt)}</Text></View><View style={styles.priceRow}><Text style={styles.body}>{m.deposit}</Text><Text style={styles.price}>৳{number(hold?.depositBdt ?? item.depositBdt)}</Text></View>
          <View style={styles.timezone}><ShieldCheck size={17} color={colors.teal} /><Text style={styles.small}>{t('trustedPrice')}</Text></View>
          {hold ? <><View style={styles.hold}><Text style={styles.small}>{m.holdUntil}</Text><Text accessibilityLabel={`${m.holdUntil} ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`} style={styles.timer}>{number(Math.floor(remaining / 60))}:{number(remaining % 60).padStart(2, locale === 'bn' ? '০' : '0')}</Text></View><Text style={styles.small}>{m.calendarLocked}</Text><Button label={rescheduleId ? t('rescheduleAppointment') : t('confirmDeposit')} loading={busy} disabled={!remaining} onPress={() => void confirm()} /><Button label={m.changeTime} variant="secondary" disabled={busy} onPress={() => void release()} /></> : <><Text style={styles.small}>{m.holdHint}</Text><Button label={t('holdThisTime')} loading={busy} disabled={!selectedStart || !patientId || profiles.isError || slots.isError || slots.isFetching} onPress={() => void reserve()} /></>}
          {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
        </SectionCard>
      </View>
    </View>
  </Screen>
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg, paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40 },
  intro: { flexDirection: 'row', gap: 16, alignItems: 'center' }, avatar: { width: 60, height: 60, borderRadius: 20, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center' }, flex: { flex: 1, minWidth: 0 }, title: { fontSize: 27, fontWeight: '800', color: colors.inkDeep, letterSpacing: -0.7, marginVertical: 5 }, kicker: { color: colors.teal, fontSize: 12, fontWeight: '700' }, body: { color: colors.muted, fontSize: 14, lineHeight: 21 }, small: { color: colors.muted, fontSize: 12, lineHeight: 18, flexShrink: 1 }, strong: { color: colors.ink, fontSize: 14, fontWeight: '700' }, sectionTitle: { color: colors.inkDeep, fontSize: 21, fontWeight: '800' }, preview: { color: colors.teal, fontSize: 12 },
  layout: { gap: 24, alignItems: 'stretch' }, row: { flexDirection: 'row', alignItems: 'flex-start' }, main: { flex: 1, minWidth: 0, gap: 20 }, summary: { gap: 20 }, wideSummary: { width: 320 }, calendar: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 16, gap: 12 }, toolbar: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 }, month: { flex: 1, color: colors.ink, fontWeight: '800', fontSize: 18 }, iconButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: colors.line }, disabled: { opacity: 0.4 }, weekdays: { flexDirection: 'row' }, weekday: { width: '14.285714%', textAlign: 'center', fontSize: 11, color: colors.muted, paddingVertical: 8 }, grid: { flexDirection: 'row', flexWrap: 'wrap' }, dayCell: { width: '14.285714%', padding: 1 }, day: { minHeight: 47, justifyContent: 'center', alignItems: 'center', borderRadius: 12, gap: 4, borderWidth: 1, borderColor: 'transparent' }, dayNumber: { fontSize: 15, fontWeight: '700', color: colors.ink }, today: { borderColor: colors.teal }, unavailable: { opacity: 0.28 }, selectedDay: { backgroundColor: colors.ink, opacity: 1 }, onDark: { color: colors.paper }, dot: { width: 4, height: 4, borderRadius: 2 }, availableDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.teal }, selectedDot: { backgroundColor: colors.mint }, legend: { flexDirection: 'row', gap: 6, alignItems: 'center' }, timezone: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' }, status: { gap: 12, paddingVertical: 14 }, period: { gap: 8, marginTop: 8 }, times: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, time: { minWidth: 78, minHeight: 46, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 12 }, patient: { borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12, minHeight: 52, gap: 4 }, patientActive: { borderColor: colors.teal, backgroundColor: colors.mintSoft }, priceRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 }, price: { color: colors.teal, fontWeight: '800', fontSize: 23 }, hold: { padding: 16, backgroundColor: colors.mintSoft, borderRadius: 12, gap: 4 }, timer: { fontSize: 30, fontWeight: '800', color: colors.teal, fontVariant: ['tabular-nums'] }, error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
})
