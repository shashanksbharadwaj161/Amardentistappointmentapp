import { useQuery } from '@tanstack/react-query'
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router'
import { ChevronRight, Inbox, MessageCircle } from 'lucide-react-native'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Screen } from '../../src/components/Screen'
import { SectionCard } from '../../src/components/SectionCard'
import { getClinicOperationsContext } from '../../src/lib/phase3'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, radius, spacing } from '../../src/theme'

export default function ProfessionalInboxScreen() {
  const { clinicId } = useLocalSearchParams<{ clinicId?: string }>()
  const { profile, loading } = useAuth()
  const { locale, t } = useLocale()
  const context = useQuery({ queryKey: ['clinic-operations', profile?.id, clinicId], queryFn: () => getClinicOperationsContext(profile!.id, clinicId), enabled: Boolean(profile), refetchInterval: 10_000 })
  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null
  const formatter = new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dhaka' })
  return <Screen maxWidth={760} style={styles.screen}>
    <Stack.Screen options={{ title: t('clinicInbox'), headerBackTitle: t('back') }} />
    <View style={styles.heading}><Inbox size={28} color={colors.teal} /><View style={styles.headingCopy}><Text style={styles.title}>{t('clinicInbox')}</Text><Text style={styles.subtitle}>{t('clinicInboxBody')}</Text></View></View>
    {context.isLoading ? <ActivityIndicator color={colors.teal} /> : context.isError ? <SectionCard title={t('authUnavailable')}><Button label={t('retry')} variant="secondary" onPress={() => void context.refetch()} /></SectionCard> : context.data?.chats.length ? <View style={styles.list}>{context.data.chats.map((thread) => <Pressable key={thread.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/patient/chat', params: { threadId: thread.id, clinicName: context.data?.clinic?.name ?? '', patientName: thread.patientName } })} style={styles.row}><View style={styles.icon}><MessageCircle size={20} color={colors.teal} /></View><View style={styles.copy}><View style={styles.rowHeading}><Text style={styles.patient}>{thread.patientName}</Text><Text style={styles.time}>{formatter.format(new Date(thread.lastMessageAt))}</Text></View><Text style={styles.preview} numberOfLines={2}>{thread.lastMessage || t('noMessagesYet')}</Text></View><ChevronRight size={19} color={colors.muted} /></Pressable>)}</View> : <View style={styles.empty}><Inbox size={36} color={colors.teal} /><Text style={styles.emptyTitle}>{t('noClinicMessages')}</Text><Text style={styles.emptyBody}>{t('clinicInboxEmptyBody')}</Text></View>}
  </Screen>
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xl, gap: spacing.xl }, heading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, headingCopy: { flex: 1, gap: 5 }, title: { color: colors.inkDeep, fontSize: 31, fontWeight: '800', letterSpacing: -0.9 }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20 }, list: { overflow: 'hidden', borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, backgroundColor: colors.paper }, row: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }, icon: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 21, backgroundColor: colors.mintSoft }, copy: { flex: 1, gap: 5 }, rowHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md }, patient: { flex: 1, color: colors.inkDeep, fontSize: 14, fontWeight: '800' }, time: { color: colors.muted, fontSize: 10 }, preview: { color: colors.muted, fontSize: 12, lineHeight: 17 }, empty: { minHeight: 300, alignItems: 'center', justifyContent: 'center', gap: spacing.md }, emptyTitle: { color: colors.inkDeep, fontSize: 17, fontWeight: '800' }, emptyBody: { maxWidth: 360, color: colors.muted, fontSize: 13, lineHeight: 20, textAlign: 'center' },
})
