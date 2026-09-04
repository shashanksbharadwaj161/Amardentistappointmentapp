import { useQuery } from '@tanstack/react-query'
import { Redirect, router, Stack } from 'expo-router'
import { Building2, CalendarCheck2, CalendarDays, ChevronRight, FileBadge2, LockKeyhole, UserCheck, UsersRound } from 'lucide-react-native'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Screen } from '../../src/components/Screen'
import { SectionCard } from '../../src/components/SectionCard'
import { StatusPill } from '../../src/components/StatusPill'
import { acceptClinicMembership, getProfessionalOverview } from '../../src/lib/phase2'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, hitTarget, radius, spacing } from '../../src/theme'

export default function ProfessionalHomeScreen() {
  const { profile, loading } = useAuth()
  const { t } = useLocale()
  const overview = useQuery({
    queryKey: ['professional-overview', profile?.id],
    queryFn: () => getProfessionalOverview(profile!.id),
    enabled: Boolean(profile),
  })
  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null

  const accept = async (membershipId: string) => {
    await acceptClinicMembership(membershipId)
    await overview.refetch()
  }

  return (
    <Screen maxWidth={760} style={styles.safe}>
      <Stack.Screen options={{ title: t('professionalOnboarding'), headerBackTitle: t('back') }} />
      <View style={styles.header}>
        <Text style={styles.kicker}>{t('professionalWorkspace').toUpperCase()}</Text>
        <Text style={styles.title}>{t('professionalOnboarding')}</Text>
        <Text style={styles.subtitle}>{t('professionalOnboardingBody')}</Text>
        <View style={styles.privacy}><LockKeyhole size={17} color={colors.teal} /><Text style={styles.privacyText}>{t('verificationPrivacy')}</Text></View>
      </View>

      {overview.isLoading ? <ActivityIndicator style={styles.loader} color={colors.teal} /> : overview.isError ? (
        <SectionCard title={t('authUnavailable')}><Button label={t('retry')} variant="secondary" onPress={() => void overview.refetch()} /></SectionCard>
      ) : (
        <View style={styles.sections}>
          {overview.data?.pendingMemberships.map((membership) => (
            <SectionCard key={membership.id} eyebrow={t('pendingApproval').toUpperCase()} title={membership.clinicName}>
              <Text style={styles.body}>{membership.role.replace('_', ' ')}</Text>
              <Button label={t('approved')} onPress={() => void accept(membership.id)} />
            </SectionCard>
          ))}
          <Pressable accessibilityRole="button" onPress={() => router.push('/professional/dentist-application')} style={styles.linkCard}>
            <View style={styles.icon}><FileBadge2 size={23} color={colors.teal} /></View>
            <View style={styles.linkCopy}><Text style={styles.linkTitle}>{t('dentistApplication')}</Text><Text style={styles.body}>{t('dentistApplicationDetail')}</Text></View>
            {overview.data?.dentistStatus ? <StatusPill status={overview.data.dentistStatus} /> : <ChevronRight size={20} color={colors.muted} />}
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.push('/professional/clinic-application')} style={styles.linkCard}>
            <View style={styles.icon}><Building2 size={23} color={colors.teal} /></View>
            <View style={styles.linkCopy}><Text style={styles.linkTitle}>{t('clinicApplication')}</Text><Text style={styles.body}>{t('clinicApplicationDetail')}</Text></View>
            <ChevronRight size={20} color={colors.muted} />
          </Pressable>

          <SectionCard eyebrow={t('clinics').toUpperCase()} title={overview.data?.clinics.length ? `${overview.data.clinics.length} ${t('clinics')}` : t('noClinics')}>
            {overview.data?.clinics.map((clinic) => <View key={clinic.id} style={styles.clinicRow}><View style={styles.clinicIcon}><UserCheck size={18} color={colors.ink} /></View><View style={styles.linkCopy}><Text style={styles.linkTitle}>{clinic.name}</Text><Text style={styles.body}>{clinic.city} · {clinic.roles.map((role) => role.replace('clinic_', '').replace('_', ' ')).join(', ')}</Text></View><StatusPill status={clinic.status} /></View>)}
          </SectionCard>
          {overview.data?.clinics.some((clinic) => clinic.roles.some((role) => role === 'clinic_owner' || role === 'clinic_manager')) ? <Pressable accessibilityRole="button" onPress={() => router.push('/professional/team')} style={styles.linkCard}><View style={styles.icon}><UsersRound size={23} color={colors.teal} /></View><View style={styles.linkCopy}><Text style={styles.linkTitle}>{t('manageTeam')}</Text><Text style={styles.body}>{t('manageTeamBody')}</Text></View><ChevronRight size={20} color={colors.muted} /></Pressable> : null}
          {overview.data?.clinics.some((clinic) => clinic.status === 'approved') ? <Pressable accessibilityRole="button" onPress={() => router.push('/professional/operations')} style={styles.linkCard}><View style={styles.icon}><CalendarCheck2 size={23} color={colors.teal} /></View><View style={styles.linkCopy}><Text style={styles.linkTitle}>{t('clinicOperations')}</Text><Text style={styles.body}>{t('clinicOperationsBody')}</Text></View><ChevronRight size={20} color={colors.muted} /></Pressable> : null}
          <Button label={t('openCalendar')} onPress={() => router.push('/professional/calendar')} />
        </View>
      )}
      <View style={styles.bottomMark}><CalendarDays size={17} color={colors.teal} /><Text style={styles.bottomText}>{t('scheduleReadyBody')}</Text></View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  safe: { paddingTop: spacing.xl },
  header: { gap: spacing.md },
  kicker: { color: colors.teal, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.inkDeep, fontSize: 34, lineHeight: 39, fontWeight: '800', letterSpacing: -1.1 },
  subtitle: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  privacy: { flexDirection: 'row', gap: 9, alignItems: 'flex-start', padding: spacing.md, backgroundColor: colors.mintSoft, borderRadius: radius.md },
  privacyText: { flex: 1, color: colors.teal, fontSize: 12, lineHeight: 18 },
  loader: { marginTop: 72 },
  sections: { gap: spacing.lg, marginTop: spacing.xl },
  linkCard: { minHeight: 92, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg },
  icon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintSoft },
  linkCopy: { flex: 1, gap: 4 },
  linkTitle: { color: colors.inkDeep, fontSize: 15, fontWeight: '800' },
  body: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  clinicRow: { minHeight: hitTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  clinicIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mint },
  bottomMark: { flexDirection: 'row', gap: 9, marginVertical: spacing.xl, paddingHorizontal: spacing.sm, alignItems: 'flex-start' },
  bottomText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 17 },
})
