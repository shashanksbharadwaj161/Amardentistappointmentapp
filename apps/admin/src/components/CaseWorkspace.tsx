import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type CaseStatus = 'open' | 'investigating' | 'resolved' | 'dismissed'
type Case = { id:string; category:string; summary:string; status:CaseStatus; resolution:string|null; assigned_to:string|null; reference_type:string|null; reference_id:string|null; updated_at:string }
const preview:Case[] = [{id:'demo-case',category:'moderation',summary:'A patient has reported inappropriate language in a review.',status:'open',resolution:null,assigned_to:null,reference_type:'review',reference_id:'demo-review',updated_at:'2026-09-06T00:00:00Z'}]

export function CaseWorkspace({query}:{query:string}) {
  const [rows,setRows]=useState<Case[]>(supabase?[]:preview)
  const [selected,setSelected]=useState<Case|null>(null)
  const [status,setStatus]=useState<CaseStatus>('investigating')
  const [note,setNote]=useState('')
  const [assign,setAssign]=useState(true)
  const [busy,setBusy]=useState(false)
  const [loading,setLoading]=useState(Boolean(supabase))
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [paymentId,setPaymentId]=useState('')
  const [amount,setAmount]=useState('')
  const [refundKey,setRefundKey]=useState(()=>crypto.randomUUID())
  async function load(){
    if(!supabase)return
    setLoading(true);setError('')
    try{const result=await supabase.from('support_cases').select('id,category,summary,status,resolution,assigned_to,reference_type,reference_id,updated_at').order('updated_at',{ascending:false}).limit(100);if(result.error)throw result.error;setRows(result.data as Case[])}
    catch{setError('Cases could not be loaded. Try again.')}finally{setLoading(false)}
  }
  useEffect(()=>{void load()},[])
  function select(item:Case){setSelected(item);setStatus(item.status);setNote('');setError('');setNotice('');setPaymentId('');setAmount('');setRefundKey(crypto.randomUUID())}
  async function save(event:FormEvent){
    event.preventDefault();if(!selected||busy)return
    if(note.trim().length<5){setError('Explain the decision in at least five characters.');return}
    setBusy(true);setError('');setNotice('')
    try{
      if(supabase){const result=await supabase.rpc('update_support_case',{target_case_id:selected.id,next_status:status,resolution_note:note,assign_to_self:assign,expected_updated_at:selected.updated_at});if(result.error)throw result.error;await load()}
      else setRows(current=>current.map(row=>row.id===selected.id?{...row,status,resolution:note,assigned_to:assign?'demo-admin':row.assigned_to,updated_at:new Date().toISOString()}:row))
      setSelected(null);setNotice(supabase ? 'Case updated. The decision is recorded in the audit trail.' : 'Preview only: sample case updated for this visit. Nothing was saved or audited.')
    }catch{setError('The case could not be saved. It may have changed; refresh and try again.')}finally{setBusy(false)}
  }
  async function moderate(visible:boolean){
    if(!selected||busy)return
    if(note.trim().length<5){setError('Enter a reason before changing review visibility.');return}
    setBusy(true);setError('')
    try{if(supabase){const {error}=await supabase.rpc('moderate_case_review',{target_case_id:selected.id,make_visible:visible,action_reason:note});if(error)throw error}setNotice(!supabase ? 'Preview only: no review visibility or audit records were changed.' : visible?'Review restored. Decision recorded.':'Review hidden from discovery. Decision recorded.')}
    catch{setError('Review visibility could not be changed. Try again.')}finally{setBusy(false)}
  }
  async function refund(){
    if(busy)return
    if(note.trim().length<5||!paymentId.trim()||!Number.isFinite(Number(amount))||Number(amount)<=0){setError('Enter the payment ID, positive refund amount, and reason.');return}
    setBusy(true);setError('')
    try{
      if(!supabase){setNotice('Preview only: no money was moved.');return}
      const {data,error}=await supabase.functions.invoke('payment-refund',{body:{paymentId:paymentId.trim(),amountBdt:Number(amount),reason:note,idempotencyKey:refundKey}})
      if(error||!data?.ok)throw new Error(data?.error?.code??'REFUND_FAILED')
      setNotice('Provider confirmed the refund. The financial ledger is updated.');setRefundKey(crypto.randomUUID());setAmount('')
    }catch{setError('Refund is unconfirmed. Check provider configuration and payment status. Retry with the same details to avoid a duplicate.')}finally{setBusy(false)}
  }
  const filtered=rows.filter(row=>[row.category,row.status,row.summary].join(' ').toLowerCase().includes(query.trim().toLowerCase()))
  return <>
    <div className="page-heading"><div><p className="eyebrow">PATIENT SUPPORT</p><h1>Cases and moderation</h1><p>Assign a case, record its outcome, and act on reported reviews.</p></div><button className="secondary-button" onClick={()=>void load()} disabled={loading}>Refresh cases</button></div>
    {error?<div role="alert" className="alert">{error}</div>:null}{notice?<div role="status" className="workspace-alert">{notice}</div>:null}
    <div className="case-workspace"><section className="panel" aria-label="Case queue">
      <h2>Case queue</h2>{loading?<p role="status">Loading cases…</p>:filtered.length===0?<p>{query?'No cases match this search.':'No support cases have been opened.'}</p>:<div className="case-list">{filtered.map(row=><button className="case-choice" aria-pressed={selected?.id===row.id} key={row.id} onClick={()=>select(row)}><strong>{row.category} · {row.status}</strong><span>{row.summary}</span><small>{row.assigned_to?'Assigned':'Unassigned'} · {new Date(row.updated_at).toLocaleDateString()}</small></button>)}</div>}
    </section><section className="panel" aria-label="Case details">{!selected?<><h2>Choose a case</h2><p>Open a case from the queue to review its history and next action.</p></>:<>
      <h2>{selected.category} case</h2><p>{selected.summary}</p>{selected.resolution?<p><strong>Previous decision:</strong> {selected.resolution}</p>:null}
      {selected.reference_id?<p className="config-note">{selected.reference_type}: {selected.reference_id}</p>:null}
      <form className="config-form" onSubmit={save}>
        <label>Status<select value={status} onChange={event=>setStatus(event.target.value as CaseStatus)}><option value="open">Open</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></label>
        <label>Decision and reason<textarea rows={4} required minLength={5} maxLength={2000} value={note} onChange={event=>{setNote(event.target.value);setError('')}}/></label>
        <label className="inline-check"><input type="checkbox" checked={assign} onChange={event=>setAssign(event.target.checked)}/>Assign this case to me</label>
        <button className="primary-button" disabled={busy}>Save case decision</button>
      </form>
      {selected.category==='moderation'&&selected.reference_type==='review'?<div className="case-action-row"><button className="secondary-button" disabled={busy} onClick={()=>void moderate(false)}>Hide reported review</button><button className="secondary-button" disabled={busy} onClick={()=>void moderate(true)}>Restore reported review</button></div>:null}
      {selected.category==='refund'?<div className="config-form"><h3>Provider refund</h3><p>Use the payment ID from the receipt. The server checks the refundable balance.</p><label>Payment ID<input value={paymentId} onChange={event=>setPaymentId(event.target.value)}/></label><label>Amount (BDT)<input type="number" min="0.01" step="0.01" value={amount} onChange={event=>setAmount(event.target.value)}/></label><button className="secondary-button" disabled={busy} onClick={()=>void refund()}>Request provider refund</button></div>:null}
    </>}</section></div>
  </>
}
