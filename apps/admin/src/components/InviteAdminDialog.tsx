import { inviteAdminSchema } from '@amar-dentist/domain'
import { Button } from '@heroui/react/button'
import { CheckCircle2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/animate-ui/components/radix/dialog'

type InviteAdminDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onInvite: (email: string, displayName: string, expiresInDays: number) => Promise<string | null>
}

export function InviteAdminDialog({ open, onOpenChange, onInvite }: InviteAdminDialogProps) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    const parsed = inviteAdminSchema.safeParse({ email, displayName, expiresInDays: 7 })
    if (!parsed.success) {
      setSuccess(false)
      setMessage(parsed.error.issues[0]?.message ?? 'Check the invitation fields.')
      return
    }
    setBusy(true)
    const error = await onInvite(parsed.data.email, parsed.data.displayName, parsed.data.expiresInDays)
    setBusy(false)
    setSuccess(!error)
    setMessage(error ?? `Invitation sent to ${parsed.data.email}.`)
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) {
      setEmail('')
      setDisplayName('')
      setMessage(null)
      setSuccess(false)
    }
  }

  return <Dialog open={open} onOpenChange={handleOpenChange}><DialogContent className="dialog-content" aria-describedby="invite-description" from="right"><DialogHeader className="dialog-heading"><div><p className="eyebrow">SUPER ADMIN ACTION</p><DialogTitle>Invite an administrator</DialogTitle></div></DialogHeader><DialogDescription id="invite-description">The invitation expires after seven days. New admins can review operations but cannot create other admins.</DialogDescription>{success ? <div className="success-state" role="status"><CheckCircle2 /><strong>Invitation ready</strong><p>{message}</p><DialogClose className="primary-button">Done</DialogClose></div> : <form className="dialog-form" onSubmit={submit}><label>Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoComplete="name" placeholder="Administrator’s name" /></label><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="admin@example.com" /></label>{message && <div className="alert" role="alert">{message}</div>}<div className="dialog-actions"><DialogClose className="secondary-button" type="button">Cancel</DialogClose><Button className="primary-button" type="submit" isPending={busy}>{busy ? 'Sending…' : 'Send invitation'}</Button></div></form>}</DialogContent></Dialog>
}
