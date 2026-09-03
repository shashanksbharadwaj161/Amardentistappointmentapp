import { z } from 'zod'

export const PATIENT_RELATIONSHIPS = ['self', 'child', 'spouse', 'parent', 'sibling', 'other'] as const
export const APPOINTMENT_STATUSES = ['confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show'] as const
export const APPOINTMENT_HOLD_STATUSES = ['held', 'consumed', 'expired', 'released'] as const
export const WAITLIST_STATUSES = ['waiting', 'offered', 'booked', 'expired', 'withdrawn'] as const

export type PatientRelationship = (typeof PATIENT_RELATIONSHIPS)[number]
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]
export type AppointmentHoldStatus = (typeof APPOINTMENT_HOLD_STATUSES)[number]
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number]

export const patientProfileSchema = z.object({
  id: z.uuid().nullable().default(null),
  relationship: z.enum(PATIENT_RELATIONSHIPS),
  fullName: z.string().trim().min(2).max(120),
  dateOfBirth: z.iso.date().nullable().default(null),
  gender: z.enum(['female', 'male', 'non_binary', 'prefer_not_to_say']).nullable().default(null),
  phone: z.string().trim().min(7).max(24).or(z.literal('')).default(''),
  city: z.string().trim().max(80).default(''),
  district: z.string().trim().max(80).default(''),
}).refine((value) => value.relationship !== 'self' || value.fullName.length > 0, {
  path: ['fullName'], message: 'A patient name is required',
})

export const marketplaceFilterSchema = z.object({
  query: z.string().trim().max(100).default(''),
  specialty: z.string().trim().max(80).default(''),
  gender: z.enum(['female', 'male', 'non_binary']).nullable().default(null),
  language: z.enum(['bn', 'en']).nullable().default(null),
  maxPriceBdt: z.number().min(0).max(10_000_000).nullable().default(null),
  minimumRating: z.number().min(0).max(5).default(0),
  availableOn: z.iso.date().nullable().default(null),
  openNow: z.boolean().default(false),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
  radiusKm: z.number().min(1).max(250).default(50),
}).refine((value) => (value.latitude === null) === (value.longitude === null), {
  path: ['latitude'], message: 'Latitude and longitude must be supplied together',
})

export const bookingHoldSchema = z.object({
  patientProfileId: z.uuid(),
  serviceId: z.uuid(),
  dentistId: z.uuid(),
  startAt: z.iso.datetime({ offset: true }),
})

export const waitlistRequestSchema = z.object({
  patientProfileId: z.uuid(),
  clinicId: z.uuid(),
  dentistId: z.uuid().nullable().default(null),
  serviceId: z.uuid(),
  preferredDate: z.iso.date(),
  earliestTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
  latestTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().default(null),
}).refine((value) => !value.earliestTime || !value.latestTime || value.earliestTime < value.latestTime, {
  path: ['latestTime'], message: 'Latest time must follow earliest time',
})

export const reviewSchema = z.object({
  appointmentId: z.uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1200).default(''),
})

export type PatientProfileInput = z.infer<typeof patientProfileSchema>
export type MarketplaceFilter = z.infer<typeof marketplaceFilterSchema>
export type BookingHoldInput = z.infer<typeof bookingHoldSchema>
export type WaitlistRequestInput = z.infer<typeof waitlistRequestSchema>
export type ReviewInput = z.infer<typeof reviewSchema>

export type MarketplaceDentist = {
  dentistId: string
  clinicId: string
  clinicName: string
  dentistName: string
  professionalTitle: string
  specialties: string[]
  languages: string[]
  gender: string | null
  yearsExperience: number | null
  serviceId: string
  serviceName: string
  durationMinutes: number
  priceBdt: number
  depositBdt: number
  rating: number
  reviewCount: number
  distanceKm: number | null
  nextAvailableAt: string | null
  openNow: boolean
}
