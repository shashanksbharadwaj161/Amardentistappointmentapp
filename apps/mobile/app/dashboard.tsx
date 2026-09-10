import { BriefcaseBusiness, CalendarDays, ChevronRight, CircleUserRound, ClipboardList, MapPin, MessageCircleHeart, Stethoscope } from 'lucide-react-native'
import { Redirect, router } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Button } from '../src/components/Button'
import { Screen } from '../src/components/Screen'
import { effectiveNavigationMode } from '../src/lib/navigation'
import { navigationMessages } from '../src/lib/navigation-messages'
import { useAuth } from '../src/providers/AuthProvider'
import { useLocale } from '../src/providers/LocaleProvider'
import { colors, radius, shadow, spacing } from '../src/theme'

export default function DashboardScreen() {
  const { profile, loading } = useAuth()
  const { locale, t } = useLocale()
  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null
  const professional = effectiveNavigationMode(profile.activeMode, profile.roles) === 'professional'
  const local = navigationMessages[locale]
  const professionalRoleLabels = [
    profile.roles.includes('dentist') ? local.roleDentist : null,
    profile.roles.includes('front_desk') ? local.roleFrontDesk : null,
    profile.roles.includes('clinic_manager') ? local.roleManager : null,
    profile.roles.includes('clinic_owner') ? local.roleOwner : null,
  ].filter((role) => role !== null)
  const ProfessionalIcon = profile.roles.includes('dentist') ? Stethoscope : BriefcaseBusiness
  const patientSteps = [
    { label: t('completeProfile'), detail: t('completeProfileDetail'), icon: CircleUserRound, route: '/patient/profiles' as const },
    { label: t('findDentist'), detail: t('discoveryPhase'), icon: MapPin, route: '/patient/discover' as const },
    { label: t('bookVisit'), detail: t('schedulingPhase'), icon: CalendarDays, route: '/patient/discover' as const },
    { label: t('medicalRecords'), detail: t('recordsPrivacy'), icon: ClipboardList, route: '/patient/records' as const },
    { label: t('careAssistant'), detail: t('aiPatientBody'), icon: MessageCircleHeart, route: '/patient/assistant' as const },
  ]

  return (
    <Screen maxWidth={1040}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>{professional ? t('professionalWorkspace') : t('carePath')}</Text>
        <Text style={styles.title}>{professional ? `${local.professionalGreeting}, ${profile.fullName.split(' ')[0]}` : `${t('welcomeName')}, ${profile.fullName.split(' ')[0]}`}</Text>
        <Text style={styles.subtitle}>{professional ? local.professionalOverview : t('accountReady')}</Text>
      </View>

      {professional ? (
        <View style={styles.professionalPanel}>
          <View style={styles.panelIcon}><ProfessionalIcon color={colors.mint} size={28} /></View>
          <Text style={styles.panelTitle}>{t('professionalWorkspace')}</Text>
          <Text style={styles.panelBody}>{t('clinicOperationsBody')}</Text>
          <View style={styles.permissionBadge}><View style={styles.badgeDot} /><Text style={styles.badgeText}>{local.roles}: {professionalRoleLabels.join(', ')}</Text></View>
          <View style={styles.professionalActions}>
            <Button label={t('openCalendar')} onPress={() => router.push('/professional/calendar')} />
            <Button label={t('clinicOperations')} variant="secondary" onPress={() => router.push('/professional/operations')} />
            <Button label={t('professionalOnboarding')} variant="ghost" onPress={() => router.push('/professional')} />
          </View>
        </View>
      ) : (
        <View style={styles.ledger}>
          {patientSteps.map(({ label, detail, icon: Icon, route }, index) => <Pressable accessibilityRole="button" onPress={() => router.push(route)} key={label} style={styles.step}><View style={[styles.stepIcon, index === 0 && styles.stepIconActive]}><Icon size={20} color={index === 0 ? colors.ink : colors.teal} /></View><View style={styles.stepCopy}><Text style={styles.stepTitle}>{label}</Text><Text style={styles.stepDetail}>{detail}</Text></View><ChevronRight size={19} color={colors.muted} /></Pressable>)}
        </View>
      )}

      {!professional ? <Pressable accessibilityRole="button" onPress={() => router.push('/professional')} style={styles.joinCard}><View style={styles.joinIcon}><Stethoscope size={20} color={colors.teal} /></View><View style={styles.stepCopy}><Text style={styles.stepTitle}>{t('joinProfessional')}</Text><Text style={styles.stepDetail}>{t('joinProfessionalDetail')}</Text></View><ChevronRight size={19} color={colors.muted} /></Pressable> : null}

      {!professional ? <Button label={t('appointments')} variant="secondary" onPress={() => router.push('/patient/appointments')} /> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  hero: { marginTop: spacing.xxxl, gap: spacing.md },
  kicker: { color: colors.teal, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.inkDeep, fontSize: 36, lineHeight: 42, fontWeight: '800', letterSpacing: -1.3 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  ledger: { marginTop: spacing.xxl, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, overflow: 'hidden', ...shadow },
  step: { minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  stepIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center' },
  stepIconActive: { backgroundColor: colors.mint },
  stepCopy: { flex: 1, gap: 3 },
  stepTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  stepDetail: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  professionalPanel: { marginTop: spacing.xxl, backgroundColor: colors.inkDeep, padding: spacing.xl, borderRadius: radius.lg, gap: spacing.md },
  panelIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#15344C', alignItems: 'center', justifyContent: 'center' },
  panelTitle: { color: colors.paper, fontWeight: '800', fontSize: 20 },
  panelBody: { color: '#B8C8D3', fontSize: 14, lineHeight: 22 },
  permissionBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#15344C', borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 12 },
  badgeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.mint },
  badgeText: { color: colors.mintSoft, fontSize: 12, fontWeight: '700' },
  professionalActions: { gap: spacing.sm, marginTop: spacing.xs },
  joinCard: { minHeight: 82, marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg },
  joinIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintSoft },
})
