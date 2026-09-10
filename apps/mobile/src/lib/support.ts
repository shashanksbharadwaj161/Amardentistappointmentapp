import { z } from 'zod'
import { supabase } from './supabase'

export const supportCategories = ['technical', 'privacy', 'dispute', 'refund', 'moderation'] as const
export const supportInputSchema = z.object({
  category: z.enum(supportCategories),
  summary: z.string().trim().min(5).max(1000),
})
const caseSchema = z.object({
  id: z.uuid(), category: z.enum(supportCategories),
  status: z.enum(['open', 'investigating', 'resolved', 'dismissed']),
  summary: z.string(), resolution: z.string().nullable(), created_at: z.string(),
})
export type SupportCase = z.infer<typeof caseSchema>
export type SupportInput = z.infer<typeof supportInputSchema>
export const isSupportPreview = (userId: string) => userId === '00000000-0000-4000-8000-000000000001'

export async function openSupportCase(userId: string, input: SupportInput) {
  if (!userId) throw new Error('SIGN_IN_REQUIRED')
  const parsed = supportInputSchema.parse(input)
  if (isSupportPreview(userId)) return { preview: true, id: null }
  if (!supabase) throw new Error('SERVICE_NOT_CONFIGURED')
  const { data, error } = await supabase.rpc('open_support_case', {
    case_category: parsed.category, case_summary: parsed.summary,
  })
  if (error) throw new Error('SUPPORT_SUBMIT_FAILED')
  return { preview: false, id: z.uuid().parse(data) }
}

export async function listSupportCases(userId: string): Promise<SupportCase[]> {
  if (!userId) throw new Error('SIGN_IN_REQUIRED')
  if (isSupportPreview(userId)) return []
  if (!supabase) throw new Error('SERVICE_NOT_CONFIGURED')
  const { data, error } = await supabase.from('support_cases')
    .select('id,category,status,summary,resolution,created_at')
    .eq('opened_by', userId).order('created_at', { ascending: false }).limit(50)
  if (error) throw new Error('SUPPORT_LOAD_FAILED')
  return z.array(caseSchema).parse(data)
}
