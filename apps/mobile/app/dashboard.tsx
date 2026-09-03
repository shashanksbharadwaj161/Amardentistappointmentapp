import { availableModes, type AppMode } from '@amar-dentist/domain'
import { CalendarDays, ChevronRight, CircleUserRound, Home, MapPin, Stethoscope } from 'lucide-react-native'
import { Redirect, router } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { BrandMark } from '../src/components/BrandMark'
import { Button } from '../src/components/Button'
import { Screen } from '../src/components/Screen'
import { useAuth } from '../src/providers/AuthProvider'
import { useLocale } from '../src/providers/LocaleProvider'
import { colors, hitTarget, radius, shadow, spacing } from '../src/theme'

export default function DashboardScreen() {
  const { profile, loading, setMode, signOut } = useAuth()
  const { t } = useLocale()
  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null
  const modes = availableModes(profile.roles)
  const professional = profile.activeMode === 'professional'
  const switchMode = (mode: AppMode) => void setMode(mode)
  const patientSteps = [
    { label: t('completeProfile'), detail: t('completeProfileDetail'), icon: CircleUserRound, route: '/patient/profiles' as const },
    { label: t('findDentist'), detail: t('discoveryPhase'), icon: MapPin, route: '/patient/discover' as const },
    { label: t('bookVisit'), detail: t('schedulingPhase'), icon: CalendarDays, route: '/patient/discover' as const },
  ]

  return (
    <Screen maxWidth={1040}>
      <View style={styles.header}><BrandMark /><View accessible accessibilityLabel={`${profile.fullName}, account`} style={styles.avatar}><Text style={styles.avatarText}>{profile.fullName.slice(0, 1).toUpperCase()}</Text></View></View>
      {modes.length > 1 ? <View style={styles.modeSwitch}>{modes.map((mode) => <Pressable key={mode} accessibilityRole="tab" accessibilityState={{ selected: profile.activeMode === mode }} onPress={() => switchMode(mode)} style={[styles.modeOption, profile.activeMode === mode && styles.modeActive]}><Text style={[styles.modeLabel, profile.activeMode === mode && styles.modeLabelActive]}>{mode === 'patient' ? t('patient') : t('professional')}</Text></Pressable>)}</View> : null}

      <View style={styles.hero}>
        <Text style={styles.kicker}>{professional ? t('professionalWorkspace') : t('carePath')}</Text>
        <Text style={styles.title}>{professional ? `${t('goodMorningDoctor')}, ${t('doctorHonorific')} ${profile.fullName.split(' ').at(-1)}` : `${t('welcomeName')}, ${profile.fullName.split(' ')[0]}`}</Text>
        <Text style={styles.subtitle}>{professional ? t('professionalReady') : t('accountReady')}</Text>
      </View>

      {professional ? (
        <View style={styles.professionalPanel}>
          <View style={styles.panelIcon}><Stethoscope color={colors.mint} size={28} /></View>
          <Text style={styles.panelTitle}>{t('professionalFoundation')}</Text>
          <Text style={styles.panelBody}>{t('professionalFoundationBody')}</Text>
          <View style={styles.permissionBadge}><View style={styles.badgeDot} /><Text style={styles.badgeText}>{t('dentistRecognized')}</Text></View>
          <Button label={t('professionalOnboarding')} variant="secondary" onPress={() => router.push('/professional')} />
        </View>
      ) : (
        <View style={styles.ledger}>
          {patientSteps.map(({ label, detail, icon: Icon, route }, index) => <Pressable accessibilityRole="button" onPress={() => router.push(route)} key={label} style={styles.step}><View style={[styles.stepIcon, index === 0 && styles.stepIconActive]}><Icon size={20} color={index === 0 ? colors.ink : colors.teal} /></View><View style={styles.stepCopy}><Text style={styles.stepTitle}>{label}</Text><Text style={styles.stepDetail}>{detail}</Text></View><ChevronRight size={19} color={colors.muted} /></Pressable>)}
        </View>
      )}

      {!professional ? <Pressable accessibilityRole="button" onPress={() => router.push('/professional')} style={styles.joinCard}><View style={styles.joinIcon}><Stethoscope size={20} color={colors.teal} /></View><View style={styles.stepCopy}><Text style={styles.stepTitle}>{t('joinProfessional')}</Text><Text style={styles.stepDetail}>{t('joinProfessionalDetail')}</Text></View><ChevronRight size={19} color={colors.muted} /></Pressable> : null}

      {!professional ? <Button label={t('appointments')} variant="secondary" onPress={() => router.push('/patient/appointments')} /> : null}

      <View style={styles.securityStrip}><Home size={18} color={colors.teal} /><Text style={styles.securityText}>{t('signedInAs')} {profile.email}</Text></View>
      <Button label={t('signOut')} variant="ghost" onPress={() => void signOut()} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  avatar: { width: hitTarget, height: hitTarget, borderRadius: hitTarget / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintSoft, borderWidth: 1, borderColor: colors.mint },
  avatarText: { color: colors.ink, fontWeight: '800', fontSize: 16 },
  modeSwitch: { marginTop: spacing.xl, flexDirection: 'row', alignSelf: 'center', padding: 4, backgroundColor: '#E8EFED', borderRadius: radius.pill },
  modeOption: { minHeight: hitTarget, paddingHorizontal: 18, justifyContent: 'center', borderRadius: radius.pill },
  modeActive: { backgroundColor: colors.paper, ...shadow },
  modeLabel: { color: colors.muted, fontWeight: '700' },
  modeLabelActive: { color: colors.ink },
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
  joinCard: { minHeight: 82, marginTop: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg },
  joinIcon: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintSoft },
  securityStrip: { marginTop: spacing.xl, flexDirection: 'row', alignItems: 'center', gap: 9, padding: spacing.md, backgroundColor: colors.mintSoft, borderRadius: radius.md },
  securityText: { flex: 1, color: colors.teal, fontSize: 13 },
})
