import { availableModes, type AppMode } from '@amar-dentist/domain'
import { Redirect, router, Stack } from 'expo-router'
import { Check, ChevronRight, CircleUserRound, Languages, Stethoscope } from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { Button } from '../src/components/Button'
import { Screen } from '../src/components/Screen'
import { getNavigationGroups, performModeSwitch, type NavigationItem } from '../src/lib/navigation'
import { navigationMessages } from '../src/lib/navigation-messages'
import { useAuth } from '../src/providers/AuthProvider'
import { useLocale } from '../src/providers/LocaleProvider'
import { colors, hitTarget, radius, spacing } from '../src/theme'

export default function AccountScreen() {
  const { profile, loading, setMode, signOut } = useAuth()
  const { locale, setLocale, t } = useLocale()
  const [busyMode, setBusyMode] = useState<AppMode | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null

  const local = navigationMessages[locale] as Record<string, string>
  const itemLabel = (item: NavigationItem) => local[item.label] ?? t(item.label as Parameters<typeof t>[0])
  const modes = availableModes(profile.roles)
  const overflowItems = getNavigationGroups(profile.activeMode, profile.roles).flatMap(({ items }, index) => index === 0 ? [] : items)

  const switchMode = async (mode: AppMode) => {
    if (mode === profile.activeMode || busyMode) return
    setMessage(null)
    const error = await performModeSwitch({
      mode,
      setMode,
      setBusy: setBusyMode,
      onSuccess: () => router.replace('/dashboard'),
      fallbackError: navigationMessages[locale].switchFailed,
    })
    if (error) {
      setMessage(error)
    }
  }

  const exit = async () => {
    setMessage(null)
    setSigningOut(true)
    try {
      await signOut()
      router.replace('/')
    } catch {
      setMessage(t('authUnavailable'))
      setSigningOut(false)
    }
  }

  return (
    <Screen maxWidth={760} style={styles.screen}>
      <Stack.Screen options={{ title: local.account }} />
      <View style={styles.heading}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{profile.fullName.slice(0, 1).toUpperCase()}</Text></View>
        <View style={styles.identity}>
          <Text style={styles.title}>{profile.fullName}</Text>
          <Text style={styles.email}>{profile.email}</Text>
          <Text style={styles.subtitle}>{local.accountSubtitle}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{local.language}</Text>
        <View accessibilityRole="radiogroup" style={styles.choiceRow}>
          {(['en', 'bn'] as const).map((option) => {
            const selected = locale === option
            return (
              <Pressable key={option} accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={() => setLocale(option)} style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.pressed]}>
                <Languages aria-hidden size={18} color={selected ? colors.ink : colors.muted} />
                <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{option === 'en' ? t('english') : t('bangla')}</Text>
                {selected ? <Check aria-hidden size={17} color={colors.teal} /> : null}
              </Pressable>
            )
          })}
        </View>
      </View>

      {modes.length > 1 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{local.workspace}</Text>
          <View accessibilityRole="radiogroup" style={styles.choiceRow}>
            {modes.map((mode) => {
              const selected = profile.activeMode === mode
              return (
                <Pressable key={mode} accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: Boolean(busyMode), busy: busyMode === mode }} disabled={Boolean(busyMode)} onPress={() => void switchMode(mode)} style={({ pressed }) => [styles.choice, selected && styles.choiceSelected, pressed && styles.pressed]}>
                  {busyMode === mode ? <ActivityIndicator size="small" color={colors.teal} /> : mode === 'patient' ? <CircleUserRound aria-hidden size={18} color={selected ? colors.ink : colors.muted} /> : <Stethoscope aria-hidden size={18} color={selected ? colors.ink : colors.muted} />}
                  <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{mode === 'patient' ? t('patient') : t('professional')}</Text>
                  {selected ? <Check aria-hidden size={17} color={colors.teal} /> : null}
                </Pressable>
              )
            })}
          </View>
        </View>
      ) : null}

      {overflowItems.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{local.settings}</Text>
          <View style={styles.links}>
            {overflowItems.map((item) => (
              <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={itemLabel(item)} onPress={() => router.navigate(item.href)} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
                <Text style={styles.linkText}>{itemLabel(item)}</Text>
                <ChevronRight aria-hidden size={19} color={colors.muted} />
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
      <Button label={t('signOut')} variant="secondary" loading={signingOut} onPress={() => void exit()} />
    </Screen>
  )
}

const styles = StyleSheet.create({
  screen: { gap: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xxxl },
  heading: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mint },
  avatarText: { color: colors.ink, fontSize: 24, fontWeight: '800' },
  identity: { flex: 1, minWidth: 0, gap: 3 },
  title: { color: colors.inkDeep, fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.4 },
  email: { color: colors.teal, fontSize: 13, lineHeight: 19 },
  subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  section: { gap: spacing.md },
  sectionTitle: { color: colors.ink, fontSize: 15, lineHeight: 21, fontWeight: '800' },
  choiceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: { minWidth: 144, minHeight: hitTarget, flexGrow: 1, flexBasis: 180, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, backgroundColor: colors.paper },
  choiceSelected: { backgroundColor: colors.mintSoft, borderColor: colors.teal },
  choiceText: { flex: 1, color: colors.muted, fontSize: 14, fontWeight: '700' },
  choiceTextSelected: { color: colors.ink },
  links: { overflow: 'hidden', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.paper },
  link: { minHeight: hitTarget + 4, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  linkText: { flex: 1, color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 13, lineHeight: 20 },
  pressed: { opacity: 0.72 },
})
