import { createAiTaskHandler } from './handler.ts'

Deno.serve(createAiTaskHandler({supabaseUrl:Deno.env.get('SUPABASE_URL'),publishableKey:Deno.env.get('SUPABASE_ANON_KEY')??Deno.env.get('SUPABASE_PUBLISHABLE_KEY'),serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),openAiUrl:Deno.env.get('OPENAI_RESPONSES_URL')}))
