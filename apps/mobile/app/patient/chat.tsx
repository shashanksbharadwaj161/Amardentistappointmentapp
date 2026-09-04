import { useQuery } from '@tanstack/react-query'
import { Redirect, Stack, useLocalSearchParams } from 'expo-router'
import { MessageCircle, Send, ShieldCheck } from 'lucide-react-native'
import { useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Screen } from '../../src/components/Screen'
import { getChatMessages, getOrCreateChatThread, sendChatMessage, subscribeToChatMessages, type ChatMessage } from '../../src/lib/phase3'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, hitTarget, radius, spacing } from '../../src/theme'

export default function PatientClinicChatScreen() {
  const params = useLocalSearchParams<{ patientProfileId?: string; clinicId?: string; clinicName?: string; appointmentId?: string; threadId?: string; patientName?: string }>()
  const { profile, loading } = useAuth()
  const { locale, t } = useLocale()
  const listRef = useRef<FlatList<ChatMessage>>(null)
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const thread = useQuery({ queryKey: ['chat-thread', params.threadId, params.patientProfileId, params.clinicId, params.appointmentId], queryFn: () => params.threadId ?? getOrCreateChatThread(params.patientProfileId!, params.clinicId!, params.appointmentId ?? null), enabled: Boolean(profile && (params.threadId || (params.patientProfileId && params.clinicId))) })
  const history = useQuery({ queryKey: ['chat-messages', thread.data], queryFn: () => getChatMessages(thread.data!), enabled: Boolean(thread.data), refetchInterval: 10_000 })

  useEffect(() => { if (history.data) setMessages(history.data) }, [history.data])
  useEffect(() => thread.data ? subscribeToChatMessages(thread.data, (message) => setMessages((items) => items.some((item) => item.id === message.id) ? items : [...items, message])) : undefined, [thread.data])
  useEffect(() => { if (messages.length) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true })) }, [messages.length])

  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null

  const send = async () => {
    if (!thread.data || !draft.trim()) return
    const body = draft.trim(); setSending(true); setError(null)
    try {
      const id = await sendChatMessage(thread.data, body)
      setMessages((items) => [...items, { id, senderId: profile.id, body, createdAt: new Date().toISOString() }])
      setDraft('')
    } catch { setError(t('authUnavailable')) } finally { setSending(false) }
  }

  const staffReply = Boolean(params.threadId && params.patientName)
  const title = params.patientName || params.clinicName || t('clinicChat')
  const formatter = new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Dhaka' })

  return <Screen scroll={false} maxWidth={720} style={styles.screen}>
    <Stack.Screen options={{ title, headerBackTitle: t('back') }} />
    <KeyboardAvoidingView style={styles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={92}>
      <View style={styles.heading}><MessageCircle size={26} color={colors.teal} /><View style={styles.headingCopy}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{t('clinicChatBody')}</Text></View></View>
      <View style={styles.privacy}><ShieldCheck size={16} color={colors.teal} /><Text style={styles.privacyText}>{t('chatPrivacy')}</Text></View>
      {history.isLoading ? <ActivityIndicator color={colors.teal} /> : <FlatList ref={listRef} style={styles.messages} contentContainerStyle={styles.messageContent} data={messages} keyExtractor={(message) => message.id} keyboardShouldPersistTaps="handled" onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })} renderItem={({ item: message }) => {
        const own = message.senderId === profile.id
        const sender = own ? t('yourMessage') : staffReply ? t('patientMessage') : t('clinicMessage')
        const timestamp = formatter.format(new Date(message.createdAt))
        return <View accessible accessibilityLabel={`${sender}. ${timestamp}. ${message.body}`} style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleClinic]}><Text style={[styles.messageText, own && styles.messageTextOwn]}>{message.body}</Text><Text style={[styles.messageMeta, own && styles.messageMetaOwn]}>{sender} · {timestamp}</Text></View>
      }} />}
      <View style={styles.composer}><TextInput accessibilityLabel={staffReply ? t('replyToPatient') : t('messageClinic')} placeholder={staffReply ? t('typeReply') : t('typeMessage')} placeholderTextColor={colors.muted} multiline value={draft} onChangeText={setDraft} style={styles.input} /><Pressable accessibilityRole="button" accessibilityLabel={t('sendMessage')} disabled={!draft.trim() || sending} onPress={() => void send()} style={[styles.send, (!draft.trim() || sending) && styles.sendDisabled]}><Send size={19} color={colors.paper} /></Pressable></View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </KeyboardAvoidingView>
  </Screen>
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.lg }, keyboard: { flex: 1, gap: spacing.md }, heading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, headingCopy: { flex: 1, gap: 5 }, title: { color: colors.inkDeep, fontSize: 28, fontWeight: '800', letterSpacing: -0.7 }, subtitle: { color: colors.muted, fontSize: 12, lineHeight: 18 }, privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.mintSoft }, privacyText: { flex: 1, color: colors.teal, fontSize: 11, lineHeight: 17 }, messages: { flex: 1, minHeight: 180 }, messageContent: { flexGrow: 1, justifyContent: 'flex-end', gap: spacing.sm, paddingVertical: spacing.sm }, bubble: { maxWidth: '82%', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.md }, bubbleClinic: { alignSelf: 'flex-start', backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line }, bubbleOwn: { alignSelf: 'flex-end', backgroundColor: colors.ink }, messageText: { color: colors.text, fontSize: 13, lineHeight: 19 }, messageTextOwn: { color: colors.paper }, messageMeta: { marginTop: 4, color: colors.muted, fontSize: 9, lineHeight: 13 }, messageMetaOwn: { color: '#B8C8D3' }, composer: { minHeight: 56, flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, backgroundColor: colors.paper }, input: { flex: 1, minHeight: 40, maxHeight: 120, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, color: colors.text, fontSize: 14 }, send: { width: hitTarget, height: hitTarget, alignItems: 'center', justifyContent: 'center', borderRadius: hitTarget / 2, backgroundColor: colors.ink }, sendDisabled: { opacity: 0.45 }, error: { color: colors.danger, fontSize: 12, paddingBottom: spacing.sm },
})
