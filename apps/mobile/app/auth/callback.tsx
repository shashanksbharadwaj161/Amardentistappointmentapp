import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Screen } from '../../src/components/Screen'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, radius, spacing } from '../../src/theme'

export default function AuthCallbackScreen() {
  const { session, recoveringPassword } = useAuth()
  const { t } = useLocale()
  const [delayed, setDelayed] = useState(false)

  useEffect(() => {
    if (session) {
      router.replace(recoveringPassword ? '/reset-password' : '/dashboard')
      return
    }
    const timer = setTimeout(() => setDelayed(true), 6000)
    return () => clearTimeout(timer)
  }, [session, recoveringPassword])

  return (
    <Screen scroll={false} style={styles.screen}>
      <View style={styles.card} accessibilityLiveRegion="polite">
        <View style={styles.indicator}><ActivityIndicator color={colors.teal} size="large" /></View>
        <Text style={styles.title}>{t('completingVerification')}</Text>
        <Text style={styles.body}>{delayed ? t('verificationDelayed') : t('completingVerificationBody')}</Text>
        {delayed ? <Button label={t('returnToSignIn')} variant="secondary" onPress={() => router.replace('/sign-in')} /> : null}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screen: { justifyContent: 'center' },
  card: { gap: spacing.lg, padding: spacing.xxl, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg },
  indicator: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintSoft, borderRadius: 28 },
  title: { color: colors.inkDeep, fontSize: 28, fontWeight: '800', letterSpacing: -0.8 },
  body: { color: colors.muted, fontSize: 16, lineHeight: 24 },
})
