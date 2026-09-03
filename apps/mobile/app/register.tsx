import { signUpSchema } from '@amar-dentist/domain'
import { Stack } from 'expo-router'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Check } from 'lucide-react-native'
import { Button } from '../src/components/Button'
import { Field } from '../src/components/Field'
import { Screen } from '../src/components/Screen'
import { useAuth } from '../src/providers/AuthProvider'
import { useLocale } from '../src/providers/LocaleProvider'
import { colors, hitTarget, radius, spacing } from '../src/theme'

export default function RegisterScreen() {
  const { signUp } = useAuth()
  const { locale, t } = useLocale()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    const parsed = signUpSchema.safeParse({ fullName, email, password, confirmPassword, acceptedTerms })
    if (!parsed.success) return setStatus(locale === 'bn' ? t('checkDetails') : (parsed.error.issues[0]?.message ?? t('checkDetails')))
    setBusy(true)
    const error = await signUp(parsed.data.fullName, parsed.data.email, parsed.data.password)
    setBusy(false)
    setSuccess(!error)
    setStatus(error ? (locale === 'bn' ? t('authUnavailable') : error) : t('checkInbox'))
  }

  return (
    <Screen style={styles.screen}>
      <Stack.Screen options={{ title: t('createAccount'), headerBackTitle: t('back') }} />
      <View style={styles.heading}><Text style={styles.title}>{t('startAsPatient')}</Text><Text style={styles.subtitle}>{t('professionalAccessNote')}</Text></View>
      <View style={styles.form}>
        <Field label={t('fullName')} value={fullName} onChangeText={setFullName} autoComplete="name" placeholder={t('yourFullName')} />
        <Field label={t('email')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="you@example.com" />
        <Field label={t('password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" hint={t('passwordHint')} />
        <Field label={t('confirmPassword')} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry autoComplete="new-password" />
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: acceptedTerms }} onPress={() => setAcceptedTerms((value) => !value)} style={styles.checkRow}>
          <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>{acceptedTerms ? <Check color={colors.ink} size={16} strokeWidth={3} /> : null}</View>
          <Text style={styles.checkText}>{t('acceptTerms')}</Text>
        </Pressable>
        {status ? <Text accessibilityRole={success ? 'text' : 'alert'} style={[styles.status, success && styles.success]}>{status}</Text> : null}
        <Button label={t('createAccount')} loading={busy} onPress={() => void submit()} />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  screen: { paddingTop: 28 },
  heading: { gap: 9, marginBottom: spacing.xxl },
  title: { color: colors.inkDeep, fontSize: 34, fontWeight: '800', letterSpacing: -1.1 },
  subtitle: { color: colors.muted, fontSize: 16, lineHeight: 24 },
  form: { gap: spacing.lg },
  checkRow: { minHeight: hitTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.paper, alignItems: 'center', justifyContent: 'center' },
  checkboxChecked: { backgroundColor: colors.mint, borderColor: colors.mint },
  checkText: { flex: 1, color: colors.text, lineHeight: 20 },
  status: { color: colors.danger, backgroundColor: '#FFF0F0', borderRadius: radius.sm, padding: spacing.md, lineHeight: 20 },
  success: { color: colors.success, backgroundColor: colors.mintSoft },
})
