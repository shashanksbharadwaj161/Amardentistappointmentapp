import { createRotateAiKeyHandler } from './handler.ts'
Deno.serve(createRotateAiKeyHandler({supabaseUrl:Deno.env.get('SUPABASE_URL'),publishableKey:Deno.env.get('SUPABASE_ANON_KEY')??Deno.env.get('SUPABASE_PUBLISHABLE_KEY'),serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}))
