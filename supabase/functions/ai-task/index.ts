import { browserEndpoint } from '../_shared/http.ts'
import { createAiTaskHandler } from './handler.ts'

Deno.serve(browserEndpoint(createAiTaskHandler({supabaseUrl:Deno.env.get('SUPABASE_URL'),publishableKey:Deno.env.get('SUPABASE_ANON_KEY')??Deno.env.get('SUPABASE_PUBLISHABLE_KEY'),serviceRoleKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),openAiUrl:Deno.env.get('OPENAI_RESPONSES_URL')})))
