import { createRevenueCatHandler } from './handler.ts'
Deno.serve(createRevenueCatHandler({supabaseUrl:Deno.env.get('SUPABASE_URL'),serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),authorizationToken:Deno.env.get('REVENUECAT_WEBHOOK_AUTH'),signingSecret:Deno.env.get('REVENUECAT_WEBHOOK_SIGNING_SECRET')}))
