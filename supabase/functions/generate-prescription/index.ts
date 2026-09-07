import { browserEndpoint } from '../_shared/http.ts'
import { createPrescriptionHandler } from './handler.ts'

Deno.serve(browserEndpoint(createPrescriptionHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL'),
  publishableKey: Deno.env.get('SUPABASE_ANON_KEY'),
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  webAppUrl: Deno.env.get('MOBILE_WEB_URL'),
})))
