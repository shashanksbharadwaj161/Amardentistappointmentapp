import { Activity, Building2, CircleDollarSign, Gavel, ShieldCheck, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type View = 'users' | 'cases' | 'audit'
type UserRow = { id:string; full_name:string; email:string; active_mode:string; created_at:string }
type CaseRow = { id:string; category:string; status:string; summary:string; created_at:string }
type AuditRow = { id:string; action:string; target_type:string; target_id:string|null; created_at:string }

const previewUsers:UserRow[] = [
  { id:'1', full_name:'Demo Patient', email:'patient@example.test', active_mode:'patient', created_at:new Date().toISOString() },
  { id:'2', full_name:'Dr. Ayesha Rahman', email:'dentist@example.test', active_mode:'professional', created_at:new Date().toISOString() },
]
const previewCases:CaseRow[] = [
  { id:'1', category:'refund', status:'open', summary:'Deposit review requested after a clinic cancellation.', created_at:new Date().toISOString() },
  { id:'2', category:'moderation', status:'investigating', summary:'Verified review language requires moderation.', created_at:new Date().toISOString() },
]
const previewAudits:AuditRow[] = [
  { id:'1', action:'clinic.application_approved', target_type:'clinic', target_id:null, created_at:new Date().toISOString() },
  { id:'2', action:'platform.feature_flag_updated', target_type:'feature_flag', target_id:'patient_ai', created_at:new Date().toISOString() },
]

export function PlatformWorkspace({ view, query }: { view:View; query:string }) {
  const connected = Boolean(supabase)
  const [userRows,setUsers] = useState(connected ? [] : previewUsers)
  const [caseRows,setCases] = useState(connected ? [] : previewCases)
  const [auditRows,setAudits] = useState(connected ? [] : previewAudits)
  const [clinicCount,setClinicCount] = useState(connected ? 0 : 3)
  const [usage,setUsage] = useState({ requests:0, cost:0 })
  const [loadError,setLoadError] = useState<string|null>(null)

  useEffect(() => {
    if (!supabase) return
    void Promise.all([
      supabase.from('profiles').select('id,full_name,email,active_mode,created_at').order('created_at',{ ascending:false }).limit(100),
      supabase.from('support_cases').select('id,category,status,summary,created_at').order('created_at',{ ascending:false }).limit(100),
      supabase.from('audit_logs').select('id,action,target_type,target_id,created_at').order('created_at',{ ascending:false }).limit(100),
      supabase.from('clinics').select('id',{ count:'exact',head:true }),
      supabase.from('ai_usage_daily').select('request_count,estimated_cost_usd'),
    ]).then(([usersResult,casesResult,auditsResult,clinicsResult,aiResult]) => {
      const error = usersResult.error ?? casesResult.error ?? auditsResult.error ?? clinicsResult.error ?? aiResult.error
      if (error) {
        setLoadError('Live platform data could not be loaded. No preview records are being shown.')
        return
      }
      setUsers((usersResult.data ?? []) as UserRow[])
      setCases((casesResult.data ?? []) as CaseRow[])
      setAudits((auditsResult.data ?? []) as AuditRow[])
      setClinicCount(clinicsResult.count ?? 0)
      setUsage({
        requests:(aiResult.data ?? []).reduce((sum,row) => sum + Number(row.request_count),0),
        cost:(aiResult.data ?? []).reduce((sum,row) => sum + Number(row.estimated_cost_usd),0),
      })
      setLoadError(null)
    })
  }, [])

  const term = query.trim().toLowerCase()
  const filteredUsers = useMemo(() => userRows.filter((row) => `${row.full_name} ${row.email}`.toLowerCase().includes(term)),[userRows,term])
  const filteredCases = useMemo(() => caseRows.filter((row) => `${row.category} ${row.status} ${row.summary}`.toLowerCase().includes(term)),[caseRows,term])
  const filteredAudits = useMemo(() => auditRows.filter((row) => `${row.action} ${row.target_type} ${row.target_id ?? ''}`.toLowerCase().includes(term)),[auditRows,term])
  const title = view === 'users' ? 'People and clinics' : view === 'cases' ? 'Cases and moderation' : 'Audit investigation'

  return <>
    <div className="page-heading"><div><p className="eyebrow">PLATFORM OVERSIGHT</p><h1>{title}</h1><p>Operational metadata is visible here. Clinical content requires a reasoned, separately audited access action.</p></div></div>
    {loadError ? <div className="workspace-alert" role="alert">{loadError}</div> : null}
    <div className="ops-metrics">
      <article><Users/><div><strong>{userRows.length}</strong><span>visible users</span></div></article>
      <article><Building2/><div><strong>{clinicCount}</strong><span>clinics</span></div></article>
      <article><Gavel/><div><strong>{caseRows.filter((item) => item.status !== 'resolved').length}</strong><span>open cases</span></div></article>
      <article><CircleDollarSign/><div><strong>{usage.requests}</strong><span>AI requests · ${usage.cost.toFixed(2)}</span></div></article>
    </div>
    {view === 'users' ? <section className="panel data-panel"><div className="panel-heading"><div><p className="eyebrow">IDENTITIES</p><h2>Users</h2></div><Users/></div><div className="data-table"><div className="data-head"><span>Name</span><span>Mode</span><span>Created</span></div>{filteredUsers.map((row) => <article key={row.id}><span><strong>{row.full_name || 'Profile pending'}</strong><small>{row.email}</small></span><span>{row.active_mode}</span><time>{new Date(row.created_at).toLocaleDateString()}</time></article>)}</div></section> : null}
    {view === 'cases' ? <section className="panel data-panel"><div className="panel-heading"><div><p className="eyebrow">DISPUTES · REFUNDS · MODERATION</p><h2>Case queue</h2></div><Gavel/></div><div className="case-list">{filteredCases.map((row) => <article key={row.id}><span className="case-icon"><ShieldCheck/></span><div><strong>{row.category} · {row.status}</strong><p>{row.summary}</p></div><time>{new Date(row.created_at).toLocaleDateString()}</time></article>)}</div><p className="config-note">This checkpoint provides investigation visibility. Case assignment, resolution, moderation, and refunds remain explicitly gated server actions.</p></section> : null}
    {view === 'audit' ? <section className="panel data-panel"><div className="panel-heading"><div><p className="eyebrow">IMMUTABLE ACTIVITY</p><h2>Audit trail</h2></div><Activity/></div><div className="case-list">{filteredAudits.map((row) => <article key={row.id}><span className="case-icon"><Activity/></span><div><strong>{row.action}</strong><p>{row.target_type}{row.target_id ? ` · ${row.target_id}` : ''}</p></div><time>{new Date(row.created_at).toLocaleString()}</time></article>)}</div><p className="config-note">Clinical and AI raw-output access is not exposed here. Super Admin emergency access requires a written reason and creates another audit event.</p></section> : null}
  </>
}
