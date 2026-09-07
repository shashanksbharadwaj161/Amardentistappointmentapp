import { browserEndpoint } from '../_shared/http.ts'
import { createRefundHandler } from './handler.ts'
Deno.serve(browserEndpoint(createRefundHandler({supabaseUrl:Deno.env.get('SUPABASE_URL'),publishableKey:Deno.env.get('SUPABASE_ANON_KEY'),serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),bkashRefundUrl:Deno.env.get('BKASH_REFUND_URL'),bkashToken:Deno.env.get('BKASH_API_TOKEN'),nagadRefundUrl:Deno.env.get('NAGAD_REFUND_URL'),nagadToken:Deno.env.get('NAGAD_API_TOKEN')})))
