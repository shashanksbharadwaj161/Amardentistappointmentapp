import { verificationReviewSchema, type VerificationDecision, type VerificationQueueItem } from '@amar-dentist/domain'
import { Button } from '@heroui/react/button'
import { Chip } from '@heroui/react/chip'
import { Building2, CheckCircle2, FileBadge2, FileText, LoaderCircle, ShieldCheck, Stethoscope, XCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { loadVerificationDetails, loadVerificationQueue, reviewVerification, type VerificationDetails } from '../lib/phase2'
import { supabase } from '../lib/supabase'

function QueueIcon({ type }: { type: VerificationQueueItem['targetType'] }) {
  return type === 'clinic' ? <Building2 /> : <Stethoscope />
}

function QueueStatus({ status }: { status: VerificationQueueItem['status'] }) {
  return <Chip className={`queue-status queue-status-${status}`} size="sm"><Chip.Label>{status.replace('_', ' ')}</Chip.Label></Chip>
}

export function VerificationWorkspace({ query }: { query: string }) {
  const [items, setItems] = useState<VerificationQueueItem[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<VerificationDecision | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [detailState, setDetailState] = useState<{ item: VerificationQueueItem; data?: VerificationDetails; failed?: boolean } | null>(null)
  const [detailRetry, setDetailRetry] = useState(0)
  const submitting = useRef(false)

  const refresh = async () => {
    setLoading(true)
    try {
      const next = await loadVerificationQueue()
      setItems(next)
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : (next[0]?.id ?? null))
      setMessage(null)
    } catch { setMessage('The verification queue could not be loaded. Try again.') }
    finally { setLoading(false) }
  }
  useEffect(() => {
    let active = true
    void loadVerificationQueue().then((next) => {
      if (!active) return
      setItems(next)
      setSelectedId(next[0]?.id ?? null)
    }).catch(() => { if (active) setMessage('The verification queue could not be loaded. Try again.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const filtered = useMemo(() => items.filter((item) => `${item.title} ${item.subtitle} ${item.targetType}`.toLowerCase().includes(query.toLowerCase())), [items, query])
  const selected = items.find((item) => item.id === selectedId) ?? null
  const currentDetails = detailState?.item === selected ? detailState : null
  const details = currentDetails?.data ?? { evidence: [], history: [] }
  const detailsReady = Boolean(currentDetails?.data)
  const detailsLoading = Boolean(selected && !currentDetails)
  const detailsFailed = Boolean(currentDetails?.failed)
  useEffect(() => {
    if (!selected) return
    let active = true
    void loadVerificationDetails(selected)
      .then((data) => { if (active) setDetailState({ item: selected, data }) })
      .catch(() => { if (active) setDetailState({ item: selected, failed: true }) })
    return () => { active = false }
  }, [selected, detailRetry])

  const decide = async (decision: VerificationDecision) => {
    if (!selected || !detailsReady || submitting.current) return
    const parsed = verificationReviewSchema.safeParse({ targetType: selected.targetType, targetId: selected.id, decision, reason })
    if (!parsed.success) return setMessage(parsed.error.issues[0]?.message ?? 'Add a review reason.')
    submitting.current = true
    setBusy(decision)
    setMessage(null)
    try {
      await reviewVerification(selected, decision, parsed.data.reason)
      setItems((current) => current.filter((item) => item.id !== selected.id))
      setSelectedId(items.find((item) => item.id !== selected.id)?.id ?? null)
      setReason('')
      setMessage(!supabase ? 'Preview only: sample decision updated. No real access or audit records changed.' : decision === 'approved' ? 'Application approved and access updated.' : 'Decision saved with its review reason.')
    } catch { setMessage('The decision was not saved. Check your access and try again.') }
    finally { submitting.current = false; setBusy(null) }
  }

  return <>
    <div className="page-heading verification-heading"><div><p className="eyebrow">TRUST &amp; SAFETY</p><h1>Verification queue</h1><p>Review clinic and BMDC evidence before anything becomes discoverable to patients.</p></div><div className="queue-total"><strong>{filtered.length}</strong><span>awaiting decision</span></div></div>
    {message && <div className="workspace-alert" role="status">{message}</div>}
    {loading ? <div className="queue-loading"><LoaderCircle /><span>Loading private applications…</span></div> : filtered.length === 0 ? <section className="panel queue-empty"><span><ShieldCheck /></span><h2>Queue cleared</h2><p>No submitted clinic or dentist applications match this view.</p><Button className="secondary-button" onPress={() => void refresh()}>Refresh queue</Button></section> : <div className="verification-layout">
      <section className="queue-list" aria-label="Applications awaiting verification">{filtered.map((item) => <button key={item.id} type="button" disabled={Boolean(busy)} className={`queue-card ${selected?.id === item.id ? 'queue-card-active' : ''}`} onClick={() => { if (selectedId !== item.id) setDetailState(null); setSelectedId(item.id); setReason(''); setMessage(null) }}><span className="queue-icon"><QueueIcon type={item.targetType} /></span><span className="queue-copy"><strong>{item.title}</strong><small>{item.subtitle}</small><span className="queue-meta"><FileText />{item.documentCount} private document{item.documentCount === 1 ? '' : 's'}</span></span><QueueStatus status={item.status} /></button>)}</section>
      {selected && <section className="review-panel" aria-label={`Review ${selected.title}`}><div className="review-hero"><span><QueueIcon type={selected.targetType} /></span><div><p className="eyebrow">{selected.targetType.toUpperCase()} APPLICATION</p><h2>{selected.title}</h2><p>{selected.subtitle}</p></div><QueueStatus status={selected.status} /></div><div className="evidence-card"><div><FileBadge2 /><span><strong>Evidence bundle</strong><small>{selected.documentCount} encrypted private file{selected.documentCount === 1 ? '' : 's'}</small></span></div>{detailsLoading && <LoaderCircle className="inline-loader" />}</div>{detailsLoading && <p role="status">Loading this applicant’s private evidence…</p>}{detailsFailed && <div className="workspace-alert" role="alert"><p>Private evidence could not be loaded. Decisions are unavailable until this applicant’s evidence is ready.</p><Button className="secondary-button" onPress={() => { setDetailState(null); setDetailRetry(value => value + 1) }}>Retry private evidence</Button></div>}{details.evidence.length > 0 && <ul className="evidence-list">{details.evidence.map((document) => <li key={document.id}><FileText /><span><strong>{document.name}</strong><small>{document.kind}</small></span>{document.signedUrl ? <a href={document.signedUrl} target="_blank" rel="noreferrer">Open private file</a> : <em>{!supabase ? 'Preview fixture' : 'Private file unavailable'}</em>}</li>)}</ul>}{details.history.length > 0 && <div className="decision-history"><h3>Previous decisions</h3>{details.history.map((entry) => <article key={entry.id}><span className={`history-dot history-${entry.decision}`} /><div><strong>{entry.decision.replace('_', ' ')}</strong><p>{entry.reason}</p><small>{entry.reviewer} · {new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium' }).format(new Date(entry.decidedAt))}</small></div></article>)}</div>}<div key={selected.id} className="review-checklist"><h3>Review checks</h3><label><input type="checkbox" /> Identity matches submitted profile</label><label><input type="checkbox" /> Registration or license is current</label><label><input type="checkbox" /> Clinic and location details are consistent</label></div><label className="review-reason">Review note<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required when requesting changes, rejecting, or suspending…" maxLength={2000} /></label><div className="review-actions"><Button className="secondary-button reject-button" isDisabled={!detailsReady || Boolean(busy)} isPending={busy === 'rejected'} onPress={() => void decide('rejected')}><XCircle />Reject</Button><Button className="secondary-button" isDisabled={!detailsReady || Boolean(busy)} isPending={busy === 'changes_requested'} onPress={() => void decide('changes_requested')}><FileText />Request changes</Button><Button className="primary-button" isDisabled={!detailsReady || Boolean(busy)} isPending={busy === 'approved'} onPress={() => void decide('approved')}><CheckCircle2 />Approve</Button></div><p className="decision-note"><ShieldCheck /> Every decision, reviewer, reason, and timestamp is retained in the audit ledger.</p></section>}
    </div>}
  </>
}
