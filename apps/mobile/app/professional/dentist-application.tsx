import { dentistApplicationSchema } from '@amar-dentist/domain'
import * as DocumentPicker from 'expo-document-picker'
import { router, Stack } from 'expo-router'
import { Check, FileBadge2, Languages } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Field } from '../../src/components/Field'
import { Screen } from '../../src/components/Screen'
import { submitDentistApplication, uploadVerificationDocument } from '../../src/lib/phase2'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, hitTarget, radius, spacing } from '../../src/theme'

export default function DentistApplicationScreen() {
  const { profile } = useAuth()
  const { locale, t } = useLocale()
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [title, setTitle] = useState('Dental Surgeon')
  const [biography, setBiography] = useState('')
  const [specialties, setSpecialties] = useState('')
  const [yearsExperience, setYearsExperience] = useState('')
  const [languages, setLanguages] = useState<Array<'bn' | 'en'>>(['bn', 'en'])
  const [document, setDocument] = useState<DocumentPicker.DocumentPickerAsset | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const toggleLanguage = (language: 'bn' | 'en') => setLanguages((current) => current.includes(language) ? current.filter((value) => value !== language) : [...current, language])
  const chooseDocument = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], copyToCacheDirectory: true })
    if (!result.canceled) setDocument(result.assets[0] ?? null)
  }
  const submit = async () => {
    if (!profile || !document) return setMessage(t('documentRequired'))
    const parsed = dentistApplicationSchema.safeParse({
      registrationNumber, title, biography,
      specialties: specialties.split(',').map((value) => value.trim()).filter(Boolean),
      languages, gender: null, yearsExperience: yearsExperience ? Number(yearsExperience) : null,
    })
    if (!parsed.success) return setMessage(locale === 'bn' ? t('checkDetails') : (parsed.error.issues[0]?.message ?? t('checkDetails')))
    setBusy(true)
    setMessage(null)
    try {
      const targetId = await submitDentistApplication(parsed.data)
      await uploadVerificationDocument({ userId: profile.id, targetType: 'dentist', targetId, kind: 'bmdc_card', asset: document })
      setSuccess(true)
      setMessage(t('dentistSubmitted'))
    } catch {
      setMessage(t('authUnavailable'))
    } finally { setBusy(false) }
  }

  return <Screen style={styles.screen}>
    <Stack.Screen options={{ title: t('dentistApplication'), headerBackTitle: t('back') }} />
    <View style={styles.heading}><Text style={styles.title}>{t('dentistApplication')}</Text><Text style={styles.subtitle}>{t('verificationPrivacy')}</Text></View>
    <View style={styles.form}>
      <Field label={t('registrationNumber')} value={registrationNumber} onChangeText={setRegistrationNumber} autoCapitalize="characters" />
      <Field label={t('professionalTitle')} value={title} onChangeText={setTitle} />
      <Field label={t('specialties')} value={specialties} onChangeText={setSpecialties} hint={t('specialtiesHint')} />
      <Field label={t('yearsExperience')} value={yearsExperience} onChangeText={setYearsExperience} keyboardType="number-pad" />
      <Field label={t('biography')} value={biography} onChangeText={setBiography} multiline numberOfLines={5} style={styles.multiline} />
      <View style={styles.group}><Text style={styles.label}>{t('languages')}</Text><View style={styles.languageRow}>{(['bn', 'en'] as const).map((language) => <Pressable key={language} accessibilityRole="checkbox" accessibilityState={{ checked: languages.includes(language) }} onPress={() => toggleLanguage(language)} style={[styles.choice, languages.includes(language) && styles.choiceActive]}>{languages.includes(language) ? <Check size={16} color={colors.ink} /> : <Languages size={16} color={colors.muted} />}<Text style={styles.choiceText}>{language === 'bn' ? t('bangla') : t('english')}</Text></Pressable>)}</View></View>
      <View style={styles.documentCard}><View style={styles.documentIcon}><FileBadge2 size={22} color={colors.teal} /></View><View style={styles.documentCopy}><Text style={styles.documentTitle}>{t('credentialDocument')}</Text><Text numberOfLines={2} style={styles.documentName}>{document?.name ?? t('documentRequired')}</Text></View><Button label={document ? t('documentSelected') : t('chooseDocument')} variant="secondary" onPress={() => void chooseDocument()} /></View>
      {message ? <Text accessibilityRole={success ? 'text' : 'alert'} style={[styles.message, success && styles.success]}>{message}</Text> : null}
      {success ? <Button label={t('professionalOnboarding')} variant="secondary" onPress={() => router.replace('/professional')} /> : <Button label={t('submitDentist')} loading={busy} onPress={() => void submit()} />}
    </View>
  </Screen>
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xl },
  heading: { gap: spacing.sm, marginBottom: spacing.xl },
  title: { color: colors.inkDeep, fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  form: { gap: spacing.lg },
  multiline: { minHeight: 124, paddingTop: 14, textAlignVertical: 'top' },
  group: { gap: spacing.sm },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  languageRow: { flexDirection: 'row', gap: spacing.md },
  choice: { minHeight: hitTarget, flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.paper },
  choiceActive: { borderColor: colors.mint, backgroundColor: colors.mintSoft },
  choiceText: { color: colors.ink, fontWeight: '700' },
  documentCard: { gap: spacing.md, padding: spacing.lg, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg },
  documentIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintSoft },
  documentCopy: { gap: 4 },
  documentTitle: { color: colors.ink, fontWeight: '800' },
  documentName: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  message: { color: colors.danger, padding: spacing.md, borderRadius: radius.sm, backgroundColor: '#FFF0F0', lineHeight: 20 },
  success: { color: colors.success, backgroundColor: colors.mintSoft },
})
