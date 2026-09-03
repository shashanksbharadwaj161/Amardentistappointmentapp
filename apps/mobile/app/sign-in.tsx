import { signInSchema } from '@amar-dentist/domain'
import { router, Stack } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button } from '../src/components/Button'
import { Field } from '../src/components/Field'
import { Screen } from '../src/components/Screen'
import { useAuth } from '../src/providers/AuthProvider'
import { useLocale } from '../src/providers/LocaleProvider'
import { colors, radius, spacing } from '../src/theme'

export default function SignInScreen() {
  const { signIn } = useAuth()
  const { locale, t } = useLocale()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const parsed = signInSchema.safeParse({ email, password })
    if (!parsed.success) return setError(locale === 'bn' ? t('checkDetails') : (parsed.error.issues[0]?.message ?? t('checkDetails')))
    setBusy(true)
    const authError = await signIn(parsed.data.email, parsed.data.password)
    setError(authError && locale === 'bn' ? t('authUnavailable') : authError)
    setBusy(false)
  }

  return (
    <Screen style={styles.screen}>
      <Stack.Screen options={{ title: t('signIn'), headerBackTitle: t('back') }} />
      <View style={styles.heading}><Text style={styles.title}>{t('welcomeBack')}</Text><Text style={styles.subtitle}>{t('verifiedEmailContinue')}</Text></View>
      <View style={styles.form}>
        <Field label={t('email')} autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} placeholder="you@example.com" />
        <Field label={t('password')} secureTextEntry autoComplete="current-password" value={password} onChangeText={setPassword} placeholder={t('yourPassword')} />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Button label={t('signIn')} loading={busy} onPress={() => void submit()} />
        <Button label={t('forgotPassword')} variant="ghost" onPress={() => router.push('/reset-password')} />
      </View>
      <View style={styles.note}><Text style={styles.noteText}>{t('professionalSameSignIn')}</Text></View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screen: { paddingTop: 36 },
  heading: { gap: 9, marginBottom: spacing.xxl },
  title: { color: colors.inkDeep, fontSize: 34, fontWeight: '800', letterSpacing: -1.1 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  form: { gap: spacing.lg },
  error: { color: colors.danger, backgroundColor: '#FFF0F0', borderRadius: radius.sm, padding: spacing.md, lineHeight: 20 },
  note: { marginTop: spacing.xxl, padding: spacing.lg, borderLeftWidth: 3, borderLeftColor: colors.mint, backgroundColor: colors.mintSoft },
  noteText: { color: colors.ink, fontSize: 13, lineHeight: 20 },
})
