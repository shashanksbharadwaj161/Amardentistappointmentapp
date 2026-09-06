import { hasPermission, signInSchema, type AppRole } from '@amar-dentist/domain'
import { Button } from '@heroui/react/button'
import { Chip } from '@heroui/react/chip'
import type { Session } from '@supabase/supabase-js'
import { Activity, FileCheck2, Gavel, LayoutDashboard, LogOut, Menu, Search, Settings2, ShieldAlert, ShieldCheck, UserPlus, Users, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import brandMascot from './assets/brand-mascot.png'
import { InviteAdminDialog } from './components/InviteAdminDialog'
import { VerificationWorkspace } from './components/VerificationWorkspace'
import { FinanceConfiguration } from './components/FinanceConfiguration'
import { AiConfiguration } from './components/AiConfiguration'
import { PlatformWorkspace } from './components/PlatformWorkspace'
import { demoAllowed, supabase } from './lib/supabase'
import './App.css'

type AdminIdentity = { fullName: string; email: string; roles: AppRole[] }

async function resolveIdentity(session: Session): Promise<AdminIdentity | null> {
  if (!supabase) return null
  const [{ data: profile }, { data: roleRows }] = await Promise.all([
    supabase.from('profiles').select('full_name,email').eq('id', session.user.id).single(),
    supabase.from('user_roles').select('role').eq('user_id', session.user.id),
  ])
  const roles = (roleRows?.map(({ role }) => role) ?? []) as AppRole[]
  if (!profile || !hasPermission(roles, 'admin:access')) return null
  return { fullName: profile.full_name, email: profile.email, roles }
}

function Brand() {
  return <div className="brand" aria-label="Amar Dentist administration"><img className="brand-mark" src={brandMascot} alt="" /><span>Amar Dentist</span><small>ADMIN</small></div>
}

function SignIn({ onDemo, onDenied }: { onDemo: () => void; onDenied: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = signInSchema.safeParse({ email, password })
    if (!parsed.success) return setMessage(parsed.error.issues[0]?.message ?? 'Check your details.')
    if (!supabase) return setMessage('Connect Supabase to sign in.')
    setBusy(true)
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data)
    if (error) setMessage(error.message)
    else if (!data.user.email_confirmed_at) {
      await supabase.auth.signOut()
      setMessage('Verify this email before signing in.')
    } else if (data.session && !(await resolveIdentity(data.session))) {
      onDenied()
    }
    setBusy(false)
  }

  return <main className="signin-page"><section className="signin-story"><Brand /><div className="signin-copy"><p className="eyebrow">CONTROL, WITHOUT CLUTTER</p><h1>Steady oversight for every care journey.</h1><p>Verify professionals, investigate activity, and keep the platform safe from one focused workspace.</p></div><div className="trust-note"><ShieldCheck size={20} /><span>Access is verified by database role policies—not hidden navigation.</span></div></section><section className="signin-panel"><form className="signin-form" onSubmit={submit}><div><p className="eyebrow">SECURE CONSOLE</p><h2>Sign in</h2><p>Invitation-only access for platform administrators.</p></div><label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" /></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" /></label>{message && <div className="alert" role="alert">{message}</div>}<Button className="primary-button" type="submit" isPending={busy}>{busy ? 'Verifying…' : 'Enter console'}</Button>{demoAllowed && !supabase && <Button className="text-button" type="button" variant="ghost" onPress={onDemo}>Preview admin console</Button>}<p className="security-copy">Need access? Ask a Super Admin for a time-limited invitation.</p></form></section></main>
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
  { id: 'configuration', label: 'Configuration', icon: Settings2 },
]

function Console({ identity, onSignOut }: { identity: AdminIdentity; onSignOut: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [activeView, setActiveView] = useState<'overview' | 'verification' | 'users' | 'cases' | 'audit' | 'configuration'>('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const [mobileNavigation, setMobileNavigation] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const inviteButtonRef = useRef<HTMLButtonElement>(null)
  const isSuperAdmin = identity.roles.includes('super_admin')

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
        <nav aria-label="Primary navigation">{nav.map(({ id, label, icon: Icon }) => { const enabled = id === 'overview' || id === 'verification' || (isSuperAdmin && Boolean(id)); const active = activeView === id; return <button key={label} className={active ? 'nav-item nav-active' : 'nav-item'} type="button" aria-current={active ? 'page' : undefined} disabled={!enabled} title={!enabled ? `${label} requires Super Admin access` : undefined} onClick={() => { if (enabled && id) { setActiveView(id as typeof activeView); closeMenu() } }}><Icon /><span>{label}</span></button> })}</nav>
        <div className="sidebar-foot"><div className="role-lock"><ShieldCheck /><div><strong>{isSuperAdmin ? 'Super Admin' : 'Admin'}</strong><span>{isSuperAdmin ? 'Full platform oversight' : 'Scoped platform oversight'}</span></div></div><button className="nav-item" type="button" onClick={onSignOut}><LogOut /><span>Sign out</span></button></div>
      </aside>
      <div className="workspace" inert={mobileNavigation && menuOpen ? true : undefined}>
        <header className="topbar">
          <button ref={menuButtonRef} className="icon-button menu-button" type="button" aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="admin-navigation" onClick={() => setMenuOpen(true)}><Menu /></button>
          <div className="search" role="search"><Search /><input aria-label="Search current workspace" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={activeView === 'verification' ? 'Search applications' : activeView === 'users' ? 'Search users' : activeView === 'cases' ? 'Search cases' : activeView === 'audit' ? 'Search audit events' : 'Search platform'} /></div>
          <div className="top-actions"><div className="profile-summary"><span>{identity.fullName.charAt(0)}</span><div><strong>{identity.fullName}</strong><small>{isSuperAdmin ? 'Super Admin' : 'Admin'}</small></div></div></div>
        </header>
        <main className="content">{activeView === 'verification' ? <VerificationWorkspace query={searchQuery} /> : activeView === 'configuration' ? <><AiConfiguration/><div className="configuration-divider"/><FinanceConfiguration/></> : activeView === 'users' || activeView === 'cases' || activeView === 'audit' ? <PlatformWorkspace view={activeView} query={searchQuery}/> : <>
          <div className="page-heading"><div><p className="eyebrow">PLATFORM OPERATIONS</p><h1>Good morning, {identity.fullName.split(' ')[0]}.</h1><p>Clinic and dentist verification are ready for careful review.</p></div>{isSuperAdmin && <Button ref={inviteButtonRef} className="primary-button compact" type="button" onPress={() => setInviteOpen(true)}><UserPlus />Invite admin</Button>}</div>
          <section className="readiness" aria-labelledby="readiness-heading"><div className="readiness-header"><div><span className="status-dot" /><h2 id="readiness-heading">Operational readiness</h2></div><strong>Clinics &amp; professionals</strong></div><div className="readiness-grid"><article><ShieldCheck /><div><strong>Role isolation</strong><span>Database-enforced</span></div><Chip className="status-chip" color="success" size="sm"><Chip.Label>Active</Chip.Label></Chip></article><article><FileCheck2 /><div><strong>Verification queue</strong><span>Private evidence review</span></div><Chip className="status-chip" color="success" size="sm"><Chip.Label>Active</Chip.Label></Chip></article><article><Activity /><div><strong>Decision history</strong><span>Reviewer and reason retained</span></div><Chip className="status-chip" color="success" size="sm"><Chip.Label>Active</Chip.Label></Chip></article></div></section>
          <div className="two-column"><section className="panel"><div className="panel-heading"><div><p className="eyebrow">ATTENTION QUEUE</p><h2>Applications ready for review</h2></div><Chip className="phase-label" size="sm"><Chip.Label>Live</Chip.Label></Chip></div><div className="empty-state"><span><FileCheck2 /></span><h3>Verification is active</h3><p>Clinic and dentist applications are private until an administrator records a decision.</p><Button className="secondary-button" onPress={() => setActiveView('verification')}>Open verification queue</Button></div></section><section className="panel"><div className="panel-heading"><div><p className="eyebrow">SECURITY LEDGER</p><h2>Foundation events</h2></div></div><ol className="timeline"><li><span /><div><strong>Administrator session verified</strong><p>{identity.email}</p></div><time>Now</time></li><li><span /><div><strong>Role policy evaluated</strong><p>{isSuperAdmin ? 'Super Admin access granted' : 'Admin access granted'}</p></div><time>Now</time></li><li className="future"><span /><div><strong>Verification decision history</strong><p>Every approval and rejection is retained.</p></div></li></ol></section></div>
        </>}
        </main>
      </div>
      {menuOpen && <button className="scrim" aria-label="Close navigation" onClick={closeMenu} />}
      <InviteAdminDialog open={inviteOpen} onOpenChange={changeInviteOpen} onInvite={invite} />
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [identity, setIdentity] = useState<AdminIdentity | null>(null)
  const [denied, setDenied] = useState(false)
  const [loading, setLoading] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(async ({ data }) => {
      const resolved = data.session ? await resolveIdentity(data.session) : null
      setSession(data.session)
      setIdentity(resolved)
      setDenied(Boolean(data.session && !resolved))
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      void (next ? resolveIdentity(next).then((resolved) => { setIdentity(resolved); setDenied(!resolved) }) : Promise.resolve(setIdentity(null)))
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const signOut = () => {
    if (session && supabase) void supabase.auth.signOut()
    setIdentity(null)
    setSession(null)
    setDenied(false)
  }
  const demoIdentity = useMemo<AdminIdentity>(() => ({ fullName: 'Administrator', email: 'preview@amardentist.local', roles: ['super_admin'] }), [])
  if (loading) return <div className="loading"><span /><p>Checking secure access…</p></div>
  if (denied) return <AccessDenied onSignOut={signOut} />
  if (!identity) return <SignIn onDemo={() => setIdentity(demoIdentity)} onDenied={() => setDenied(true)} />
  return <Console identity={identity} onSignOut={signOut} />
}
