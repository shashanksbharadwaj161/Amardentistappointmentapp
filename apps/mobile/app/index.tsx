import { router } from 'expo-router'
import { ChevronRight, Languages, LockKeyhole, ShieldCheck } from 'lucide-react-native'
import { useEffect } from 'react'
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native'
import { BrandMark } from '../src/components/BrandMark'
import { Button } from '../src/components/Button'
import { Screen } from '../src/components/Screen'
import { useAuth } from '../src/providers/AuthProvider'
import { useLocale } from '../src/providers/LocaleProvider'
import { colors, hitTarget, radius, shadow, spacing } from '../src/theme'

export default function WelcomeScreen() {
  const { profile, loading, configured, previewAvailable, recoveringPassword, enterDemo } = useAuth()
  const { locale, setLocale, t } = useLocale()

  useEffect(() => {
    if (recoveringPassword) router.replace('/reset-password')
    else if (profile) router.replace('/dashboard')
  }, [profile, recoveringPassword])

  if (loading) return <Screen scroll={false} style={styles.center}><ActivityIndicator color={colors.teal} size="large" /></Screen>

  return (
    <Screen>
      <View style={styles.topbar}>
        <BrandMark />
        <Pressable accessibilityRole="button" accessibilityLabel={locale === 'en' ? t('switchBangla') : t('switchEnglish')} style={styles.language} onPress={() => setLocale(locale === 'en' ? 'bn' : 'en')}>
          <Languages size={18} color={colors.ink} />
          <Text style={styles.languageText}>{locale === 'en' ? 'বাংলা' : 'EN'}</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Image
          accessibilityIgnoresInvertColors
          accessibilityLabel={t('brandMascot')}
          source={require('../assets/brand-mascot.png')}
          style={styles.heroMascot}
        />
        <View style={styles.eyebrow}><View style={styles.pulse} /><Text style={styles.eyebrowText}>{t('careEyebrow')}</Text></View>
        <Text style={styles.title}>{t('welcome')}</Text>
        <Text style={styles.subtitle}>{t('welcomeSubtitle')}</Text>
      </View>

      <View style={styles.pathCard}>
        <View style={styles.pathLine} />
        <View style={styles.pathStep}>
          <View style={[styles.pathIcon, styles.pathIconActive]}><ShieldCheck color={colors.ink} size={19} /></View>
          <View style={styles.pathCopy}><Text style={styles.pathTitle}>{t('verifiedProfessionals')}</Text><Text style={styles.pathBody}>{t('verifiedProfessionalsBody')}</Text></View>
        </View>
        <View style={styles.pathStep}>
          <View style={styles.pathIcon}><LockKeyhole color={colors.teal} size={19} /></View>
          <View style={styles.pathCopy}><Text style={styles.pathTitle}>{t('privateByDesign')}</Text><Text style={styles.pathBody}>{t('privateByDesignBody')}</Text></View>
        </View>
        <View style={styles.pathStep}>
          <View style={styles.pathIcon}><ChevronRight color={colors.teal} size={19} /></View>
          <View style={styles.pathCopy}><Text style={styles.pathTitle}>{t('oneClearStep')}</Text><Text style={styles.pathBody}>{t('oneClearStepBody')}</Text></View>
        </View>
      </View>

      <View style={styles.actions}>
        <Button label={t('createAccount')} onPress={() => router.push('/register')} />
        <Button label={t('signIn')} variant="secondary" onPress={() => router.push('/sign-in')} />
        {previewAvailable || (__DEV__ && !configured) ? <Button label={t('previewPhase')} variant="ghost" onPress={enterDemo} /> : null}
      </View>
      {!configured ? <Text style={styles.setupNote}>{t('supabaseSetup')}</Text> : null}
    </Screen>
  )
}

const styles = StyleSheet.create({
  center: { justifyContent: 'center', alignItems: 'center' },
  topbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  language: { minHeight: hitTarget, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  languageText: { color: colors.ink, fontWeight: '700' },
  hero: { marginTop: 64, gap: spacing.lg },
  heroMascot: { width: 164, height: 164, resizeMode: 'contain', alignSelf: 'center', marginBottom: spacing.sm },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.mint },
  eyebrowText: { color: colors.teal, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.inkDeep, fontSize: 44, lineHeight: 49, fontWeight: '800', letterSpacing: -1.8, maxWidth: 560 },
  subtitle: { color: colors.muted, fontSize: 17, lineHeight: 26, maxWidth: 540 },
  pathCard: { marginTop: spacing.xxl, backgroundColor: colors.paper, borderRadius: radius.lg, padding: spacing.xl, gap: spacing.xl, borderWidth: 1, borderColor: colors.line, ...shadow },
  pathLine: { position: 'absolute', left: 43, top: 48, bottom: 48, width: 1, backgroundColor: colors.line },
  pathStep: { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' },
  pathIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintSoft, borderWidth: 4, borderColor: colors.paper, zIndex: 1 },
  pathIconActive: { backgroundColor: colors.mint },
  pathCopy: { flex: 1, gap: 4, paddingTop: 2 },
  pathTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  pathBody: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  actions: { marginTop: spacing.xxl, gap: spacing.md },
  setupNote: { marginTop: spacing.lg, textAlign: 'center', color: colors.muted, fontSize: 12, lineHeight: 18 },
})
