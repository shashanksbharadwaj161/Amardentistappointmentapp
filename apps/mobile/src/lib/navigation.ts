import type { AppMode, AppRole, Profile } from '@amar-dentist/domain'
import type { NavigationMessageKey } from './navigation-messages'

export type NavigationIcon =
  | 'account'
  | 'assistant'
  | 'business'
  | 'calendar'
  | 'consent'
  | 'discover'
  | 'home'
  | 'inbox'
  | 'payments'
  | 'profiles'
  | 'records'
  | 'schedule'
  | 'team'
  | 'visits'
  | 'workspace'

export type AppRoute =
  | '/account'
  | '/dashboard'
  | '/patient/appointments'
  | '/patient/assistant'
  | '/patient/consent'
  | '/patient/discover'
  | '/patient/payments'
  | '/patient/profiles'
  | '/patient/records'
  | '/professional'
  | '/professional/business'
  | '/professional/calendar'
  | '/professional/inbox'
  | '/professional/manage-schedule'
  | '/professional/operations'
  | '/professional/team'

export type NavigationItem = {
  id: string
  label: NavigationMessageKey | 'appointments' | 'businessOperations' | 'calendar' | 'careAssistant' | 'clinicalConsent' | 'clinicInbox' | 'clinicOperations' | 'findDentist' | 'manageSchedule' | 'manageTeam' | 'medicalRecords' | 'professionalOnboarding' | 'profileFamily'
  href: AppRoute
  icon: NavigationIcon
  activePrefixes: readonly string[]
  exactPaths?: readonly string[]
  roles?: readonly AppRole[]
}

export type NavigationGroup = {
  id: string
  label: NavigationMessageKey
  items: readonly NavigationItem[]
}

const professionalRoles: readonly AppRole[] = ['dentist', 'front_desk', 'clinic_manager', 'clinic_owner']
const scheduleRoles: readonly AppRole[] = ['dentist', 'clinic_manager', 'clinic_owner']
const managerRoles: readonly AppRole[] = ['clinic_manager', 'clinic_owner']
const previewProfileId = '00000000-0000-4000-8000-000000000001'

const patientPrimary: readonly NavigationItem[] = [
  { id: 'home', label: 'home', href: '/dashboard', icon: 'home', activePrefixes: ['/dashboard'] },
  { id: 'find', label: 'find', href: '/patient/discover', icon: 'discover', activePrefixes: ['/patient/discover', '/patient/dentist'] },
  { id: 'visits', label: 'visits', href: '/patient/appointments', icon: 'visits', activePrefixes: ['/patient/appointments', '/patient/chat', '/patient/waitlist', '/patient/review'] },
  { id: 'records', label: 'records', href: '/patient/records', icon: 'records', activePrefixes: ['/patient/records', '/patient/consent'] },
]

const patientSecondary: readonly NavigationItem[] = [
  { id: 'profiles', label: 'profileFamily', href: '/patient/profiles', icon: 'profiles', activePrefixes: ['/patient/profiles'] },
  { id: 'assistant', label: 'careAssistant', href: '/patient/assistant', icon: 'assistant', activePrefixes: ['/patient/assistant'] },
  { id: 'payments', label: 'payments', href: '/patient/payments', icon: 'payments', activePrefixes: ['/patient/payments'] },
  { id: 'professional-onboarding', label: 'professionalOnboarding', href: '/professional', icon: 'workspace', exactPaths: ['/professional'], activePrefixes: ['/professional/clinic-application', '/professional/dentist-application'] },
]

const professionalPrimary: readonly NavigationItem[] = [
  { id: 'home', label: 'home', href: '/dashboard', icon: 'home', activePrefixes: ['/dashboard'] },
  { id: 'calendar', label: 'calendar', href: '/professional/calendar', icon: 'calendar', activePrefixes: ['/professional/calendar'] },
  { id: 'visits', label: 'visits', href: '/professional/operations', icon: 'visits', activePrefixes: ['/professional/operations', '/professional/walk-in', '/professional/check-in', '/professional/encounter', '/professional/ai-review'], roles: professionalRoles },
  { id: 'inbox', label: 'clinicInbox', href: '/professional/inbox', icon: 'inbox', activePrefixes: ['/professional/inbox', '/patient/chat'], roles: professionalRoles },
]

const professionalSecondary: readonly NavigationItem[] = [
  { id: 'professional-onboarding', label: 'professionalOnboarding', href: '/professional', icon: 'workspace', exactPaths: ['/professional'], activePrefixes: ['/professional/clinic-application', '/professional/dentist-application'] },
  { id: 'manage-schedule', label: 'manageSchedule', href: '/professional/manage-schedule', icon: 'schedule', activePrefixes: ['/professional/manage-schedule'], roles: scheduleRoles },
  { id: 'team', label: 'manageTeam', href: '/professional/team', icon: 'team', activePrefixes: ['/professional/team'], roles: managerRoles },
  { id: 'business', label: 'businessOperations', href: '/professional/business', icon: 'business', activePrefixes: ['/professional/business'], roles: managerRoles },
]

const accountItem: NavigationItem = { id: 'account', label: 'account', href: '/account', icon: 'account', activePrefixes: ['/account'] }

function visibleForRoles(item: NavigationItem, roles: readonly AppRole[]) {
  return !item.roles || item.roles.some((role) => roles.includes(role))
}

export function effectiveNavigationMode(mode: AppMode, roles: readonly AppRole[]): AppMode {
  if (mode === 'professional' && !professionalRoles.some((role) => roles.includes(role))) return 'patient'
  return mode
}

export function getNavigationGroups(mode: AppMode, roles: readonly AppRole[]): NavigationGroup[] {
  const effectiveMode = effectiveNavigationMode(mode, roles)
  const groups: NavigationGroup[] = effectiveMode === 'professional'
    ? [
        { id: 'workspace', label: 'workspace', items: professionalPrimary },
        { id: 'professional-tools', label: 'professionalTools', items: professionalSecondary },
      ]
    : [
        { id: 'care', label: 'care', items: patientPrimary },
        { id: 'support', label: 'support', items: patientSecondary },
      ]
  return groups.map((group) => ({ ...group, items: group.items.filter((item) => visibleForRoles(item, roles)) }))
}

export function getBottomNavigation(mode: AppMode, roles: readonly AppRole[]): NavigationItem[] {
  const effectiveMode = effectiveNavigationMode(mode, roles)
  const items = effectiveMode === 'professional' ? professionalPrimary : patientPrimary
  const overflowPaths = effectiveMode === 'professional'
    ? ['/professional/clinic-application', '/professional/dentist-application', '/professional/manage-schedule', '/professional/team', '/professional/business']
    : ['/patient/profiles', '/patient/assistant', '/patient/payments', '/professional/clinic-application', '/professional/dentist-application']
  const moreItem: NavigationItem = {
    ...accountItem,
    label: 'more',
    exactPaths: effectiveMode === 'professional' ? ['/account', '/professional', '/professional/team', '/professional/business'] : ['/account', '/professional'],
    activePrefixes: ['/account', ...overflowPaths],
  }
  return [...items.filter((item) => visibleForRoles(item, roles)), moreItem].slice(0, 5)
}

export function isNavigationItemActive(pathname: string, item: NavigationItem): boolean {
  if (item.exactPaths?.includes(pathname)) return true
  return item.activePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function getActiveNavigationItemId(pathname: string, items: readonly NavigationItem[]): string | null {
  const candidates = items.flatMap((item) => {
    const exact = item.exactPaths?.includes(pathname) ? pathname.length + 1 : -1
    const prefix = Math.max(-1, ...item.activePrefixes.filter((path) => pathname === path || pathname.startsWith(`${path}/`)).map((path) => path.length))
    return Math.max(exact, prefix) >= 0 ? [{ id: item.id, score: Math.max(exact, prefix) }] : []
  })
  return candidates.sort((a, b) => b.score - a.score)[0]?.id ?? null
}

const publicPaths = new Set(['/', '/sign-in', '/register', '/reset-password'])

export function shouldShowAppShell(profile: Profile | null, loading: boolean, pathname: string): boolean {
  if (loading || !profile || publicPaths.has(pathname)) return false
  return pathname !== '/auth' && !pathname.startsWith('/auth/')
}

export function getAccountNavigationItem(): NavigationItem {
  return accountItem
}

export function isPreviewProfile(profile: Pick<Profile, 'id'>): boolean {
  return profile.id === previewProfileId
}

type ModeSwitchOptions = {
  mode: AppMode
  setMode: (mode: AppMode) => Promise<string | null>
  setBusy: (mode: AppMode | null) => void
  onSuccess: () => void
  fallbackError: string
}

export async function performModeSwitch({ mode, setMode, setBusy, onSuccess, fallbackError }: ModeSwitchOptions): Promise<string | null> {
  setBusy(mode)
  try {
    const error = await setMode(mode)
    if (error !== null) return error || fallbackError
    onSuccess()
    return null
  } catch {
    return fallbackError
  } finally {
    setBusy(null)
  }
}
