import { createCheckoutHandler } from './handler.ts'

Deno.serve(createCheckoutHandler({ supabaseUrl: Deno.env.get('SUPABASE_URL'), publishableKey: Deno.env.get('SUPABASE_ANON_KEY'), serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'), appUrl: Deno.env.get('APP_URL'), bkashApiUrl: Deno.env.get('BKASH_CREATE_PAYMENT_URL'), bkashToken: Deno.env.get('BKASH_API_TOKEN'), nagadApiUrl: Deno.env.get('NAGAD_CREATE_PAYMENT_URL'), nagadToken: Deno.env.get('NAGAD_API_TOKEN') }))

