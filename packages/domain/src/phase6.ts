import { z } from 'zod'

export const dentistAiTaskTypeSchema = z.enum(['clinical_note', 'prescription', 'photo_quality', 'oral_photo_observation', 'xray_observation'])
export const patientAiTaskTypeSchema = z.enum(['record_explanation', 'symptom_intake', 'general_guidance'])
export const aiTaskTypeSchema = z.union([dentistAiTaskTypeSchema, patientAiTaskTypeSchema])

export const aiTaskRequestSchema = z.object({
  taskType: aiTaskTypeSchema,
  encounterId: z.uuid().nullable().default(null),
  patientProfileId: z.uuid().nullable().default(null),
  mediaId: z.uuid().nullable().default(null),
  input: z.string().trim().min(3).max(12_000),
  locale: z.enum(['en', 'bn']).default('en'),
})

export const clinicalNoteDraftSchema = z.object({
  subjective: z.string().max(10_000),
  objective: z.string().max(10_000),
  assessment: z.string().max(10_000),
  plan: z.string().max(10_000),
  cautions: z.array(z.string().max(500)).max(12),
})

export const prescriptionSuggestionSchema = z.object({
  rationale: z.string().max(2_000),
  allergyWarnings: z.array(z.string().max(500)).max(20),
  items: z.array(z.object({
    medicineName: z.string().max(300), strength: z.string().max(100), dosage: z.string().max(300),
    route: z.string().max(100), frequency: z.string().max(300), duration: z.string().max(300), instructions: z.string().max(1_000),
  })).max(20),
})

export const imageObservationSchema = z.object({
  quality: z.enum(['insufficient', 'limited', 'adequate']),
  qualityNotes: z.array(z.string().max(500)).max(12),
  visibleObservations: z.array(z.string().max(700)).max(20),
  limitations: z.array(z.string().max(700)).max(12),
  experimental: z.boolean(),
})

export const patientGuidanceSchema = z.object({
  summary: z.string().max(3_000),
  urgency: z.enum(['routine', 'soon', 'urgent', 'emergency']),
  guidance: z.array(z.string().max(700)).min(1).max(12),
  redFlags: z.array(z.string().max(700)).max(12),
  bookingRecommended: z.boolean(),
  disclaimer: z.string().max(700),
})

export const aiReviewSchema = z.object({
  taskId: z.uuid(),
  reviewedFields: z.record(z.string(), z.boolean()),
  finalOutput: z.record(z.string(), z.unknown()),
  changeSummary: z.string().trim().min(3).max(2_000),
})

export const aiProviderConfigSchema = z.object({
  provider: z.enum(['openai']),
  model: z.string().trim().min(3).max(120),
  apiKey: z.string().trim().min(20).max(1_000),
})

const diagnosticTerms = /(?:\b(?:diagnos(?:e|ed|is)|you have|prescri(?:be|bed|ption)|take\s+\d+\s*(?:mg|tablet|capsule)|definitely|certainly)\b|রোগ\s*নির্ণ[য়য়]|প্রেসক্রাইব|প্রেসক্রিপশন|ওষুধ\s*(?:খান|খেতে)|ট্যাবলেট|মি\.?\s*গ্রা\.?|নিশ্চিত(?:ভাবে)?)/iu
export function patientOutputIsSafe(output: z.infer<typeof patientGuidanceSchema>) {
  return !diagnosticTerms.test([output.summary, ...output.guidance, ...output.redFlags].join(' '))
    && output.disclaimer.trim().length >= 20
}

export function allFieldsReviewed(requiredFields: string[], reviewedFields: Record<string, boolean>) {
  return requiredFields.length > 0 && requiredFields.every((field) => reviewedFields[field] === true)
}

export function maskProviderKey(key: string) {
  const tail = key.trim().slice(-4)
  return tail ? `•••• ${tail}` : 'Not configured'
}

export type AiTaskRequest = z.infer<typeof aiTaskRequestSchema>
export type AiReviewInput = z.infer<typeof aiReviewSchema>
export type PatientGuidance = z.infer<typeof patientGuidanceSchema>
