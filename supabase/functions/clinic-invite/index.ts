import { createClinicInviteHandler } from './handler.ts'

Deno.serve(createClinicInviteHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL'),
  publishableKey: Deno.env.get('SUPABASE_ANON_KEY'),
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  appRedirectUrl: Deno.env.get('MOBILE_APP_REDIRECT_URL'),
  webAppUrl: Deno.env.get('MOBILE_WEB_URL'),
}))
