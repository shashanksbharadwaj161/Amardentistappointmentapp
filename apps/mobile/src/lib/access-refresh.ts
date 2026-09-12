import { AppState, Platform } from 'react-native'

/** Reconcile open screens while active, including return from another app/tab. */
export function subscribeToAccessRefresh(refresh: () => void): () => void {
  const active = () => AppState.currentState !== 'background' && AppState.currentState !== 'inactive'
  const run = () => { if (active()) refresh() }
  const timer = setInterval(run, 30_000)
  const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh() })
  const browser = Platform.OS === 'web' && typeof window !== 'undefined' ? window : null
  browser?.addEventListener('focus', run)
  return () => { clearInterval(timer); subscription.remove(); browser?.removeEventListener('focus', run) }
}
