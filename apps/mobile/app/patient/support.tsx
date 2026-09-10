import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Redirect, Stack } from 'expo-router'
import { useRef, useState } from 'react'
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Screen } from '../../src/components/Screen'
import { isSupportPreview, listSupportCases, openSupportCase, supportCategories, supportInputSchema, type SupportInput } from '../../src/lib/support'
import { supportMessages } from '../../src/lib/support-messages'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, hitTarget } from '../../src/theme'

// A quiet, single-column support flow within the existing role-aware app shell.
export default function SupportScreen() {
  const { profile, loading } = useAuth()
  const { locale } = useLocale()
  const copy = supportMessages[locale]
  const client = useQueryClient()
  const [category, setCategory] = useState<SupportInput['category']>('technical')
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const [error, setError] = useState<'invalid' | 'failed' | null>(null)
  const [notice, setNotice] = useState<'sent' | 'preview' | null>(null)
  const requests = useQuery({ queryKey: ['support-cases', profile?.id],
    queryFn: () => listSupportCases(profile!.id), enabled: Boolean(profile), retry: false })
  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null

  const submit = async () => {
    if (submitting.current) return
    setNotice(null)
    const parsed = supportInputSchema.safeParse({ category, summary })
    if (!parsed.success) { setError('invalid'); return }
    submitting.current = true
    setBusy(true); setError(null)
    try {
      const result = await openSupportCase(profile.id, parsed.data)
      setNotice(result.preview ? 'preview' : 'sent')
      if (!result.preview) {
        setSummary('')
        void client.invalidateQueries({ queryKey: ['support-cases', profile.id] })
      }
    } catch { setError('failed') }
    finally { submitting.current = false; setBusy(false) }
  }

  return <Screen maxWidth={780} style={styles.screen}>
    <Stack.Screen options={{ title: copy.title }} />
    <View style={styles.section}><Text accessibilityRole="header" style={styles.title}>{copy.title}</Text><Text style={styles.body}>{copy.subtitle}</Text></View>
    <View style={styles.form}>
      <Text style={styles.warning}>{copy.warning}</Text>
      <Text style={styles.label}>{copy.category}</Text>
      <View style={styles.categories}>{supportCategories.map(value => <Pressable key={value}
        accessibilityRole="radio" accessibilityLabel={copy[value]} accessibilityState={{ checked: category === value, disabled: busy }}
        disabled={busy} onPress={() => setCategory(value)} style={[styles.choice, category === value && styles.selected]}>
        <Text style={[styles.body, category === value && styles.selectedText]}>{copy[value]}</Text>
      </Pressable>)}</View>
      <Text style={styles.label}>{copy.summary}</Text>
      <TextInput accessibilityLabel={copy.summary} accessibilityHint={copy.hint} multiline textAlignVertical="top"
        editable={!busy} maxLength={1000} value={summary} onChangeText={setSummary} style={styles.input} />
      <Text style={styles.body}>{copy.hint} ({summary.length.toLocaleString(locale)}/1,000)</Text>
      {error && <Text accessibilityRole="alert" style={styles.error}>{copy[error]}</Text>}
      {notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{copy[notice]}</Text>}
      <Button label={isSupportPreview(profile.id) ? copy.tryPreview : copy.send} loading={busy} onPress={() => void submit()} />
    </View>
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.heading}>{copy.history}</Text>
      <Button label={copy.refresh} variant="secondary" loading={requests.isFetching} onPress={() => void requests.refetch()} />
      {requests.isPending ? <Text style={styles.body}>{copy.loading}</Text> : requests.isError ? <Text accessibilityRole="alert" style={styles.error}>{copy.loadFailed}</Text> : !requests.data?.length ? <Text style={styles.body}>{copy.empty}</Text> : null}
      {requests.data?.map(request => <View key={request.id} style={styles.request}>
        <Text style={styles.label}>{copy[request.category]} · {copy[request.status]}</Text>
        <Text style={styles.body}>{new Date(request.created_at).toLocaleDateString(locale)}</Text>
        <Text selectable style={styles.body}>{request.summary}</Text>
        {request.resolution && <><Text style={styles.label}>{copy.response}</Text><Text selectable style={styles.body}>{request.resolution}</Text></>}
      </View>)}
    </View>
  </Screen>
}

const styles = StyleSheet.create({
  screen: { gap: 32, paddingTop: 24 }, section: { gap: 12 },
  title: { fontSize: 30, fontWeight: '800', color: colors.inkDeep }, heading: { fontSize: 22, fontWeight: '700', color: colors.ink },
  form: { padding: 20, gap: 16, borderRadius: 14, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  label: { color: colors.ink, fontSize: 16, fontWeight: '700' }, body: { color: colors.muted, fontSize: 15, lineHeight: 23 },
  warning: { color: colors.teal, fontSize: 14, lineHeight: 22 }, categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: hitTarget, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: colors.line, borderRadius: 10 },
  selected: { borderColor: colors.teal, backgroundColor: colors.mintSoft }, selectedText: { color: colors.teal, fontWeight: '700' },
  input: { minHeight: 150, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 14, fontSize: 16, lineHeight: 24, color: colors.text },
  error: { color: colors.danger, fontSize: 14, lineHeight: 22 }, notice: { color: colors.success, fontSize: 15, lineHeight: 23 },
  request: { borderTopWidth: 1, borderTopColor: colors.line, paddingVertical: 20, gap: 8 },
})
