// Preserve the sealed-key settings surface; report confirmed state rather than optimistic success.
import { Button } from '@heroui/react/button'
import { Bot, CheckCircle2, Gauge, KeyRound, ShieldCheck, ToggleLeft, ToggleRight } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Provider = { provider: string; model: string; key_hint: string; enabled: boolean; configured_at: string | null }
type Flag = { flag_key: string; description: string; enabled: boolean; audience: string }
type Limit = { limit_key: string; description: string; free_value: number; paid_value: number }
type LimitDraft = { free: string; paid: string }
export type AiConfigurationSection = 'all' | 'provider' | 'flags' | 'limits'
const emptyProvider: Provider = { provider: 'openai', model: '', key_hint: 'Not configured', enabled: false, configured_at: null }
const previewFlags: Flag[] = [
  { flag_key: 'dentist_ai', description: 'Dentist AI review workspace', enabled: true, audience: 'professional' },
  { flag_key: 'patient_ai', description: 'Patient guidance assistant', enabled: true, audience: 'patient' },
  { flag_key: 'experimental_xray_ai', description: 'Experimental X-ray observations', enabled: false, audience: 'professional' },
  { flag_key: 'sms_notifications', description: 'SMS notification delivery', enabled: false, audience: 'all' },
]
const previewLimits: Limit[] = [
  { limit_key: 'patient_ai_daily', description: 'Patient AI requests per day', free_value: 5, paid_value: 40 },
  { limit_key: 'dentist_ai_daily', description: 'Dentist AI requests per day', free_value: 15, paid_value: 150 },
]
const titles: Record<AiConfigurationSection, string> = { all: 'Provider, flags, and limits', provider: 'AI provider', flags: 'Feature flags', limits: 'Daily usage limits' }
const limitDrafts = (rows: Limit[]) => Object.fromEntries(rows.map((row) => [row.limit_key, { free: String(row.free_value), paid: String(row.paid_value) }]))

export function AiConfiguration({ section = 'all' }: { section?: AiConfigurationSection }) {
  const preview = !supabase
  const [provider, setProvider] = useState(emptyProvider)
  const [model, setModel] = useState(preview ? 'gpt-5-mini' : '')
  const [apiKey, setApiKey] = useState('')
  const [flags, setFlags] = useState(preview ? previewFlags : [])
  const [limits, setLimits] = useState(preview ? previewLimits : [])
  const [drafts, setDrafts] = useState<Record<string, LimitDraft>>(limitDrafts(preview ? previewLimits : []))
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!preview)
  const [loadFailed, setLoadFailed] = useState(false)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState<string | null>(null)
  const mutation = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let cancelled = false
    const load = async () => {
      setLoading(true); setLoadFailed(false); setError(null)
      try {
        const [providerResult, flagResult, limitResult] = await Promise.all([
          client.from('ai_provider_settings').select('provider,model,key_hint,enabled,configured_at').eq('provider', 'openai').maybeSingle(),
          client.from('feature_flags').select('flag_key,description,enabled,audience').order('flag_key'),
          client.from('platform_usage_limits').select('limit_key,description,free_value,paid_value').order('limit_key'),
        ])
        if (providerResult.error || flagResult.error || limitResult.error) throw new Error('LOAD_FAILED')
        if (cancelled) return
        const currentProvider = (providerResult.data as Provider | null) ?? emptyProvider
        const currentLimits = (limitResult.data ?? []) as Limit[]
        setProvider(currentProvider); setModel(currentProvider.model)
        setFlags((flagResult.data ?? []) as Flag[]); setLimits(currentLimits); setDrafts(limitDrafts(currentLimits))
      } catch {
        if (!cancelled) { setLoadFailed(true); setError('Live AI configuration could not be loaded. Check your connection and retry. No preview values are being shown.') }
      } finally { if (!cancelled) setLoading(false) }
    }
    void load()
    return () => { cancelled = true }
  }, [reload])

  const disabled = loading || loadFailed || busy !== null
  const begin = (key: string) => {
    if (mutation.current || loading || loadFailed) return false
    mutation.current = true; setBusy(key); setMessage(null); setError(null)
    return true
  }
  const end = () => { mutation.current = false; if (mounted.current) setBusy(null) }
  const rotate = async (event: FormEvent) => {
    event.preventDefault()
    if (preview) { setApiKey(''); setMessage('Preview only. Credentials cannot be entered or stored here. Open the connected Super Admin console to configure your key.'); return }
    if (mutation.current || disabled) return
    if (apiKey.trim().length < 20 || model.trim().length < 3 || model.trim().length > 100) {
      setError('Enter a model name of 3–100 characters and the complete API key.'); return
    }
    if (!begin('key')) return
    const submittedModel = model.trim()
    const submittedKey = apiKey.trim()
    setApiKey('')
    try {
      const { data, error: requestError } = await supabase!.functions.invoke('ai-key-rotate', { body: { provider: 'openai', model: submittedModel, apiKey: submittedKey } })
      if (requestError || !data?.ok || typeof data.data?.keyHint !== 'string') throw new Error('ROTATION_UNCONFIRMED')
      if (!mounted.current) return
      // Never render an unexpected server response as a credential hint.
      setProvider({ provider: 'openai', model: submittedModel, key_hint: `•••• ${submittedKey.slice(-4)}`, enabled: true, configured_at: new Date().toISOString() })
      setMessage('Provider credential rotated. The plaintext value cannot be read back.')
    } catch {
      if (mounted.current) setError('Credential rotation is unconfirmed. Check the provider status before retrying. The key field has been cleared for your security.')
    } finally { end() }
  }
  const toggle = async (flag: Flag) => {
    if (!begin(flag.flag_key)) return
    try {
      if (supabase) {
        const result = await supabase.rpc('set_feature_flag', { target_key: flag.flag_key, target_enabled: !flag.enabled })
        if (result.error) throw new Error('FLAG_UNCONFIRMED')
      }
      if (!mounted.current) return
      setFlags((current) => current.map((item) => item.flag_key === flag.flag_key ? { ...item, enabled: !flag.enabled } : item))
      setMessage(preview ? 'Preview only. This feature flag changed on this screen; nothing was saved or audited.' : 'Feature flag updated and audited.')
    } catch {
      if (mounted.current) setError('Feature flag update is unconfirmed. Refresh the live settings before retrying.')
    } finally { end() }
  }
  const saveLimit = async (limit: Limit) => {
    if (mutation.current || disabled) return
    const draft = drafts[limit.limit_key]
    const free = Number(draft?.free); const paid = Number(draft?.paid)
    if (!draft || !/^\d+$/.test(draft.free) || !/^\d+$/.test(draft.paid) || !Number.isSafeInteger(free) || !Number.isSafeInteger(paid) || free > 2147483647 || paid > 2147483647 || paid < free) {
      setError('Use whole numbers from 0 to 2,147,483,647. The paid limit must be at least the free limit.'); return
    }
    if (!begin(limit.limit_key)) return
    try {
      if (supabase) {
        const result = await supabase.rpc('set_platform_usage_limit', { target_key: limit.limit_key, target_free: free, target_paid: paid })
        if (result.error) throw new Error('LIMIT_UNCONFIRMED')
      }
      if (!mounted.current) return
      setLimits((current) => current.map((item) => item.limit_key === limit.limit_key ? { ...item, free_value: free, paid_value: paid } : item))
      setMessage(preview ? 'Preview only. This usage limit changed on this screen; nothing was saved or audited.' : 'Usage limit updated and audited.')
    } catch {
      if (mounted.current) setError('Usage limit update is unconfirmed. Your entries are preserved. Refresh the live settings before retrying.')
    } finally { end() }
  }
  const showProvider = section === 'all' || section === 'provider'
  const showFlags = section === 'all' || section === 'flags'
  const showLimits = section === 'all' || section === 'limits'
  return <>
    <div className="page-heading config-heading"><div><p className="eyebrow">AI &amp; SAFETY CONTROLS</p><h1>{titles[section]}</h1><p>Control patient guidance and dentist assistance. AI never replaces a dentist’s clinical review.</p></div><div className="config-lock"><ShieldCheck /><span>Super Admin only</span></div></div>
    {preview && <div className="workspace-alert" role="note">Preview configuration. Changes are temporary; no credentials, settings, or audit events are saved.</div>}
    {message && <div className="workspace-alert" role="status">{message}</div>}
    {error && <div className="workspace-alert" role="alert">{error}</div>}
    {loading && <p role="status">Loading live AI configuration…</p>}
    {!preview && <Button className="secondary-button" isDisabled={loading || busy !== null} onPress={() => { setMessage(null); setReload((value) => value + 1) }}>Refresh live settings</Button>}
    {(showProvider || showFlags) && <div className={section === 'all' ? 'ai-config-grid' : undefined}>
      {showProvider && <section className="panel config-panel"><div className="panel-heading"><h2>AI provider</h2><KeyRound /></div>
        <div className="provider-status"><span className={provider.enabled ? 'status-dot' : 'status-dot status-dot-off'} /><div><strong>{loading ? 'Loading provider status' : loadFailed ? 'Provider status unavailable' : provider.enabled ? 'Configured' : 'Waiting for key'}</strong><small>{provider.model ? `${provider.model} · ` : ''}{provider.key_hint || 'Not configured'}</small></div></div>
        <form className="config-form" onSubmit={rotate}><label>Model<input value={model} disabled={disabled || preview} maxLength={100} onChange={(event) => setModel(event.target.value)} placeholder="Provider model name" /></label>
          <label>New API key<input type="password" autoComplete="off" value={preview ? '' : apiKey} disabled={disabled || preview} onChange={(event) => { if (!preview) setApiKey(event.target.value) }} placeholder={preview ? 'Unavailable in preview' : 'Paste once to rotate'} /></label>
          <p>{preview ? 'Do not paste a real key into preview. Configure it only in the connected console.' : 'The key is sent to a protected server function and stored encrypted in Supabase Vault. The input is cleared after submission; plaintext cannot be read back.'}</p>
          <Button className="primary-button" type="submit" isPending={busy === 'key'} isDisabled={disabled || preview}><KeyRound />Rotate sealed credential</Button>
        </form></section>}
      {showFlags && <section className="panel config-panel"><div className="panel-heading"><h2>Feature flags</h2><Bot /></div><div className="flag-list">
        {!loading && !loadFailed && flags.length === 0 && <p>No feature flags are configured.</p>}
        {flags.map((flag) => <article key={flag.flag_key}><div><strong>{flag.description}</strong><small>{flag.audience} · {flag.flag_key}</small></div><button aria-label={`${flag.enabled ? 'Disable' : 'Enable'} ${flag.description}`} aria-pressed={flag.enabled} disabled={disabled} onClick={() => void toggle(flag)}>{flag.enabled ? <ToggleRight /> : <ToggleLeft />}<span>{busy === flag.flag_key ? 'Saving…' : flag.enabled ? 'On' : 'Off'}</span></button></article>)}
      </div></section>}
    </div>}
    {showLimits && <section className="panel quota-panel"><div className="panel-heading"><h2>Daily usage limits</h2><Gauge /></div><p>Limits are whole request counts. Paid access cannot have a lower allowance than free access.</p><div className="quota-grid">
      {!loading && !loadFailed && limits.length === 0 && <p>No usage limits are configured.</p>}
      {limits.map((limit) => <article key={limit.limit_key}><div><strong>{limit.description}</strong><small>{limit.limit_key}</small></div>
        <label>Free<input aria-label={`Free limit for ${limit.description}`} type="number" min="0" max="2147483647" step="1" disabled={disabled} value={drafts[limit.limit_key]?.free ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [limit.limit_key]: { ...current[limit.limit_key]!, free: event.target.value } }))} /></label>
        <label>Paid<input aria-label={`Paid limit for ${limit.description}`} type="number" min="0" max="2147483647" step="1" disabled={disabled} value={drafts[limit.limit_key]?.paid ?? ''} onChange={(event) => setDrafts((current) => ({ ...current, [limit.limit_key]: { ...current[limit.limit_key]!, paid: event.target.value } }))} /></label>
        <Button className="secondary-button" aria-label={`Save ${limit.description}`} isDisabled={disabled} isPending={busy === limit.limit_key} onPress={() => void saveLimit(limit)}><CheckCircle2 />Save</Button>
      </article>)}
    </div></section>}
  </>
}
