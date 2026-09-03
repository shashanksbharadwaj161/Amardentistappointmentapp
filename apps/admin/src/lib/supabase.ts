import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const supabase = import.meta.env.MODE !== 'test' && import.meta.env.VITE_E2E_MODE !== 'true' && supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey)
  : null

export const demoAllowed = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true'
