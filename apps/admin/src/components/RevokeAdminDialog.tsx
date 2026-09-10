import { Button } from '@heroui/react/button'
import { useRef, useState, type FormEvent } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './animate-ui/components/radix/dialog'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from './ui/field'
import { supabase } from '../lib/supabase'

export type AdminRemovalTarget = { id: string; email: string }

export function RevokeAdminDialog({ target, onClose, onRemoved }: {
  target: AdminRemovalTarget; onClose: () => void; onRemoved: (preview: boolean) => void
}) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending.current) return
    const trimmed = reason.trim()
    if (trimmed.length < 5 || trimmed.length > 500) {
      setError('Explain why access is being removed in 5–500 characters.')
      return
    }
    pending.current = true; setBusy(true); setError('')
    try {
      if (supabase) {
        const result = await supabase.rpc('revoke_operational_admin', { target_user_id: target.id, action_reason: trimmed })
        if (result.error) throw new Error('ROLE_REMOVAL_FAILED')
      }
      onRemoved(!supabase)
    } catch {
      setError('Access removal is unconfirmed. Refresh the user list before retrying. Super Admin accounts cannot be removed here.')
    } finally { pending.current = false; setBusy(false) }
  }

  return <Dialog open onOpenChange={open => { if (!open && !pending.current) onClose() }}>
    <DialogContent className="dialog-content" showCloseButton={!busy}>
      <DialogHeader><DialogTitle>Remove Admin access</DialogTitle>
        <DialogDescription>This removes operational Admin permissions from {target.email}. Other roles remain unchanged. Restoring access requires a new invitation.</DialogDescription>
      </DialogHeader>
      <form className="dialog-form" onSubmit={submit}>
        <FieldGroup><Field data-invalid={Boolean(error)} data-disabled={busy}>
          <FieldLabel htmlFor="admin-removal-reason">Reason for removal</FieldLabel>
          <textarea id="admin-removal-reason" aria-invalid={Boolean(error)} aria-describedby="admin-removal-guidance"
            value={reason} onChange={event => setReason(event.target.value)} disabled={busy} rows={4} maxLength={500} required />
          <FieldDescription id="admin-removal-guidance">The reason is retained in the audit trail. Do not include clinical information.</FieldDescription>
          <FieldError>{error}</FieldError>
        </Field></FieldGroup>
        {!supabase && <p className="config-note">Preview only: no real permissions will change.</p>}
        <div className="dialog-actions">
          <Button type="button" className="secondary-button" isDisabled={busy} onPress={onClose}>Keep access</Button>
          <Button type="submit" className="primary-button" isDisabled={busy}>{busy ? 'Removing…' : 'Confirm removal'}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>
}
