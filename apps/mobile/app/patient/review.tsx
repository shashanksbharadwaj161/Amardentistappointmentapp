import { reviewSchema } from '@amar-dentist/domain'
import { Redirect, router, Stack, useLocalSearchParams } from 'expo-router'
import { CheckCircle2, MessageSquareText, Star } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Screen } from '../../src/components/Screen'
import { submitAppointmentReview } from '../../src/lib/phase3'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, hitTarget, radius, spacing } from '../../src/theme'

export default function PatientReviewScreen() {
  const { appointmentId, clinicName } = useLocalSearchParams<{ appointmentId?: string; clinicName?: string }>()
  const { profile, loading } = useAuth()
  const { t } = useLocale()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null
  if (!appointmentId) return <Redirect href="/patient/appointments" />

  const submit = async () => {
    const parsed = reviewSchema.safeParse({ appointmentId, rating, comment })
    if (!parsed.success) return setError(t('reviewRatingRequired'))
    setBusy(true); setError(null)
    try { await submitAppointmentReview(parsed.data); setSubmitted(true) } catch { setError(t('reviewSubmitFailed')) } finally { setBusy(false) }
  }

  if (submitted) return <Screen maxWidth={640} style={styles.screen}>
    <Stack.Screen options={{ title: t('reviewSubmitted'), headerBackTitle: t('back') }} />
    <View style={styles.success}><CheckCircle2 size={46} color={colors.success} /></View>
    <Text style={styles.successTitle}>{t('reviewSubmitted')}</Text>
    <Text style={styles.successBody}>{t('reviewSubmittedBody')}</Text>
    <Button label={t('appointments')} onPress={() => router.dismissTo('/patient/appointments')} />
  </Screen>

  return <Screen maxWidth={680} style={styles.screen}>
    <Stack.Screen options={{ title: t('shareFeedback'), headerBackTitle: t('back') }} />
    <View style={styles.heading}><MessageSquareText size={27} color={colors.teal} /><View style={styles.headingCopy}><Text style={styles.title}>{t('shareFeedback')}</Text><Text style={styles.subtitle}>{clinicName || t('completedVisit')}</Text></View></View>
    <View style={styles.form}>
      <Text style={styles.label}>{t('rateVisit')}</Text>
      <View style={styles.stars}>{[1, 2, 3, 4, 5].map((value) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={`${value} ${t('stars')}`} accessibilityState={{ checked: rating === value }} onPress={() => setRating(value)} style={[styles.starButton, rating === value && styles.starSelected]}><Star size={26} color={rating >= value ? colors.warning : colors.muted} fill={rating >= value ? colors.warning : 'transparent'} /></Pressable>)}</View>
      <Text style={styles.label}>{t('reviewComment')}</Text>
      <TextInput accessibilityLabel={t('reviewComment')} placeholder={t('reviewCommentHint')} placeholderTextColor={colors.muted} value={comment} onChangeText={setComment} maxLength={1200} multiline textAlignVertical="top" style={styles.comment} />
      <Text style={styles.counter}>{comment.length}/1200</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <Button label={t('submitReview')} loading={busy} onPress={() => void submit()} />
    </View>
  </Screen>
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xl, gap: spacing.xl }, heading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, headingCopy: { flex: 1, gap: 5 }, title: { color: colors.inkDeep, fontSize: 30, fontWeight: '800', letterSpacing: -0.8 }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  form: { gap: spacing.lg, padding: spacing.xl, borderRadius: radius.lg, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line }, label: { color: colors.ink, fontSize: 14, fontWeight: '800' }, stars: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }, starButton: { width: hitTarget, height: hitTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.pearl }, starSelected: { borderColor: colors.warning, backgroundColor: '#FFF6E8' }, comment: { minHeight: 150, padding: spacing.lg, color: colors.text, fontSize: 16, lineHeight: 23, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.pearl }, counter: { alignSelf: 'flex-end', marginTop: -spacing.md, color: colors.muted, fontSize: 11 }, error: { color: colors.danger, fontSize: 13 },
  success: { width: 86, height: 86, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', borderRadius: 43, backgroundColor: colors.mintSoft }, successTitle: { color: colors.inkDeep, fontSize: 30, fontWeight: '800', textAlign: 'center' }, successBody: { color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: 'center' },
})
