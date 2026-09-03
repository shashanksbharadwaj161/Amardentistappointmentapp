import { clinicStaffInvitationSchema, type ClinicMemberRole } from '@amar-dentist/domain'
import { useQuery } from '@tanstack/react-query'
import { Redirect, Stack } from 'expo-router'
import { Check, ShieldCheck, UserPlus } from 'lucide-react-native'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Field } from '../../src/components/Field'
import { Screen } from '../../src/components/Screen'
import { SectionCard } from '../../src/components/SectionCard'
import { getScheduleManagementContext, inviteClinicStaff } from '../../src/lib/phase2'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, hitTarget, radius, spacing } from '../../src/theme'

const roles: Array<{ value: Exclude<ClinicMemberRole, 'clinic_owner'>; key: 'manager' | 'dentist' | 'frontDesk' }> = [
  { value: 'clinic_manager', key: 'manager' }, { value: 'dentist', key: 'dentist' }, { value: 'front_desk', key: 'frontDesk' },
]

export default function ClinicTeamScreen() {
  const { profile, loading } = useAuth()
  const { locale, t } = useLocale()
  const context = useQuery({ queryKey: ['team-clinic', profile?.id], queryFn: () => getScheduleManagementContext(profile!.id), enabled: Boolean(profile) })
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Exclude<ClinicMemberRole, 'clinic_owner'>>('dentist')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null

  const submit = async () => {
    if (!context.data?.clinic) return setMessage(t('noClinics'))
    const parsed = clinicStaffInvitationSchema.safeParse({ clinicId: context.data.clinic.id, email, role, expiresInDays: 7 })
    if (!parsed.success) return setMessage(locale === 'bn' ? t('checkDetails') : (parsed.error.issues[0]?.message ?? t('checkDetails')))
    setBusy(true)
    try { await inviteClinicStaff(parsed.data); setMessage(t('invitationSaved')); setEmail('') } catch { setMessage(t('authUnavailable')) } finally { setBusy(false) }
  }

  return <Screen maxWidth={720} style={styles.screen}>
    <Stack.Screen options={{ title: t('manageTeam'), headerBackTitle: t('back') }} />
    <View style={styles.heading}><Text style={styles.title}>{t('manageTeam')}</Text><Text style={styles.subtitle}>{t('manageTeamBody')}</Text></View>
    <SectionCard eyebrow={context.data?.clinic?.name.toUpperCase()} title={t('sendInvitation')}>
      <Field label={t('staffEmail')} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <View style={styles.roleList}>{roles.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityState={{ checked: role === option.value }} style={[styles.roleOption, role === option.value && styles.roleActive]} onPress={() => setRole(option.value)}><View style={[styles.check, role === option.value && styles.checkActive]}>{role === option.value ? <Check size={15} color={colors.ink} strokeWidth={3} /> : null}</View><Text style={styles.roleText}>{t(option.key)}</Text></Pressable>)}</View>
      {message ? <View style={styles.message}><ShieldCheck size={18} color={colors.teal} /><Text style={styles.messageText}>{message}</Text></View> : null}
      <Button label={t('sendInvitation')} loading={busy} onPress={() => void submit()} />
    </SectionCard>
    <View style={styles.security}><UserPlus size={17} color={colors.teal} /><Text style={styles.securityText}>{t('verificationPrivacy')}</Text></View>
  </Screen>
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xl },
  heading: { gap: spacing.sm, marginBottom: spacing.xl },
  title: { color: colors.inkDeep, fontSize: 32, fontWeight: '800', letterSpacing: -1 },
  subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  roleList: { gap: spacing.sm },
  roleOption: { minHeight: hitTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.pearl },
  roleActive: { borderColor: colors.mint, backgroundColor: colors.mintSoft },
  check: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.line, borderRadius: 7, backgroundColor: colors.paper },
  checkActive: { borderColor: colors.mint, backgroundColor: colors.mint },
  roleText: { color: colors.ink, fontWeight: '700' },
  message: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', padding: spacing.md, backgroundColor: colors.mintSoft, borderRadius: radius.md },
  messageText: { flex: 1, color: colors.teal, fontSize: 12, lineHeight: 18 },
  security: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginTop: spacing.xl, paddingHorizontal: spacing.sm },
  securityText: { flex: 1, color: colors.muted, fontSize: 12, lineHeight: 18 },
})
