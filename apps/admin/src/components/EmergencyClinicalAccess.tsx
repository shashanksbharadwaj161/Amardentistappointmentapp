import { Button } from '@heroui/react/button'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './animate-ui/components/radix/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from './ui/field'

type Account = { id: string; email: string }
type Patient = { id: string; full_name: string; relationship: string }
type Section = { title: string; rows: { label: string; value: string }[][] }
const sections = [
  ['medicalHistory', 'Medical history', ['conditions', 'current_medications', 'prior_surgeries', 'pregnancy_status', 'tobacco_use', 'notes', 'updated_at']],
  ['allergies', 'Allergies', ['allergen', 'reaction', 'severity', 'active', 'updated_at']],
  ['encounters', 'Encounters', ['status', 'chief_complaint', 'subjective_notes', 'objective_notes', 'assessment', 'plan', 'created_at', 'finalized_at']],
  ['diagnoses', 'Diagnoses', ['code', 'diagnosis', 'notes', 'created_at', 'finalized_at']],
  ['prescriptions', 'Prescriptions', ['status', 'instructions', 'created_at', 'finalized_at']],
] as const

// Retain only explicitly supported clinical fields; never render raw payloads or storage paths.
function displaySnapshot(data: unknown): Section[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('INVALID_SNAPSHOT')
  const source = data as Record<string, unknown>
  return sections.map(([key, title, fields]) => {
    const value = source[key]
    if (key === 'medicalHistory' ? value !== null && (typeof value !== 'object' || Array.isArray(value)) : !Array.isArray(value)) throw new Error('INVALID_SNAPSHOT')
    const records = value === null ? [] : Array.isArray(value) ? value : [value]
    return { title, rows: records.map(record => {
      if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('INVALID_SNAPSHOT')
      return fields.flatMap(field => {
        const item = (record as Record<string, unknown>)[field]
        const text = typeof item === 'string' ? item : typeof item === 'boolean' ? (item ? 'Yes' : 'No') : Array.isArray(item) && item.every(entry => typeof entry === 'string') ? item.join(', ') : ''
        return text ? [{ label: field.replaceAll('_', ' '), value: text }] : []
      })
    }) }
  })
}

export function EmergencyClinicalAccess(props: { account: Account; onClose: () => void }) {
  // Account changes dispose all sensitive state, including in-flight requests.
  return <ClinicalAccessSession key={props.account.id} {...props} />
}

function ClinicalAccessSession({ account, onClose }: { account: Account; onClose: () => void }) {
  const [patients, setPatients] = useState<Patient[]>([])
  const [loading, setLoading] = useState(Boolean(supabase))
  const [patientId, setPatientId] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [closed, setClosed] = useState(false)
  const [snapshot, setSnapshot] = useState<Section[] | null>(null)
  const request = useRef(0)
  const pending = useRef(false)
  const active = useRef(true)

  useEffect(() => {
    active.current = true
    let current = true
    async function load() {
      if (!supabase) return
      try {
        const result = await supabase.from('patient_profiles').select('id,full_name,relationship').eq('account_owner_id', account.id).order('created_at', { ascending: true })
        if (!current || !active.current) return
        if (result.error) throw new Error('PROFILES_UNAVAILABLE')
        setPatients((result.data ?? []) as Patient[])
      } catch {
        if (current && active.current) setError('Patient profiles could not be loaded. Close and reopen to retry.')
      } finally { if (current && active.current) setLoading(false) }
    }
    void load()
    return () => { current = false; active.current = false; request.current += 1 }
  }, [account.id])

  function clear() {
    request.current += 1; pending.current = false
    setSnapshot(null); setError(''); setBusy(false)
  }
  function close() {
    active.current = false; clear(); setReason(''); setPatients([]); setClosed(true); onClose()
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending.current || !active.current || !supabase) return
    setSnapshot(null); setError('')
    const normalized = reason.trim()
    if (!patients.some(patient => patient.id === patientId)) { setError('Choose a patient profile belonging to this account.'); return }
    if (Array.from(normalized).length < 10 || Array.from(normalized).length > 500) { setError('Explain the access need in 10–500 characters.'); return }
    const current = ++request.current
    pending.current = true; setBusy(true)
    try {
      // Authorization and audit insertion are mandatory inside this server operation.
      const result = await supabase.rpc('super_admin_clinical_snapshot', { target_patient_profile_id: patientId, access_reason: normalized })
      if (!active.current || current !== request.current) return
      if (result.error) throw new Error('ACCESS_UNCONFIRMED')
      setSnapshot(displaySnapshot(result.data))
    } catch {
      if (active.current && current === request.current) setError('Clinical access could not be confirmed. Super Admin permission and a successful audit entry are required. Retry or close this view.')
    } finally {
      if (active.current && current === request.current) { pending.current = false; setBusy(false) }
    }
  }
  if (closed) return null
  return <Dialog open onOpenChange={open => { if (!open) close() }}>
    <DialogContent className="dialog-content">
      <DialogHeader><DialogTitle>Audited clinical access</DialogTitle><DialogDescription>Review a patient or dependent belonging to {account.email}. Each read requires a written reason and is recorded in the audit trail. This view is read-only.</DialogDescription></DialogHeader>
      <form className="dialog-form config-form" onSubmit={submit}>
        <FieldGroup>
          <Field data-disabled={loading || !supabase}><FieldLabel htmlFor="clinical-patient">Patient profile</FieldLabel>
            <select id="clinical-patient" value={patientId} disabled={loading || !supabase} onChange={event => { clear(); setPatientId(event.target.value); setReason('') }}>
              <option value="">Choose patient or dependent</option>
              {patients.map(patient => <option key={patient.id} value={patient.id}>{patient.full_name} · {patient.relationship.replaceAll('_', ' ')}</option>)}
            </select>
          </Field>
          <Field data-invalid={Boolean(error)} data-disabled={busy || !supabase}><FieldLabel htmlFor="clinical-access-reason">Reason for clinical access</FieldLabel>
            <textarea id="clinical-access-reason" value={reason} disabled={busy || !supabase} rows={4} aria-invalid={Boolean(error)} aria-describedby="clinical-access-guidance" onChange={event => { setReason(event.target.value); setSnapshot(null); setError('') }} />
            <FieldDescription id="clinical-access-guidance">Explain the specific investigation need in 10–500 characters. Avoid including clinical details in the audit reason.</FieldDescription>
            <FieldError>{error}</FieldError>
          </Field>
        </FieldGroup>
        {loading && <p role="status">Loading patient profiles…</p>}
        {!loading && supabase && !error && patients.length === 0 && <p role="status">No account-owned patient profiles were found.</p>}
        {!supabase && <p className="config-note">Preview only: clinical access requires a connected Super Admin session. No sample clinical records are shown.</p>}
        <div className="dialog-actions"><Button type="button" className="secondary-button" onPress={close}>Close clinical access</Button><Button type="submit" className="primary-button" isDisabled={!supabase || loading || busy || !patientId}>{busy ? 'Confirming audited access…' : 'View audited snapshot'}</Button></div>
      </form>
      {snapshot && <div className="dialog-form" aria-label="Clinical snapshot">
        <p role="status">Audited snapshot loaded for {patients.find(patient => patient.id === patientId)?.full_name}. Draft records may be included; only treating dentists can author or finalize care.</p>
        {snapshot.map(section => <section key={section.title} aria-label={section.title}><h3>{section.title}</h3>{section.rows.length === 0 ? <p>No records returned.</p> : section.rows.map((row, index) => <details key={index} open><summary>{section.title} record {index + 1}</summary><dl>{row.map(field => <div key={field.label}><dt>{field.label}</dt><dd className="m-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{field.value}</dd></div>)}</dl></details>)}</section>)}
        <p className="config-note">This snapshot includes prescription summaries only. Medication items, documents, media and earlier record versions are not returned by this access action.</p>
      </div>}
    </DialogContent>
  </Dialog>
}
