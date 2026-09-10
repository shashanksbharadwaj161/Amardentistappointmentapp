import { hasPermission, signInSchema, type AppRole } from '@amar-dentist/domain'
import { Button } from '@heroui/react/button'
import type { Session } from '@supabase/supabase-js'
import { Activity, FileCheck2, Gavel, LayoutDashboard, LogOut, Menu, Search, Settings2, ShieldAlert, ShieldCheck, UserPlus, Users, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import brandMascot from './assets/brand-mascot.png'
import { InviteAdminDialog } from './components/InviteAdminDialog'
import { VerificationWorkspace } from './components/VerificationWorkspace'
import { FinanceConfiguration } from './components/FinanceConfiguration'
import { AiConfiguration } from './components/AiConfiguration'
import { CaseWorkspace } from './components/CaseWorkspace'
import { PlatformWorkspace } from './components/PlatformWorkspace'
import { adminPasswordCallbackIntent, demoAllowed, supabase } from './lib/supabase'
import { CompleteAdminAccess } from './components/CompleteAdminAccess'
import { OperationalOverview, OversightWorkspace } from './components/OperationalOverview'
import './App.css'

type AdminIdentity = { fullName: string; email: string; roles: AppRole[] }

async function resolveIdentity(session: Session): Promise<AdminIdentity | null> {
  if (!supabase) return null
  const verified = await supabase.auth.getUser()
  if (verified.error || verified.data.user?.id !== session.user.id || !verified.data.user.email_confirmed_at) return null
  const [{ data: profile, error: profileError }, { data: roleRows, error: roleError }] = await Promise.all([
    supabase.from('profiles').select('full_name,email').eq('id', session.user.id).single(),
    supabase.from('user_roles').select('role').eq('user_id', session.user.id),
  ])
  const roles = (roleRows?.map(({ role }) => role) ?? []) as AppRole[]
  if (profileError || roleError || !profile || !hasPermission(roles, 'admin:access')) return null
  return { fullName: profile.full_name, email: profile.email, roles }
}

function Brand() {
  return <div className="brand" aria-label="Amar Dentist administration"><img className="brand-mark" src={brandMascot} alt="" /><span>Amar Dentist</span><small>ADMIN</small></div>
}

function SignIn({ onDemo, onDenied }: { onDemo: (role: 'admin' | 'super_admin') => void; onDenied: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const pending = useRef(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending.current) return
    const parsed = signInSchema.safeParse({ email, password })
    if (!parsed.success) return setMessage(parsed.error.issues[0]?.message ?? 'Check your details.')
    if (!supabase) return setMessage('Connect Supabase to sign in.')
    pending.current = true; setBusy(true); setMessage(null)
    try {
      const { data, error } = await supabase.auth.signInWithPassword(parsed.data)
      if (error || !data.user || !data.session) throw new Error('SIGN_IN_FAILED')
      setPassword('')
      if (!data.user.email_confirmed_at) onDenied()
    } catch { setMessage('Sign-in could not be confirmed. Check your email, password, and connection, then try again.') }
    finally { pending.current = false; setBusy(false) }
  }

  return <main className="signin-page"><section className="signin-story"><Brand /><div className="signin-copy"><p className="eyebrow">CONTROL, WITHOUT CLUTTER</p><h1>Steady oversight for every care journey.</h1><p>Verify professionals, investigate activity, and keep the platform safe from one focused workspace.</p></div><div className="trust-note"><ShieldCheck size={20} /><span>Access is verified by database role policies—not hidden navigation.</span></div></section><section className="signin-panel"><form className="signin-form" onSubmit={submit}><div><p className="eyebrow">SECURE CONSOLE</p><h2>Sign in</h2><p>Invitation-only access for platform administrators.</p></div><label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" /></label>{message && <div className="alert" role="alert">{message}</div>}<Button className="primary-button" type="submit" isPending={busy}>{busy ? 'Verifying…' : 'Enter console'}</Button>{demoAllowed && !supabase && <Button className="text-button" type="button" variant="ghost" onPress={() => onDemo('super_admin')}>Preview admin console</Button>}{demoAllowed && !supabase && <Button className="text-button" type="button" variant="ghost" onPress={() => onDemo('admin')}>Preview operational Admin</Button>}<p className="security-copy">Need access? Ask a Super Admin for a time-limited invitation.</p></form></section></main>
}

function AccessDenied({ onSignOut }: { onSignOut: () => void }) {
  return <main className="denied-page"><section className="denied-card" role="alert"><span><ShieldAlert /></span><p className="eyebrow">PERMISSION REQUIRED</p><h1>This account cannot open the admin console.</h1><p>Patient and clinic roles belong in the Amar Dentist mobile app. Platform access requires a verified administrator invitation.</p><Button className="primary-button" type="button" onPress={onSignOut}>Sign out safely</Button></section></main>
}

const nav = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'verification', label: 'Verification', icon: FileCheck2 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'cases', label: 'Cases', icon: Gavel },
  { id: 'audit', label: 'Audit trail', icon: Activity },
  { id: 'invitations', label: 'Admin invitations', icon: UserPlus },
  { id: 'provider', label: 'AI provider', icon: Settings2 },
  { id: 'flags', label: 'Feature controls', icon: ShieldCheck },
  { id: 'limits', label: 'Usage limits', icon: ShieldAlert },
  { id: 'usage', label: 'AI usage and cost', icon: Activity },
  { id: 'delivery', label: 'Notification delivery', icon: Activity },
  { id: 'configuration', label: 'Configuration', icon: Settings2 },
]

function Console({ identity, onSignOut }: { identity: AdminIdentity; onSignOut: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [requestedView, setActiveView] = useState<'overview' | 'verification' | 'users' | 'cases' | 'audit' | 'configuration' | 'invitations' | 'provider' | 'flags' | 'limits' | 'usage' | 'delivery'>('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const [mobileNavigation, setMobileNavigation] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const inviteButtonRef = useRef<HTMLButtonElement>(null)
  const isSuperAdmin = identity.roles.includes('super_admin')
  const activeView = isSuperAdmin || ['overview', 'verification', 'cases'].includes(requestedView) ? requestedView : 'overview'

  useEffect(() => {
    const media = window.matchMedia('(max-width: 980px)')
    const update = () => setMobileNavigation(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => {
    if (mobileNavigation && menuOpen) sidebarRef.current?.focus()
  }, [menuOpen, mobileNavigation])

  const closeMenu = () => {
    setMenuOpen(false)
    requestAnimationFrame(() => menuButtonRef.current?.focus())
  }
  const containNavigationFocus = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!mobileNavigation || !menuOpen) return
    if (event.key === 'Escape') { event.preventDefault(); closeMenu(); return }
    if (event.key !== 'Tab') return
    const controls = [...(sidebarRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [])]
    const first = controls[0]
    const last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  const invite = async (email: string, displayName: string, expiresInDays: number) => {
    if (!isSuperAdmin) return 'Super Admin access is required.'
    if (!supabase) { await new Promise((resolve) => setTimeout(resolve, 250)); return null }
    const { error } = await supabase.functions.invoke('admin-invite', { body: { email, displayName, expiresInDays } })
    return error?.message ?? null
  }
  const changeInviteOpen = (next: boolean) => {
    setInviteOpen(next)
    if (!next) requestAnimationFrame(() => inviteButtonRef.current?.focus())
  }

  return (
    <div className="console">
      <aside ref={sidebarRef} id="admin-navigation" role={mobileNavigation ? 'dialog' : undefined} aria-label={mobileNavigation ? 'Navigation menu' : undefined} className={menuOpen ? 'sidebar sidebar-open' : 'sidebar'} aria-hidden={mobileNavigation && !menuOpen} inert={mobileNavigation && !menuOpen ? true : undefined} aria-modal={mobileNavigation && menuOpen ? true : undefined} tabIndex={mobileNavigation ? -1 : undefined} onKeyDown={containNavigationFocus}>
        <div className="sidebar-top"><Brand /><button className="icon-button close-menu" type="button" aria-label="Close navigation" onClick={closeMenu}><X /></button></div>
        <nav aria-label="Primary navigation">{nav.map(({ id, label, icon: Icon }) => { const enabled = id === 'overview' || id === 'verification' || id === 'cases' || (isSuperAdmin && Boolean(id)); const active = activeView === id; return <button key={label} className={active ? 'nav-item nav-active' : 'nav-item'} type="button" aria-current={active ? 'page' : undefined} disabled={!enabled} title={!enabled ? `${label} requires Super Admin access` : undefined} onClick={() => { if (enabled && id) { setActiveView(id as typeof activeView); closeMenu() } }}><Icon /><span>{label}</span></button> })}</nav>
        <div className="sidebar-foot"><div className="role-lock"><ShieldCheck /><div><strong>{isSuperAdmin ? 'Super Admin' : 'Admin'}</strong><span>{isSuperAdmin ? 'Full platform oversight' : 'Scoped platform oversight'}</span></div></div><button className="nav-item" type="button" onClick={onSignOut}><LogOut /><span>Sign out</span></button></div>
      </aside>
      <div className="workspace" inert={mobileNavigation && menuOpen ? true : undefined}>
        <header className="topbar">
          <button ref={menuButtonRef} className="icon-button menu-button" type="button" aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen(true)}><Menu /></button>
          <div className="search" role="search"><Search /><input aria-label="Search current workspace" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={activeView === 'verification' ? 'Search applications' : activeView === 'users' ? 'Search users' : activeView === 'cases' ? 'Search cases' : activeView === 'audit' ? 'Search audit events' : 'Search platform'} /></div>
          <div className="top-actions"><div className="profile-summary"><span>{identity.fullName.charAt(0)}</span><div><strong>{identity.fullName}</strong><small>{isSuperAdmin ? 'Super Admin' : 'Admin'}</small></div></div></div>
        </header>
        {!supabase && <p role="status" className="config-note">Preview console — fictional sample data. Actions here do not change real accounts, send messages, or move money.</p>}
        <main className="content">{activeView === 'verification' ? <VerificationWorkspace query={searchQuery} /> : activeView === 'configuration' ? <FinanceConfiguration/> : activeView === 'provider' || activeView === 'flags' || activeView === 'limits' ? <AiConfiguration key={activeView} section={activeView}/> : activeView === 'invitations' || activeView === 'delivery' || activeView === 'usage' ? <OversightWorkspace key={activeView} view={activeView} query={searchQuery} onInvite={() => setInviteOpen(true)}/> : activeView === 'cases' ? <CaseWorkspace query={searchQuery}/> : activeView === 'users' || activeView === 'audit' ? <PlatformWorkspace view={activeView} query={searchQuery}/> : <>
          <div className="page-heading"><div><p className="eyebrow">PLATFORM OPERATIONS</p><h1>Good morning, {identity.fullName.split(' ')[0]}.</h1><p>Manage dentist verification, patient support, and platform safety.</p></div>{isSuperAdmin && <Button ref={inviteButtonRef} className="primary-button compact" type="button" onPress={() => setInviteOpen(true)}><UserPlus />Invite admin</Button>}</div>
          <OperationalOverview superAdmin={isSuperAdmin} navigate={view => setActiveView(view as typeof activeView)} />
        </>}
        </main>
      </div>
      {menuOpen && <button className="scrim" aria-label="Close navigation" onClick={closeMenu} />}
      {isSuperAdmin && <InviteAdminDialog open={inviteOpen} onOpenChange={changeInviteOpen} onInvite={invite} preview={!supabase} />}
    </div>
  )
}

export default function App() {
  const [identity, setIdentity] = useState<AdminIdentity | null>(null)
  const [denied, setDenied] = useState(false)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [authError, setAuthError] = useState('')
  const [passwordSetup, setPasswordSetup] = useState(false)
  const setupIntent = useRef<'invite' | 'recovery' | null>(adminPasswordCallbackIntent)
  const authGeneration = useRef(0)

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let cancelled = false
    const settle = async (next: Session | null, generation: number) => {
      try {
        const resolved = next ? await resolveIdentity(next) : null
        if (cancelled || generation !== authGeneration.current) return
        setIdentity(resolved); setDenied(Boolean(next && !resolved)); setAuthError('')
        setPasswordSetup(Boolean(next && resolved && setupIntent.current))
      } catch {
        if (cancelled || generation !== authGeneration.current) return
        setIdentity(null); setDenied(false); setPasswordSetup(false)
        setAuthError('Secure access could not be verified. Check your connection, then sign in again.')
      } finally { if (!cancelled && generation === authGeneration.current) setLoading(false) }
    }
    const initialGeneration = ++authGeneration.current
    void client.auth.getSession().then(({ data, error }) => {
      if (cancelled || initialGeneration !== authGeneration.current) return
      if (error) throw new Error('SESSION_FAILED')
      return settle(data.session, initialGeneration)
    }).catch(() => {
      if (cancelled || initialGeneration !== authGeneration.current) return
      setIdentity(null); setLoading(false); setAuthError('Secure access could not be verified. Check your connection, then sign in again.')
    })
    const { data } = client.auth.onAuthStateChange((event, next) => {
      const generation = ++authGeneration.current
      if (event === 'PASSWORD_RECOVERY') setupIntent.current = 'recovery'
      if (event === 'SIGNED_OUT') setupIntent.current = null
      // Drop privileged UI immediately while rechecking; stale promises cannot restore it.
      if (!(event === 'USER_UPDATED' && setupIntent.current && next)) {
        setIdentity(null); setDenied(false); setPasswordSetup(false); setLoading(Boolean(next))
      }
      queueMicrotask(() => { if (!cancelled && generation === authGeneration.current) void settle(next, generation) })
    })
    return () => { cancelled = true; data.subscription.unsubscribe() }
  }, [])

  const signOut = async () => {
    ++authGeneration.current; setupIntent.current = null
    setIdentity(null); setDenied(false); setPasswordSetup(false); setAuthError(''); setLoading(false)
    try {
      if (supabase) { const result = await supabase.auth.signOut(); if (result.error) throw new Error('SIGN_OUT_FAILED') }
    } catch { setAuthError('Sign-out could not be confirmed. Close this tab on shared devices and retry when connected.') }
  }
  if (loading) return <div className="loading"><span /><p>Checking secure access…</p></div>
  if (denied) return <AccessDenied onSignOut={() => void signOut()} />
  if (!identity) return <>{authError && <div className="alert" role="alert">{authError}</div>}<SignIn onDemo={role => {
    if (!supabase && demoAllowed) setIdentity({ fullName: 'Administrator', email: 'preview@amardentist.local', roles: [role] })
  }} onDenied={() => setDenied(true)} /></>
  if (passwordSetup && supabase) return <CompleteAdminAccess onComplete={() => {
    setupIntent.current = null; setPasswordSetup(false)
    if (window.location.pathname === '/auth/callback') window.history.replaceState(null, '', '/')
  }} />
  return <Console identity={identity} onSignOut={() => void signOut()} />
}
