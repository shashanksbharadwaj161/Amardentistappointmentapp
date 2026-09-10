// Extend the existing care ledger: operational facts and direct tasks, never simulated health claims.
import { Button } from '@heroui/react/button'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type OversightView = 'invitations' | 'delivery' | 'usage'
type Entry = { id: string; title: string; detail: string; status: string; date: string }
export function invitationDisplayStatus(status: string, expiresAt: string, now = Date.now()) {
  return status === 'pending' && Date.parse(expiresAt) <= now ? 'expired' : status
}
export async function loadOversight(view: OversightView): Promise<Entry[]> {
  if (!supabase) return view === 'invitations'
    ? [{ id: 'sample', title: 'Demo Administrator', detail: 'admin@example.test · email delivery not confirmed', status: 'pending', date: '2026-09-17T00:00:00Z' }]
    : view === 'delivery'
      ? [{ id: 'sample', title: 'email · appointment_confirmation', detail: '0 delivery attempts', status: 'queued', date: '2026-09-10T00:00:00Z' }]
      : []
  if (view === 'invitations') {
    const result = await supabase.from('admin_invitations').select('id,email,display_name,status,expires_at,delivery_confirmed_at').order('created_at', { ascending: false }).limit(100)
    if (result.error) throw new Error('LOAD_FAILED')
    return (result.data ?? []).map(row => ({ id: row.id, title: row.display_name, detail: `${row.email} · ${row.delivery_confirmed_at ? 'invitation email sent' : 'email delivery not confirmed'}`, status: invitationDisplayStatus(row.status, row.expires_at), date: row.expires_at }))
  }
  if (view === 'delivery') {
    const result = await supabase.from('notification_deliveries').select('id,channel,template_key,status,attempt_count,created_at').order('created_at', { ascending: false }).limit(100)
    if (result.error) throw new Error('LOAD_FAILED')
    return (result.data ?? []).map(row => ({ id: row.id, title: `${row.channel} · ${row.template_key}`, detail: `${row.attempt_count} delivery attempts`, status: row.status, date: row.created_at }))
  }
  const today = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)
  const result = await supabase.from('ai_usage_daily').select('usage_date,task_type,request_count,estimated_cost_usd').gte('usage_date', from).lte('usage_date', today).order('usage_date', { ascending: false }).limit(500)
  if (result.error) throw new Error('LOAD_FAILED')
  return (result.data ?? []).map((row, index) => ({ id: `${row.usage_date}-${index}`, title: row.task_type.replaceAll('_', ' '), detail: `${row.request_count} requests · estimated $${Number(row.estimated_cost_usd).toFixed(4)}`, status: 'recorded', date: row.usage_date }))
}

export function OversightWorkspace({ view, query, onInvite }: { view: OversightView; query: string; onInvite: () => void }) {
  const [rows, setRows] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => { if (active) { setLoading(true); setError(false); setRows([]) }; return loadOversight(view) })
      .then(result => { if (active) setRows(result) }).catch(() => { if (active) setError(true) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [view, revision])
  const heading = { invitations: 'Administrator invitations', delivery: 'Notification delivery', usage: 'AI usage and cost' }[view]
  const filtered = rows.filter(row => `${row.title} ${row.detail} ${row.status}`.toLowerCase().includes(query.trim().toLowerCase()))
  return <>
    <div className="page-heading"><div><h1>{heading}</h1><p>{view === 'invitations' ? 'Track the latest 100 invitations. Expired invitations do not grant access.' : view === 'delivery' ? 'Latest 100 delivery records. Message content and recipient details stay private.' : 'Latest 500 usage records from the past 30 days. Estimated provider costs, not a billing statement.'}</p></div><Button className="secondary-button" isDisabled={loading} onPress={() => setRevision(value => value + 1)}>Refresh</Button></div>
    {view === 'invitations' && <Button className="primary-button" onPress={onInvite}>Invite admin</Button>}
    {loading ? <p role="status">Loading records…</p> : error ? <p role="alert">Records could not be loaded. Refresh to retry; no sample data replaces live results.</p> : !filtered.length ? <p>{query ? 'No records match your search.' : 'No records available.'}</p> :
      <section className="panel data-panel" aria-label={heading}><div className="case-list">{filtered.map(row => <article key={row.id}><div><strong>{row.title}</strong><p>{row.detail}</p><p>{row.status}</p></div><time>{view === 'invitations' ? 'Expires ' : ''}{new Date(row.date).toLocaleDateString()}</time></article>)}</div></section>}
  </>
}

export function OperationalOverview({ superAdmin, navigate }: { superAdmin: boolean; navigate: (view: string) => void }) {
  const [counts, setCounts] = useState<Array<{ label: string; value: number; view: string }>>([])
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    let active = true
    const load = async () => {
      setLoading(true); setError(false)
      if (!supabase) return [{ label: 'Dentists awaiting review', value: 2, view: 'verification' }, { label: 'Open support cases', value: 1, view: 'cases' }]
      const tasks = [
        { label: 'Dentists awaiting review', view: 'verification', request: supabase.from('dentist_profiles').select('user_id', { count: 'exact', head: true }).in('status', ['submitted', 'under_review']) },
        { label: 'Open support cases', view: 'cases', request: supabase.from('support_cases').select('id', { count: 'exact', head: true }).in('status', ['open', 'investigating']) },
      ]
      if (superAdmin) tasks.push({ label: 'Pending Admin invitations', view: 'invitations', request: supabase.from('admin_invitations').select('id', { count: 'exact', head: true }).eq('status', 'pending').gt('expires_at', new Date().toISOString()) })
      return Promise.all(tasks.map(async task => { const result = await task.request; if (result.error || result.count == null) throw new Error('LOAD_FAILED'); return { label: task.label, view: task.view, value: result.count } }))
    }
    void Promise.resolve().then(() => active ? load() : []).then(result => { if (active) setCounts(result) }).catch(() => { if (active) setError(true) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [superAdmin, revision])
  return <section className="panel data-panel action-centre" aria-label="Action centre"><div className="panel-heading"><h2>Action centre</h2><Button className="secondary-button" isDisabled={loading} onPress={() => setRevision(value => value + 1)}>Refresh overview</Button></div>
    {loading ? <p role="status">Loading current work…</p> : error ? <p role="alert">Current counts are unavailable. Refresh to retry.</p> : <div className="case-list">{counts.map(item => <article key={item.view}><div><strong>{item.label}</strong><p>{item.value} {supabase ? 'currently waiting' : 'in sample data'}</p></div><Button className="secondary-button" onPress={() => navigate(item.view)}>{item.view === 'verification' ? 'Review dentists' : item.view === 'cases' ? 'View cases' : 'View invitations'}</Button></article>)}</div>}
    <p className="config-note">Database-enforced permissions. Operational Admins handle verification and support; Super Admins additionally manage access, safety settings, and platform oversight.</p>
  </section>
}
