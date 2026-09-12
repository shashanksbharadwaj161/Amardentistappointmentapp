import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Read before the SDK consumes callback parameters. This is routing intent only;
// a verified Auth user and database Admin role are still mandatory.
export const adminPasswordCallbackIntent = (() => {
  if (typeof window === 'undefined' || window.location.pathname !== '/auth/callback') return null
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const query = new URLSearchParams(window.location.search)
  const type = hash.get('type') ?? query.get('type')
  const hasExchange = Boolean((hash.get('access_token') && hash.get('refresh_token')) || query.get('code'))
  return hasExchange && (type === 'invite' || type === 'recovery') ? type : null
})()

export const supabase = import.meta.env.MODE !== 'test' && import.meta.env.VITE_E2E_MODE !== 'true' && supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null

export const demoAllowed = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true'
