import type { AppMode, AppRole, Profile } from '@amar-dentist/domain'
import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import * as Linking from 'expo-linking'
import { Platform } from 'react-native'
import { parseAuthLink } from '../lib/auth-links'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { subscribeToAccessRefresh } from '../lib/access-refresh'

type AuthContextValue = {
  session: Session | null
  profile: Profile | null
  loading: boolean
  configured: boolean
  previewAvailable: boolean
  recoveringPassword: boolean
  passwordSetupMode: 'invite' | 'recovery' | null
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (fullName: string, email: string, password: string) => Promise<string | null>
  resetPassword: (email: string) => Promise<string | null>
  updatePassword: (password: string) => Promise<string | null>
  signOut: () => Promise<void>
  setMode: (mode: AppMode) => Promise<string | null>
  enterDemo: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)
const demoEnabled = __DEV__ || process.env.EXPO_PUBLIC_DEMO_MODE === 'true'

function authRedirect(path: 'auth/callback' | 'reset-password') {
  if (Platform.OS === 'web' && globalThis.location?.origin) return new URL(path, `${globalThis.location.origin}/`).toString()
  return Linking.createURL(path, { scheme: 'amardentist' })
}

async function loadProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null
  const [{ data: profile, error: profileError }, { data: roles, error: rolesError }] = await Promise.all([
    supabase.from('profiles').select('id,email,full_name,locale,active_mode').eq('id', userId).single(),
    supabase.from('user_roles').select('role').eq('user_id', userId),
  ])
  if (profileError || rolesError || !profile || !roles) throw new Error('PROFILE_UNAVAILABLE')
  const assignedRoles = roles.map(({ role }) => role) as AppRole[]
  let approvedDentist = false
  if (assignedRoles.includes('dentist')) {
    try {
      const { data: dentist, error } = await supabase.from('dentist_profiles').select('status').eq('user_id', userId).maybeSingle()
      approvedDentist = !error && dentist?.status === 'approved'
    } catch { /* Unverified clinical access stays closed; application access remains available. */ }
  }
  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    locale: profile.locale,
    activeMode: profile.active_mode,
    // Assignment survives suspension in the database; clinical UI access must not.
    roles: assignedRoles.filter(role => role !== 'dentist' || approvedDentist),
  }
}

export function AuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient()
  const generation = useRef(0)
  const actor = useRef<string | null>(null)
  const currentSession = useRef<Session | null>(null)
  const verifiedRoles = useRef<AppRole[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [recoveringPassword, setRecoveringPassword] = useState(false)
  const [passwordSetupMode, setPasswordSetupMode] = useState<'invite' | 'recovery' | null>(null)

  useEffect(() => {
    const client = supabase
    if (!client) {
      setLoading(false)
      return
    }
    let cancelled = false
    let refreshing = false
    const settle = async (next: Session | null, ticket: number) => {
      try {
        const nextProfile = next ? await loadProfile(next.user.id) : null
        if (cancelled || ticket !== generation.current) return
        if (verifiedRoles.current.some(role => !nextProfile?.roles.includes(role))) queryClient.clear()
        verifiedRoles.current = nextProfile?.roles ?? []
        setProfile(nextProfile)
      } catch {
        if (cancelled || ticket !== generation.current) return
        verifiedRoles.current = []; setProfile(null); queryClient.clear()
      } finally { if (!cancelled && ticket === generation.current) setLoading(false) }
    }
    const receive = (next: Session | null) => {
      const ticket = ++generation.current
      currentSession.current = next
      const nextActor = next?.user.id ?? null
      if (actor.current !== nextActor || !next) {
        if (!next || actor.current !== null) { setRecoveringPassword(false); setPasswordSetupMode(null) }
        actor.current = nextActor
        verifiedRoles.current = []; setProfile(null); queryClient.clear(); setLoading(Boolean(next))
      }
      setSession(next)
      queueMicrotask(() => { if (!cancelled && ticket === generation.current) void settle(next, ticket) })
    }
    const initialTicket = generation.current
    void client.auth.getSession().then(({ data, error }) => {
      if (cancelled || initialTicket !== generation.current) return
      receive(error ? null : data.session)
    }).catch(() => { if (!cancelled && initialTicket === generation.current) receive(null) })
    const handleRecoveryUrl = async (url: string | null) => {
      if (!url) return
      const parsed = parseAuthLink(url)
      if (!parsed) return
      const { accessToken, refreshToken, authorizationCode } = parsed
      if (parsed.type === 'recovery' || parsed.type === 'invite') {
        setRecoveringPassword(true)
        setPasswordSetupMode(parsed.type)
      }
      if (accessToken && refreshToken) await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      else if (authorizationCode) await client.auth.exchangeCodeForSession(authorizationCode)
    }
    void Linking.getInitialURL().then(handleRecoveryUrl)
    const linkSubscription = Linking.addEventListener('url', ({ url }) => { void handleRecoveryUrl(url) })
    const { data } = client.auth.onAuthStateChange((event, nextSession) => {
      receive(nextSession)
      if (event === 'PASSWORD_RECOVERY') {
        setRecoveringPassword(true)
        setPasswordSetupMode('recovery')
      }
    })
    const stopRefresh = subscribeToAccessRefresh(() => {
      if (cancelled || refreshing || !currentSession.current) return
      refreshing = true
      const ticket = ++generation.current
      void settle(currentSession.current, ticket).finally(() => { refreshing = false })
    })
    return () => {
      cancelled = true; ++generation.current; stopRefresh()
      data.subscription.unsubscribe()
      linkSubscription.remove()
    }
  }, [queryClient])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return 'Connect Supabase to sign in.'
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return error.message
    if (!data.user.email_confirmed_at) {
      await supabase.auth.signOut()
      return 'Verify your email before signing in.'
    }
    return null
  }, [])

  const signUp = useCallback(async (fullName: string, email: string, password: string) => {
    if (!supabase) return 'Connect Supabase to create an account.'
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: authRedirect('auth/callback') } })
    return error?.message ?? null
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) return 'Connect Supabase to reset a password.'
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: authRedirect('reset-password') })
    return error?.message ?? null
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) return 'Connect Supabase to update a password.'
    const { error } = await supabase.auth.updateUser({ password })
    if (!error) {
      setRecoveringPassword(false)
      setPasswordSetupMode(null)
    }
    return error?.message ?? null
  }, [])

  const signOut = useCallback(async () => {
    ++generation.current; actor.current = null; currentSession.current = null; queryClient.clear()
    verifiedRoles.current = []; setSession(null); setProfile(null); setLoading(false)
    setRecoveringPassword(false); setPasswordSetupMode(null)
    if (supabase) {
      const { error } = await supabase.auth.signOut()
      if (error) throw new Error('Sign-out could not be confirmed. Please retry when connected.')
    }
  }, [queryClient])

  const setMode = useCallback(async (mode: AppMode) => {
    if (!profile) return 'A connected account is required.'
    if (demoEnabled && profile.id === '00000000-0000-4000-8000-000000000001') {
      setProfile({ ...profile, activeMode: mode })
      return null
    }
    if (!supabase) return 'A connected account is required.'
    const ticket = ++generation.current
    const { error } = await supabase.rpc('set_active_mode', { requested_mode: mode })
    if (error) return error.message
    if (ticket === generation.current && actor.current === profile.id) setProfile({ ...profile, activeMode: mode })
    return null
  }, [profile])

  const enterDemo = useCallback(() => {
    if (!demoEnabled) return
    setProfile({
      id: '00000000-0000-4000-8000-000000000001',
      email: 'preview@amardentist.local',
      fullName: 'Preview account',
      locale: 'en',
      activeMode: 'patient',
      roles: ['patient', 'dentist'],
    })
  }, [])

  const value = useMemo(() => ({ session, profile, loading, configured: isSupabaseConfigured, previewAvailable: process.env.EXPO_PUBLIC_DEMO_MODE === 'true', recoveringPassword, passwordSetupMode, signIn, signUp, resetPassword, updatePassword, signOut, setMode, enterDemo }), [session, profile, loading, recoveringPassword, passwordSetupMode, signIn, signUp, resetPassword, updatePassword, signOut, setMode, enterDemo])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used within AuthProvider')
  return value
}
