import { createPaymentWebhookHandler } from './handler.ts'
Deno.serve(createPaymentWebhookHandler({supabaseUrl:Deno.env.get('SUPABASE_URL'),serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),bkashWebhookSecret:Deno.env.get('BKASH_WEBHOOK_SECRET'),nagadWebhookSecret:Deno.env.get('NAGAD_WEBHOOK_SECRET')}))

