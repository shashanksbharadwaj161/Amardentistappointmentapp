import { clinicServiceSchema, scheduleExceptionSchema, weeklyScheduleBlockSchema, weeklyScheduleBreakSchema, type ScheduleExceptionKind } from '@amar-dentist/domain'
import { useQuery } from '@tanstack/react-query'
import { Redirect, Stack } from 'expo-router'
import { CheckCircle2 } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Field } from '../../src/components/Field'
import { Screen } from '../../src/components/Screen'
import { SectionCard } from '../../src/components/SectionCard'
import { getScheduleManagementContext, saveClinicService, saveScheduleException, saveWeeklyScheduleBlock, saveWeeklyScheduleBreak } from '../../src/lib/phase2'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, hitTarget, radius, spacing } from '../../src/theme'

const dayKeys = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const
const exceptionOptions: Array<{ kind: ScheduleExceptionKind; key: 'unavailable' | 'extraHours' | 'clinicClosed' }> = [
  { kind: 'unavailable', key: 'unavailable' }, { kind: 'available', key: 'extraHours' }, { kind: 'clinic_closed', key: 'clinicClosed' },
]
function tomorrow(): string { const value = new Date(); value.setUTCDate(value.getUTCDate() + 1); return value.toISOString().slice(0, 10) }

export default function ManageScheduleScreen() {
  const { profile, loading } = useAuth()
  const { locale, t } = useLocale()
  const context = useQuery({ queryKey: ['schedule-management', profile?.id], queryFn: () => getScheduleManagementContext(profile!.id), enabled: Boolean(profile) })
  const [serviceName, setServiceName] = useState('Dental consultation')
  const [duration, setDuration] = useState('30')
  const [price, setPrice] = useState('800')
  const [deposit, setDeposit] = useState('200')
  const [weekday, setWeekday] = useState(0)
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('17:00')
  const [blockId, setBlockId] = useState<string | null>(null)
  const [breakStart, setBreakStart] = useState('13:00')
  const [breakEnd, setBreakEnd] = useState('14:00')
  const [breakLabel, setBreakLabel] = useState('Lunch')
  const [exceptionKind, setExceptionKind] = useState<ScheduleExceptionKind>('unavailable')
  const [exceptionDate, setExceptionDate] = useState(tomorrow())
  const [exceptionStart, setExceptionStart] = useState('15:00')
  const [exceptionEnd, setExceptionEnd] = useState('17:00')
  const [exceptionReason, setExceptionReason] = useState('')
  const [busy, setBusy] = useState<'service' | 'hours' | 'break' | 'exception' | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null
  const clinic = context.data?.clinic
  const dentistId = context.data?.dentistId

  const saveService = async () => {
    if (!clinic) return setMessage(t('noClinics'))
    const parsed = clinicServiceSchema.safeParse({ id: null, clinicId: clinic.id, dentistId, name: serviceName, description: '', durationMinutes: Number(duration), priceBdt: Number(price), depositBdt: Number(deposit), active: true })
    if (!parsed.success) return setMessage(locale === 'bn' ? t('checkDetails') : (parsed.error.issues[0]?.message ?? t('checkDetails')))
    setBusy('service')
    try { await saveClinicService(parsed.data); setMessage(t('serviceSaved')) } catch { setMessage(t('authUnavailable')) } finally { setBusy(null) }
  }
  const saveHours = async () => {
    if (!clinic || !dentistId) return setMessage(t('scheduleNeedsApproval'))
    const parsed = weeklyScheduleBlockSchema.safeParse({ id: null, clinicId: clinic.id, dentistId, dayOfWeek: weekday, startTime, endTime, timezone: 'Asia/Dhaka', active: true })
    if (!parsed.success) return setMessage(locale === 'bn' ? t('checkDetails') : (parsed.error.issues[0]?.message ?? t('checkDetails')))
    setBusy('hours')
    try { const savedId = await saveWeeklyScheduleBlock(parsed.data); setBlockId(savedId); setMessage(t('scheduleSaved')) } catch { setMessage(t('authUnavailable')) } finally { setBusy(null) }
  }
  const addBreak = async () => {
    if (!blockId) return setMessage(t('saveHoursFirst'))
    const parsed = weeklyScheduleBreakSchema.safeParse({ scheduleBlockId: blockId, startTime: breakStart, endTime: breakEnd, label: breakLabel })
    if (!parsed.success) return setMessage(locale === 'bn' ? t('checkDetails') : (parsed.error.issues[0]?.message ?? t('checkDetails')))
    setBusy('break')
    try { await saveWeeklyScheduleBreak(parsed.data); setMessage(t('breakSaved')) } catch { setMessage(t('authUnavailable')) } finally { setBusy(null) }
  }
  const addException = async () => {
    if (!clinic || !dentistId) return setMessage(t('scheduleNeedsApproval'))
    const fullClosure = exceptionKind === 'clinic_closed'
    const parsed = scheduleExceptionSchema.safeParse({ clinicId: clinic.id, dentistId: fullClosure ? null : dentistId, date: exceptionDate, kind: exceptionKind, startTime: fullClosure ? null : exceptionStart, endTime: fullClosure ? null : exceptionEnd, reason: exceptionReason })
    if (!parsed.success) return setMessage(locale === 'bn' ? t('checkDetails') : (parsed.error.issues[0]?.message ?? t('checkDetails')))
    setBusy('exception')
    try { await saveScheduleException(parsed.data); setMessage(t('exceptionSaved')) } catch { setMessage(t('authUnavailable')) } finally { setBusy(null) }
  }

  return <Screen maxWidth={760} style={styles.screen}>
    <Stack.Screen options={{ title: t('manageSchedule'), headerBackTitle: t('back') }} />
    <View style={styles.heading}><Text style={styles.title}>{t('manageSchedule')}</Text><Text style={styles.subtitle}>{t('manageScheduleBody')}</Text></View>
    {context.isLoading ? null : !clinic ? <SectionCard title={t('noClinics')}><Text style={styles.body}>{t('scheduleNeedsApproval')}</Text></SectionCard> : <View style={styles.sections}>
      <SectionCard eyebrow={clinic.name.toUpperCase()} title={t('serviceName')}>
        <Field label={t('serviceName')} value={serviceName} onChangeText={setServiceName} />
        <Field label={t('durationMinutes')} value={duration} onChangeText={setDuration} keyboardType="number-pad" />
        <View style={styles.row}><View style={styles.half}><Field label={t('priceBdt')} value={price} onChangeText={setPrice} keyboardType="number-pad" /></View><View style={styles.half}><Field label={t('depositBdt')} value={deposit} onChangeText={setDeposit} keyboardType="number-pad" /></View></View>
        <Button label={t('saveService')} loading={busy === 'service'} onPress={() => void saveService()} />
      </SectionCard>
      <SectionCard eyebrow={t('clinicHours').toUpperCase()} title={t('weeklyHours')}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.days}>{dayKeys.map((key, index) => <Pressable key={key} accessibilityRole="radio" accessibilityState={{ checked: weekday === index }} style={[styles.day, weekday === index && styles.dayActive]} onPress={() => setWeekday(index)}><Text style={[styles.dayText, weekday === index && styles.dayTextActive]}>{t(key).slice(0, 2)}</Text></Pressable>)}</ScrollView>
        <View style={styles.row}><View style={styles.half}><Field label={t('startTime')} value={startTime} onChangeText={setStartTime} keyboardType="numbers-and-punctuation" hint="HH:mm" /></View><View style={styles.half}><Field label={t('endTime')} value={endTime} onChangeText={setEndTime} keyboardType="numbers-and-punctuation" hint="HH:mm" /></View></View>
        <Button label={t('saveHours')} loading={busy === 'hours'} onPress={() => void saveHours()} />
      </SectionCard>
      <SectionCard eyebrow={t('weeklyHours').toUpperCase()} title={t('breaksExceptions')}>
        <Field label={t('breakLabel')} value={breakLabel} onChangeText={setBreakLabel} />
        <View style={styles.row}><View style={styles.half}><Field label={t('startTime')} value={breakStart} onChangeText={setBreakStart} hint="HH:mm" /></View><View style={styles.half}><Field label={t('endTime')} value={breakEnd} onChangeText={setBreakEnd} hint="HH:mm" /></View></View>
        <Button label={t('addBreak')} variant="secondary" loading={busy === 'break'} onPress={() => void addBreak()} />
        <View style={styles.divider} />
        <View style={styles.days}>{exceptionOptions.map((option) => <Pressable key={option.kind} accessibilityRole="radio" accessibilityState={{ checked: exceptionKind === option.kind }} style={[styles.exceptionChoice, exceptionKind === option.kind && styles.dayActive]} onPress={() => setExceptionKind(option.kind)}><Text style={[styles.dayText, exceptionKind === option.kind && styles.dayTextActive]}>{t(option.key)}</Text></Pressable>)}</View>
        <Field label={t('exceptionDate')} value={exceptionDate} onChangeText={setExceptionDate} hint="YYYY-MM-DD" />
        {exceptionKind !== 'clinic_closed' ? <View style={styles.row}><View style={styles.half}><Field label={t('startTime')} value={exceptionStart} onChangeText={setExceptionStart} hint="HH:mm" /></View><View style={styles.half}><Field label={t('endTime')} value={exceptionEnd} onChangeText={setExceptionEnd} hint="HH:mm" /></View></View> : null}
        <Field label={t('reason')} value={exceptionReason} onChangeText={setExceptionReason} />
        <Button label={t('addException')} variant="secondary" loading={busy === 'exception'} onPress={() => void addException()} />
      </SectionCard>
    </View>}
    {message ? <View style={styles.message}><CheckCircle2 size={18} color={colors.teal} /><Text style={styles.messageText}>{message}</Text></View> : null}
  </Screen>
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xl },
  heading: { gap: spacing.sm, marginBottom: spacing.xl },
  title: { color: colors.inkDeep, fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  sections: { gap: spacing.lg },
  body: { color: colors.muted, lineHeight: 20 },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  days: { gap: 6, paddingRight: spacing.sm },
  day: { width: hitTarget, minHeight: hitTarget, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.pearl },
  dayActive: { borderColor: colors.inkDeep, backgroundColor: colors.inkDeep },
  dayText: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  dayTextActive: { color: colors.paper },
  exceptionChoice: { minHeight: hitTarget, flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.pearl },
  divider: { height: 1, backgroundColor: colors.line },
  message: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.mintSoft },
  messageText: { flex: 1, color: colors.teal, fontSize: 12, lineHeight: 18 },
})
