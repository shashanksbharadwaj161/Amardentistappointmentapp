import { canMarkNoShow } from '@amar-dentist/domain'
import { useQuery } from '@tanstack/react-query'
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router'
import { BellRing, Building2, CalendarCheck2, CheckCircle2, Clock3, QrCode, XCircle } from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Screen } from '../../src/components/Screen'
import { SectionCard } from '../../src/components/SectionCard'
import { getClinicOperationsContext, getClinicWaitlistOfferSlots, markAppointmentNoShow, offerWaitlistSlot } from '../../src/lib/phase3'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, radius, spacing } from '../../src/theme'

function dhakaDate(value: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Dhaka' }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function dhakaTime(value: string): string {
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Dhaka' }).format(new Date(value))
}

export default function ProfessionalOperationsScreen() {
  const params = useLocalSearchParams<{ clinicId?: string }>()
  const { width } = useWindowDimensions()
  const { profile, loading } = useAuth()
  const { locale, t } = useLocale()
  const [clinicId, setClinicId] = useState<string | undefined>(params.clinicId)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const operations = useQuery({ queryKey: ['clinic-operations', profile?.id, clinicId], queryFn: () => getClinicOperationsContext(profile!.id, clinicId), enabled: Boolean(profile), refetchInterval: 10_000 })
  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null
  const formatter = new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dhaka' })
  const dateFormatter = new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Dhaka' })
  const operationData = operations.data
  const clinic = operationData?.clinic
  const isDentist = clinic?.roles.includes('dentist') ?? false

  const noShow = async (id: string, startsAt: string) => {
    if (!canMarkNoShow(new Date(), new Date(startsAt))) return setMessage(t('noShowNotReady'))
    setBusyId(id); setMessage(null)
    try { await markAppointmentNoShow(id); setMessage(t('noShowRecorded')); await operations.refetch() } catch { setMessage(t('operationFailed')) } finally { setBusyId(null) }
  }
  const offer = async () => {
    const data = operations.data
    const waiting = data?.waitlist.find((entry) => entry.status === 'waiting')
    const dentistId = waiting?.dentistId ?? data?.dentists[0]?.id
    if (!data?.clinic || !dentistId || !waiting) return setMessage(t('noMatchingWaitlistSlot'))
    setBusyId('offer'); setMessage(null)
    try {
      const slots = await getClinicWaitlistOfferSlots(data.clinic.id, waiting.serviceId, dentistId)
      const slot = slots.find((candidate) => dhakaDate(candidate.startAt) === waiting.preferredDate && (!waiting.earliestTime || dhakaTime(candidate.startAt) >= waiting.earliestTime.slice(0, 5)) && (!waiting.latestTime || dhakaTime(candidate.startAt) <= waiting.latestTime.slice(0, 5)))
      if (!slot) return setMessage(t('noMatchingWaitlistSlot'))
      await offerWaitlistSlot(data.clinic.id, waiting.serviceId, dentistId, slot.startAt); setMessage(t('waitlistOfferSent')); await operations.refetch()
    } catch { setMessage(t('operationFailed')) } finally { setBusyId(null) }
  }

  const appointmentStatus = (status: string) => status === 'confirmed' ? t('statusConfirmed') : status === 'checked_in' ? t('statusCheckedIn') : status === 'completed' ? t('statusCompleted') : status === 'no_show' ? t('statusNoShow') : status

  return <Screen maxWidth={920} style={styles.screen}>
    <Stack.Screen options={{ title: t('clinicOperations'), headerBackTitle: t('back') }} />
    <View style={styles.heading}><CalendarCheck2 size={28} color={colors.teal} /><View style={styles.headingCopy}><Text style={styles.kicker}>{clinic?.name ?? t('professionalWorkspace')}</Text><Text style={styles.title}>{t('clinicOperations')}</Text><Text style={styles.subtitle}>{t('clinicOperationsBody')}</Text></View></View>
    {operationData && operationData.clinics.length > 1 ? <View accessibilityRole="tablist" style={styles.clinicChoices}>{operationData.clinics.map((item) => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: clinic?.id === item.id }} onPress={() => setClinicId(item.id)} style={[styles.clinicChoice, clinic?.id === item.id && styles.clinicChoiceActive]}><Building2 size={16} color={clinic?.id === item.id ? colors.ink : colors.teal} /><Text style={[styles.clinicChoiceText, clinic?.id === item.id && styles.clinicChoiceTextActive]}>{item.name}</Text></Pressable>)}</View> : null}
    <View style={styles.quickActions}><Button label={t('newWalkIn')} onPress={() => router.push({ pathname: '/professional/walk-in', params: clinic ? { clinicId: clinic.id } : {} })} /><Button label={t('scanCheckin')} variant="secondary" onPress={() => router.push('/professional/check-in')} /><Button label={t('clinicInbox')} variant="secondary" onPress={() => router.push({ pathname: '/professional/inbox', params: clinic ? { clinicId: clinic.id } : {} })} /></View>
    {message ? <View style={styles.notice}><CheckCircle2 size={17} color={colors.teal} /><Text style={styles.noticeText}>{message}</Text></View> : null}
    {operations.isLoading ? <ActivityIndicator color={colors.teal} /> : operations.isError ? <SectionCard title={t('authUnavailable')}><Button label={t('retry')} variant="secondary" onPress={() => void operations.refetch()} /></SectionCard> : !clinic || !operationData ? <SectionCard title={t('noClinics')}><Text style={styles.body}>{t('scheduleNeedsApproval')}</Text></SectionCard> : <>
      <View style={[styles.sections, width >= 900 && styles.sectionsWide]}><View style={styles.section}><SectionCard eyebrow={t('today').toUpperCase()} title={t('clinicSchedule')}>
        {operationData.appointments.length ? <View style={styles.rows}>{operationData.appointments.map((appointment) => <View key={appointment.id} style={[styles.row, (width < 760 || width >= 900) && styles.rowCompact]}><View style={[styles.stateIcon, appointment.status === 'checked_in' && styles.stateIconActive]}>{appointment.status === 'checked_in' ? <CheckCircle2 size={18} color={colors.ink} /> : appointment.status === 'no_show' ? <XCircle size={18} color={colors.danger} /> : <Clock3 size={18} color={colors.teal} />}</View><View style={styles.rowCopy}><Text style={styles.rowTitle}>{appointment.patientName}</Text><Text style={styles.rowMeta}>{formatter.format(new Date(appointment.startAt))} · {appointment.serviceName}</Text><Text style={styles.rowStatus}>{appointmentStatus(appointment.status)}</Text></View><View style={[styles.rowActions, (width < 760 || width >= 900) && styles.rowActionsCompact]}>{appointment.status === 'confirmed' ? <Button label={t('markNoShow')} variant="ghost" loading={busyId === appointment.id} onPress={() => void noShow(appointment.id, appointment.startAt)} /> : null}{appointment.status === 'checked_in' && isDentist ? <Button label={t('openClinicalRecord')} variant="secondary" onPress={() => router.push({ pathname: '/professional/encounter', params: { appointmentId: appointment.id, patientName: appointment.patientName } })} /> : null}</View></View>)}</View> : <View style={styles.empty}><CalendarCheck2 size={30} color={colors.teal} /><Text style={styles.body}>{t('noClinicAppointments')}</Text></View>}
      </SectionCard></View>
      <View style={styles.section}><SectionCard eyebrow={t('waitlist').toUpperCase()} title={t('waitingPatients')}>
        {operationData.waitlist.length ? <View style={styles.rows}>{operationData.waitlist.map((entry) => <View key={entry.id} style={styles.row}><View style={styles.stateIcon}><BellRing size={18} color={colors.teal} /></View><View style={styles.rowCopy}><Text style={styles.rowTitle}>{entry.patientName}</Text><Text style={styles.rowMeta}>{dateFormatter.format(new Date(`${entry.preferredDate}T12:00:00+06:00`))} · {entry.serviceName}</Text><Text style={styles.rowStatus}>{entry.status === 'offered' ? t('offerActive') : t('waitingForSlot')}</Text></View></View>)}</View> : <View style={styles.empty}><BellRing size={30} color={colors.teal} /><Text style={styles.body}>{t('noWaitingPatients')}</Text></View>}
        {operationData.waitlist.some((entry) => entry.status === 'waiting') ? <Button label={t('offerNextSlot')} variant="secondary" loading={busyId === 'offer'} onPress={() => void offer()} /> : null}
      </SectionCard></View></View>
    </>}
    <View style={styles.footer}><QrCode size={16} color={colors.teal} /><Text style={styles.footerText}>{t('checkinSecurity')}</Text></View>
  </Screen>
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xl, gap: spacing.xl }, heading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, headingCopy: { flex: 1, gap: 5 }, kicker: { color: colors.teal, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' }, title: { color: colors.inkDeep, fontSize: 32, fontWeight: '800', letterSpacing: -1 }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  clinicChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, clinicChoice: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.pill, backgroundColor: colors.paper }, clinicChoiceActive: { borderColor: colors.mint, backgroundColor: colors.mintSoft }, clinicChoiceText: { color: colors.teal, fontSize: 12, fontWeight: '700' }, clinicChoiceTextActive: { color: colors.ink }, quickActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.mintSoft }, noticeText: { flex: 1, color: colors.teal, fontSize: 12, lineHeight: 18 }, body: { color: colors.muted, fontSize: 13, lineHeight: 20 }, sections: { gap: spacing.xl }, sectionsWide: { flexDirection: 'row', alignItems: 'flex-start' }, section: { flex: 1, minWidth: 0 }, rows: { gap: 0 }, row: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, rowCompact: { flexWrap: 'wrap', alignItems: 'flex-start' }, stateIcon: { width: 40, height: 40, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: colors.mintSoft }, stateIconActive: { backgroundColor: colors.mint }, rowCopy: { flex: 1, minWidth: 180, gap: 3 }, rowTitle: { color: colors.inkDeep, fontSize: 14, fontWeight: '800' }, rowMeta: { color: colors.muted, fontSize: 11, lineHeight: 16 }, rowStatus: { color: colors.teal, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' }, rowActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.xs }, rowActionsCompact: { width: '100%', justifyContent: 'flex-start', paddingLeft: 56 }, empty: { minHeight: 130, alignItems: 'center', justifyContent: 'center', gap: spacing.sm }, footer: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingHorizontal: spacing.sm }, footerText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 17 },
})
