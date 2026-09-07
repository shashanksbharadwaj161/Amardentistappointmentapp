import { browserEndpoint } from '../_shared/http.ts'
import { createAdminInviteHandler } from './handler.ts'

Deno.serve(browserEndpoint(createAdminInviteHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL'),
  publishableKey: Deno.env.get('SUPABASE_ANON_KEY'),
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  adminAppUrl: Deno.env.get('ADMIN_APP_URL'),
})))
