import { availableModes, type AppMode } from '@amar-dentist/domain'
import { router, usePathname } from 'expo-router'
import {
  BriefcaseBusiness,
  CalendarDays,
  CalendarRange,
  CircleUserRound,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  HeartHandshake,
  Home,
  Inbox,
  MapPin,
  MessageCircleHeart,
  Settings2,
  ShieldCheck,
  Stethoscope,
  UsersRound,
  type LucideIcon,
} from 'lucide-react-native'
import { useEffect, useState, type PropsWithChildren } from 'react'
import { ActivityIndicator, Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getAccountNavigationItem, getActiveNavigationItemId, getBottomNavigation, getNavigationGroups, isNavigationItemActive, isPreviewProfile, performModeSwitch, shouldShowAppShell, type NavigationIcon, type NavigationItem } from '../lib/navigation'
import { navigationMessages } from '../lib/navigation-messages'
import { useAuth } from '../providers/AuthProvider'
import { useLocale } from '../providers/LocaleProvider'
import { colors, hitTarget, radius, spacing } from '../theme'
import { BrandMark } from './BrandMark'

const expandedWidth = 1280
const icons: Record<NavigationIcon, LucideIcon> = {
  account: CircleUserRound,
  assistant: MessageCircleHeart,
  business: BriefcaseBusiness,
  calendar: CalendarDays,
  consent: ShieldCheck,
  discover: MapPin,
  home: Home,
  inbox: Inbox,
  payments: CreditCard,
  profiles: HeartHandshake,
  records: ClipboardList,
  schedule: CalendarRange,
  team: UsersRound,
  visits: ClipboardCheck,
  workspace: Stethoscope,
}

function useKeyboardVisible() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (Platform.OS === 'web') return
    const shown = Keyboard.addListener('keyboardDidShow', () => setVisible(true))
    const hidden = Keyboard.addListener('keyboardDidHide', () => setVisible(false))
    return () => { shown.remove(); hidden.remove() }
  }, [])
  return visible
}

function NavIcon({ name, active, size = 20 }: { name: NavigationIcon; active: boolean; size?: number }) {
  const Icon = icons[name]
  return <Icon aria-hidden color={active ? colors.ink : colors.muted} size={size} strokeWidth={active ? 2.5 : 2} />
}

export function AppShell({ children }: PropsWithChildren) {
  const { profile, loading, setMode } = useAuth()
  const { locale, t } = useLocale()
  const pathname = usePathname()
  const { width } = useWindowDimensions()
  const keyboardVisible = useKeyboardVisible()
  const [modeBusy, setModeBusy] = useState<AppMode | null>(null)
  const [modeError, setModeError] = useState<string | null>(null)

  if (!profile || !shouldShowAppShell(profile, loading, pathname)) return children

  const local = navigationMessages[locale] as Record<string, string>
  const label = (item: NavigationItem) => local[item.label] ?? t(item.label as Parameters<typeof t>[0])
  const groupLabel = (key: keyof typeof navigationMessages.en) => navigationMessages[locale][key]
  const modes = availableModes(profile.roles)
  const expanded = width >= expandedWidth

  const navigate = (item: NavigationItem) => router.navigate(item.href)
  const switchMode = async (mode: AppMode) => {
    if (mode === profile.activeMode || modeBusy) return
    setModeError(null)
    const error = await performModeSwitch({
      mode,
      setMode,
      setBusy: setModeBusy,
      onSuccess: () => router.replace('/dashboard'),
      fallbackError: groupLabel('switchFailed'),
    })
    if (error) {
      setModeError(error)
    }
  }

  if (!expanded) {
    const items = getBottomNavigation(profile.activeMode, profile.roles)
    const activeId = getActiveNavigationItemId(pathname, items)
    return (
      <View style={styles.compactShell}>
        <View style={styles.content}>{children}</View>
        {isPreviewProfile(profile) ? <Text numberOfLines={2} style={styles.compactPreviewNotice}>{groupLabel('previewNotice')}</Text> : null}
        {!keyboardVisible ? (
          <SafeAreaView edges={['bottom']} style={styles.bottomSafe}>
            <View accessibilityRole="tablist" accessibilityLabel={groupLabel('navigation')} style={styles.bottomBar}>
              {items.map((item) => {
                const active = activeId === item.id
                return (
                  <Pressable
                    key={item.id}
                    accessibilityRole="tab"
                    accessibilityLabel={label(item)}
                    accessibilityState={{ selected: active }}
                    onPress={() => navigate(item)}
                    style={({ pressed }) => [styles.bottomItem, active && styles.bottomItemActive, pressed && styles.pressed]}
                  >
                    <NavIcon name={item.icon} active={active} size={21} />
                    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.bottomLabel, active && styles.bottomLabelActive]}>{label(item)}</Text>
                  </Pressable>
                )
              })}
            </View>
          </SafeAreaView>
        ) : null}
      </View>
    )
  }

  const accountItem = getAccountNavigationItem()
  const accountActive = isNavigationItemActive(pathname, accountItem)
  const groups = getNavigationGroups(profile.activeMode, profile.roles)
  const activeId = getActiveNavigationItemId(pathname, groups.flatMap((group) => group.items))
  return (
    <View style={styles.expandedShell}>
      <SafeAreaView edges={['top', 'bottom', 'left']} style={styles.sidebarSafe}>
        <View style={styles.sidebar}>
          <BrandMark />
          {isPreviewProfile(profile) ? <Text numberOfLines={2} style={styles.previewNotice}>{groupLabel('previewNotice')}</Text> : null}
          {modes.length > 1 ? (
            <View>
              <Text style={styles.sectionLabel}>{groupLabel('workspace')}</Text>
              <View accessibilityRole="tablist" style={styles.modeSwitch}>
                {modes.map((mode) => {
                  const active = profile.activeMode === mode
                  const busy = modeBusy === mode
                  return (
                    <Pressable
                      key={mode}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active, disabled: Boolean(modeBusy), busy }}
                      disabled={Boolean(modeBusy)}
                      onPress={() => void switchMode(mode)}
                      style={({ pressed }) => [styles.modeOption, active && styles.modeOptionActive, pressed && styles.pressed]}
                    >
                      {busy ? <ActivityIndicator size="small" color={colors.teal} /> : mode === 'patient' ? <CircleUserRound aria-hidden size={17} color={active ? colors.ink : colors.muted} /> : <Stethoscope aria-hidden size={17} color={active ? colors.ink : colors.muted} />}
                      <Text style={[styles.modeText, active && styles.modeTextActive]}>{mode === 'patient' ? t('patient') : t('professional')}</Text>
                    </Pressable>
                  )
                })}
              </View>
              {modeError ? <Text accessibilityRole="alert" style={styles.modeError}>{modeError}</Text> : null}
            </View>
          ) : null}

          <ScrollView accessibilityRole="tablist" accessibilityLabel={groupLabel('navigation')} style={styles.groups} contentContainerStyle={styles.groupsContent} showsVerticalScrollIndicator={false}>
            {groups.map((group) => (
              <View key={group.id} style={styles.group}>
                <Text style={styles.sectionLabel}>{groupLabel(group.label)}</Text>
                <View style={styles.groupItems}>
                  {group.items.map((item) => {
                    const active = activeId === item.id
                    return (
                      <Pressable
                        key={item.id}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: active }}
                        onPress={() => navigate(item)}
                        style={({ pressed }) => [styles.sideItem, active && styles.sideItemActive, pressed && styles.pressed]}
                      >
                        <NavIcon name={item.icon} active={active} />
                        <Text numberOfLines={2} style={[styles.sideLabel, active && styles.sideLabelActive]}>{label(item)}</Text>
                        {active ? <View style={styles.activeMark} /> : null}
                      </Pressable>
                    )
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${groupLabel('account')}, ${profile.fullName}`}
            accessibilityState={{ selected: accountActive }}
            onPress={() => navigate(accountItem)}
            style={({ pressed }) => [styles.account, accountActive && styles.accountActive, pressed && styles.pressed]}
          >
            <View style={styles.avatar}><Text style={styles.avatarText}>{profile.fullName.slice(0, 1).toUpperCase()}</Text></View>
            <View style={styles.accountCopy}>
              <Text numberOfLines={1} style={styles.accountName}>{profile.fullName}</Text>
              <Text numberOfLines={1} style={styles.accountEmail}>{profile.email}</Text>
            </View>
            <Settings2 aria-hidden size={18} color={accountActive ? colors.ink : colors.muted} />
          </Pressable>
        </View>
      </SafeAreaView>
      <View style={styles.content}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  compactShell: { flex: 1, backgroundColor: colors.pearl },
  expandedShell: { flex: 1, minWidth: 0, flexDirection: 'row', backgroundColor: colors.pearl },
  content: { flex: 1, minWidth: 0 },
  sidebarSafe: { width: 248, flexShrink: 0, backgroundColor: colors.paper, borderRightWidth: 1, borderRightColor: colors.line },
  sidebar: { flex: 1, minHeight: 0, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  groups: { flex: 1, minHeight: 0, marginTop: spacing.md },
  groupsContent: { gap: spacing.xl, paddingBottom: spacing.md },
  group: { gap: spacing.sm },
  groupItems: { gap: spacing.xs },
  sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.sm, color: colors.muted, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  sideItem: { position: 'relative', minHeight: hitTarget, flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm },
  sideItemActive: { backgroundColor: colors.mintSoft },
  sideLabel: { flex: 1, color: colors.muted, fontSize: 14, lineHeight: 19, fontWeight: '600' },
  sideLabelActive: { color: colors.ink, fontWeight: '800' },
  activeMark: { width: 4, height: 4, borderRadius: 2, backgroundColor: colors.teal },
  modeSwitch: { flexDirection: 'row', padding: 3, backgroundColor: colors.pearl, borderRadius: radius.sm },
  modeOption: { flex: 1, minHeight: hitTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8, paddingHorizontal: spacing.xs },
  modeOptionActive: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  modeText: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  modeTextActive: { color: colors.ink },
  modeError: { marginTop: spacing.sm, paddingHorizontal: spacing.sm, color: colors.danger, fontSize: 12, lineHeight: 18 },
  previewNotice: { marginTop: spacing.md, padding: spacing.sm, borderRadius: radius.sm, backgroundColor: colors.mintSoft, color: colors.teal, fontSize: 11, lineHeight: 17, fontWeight: '700' },
  compactPreviewNotice: { flexShrink: 0, paddingHorizontal: spacing.sm, paddingVertical: 3, backgroundColor: colors.mintSoft, color: colors.teal, fontSize: 10, lineHeight: 14, fontWeight: '700', textAlign: 'center' },
  account: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line },
  accountActive: { backgroundColor: colors.mintSoft, borderColor: colors.mint },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mint },
  avatarText: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  accountCopy: { flex: 1, minWidth: 0, gap: 2 },
  accountName: { color: colors.ink, fontSize: 13, fontWeight: '800' },
  accountEmail: { color: colors.muted, fontSize: 10 },
  bottomSafe: { backgroundColor: colors.paper, borderTopWidth: 1, borderTopColor: colors.line },
  bottomBar: { minHeight: 64, flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: spacing.xs, paddingTop: spacing.xs },
  bottomItem: { flex: 1, flexBasis: 0, minWidth: 0, minHeight: 60, alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: radius.sm, paddingHorizontal: 2 },
  bottomItemActive: { backgroundColor: colors.mintSoft },
  bottomLabel: { width: '100%', textAlign: 'center', color: colors.muted, fontSize: 11, lineHeight: 14, fontWeight: '600' },
  bottomLabelActive: { color: colors.ink, fontWeight: '800' },
  pressed: { opacity: 0.72 },
})
