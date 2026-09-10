import { passwordSchema } from '@amar-dentist/domain'
import { Button } from '@heroui/react/button'
import type { User } from '@supabase/supabase-js'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from './ui/field'
import { supabase } from '../lib/supabase'

// The parent must resolve an Admin identity and a verified invite/recovery callback before mounting.
// Historical timestamps are a secondary guard, not proof of a fresh callback or a role grant.
const eligibleUser = (user: User | null) => Boolean(user?.id && user.email_confirmed_at && (user.invited_at || user.recovery_sent_at))

export function CompleteAdminAccess({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [confirmationError, setConfirmationError] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [complete, setComplete] = useState(false)
  const [retry, setRetry] = useState(0)
  const pending = useRef(false)
  const mounted = useRef(true)
  const verifiedUserId = useRef<string | null>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    let cancelled = false
    async function verify() {
      setChecking(true); setReady(false); setError(''); verifiedUserId.current = null
      try {
        if (!supabase) throw new Error('NOT_CONNECTED')
        const result = await supabase.auth.getUser()
        if (result.error || !eligibleUser(result.data.user)) throw new Error('SESSION_REQUIRED')
        if (!cancelled) { verifiedUserId.current = result.data.user!.id; setReady(true) }
      } catch {
        if (!cancelled) setError('A verified invitation or recovery session is required. Open the latest email link. If it has expired, request a new link.')
      } finally { if (!cancelled) setChecking(false) }
    }
    void verify()
    return () => { cancelled = true }
  }, [retry])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending.current || checking || !ready || complete) return
    const parsed = passwordSchema.safeParse(password)
    setPasswordError(parsed.success ? '' : 'Use 10–128 characters with an uppercase letter, a lowercase letter, and a number.')
    setConfirmationError(password === confirmation ? '' : 'Passwords do not match.')
    if (!parsed.success || password !== confirmation) return
    pending.current = true; setBusy(true); setError('')
    try {
      if (!supabase) throw new Error('NOT_CONNECTED')
      const current = await supabase.auth.getUser()
      if (current.error || !eligibleUser(current.data.user) || current.data.user?.id !== verifiedUserId.current) {
        if (mounted.current) { setReady(false); setPassword(''); setConfirmation('') }
        throw new Error('SESSION_CHANGED')
      }
      const updated = await supabase.auth.updateUser({ password: parsed.data })
      if (updated.error || !updated.data.user || updated.data.user.id !== verifiedUserId.current) throw new Error('UPDATE_UNCONFIRMED')
      if (mounted.current) { setPassword(''); setConfirmation(''); setComplete(true) }
    } catch {
      if (mounted.current) setError('Password setup is unconfirmed. Check your connection and session before retrying. If the link expired, request a new invitation or recovery link.')
    } finally {
      pending.current = false
      if (mounted.current) setBusy(false)
    }
  }

  if (complete) return <main className="signin-panel"><section className="signin-form">
    <h1>Password saved</h1><p role="status">Your password has been saved. Your existing administrator permissions have not changed.</p>
    <Button className="primary-button" onPress={onComplete}>Continue to console</Button>
  </section></main>

  return <main className="signin-panel"><form className="signin-form" onSubmit={submit} noValidate>
    <div><h1>Secure your administrator account</h1><p>Choose a private password to finish your invitation or account recovery. This does not create or change administrator permissions.</p></div>
    {checking && <p role="status">Verifying your secure session…</p>}
    {error && <div className="alert" role="alert">{error}</div>}
    <FieldGroup>
      <Field data-invalid={Boolean(passwordError)} data-disabled={!ready || busy || checking}>
        <FieldLabel htmlFor="admin-setup-password">New password</FieldLabel>
        <input id="admin-setup-password" type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} disabled={!ready || busy || checking} maxLength={128} required aria-invalid={Boolean(passwordError)} aria-describedby="admin-setup-password-hint admin-setup-password-error" />
        <FieldDescription id="admin-setup-password-hint">10–128 characters, including uppercase, lowercase, and a number. Use a password unique to this account.</FieldDescription>
        <FieldError id="admin-setup-password-error">{passwordError}</FieldError>
      </Field>
      <Field data-invalid={Boolean(confirmationError)} data-disabled={!ready || busy || checking}>
        <FieldLabel htmlFor="admin-setup-confirmation">Confirm password</FieldLabel>
        <input id="admin-setup-confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={!ready || busy || checking} maxLength={128} required aria-invalid={Boolean(confirmationError)} aria-describedby="admin-setup-confirmation-error" />
        <FieldError id="admin-setup-confirmation-error">{confirmationError}</FieldError>
      </Field>
    </FieldGroup>
    <Button type="submit" className="primary-button" isDisabled={!ready || busy || checking} isPending={busy}>{busy ? 'Saving password…' : 'Save password'}</Button>
    {!ready && !checking && <Button type="button" className="secondary-button" onPress={() => setRetry(value => value + 1)}>Check session again</Button>}
  </form></main>
}
