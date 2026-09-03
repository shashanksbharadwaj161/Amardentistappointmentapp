import { emailSchema, passwordSchema } from '@amar-dentist/domain'
import { router, Stack } from 'expo-router'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button } from '../src/components/Button'
import { Field } from '../src/components/Field'
import { Screen } from '../src/components/Screen'
import { useAuth } from '../src/providers/AuthProvider'
import { useLocale } from '../src/providers/LocaleProvider'
import { colors, radius, spacing } from '../src/theme'

export default function ResetPasswordScreen() {
  const { resetPassword, recoveringPassword, passwordSetupMode, updatePassword } = useAuth()
  const { locale, t } = useLocale()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [passwordChangeComplete, setPasswordChangeComplete] = useState(false)
  const [busy, setBusy] = useState(false)

  const requestReset = async () => {
    const parsed = emailSchema.safeParse(email)
    if (!parsed.success) return setStatus(t('invalidEmail'))
    setBusy(true)
    const error = await resetPassword(parsed.data)
    setBusy(false)
    setSuccess(!error)
    setStatus(error ? (locale === 'bn' ? t('authUnavailable') : error) : t('resetSent'))
  }

  const finishReset = async () => {
    const parsed = passwordSchema.safeParse(password)
    if (!parsed.success || password !== confirmPassword) return setStatus(t('checkDetails'))
    setBusy(true)
    const error = await updatePassword(parsed.data)
    setBusy(false)
    setSuccess(!error)
    setPasswordChangeComplete(!error)
    setStatus(error ? (locale === 'bn' ? t('authUnavailable') : error) : t('passwordUpdated'))
  }

  if (passwordChangeComplete) return (
    <Screen style={styles.screen}>
      <Stack.Screen options={{ title: t('passwordUpdatedTitle'), headerBackTitle: t('back') }} />
      <View style={styles.heading}><Text style={styles.title}>{t('passwordUpdatedTitle')}</Text><Text style={styles.subtitle}>{t('passwordUpdated')}</Text></View>
      <Button label={t('signIn')} onPress={() => router.replace('/sign-in')} />
    </Screen>
  )

  if (recoveringPassword) return (
    <Screen style={styles.screen}>
      <Stack.Screen options={{ title: t(passwordSetupMode === 'invite' ? 'chooseInitialPassword' : 'chooseNewPassword'), headerBackTitle: t('back') }} />
      <View style={styles.heading}><Text style={styles.title}>{t(passwordSetupMode === 'invite' ? 'chooseInitialPassword' : 'chooseNewPassword')}</Text><Text style={styles.subtitle}>{t(passwordSetupMode === 'invite' ? 'chooseInitialPasswordBody' : 'chooseNewPasswordBody')}</Text></View>
      <View style={styles.form}>
        <Field label={t('password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" hint={t('passwordHint')} />
        <Field label={t('confirmPassword')} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoComplete="new-password" />
        {status ? <Text accessibilityLiveRegion="polite" style={[styles.status, success && styles.success]}>{status}</Text> : null}
        {success ? <Button label={t('signIn')} onPress={() => router.replace('/sign-in')} /> : <Button label={t('updatePassword')} loading={busy} onPress={() => void finishReset()} />}
      </View>
    </Screen>
  )

  return (
    <Screen style={styles.screen}>
      <Stack.Screen options={{ title: t('resetPassword'), headerBackTitle: t('back') }} />
      <View style={styles.heading}><Text style={styles.title}>{t('resetPassword')}</Text><Text style={styles.subtitle}>{t('resetPrivacy')}</Text></View>
      <View style={styles.form}>
        <Field label={t('email')} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} placeholder="you@example.com" />
        {status ? <Text accessibilityLiveRegion="polite" style={[styles.status, success && styles.success]}>{status}</Text> : null}
        <Button label={t('sendResetLink')} loading={busy} onPress={() => void requestReset()} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screen: { paddingTop: 36 },
  heading: { gap: 10, marginBottom: spacing.xxl },
  title: { color: colors.inkDeep, fontSize: 34, fontWeight: '800', letterSpacing: -1.1 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  form: { gap: spacing.lg },
  status: { color: colors.danger, backgroundColor: '#FFF0F0', borderRadius: radius.sm, padding: spacing.md, lineHeight: 20 },
  success: { color: colors.success, backgroundColor: colors.mintSoft },
})
