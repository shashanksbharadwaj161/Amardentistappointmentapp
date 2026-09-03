import { clinicApplicationSchema } from '@amar-dentist/domain'
import * as DocumentPicker from 'expo-document-picker'
import { router, Stack } from 'expo-router'
import { FileBadge2 } from 'lucide-react-native'
import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Field } from '../../src/components/Field'
import { Screen } from '../../src/components/Screen'
import { submitClinicApplication, uploadVerificationDocument } from '../../src/lib/phase2'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, radius, spacing } from '../../src/theme'

export default function ClinicApplicationScreen() {
  const { profile } = useAuth()
  const { locale, t } = useLocale()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [district, setDistrict] = useState('')
  const [city, setCity] = useState('')
  const [description, setDescription] = useState('')
  const [document, setDocument] = useState<DocumentPicker.DocumentPickerAsset | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const submit = async () => {
    if (!profile || !document) return setMessage(t('documentRequired'))
    const parsed = clinicApplicationSchema.safeParse({ name, phone, email, address, district, city, description, latitude: null, longitude: null })
    if (!parsed.success) return setMessage(locale === 'bn' ? t('checkDetails') : (parsed.error.issues[0]?.message ?? t('checkDetails')))
    setBusy(true)
    setMessage(null)
    try {
      const clinicId = await submitClinicApplication(parsed.data)
      await uploadVerificationDocument({ userId: profile.id, targetType: 'clinic', targetId: clinicId, kind: 'clinic_license', asset: document })
      setSuccess(true)
      setMessage(t('clinicSubmitted'))
    } catch {
      setMessage(t('authUnavailable'))
    } finally { setBusy(false) }
  }
  const chooseDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true })
    if (!result.canceled) setDocument(result.assets[0] ?? null)
  }

  return <Screen style={styles.screen}>
    <Stack.Screen options={{ title: t('clinicApplication'), headerBackTitle: t('back') }} />
    <View style={styles.heading}><Text style={styles.title}>{t('clinicApplication')}</Text><Text style={styles.subtitle}>{t('privateUntilApproved')}</Text></View>
    <View style={styles.form}>
      <Field label={t('clinicName')} value={name} onChangeText={setName} autoComplete="organization" />
      <Field label={t('phone')} value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" />
      <Field label={t('optionalEmail')} value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
      <Field label={t('address')} value={address} onChangeText={setAddress} autoComplete="street-address" />
      <View style={styles.row}><View style={styles.half}><Field label={t('district')} value={district} onChangeText={setDistrict} /></View><View style={styles.half}><Field label={t('city')} value={city} onChangeText={setCity} /></View></View>
      <Field label={t('description')} value={description} onChangeText={setDescription} multiline numberOfLines={4} style={styles.multiline} />
      <View style={styles.documentCard}><View style={styles.documentIcon}><FileBadge2 size={22} color={colors.teal} /></View><View style={styles.documentCopy}><Text style={styles.documentTitle}>{t('clinicDocument')}</Text><Text numberOfLines={2} style={styles.documentName}>{document?.name ?? t('documentRequired')}</Text></View><Button label={document ? t('documentSelected') : t('chooseDocument')} variant="secondary" onPress={() => void chooseDocument()} /></View>
      {message ? <Text accessibilityRole={success ? 'text' : 'alert'} style={[styles.message, success && styles.success]}>{message}</Text> : null}
      {success ? <Button label={t('professionalOnboarding')} variant="secondary" onPress={() => router.replace('/professional')} /> : <Button label={t('submitClinic')} loading={busy} onPress={() => void submit()} />}
    </View>
  </Screen>
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xl },
  heading: { gap: spacing.sm, marginBottom: spacing.xl },
  title: { color: colors.inkDeep, fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  subtitle: { color: colors.teal, fontSize: 13, fontWeight: '700' },
  form: { gap: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md },
  half: { flex: 1 },
  multiline: { minHeight: 112, paddingTop: 14, textAlignVertical: 'top' },
  documentCard: { gap: spacing.md, padding: spacing.lg, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg },
  documentIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintSoft },
  documentCopy: { gap: 4 },
  documentTitle: { color: colors.ink, fontWeight: '800' },
  documentName: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  message: { color: colors.danger, padding: spacing.md, borderRadius: radius.sm, backgroundColor: '#FFF0F0', lineHeight: 20 },
  success: { color: colors.success, backgroundColor: colors.mintSoft },
})
