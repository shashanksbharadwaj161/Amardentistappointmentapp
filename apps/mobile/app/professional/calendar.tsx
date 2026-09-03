import { useQuery } from '@tanstack/react-query'
import { Redirect, router, Stack } from 'expo-router'
import { CalendarClock, CheckCircle2, Clock3, SlidersHorizontal } from 'lucide-react-native'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { SectionCard } from '../../src/components/SectionCard'
import { Screen } from '../../src/components/Screen'
import { getCalendarContext, subscribeToAppointmentChanges } from '../../src/lib/phase2'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, hitTarget, radius, shadow, spacing } from '../../src/theme'

function dateOnly(date: Date): string { return date.toISOString().slice(0, 10) }

export default function ProfessionalCalendarScreen() {
  const { profile, loading } = useAuth()
  const { locale, t } = useLocale()
  const [view, setView] = useState<'day' | 'week'>('day')
  const [selectedDate, setSelectedDate] = useState(dateOnly(new Date()))
  const range = useMemo(() => {
    const from = new Date()
    from.setUTCHours(0, 0, 0, 0)
    const through = new Date(from)
    through.setUTCDate(from.getUTCDate() + 6)
    return { from, through }
  }, [])
  const calendar = useQuery({
    queryKey: ['professional-calendar', profile?.id, dateOnly(range.from)],
    queryFn: () => getCalendarContext(profile!.id, range.from, range.through),
    enabled: Boolean(profile),
  })
  useEffect(() => calendar.data?.dentistId ? subscribeToAppointmentChanges(calendar.data.dentistId, () => { void calendar.refetch() }) : undefined, [calendar.data?.dentistId, calendar.refetch])
  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null

  const dates = Array.from({ length: 7 }, (_, index) => {
    const value = new Date(range.from)
    value.setUTCDate(range.from.getUTCDate() + index)
    return value
  })
  const localeCode = locale === 'bn' ? 'bn-BD' : 'en-GB'
  const selectedSlots = calendar.data?.slots.filter((slot) => slot.date === selectedDate) ?? []

  return <Screen maxWidth={920} style={styles.screen}>
    <Stack.Screen options={{ title: t('calendar'), headerBackTitle: t('back') }} />
    <View style={styles.headingRow}><View style={styles.headingCopy}><Text style={styles.kicker}>{calendar.data?.clinic?.name ?? t('professionalWorkspace')}</Text><Text style={styles.title}>{t('calendar')}</Text><Text style={styles.subtitle}>{calendar.data?.service ? `${calendar.data.service.name} · ${calendar.data.service.durationMinutes} min` : t('noService')}</Text></View><Pressable accessibilityRole="button" accessibilityLabel={t('manageSchedule')} style={styles.settings} onPress={() => router.push('/professional/manage-schedule')}><SlidersHorizontal size={21} color={colors.ink} /></Pressable></View>
    <View style={styles.segment}>{(['day', 'week'] as const).map((option) => <Pressable key={option} accessibilityRole="tab" accessibilityState={{ selected: view === option }} style={[styles.segmentButton, view === option && styles.segmentActive]} onPress={() => setView(option)}><Text style={[styles.segmentText, view === option && styles.segmentTextActive]}>{t(option)}</Text></Pressable>)}</View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dateStrip}>{dates.map((date) => {
      const value = dateOnly(date)
      const selected = selectedDate === value
      return <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected }} style={[styles.dateButton, selected && styles.dateActive]} onPress={() => setSelectedDate(value)}><Text style={[styles.dayName, selected && styles.dateTextActive]}>{new Intl.DateTimeFormat(localeCode, { weekday: 'short', timeZone: 'UTC' }).format(date)}</Text><Text style={[styles.dayNumber, selected && styles.dateTextActive]}>{new Intl.DateTimeFormat(localeCode, { day: 'numeric', timeZone: 'UTC' }).format(date)}</Text><View style={[styles.slotDot, (calendar.data?.slots.some((slot) => slot.date === value)) && styles.slotDotActive]} /></Pressable>
    })}</ScrollView>

    {calendar.isLoading ? <ActivityIndicator style={styles.loader} color={colors.teal} /> : calendar.isError ? <SectionCard title={t('authUnavailable')}><Button label={t('retry')} variant="secondary" onPress={() => void calendar.refetch()} /></SectionCard> : view === 'day' ? (
      <SectionCard eyebrow={new Intl.DateTimeFormat(localeCode, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${selectedDate}T00:00:00Z`)).toUpperCase()} title={t('availableSlots')}>
        {selectedSlots.length ? <View style={styles.slotGrid}>{selectedSlots.map((slot) => <View key={`${slot.date}-${slot.startTime}`} style={styles.slotCard}><View style={styles.timeIcon}><Clock3 size={17} color={colors.teal} /></View><View style={styles.slotCopy}><Text style={styles.slotTime}>{slot.startTime}</Text><Text style={styles.slotEnd}>{slot.endTime}</Text></View><CheckCircle2 size={18} color={colors.success} /></View>)}</View> : <View style={styles.empty}><CalendarClock size={28} color={colors.teal} /><Text style={styles.emptyTitle}>{t('noSlots')}</Text><Text style={styles.emptyBody}>{t('scheduleReadyBody')}</Text></View>}
      </SectionCard>
    ) : (
      <SectionCard eyebrow={t('week').toUpperCase()} title={t('availableSlots')}>
        <View style={styles.weekList}>{dates.map((date) => { const value = dateOnly(date); const count = calendar.data?.slots.filter((slot) => slot.date === value).length ?? 0; return <Pressable key={value} accessibilityRole="button" style={styles.weekRow} onPress={() => { setSelectedDate(value); setView('day') }}><View style={styles.weekDate}><Text style={styles.weekDay}>{new Intl.DateTimeFormat(localeCode, { weekday: 'long', timeZone: 'UTC' }).format(date)}</Text><Text style={styles.weekMeta}>{new Intl.DateTimeFormat(localeCode, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(date)}</Text></View><Text style={[styles.weekCount, count === 0 && styles.weekCountEmpty]}>{count} {t('availableSlots').toLowerCase()}</Text></Pressable> })}</View>
      </SectionCard>
    )}
    <View style={styles.note}><CheckCircle2 size={17} color={colors.teal} /><Text style={styles.noteText}>{t('scheduleReadyBody')}</Text></View>
  </Screen>
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xl },
  headingRow: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  headingCopy: { flex: 1, gap: 6 },
  kicker: { color: colors.teal, fontSize: 11, fontWeight: '800', letterSpacing: 1.1, textTransform: 'uppercase' },
  title: { color: colors.inkDeep, fontSize: 36, fontWeight: '800', letterSpacing: -1.3 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  settings: { width: hitTarget, height: hitTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  segment: { flexDirection: 'row', alignSelf: 'center', marginTop: spacing.xl, padding: 4, borderRadius: radius.pill, backgroundColor: '#E8EFED' },
  segmentButton: { minWidth: 92, minHeight: hitTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
  segmentActive: { backgroundColor: colors.paper, ...shadow },
  segmentText: { color: colors.muted, fontWeight: '700' },
  segmentTextActive: { color: colors.ink },
  dateStrip: { gap: 7, marginVertical: spacing.xl, paddingRight: spacing.sm },
  dateButton: { minHeight: 76, width: 52, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: radius.md, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  dateActive: { backgroundColor: colors.inkDeep, borderColor: colors.inkDeep },
  dayName: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  dayNumber: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  dateTextActive: { color: colors.paper },
  slotDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'transparent' },
  slotDotActive: { backgroundColor: colors.mint },
  loader: { marginTop: 56 },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  slotCard: { width: '48%', minWidth: 150, flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.pearl },
  timeIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintSoft },
  slotCopy: { flex: 1 },
  slotTime: { color: colors.inkDeep, fontSize: 15, fontWeight: '800' },
  slotEnd: { color: colors.muted, fontSize: 10 },
  empty: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  emptyTitle: { color: colors.ink, fontWeight: '800' },
  emptyBody: { maxWidth: 350, color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  weekList: { gap: 0 },
  weekRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  weekDate: { gap: 3 },
  weekDay: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  weekMeta: { color: colors.muted, fontSize: 11 },
  weekCount: { color: colors.success, fontSize: 11, fontWeight: '800' },
  weekCountEmpty: { color: colors.muted },
  note: { flexDirection: 'row', gap: 9, marginTop: spacing.xl, alignItems: 'flex-start', paddingHorizontal: spacing.sm },
  noteText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 17 },
})
