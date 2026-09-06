import { describe, expect, it } from 'vitest'
import { allFieldsReviewed, maskProviderKey, patientGuidanceSchema, patientOutputIsSafe } from './phase6'

const safe = { summary: 'Your finalized record notes a restored tooth.', urgency: 'routine' as const, guidance: ['Keep the area clean and follow the clinic plan.'], redFlags: ['Seek urgent care for rapidly increasing swelling.'], bookingRecommended: false, disclaimer: 'This is general information and not a diagnosis or prescription.' }

describe('phase 6 AI safety', () => {
  it('accepts a bounded patient-safe response', () => expect(patientOutputIsSafe(patientGuidanceSchema.parse(safe))).toBe(true))
  it('rejects diagnostic language from patient output', () => expect(patientOutputIsSafe({ ...safe, summary: 'You have an abscess.' })).toBe(false))
  it('rejects diagnostic or prescription language in Bangla patient output', () => expect(patientOutputIsSafe({ ...safe, summary: 'এটি রোগ নির্ণয়।', guidance: ['এই ওষুধ খান।'] })).toBe(false))
  it('requires every named clinical field to be reviewed', () => expect(allFieldsReviewed(['subjective', 'objective'], { subjective: true, objective: false })).toBe(false))
  it('never renders the full provider key', () => expect(maskProviderKey('sk-example-secret-1234')).toBe('•••• 1234'))
})
