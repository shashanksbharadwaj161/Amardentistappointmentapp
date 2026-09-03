import { z } from 'zod'

export const VERIFICATION_STATUSES = ['draft', 'submitted', 'under_review', 'approved', 'rejected', 'suspended'] as const
export const CLINIC_MEMBER_ROLES = ['clinic_owner', 'clinic_manager', 'dentist', 'front_desk'] as const
export const CLINIC_MEMBERSHIP_STATUSES = ['invited', 'active', 'suspended', 'removed'] as const
export const VERIFICATION_DECISIONS = ['approved', 'rejected', 'changes_requested', 'suspended'] as const
export const SCHEDULE_EXCEPTION_KINDS = ['unavailable', 'available', 'clinic_closed'] as const

export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number]
export type ClinicMemberRole = (typeof CLINIC_MEMBER_ROLES)[number]
export type ClinicMembershipStatus = (typeof CLINIC_MEMBERSHIP_STATUSES)[number]
export type VerificationDecision = (typeof VERIFICATION_DECISIONS)[number]
export type ScheduleExceptionKind = (typeof SCHEDULE_EXCEPTION_KINDS)[number]

const optionalEmail = z.union([z.literal(''), z.string().trim().email().max(254)]).default('')
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm time')

export const clinicApplicationSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(24),
  email: optionalEmail,
  address: z.string().trim().min(5).max(240),
  district: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
  description: z.string().trim().max(1200).default(''),
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
}).refine((value) => (value.latitude === null) === (value.longitude === null), {
  path: ['latitude'], message: 'Latitude and longitude must be provided together',
})

export const dentistApplicationSchema = z.object({
  registrationNumber: z.string().trim().min(3).max(40).transform((value) => value.toUpperCase()),
  title: z.string().trim().min(2).max(80).default('Dentist'),
  biography: z.string().trim().max(1600).default(''),
  specialties: z.array(z.string().trim().min(2).max(80)).max(12).default([]),
  languages: z.array(z.enum(['bn', 'en'])).min(1),
  gender: z.enum(['female', 'male', 'non_binary', 'prefer_not_to_say']).nullable().default(null),
  yearsExperience: z.number().int().min(0).max(70).nullable().default(null),
})

export const clinicServiceSchema = z.object({
  id: z.uuid().nullable().default(null),
  clinicId: z.uuid(),
  dentistId: z.uuid().nullable().default(null),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(800).default(''),
  durationMinutes: z.number().int().min(10).max(480).refine((value) => value % 5 === 0, 'Duration must use five-minute increments'),
  priceBdt: z.number().min(0).max(10_000_000),
  depositBdt: z.number().min(0).max(10_000_000),
  active: z.boolean().default(true),
}).refine((value) => value.depositBdt <= value.priceBdt, {
  path: ['depositBdt'], message: 'Deposit cannot exceed the service price',
})

export const weeklyScheduleBlockSchema = z.object({
  id: z.uuid().nullable().default(null),
  clinicId: z.uuid(),
  dentistId: z.uuid(),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema,
  timezone: z.string().trim().min(3).max(80).default('Asia/Dhaka'),
  active: z.boolean().default(true),
}).refine((value) => value.startTime < value.endTime, {
  path: ['endTime'], message: 'End time must be after start time',
})

export const scheduleExceptionSchema = z.object({
  clinicId: z.uuid(),
  dentistId: z.uuid().nullable(),
  date: z.iso.date(),
  kind: z.enum(SCHEDULE_EXCEPTION_KINDS),
  startTime: timeSchema.nullable(),
  endTime: timeSchema.nullable(),
  reason: z.string().trim().max(240).default(''),
}).refine((value) => (value.startTime === null) === (value.endTime === null), {
  path: ['startTime'], message: 'Both exception times are required',
}).refine((value) => value.startTime === null || value.startTime < value.endTime!, {
  path: ['endTime'], message: 'End time must be after start time',
}).refine((value) => value.kind !== 'clinic_closed' || value.dentistId === null, {
  path: ['dentistId'], message: 'Clinic closures apply to the full clinic',
})

export const weeklyScheduleBreakSchema = z.object({
  scheduleBlockId: z.uuid(),
  startTime: timeSchema,
  endTime: timeSchema,
  label: z.string().trim().min(1).max(80).default('Break'),
}).refine((value) => value.startTime < value.endTime, {
  path: ['endTime'], message: 'End time must be after start time',
})

export const clinicStaffInvitationSchema = z.object({
  clinicId: z.uuid(),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  role: z.enum(['clinic_manager', 'dentist', 'front_desk']),
  expiresInDays: z.number().int().min(1).max(30).default(7),
})

export const verificationReviewSchema = z.object({
  targetType: z.enum(['clinic', 'dentist']),
  targetId: z.uuid(),
  decision: z.enum(VERIFICATION_DECISIONS),
  reason: z.string().trim().max(2000).default(''),
}).refine((value) => value.decision === 'approved' || value.reason.length >= 5, {
  path: ['reason'], message: 'Add a clear reason for this decision',
})

export type ClinicApplicationInput = z.infer<typeof clinicApplicationSchema>
export type DentistApplicationInput = z.infer<typeof dentistApplicationSchema>
export type ClinicServiceInput = z.infer<typeof clinicServiceSchema>
export type WeeklyScheduleBlockInput = z.infer<typeof weeklyScheduleBlockSchema>
export type ScheduleExceptionInput = z.infer<typeof scheduleExceptionSchema>
export type WeeklyScheduleBreakInput = z.infer<typeof weeklyScheduleBreakSchema>
export type ClinicStaffInvitationInput = z.infer<typeof clinicStaffInvitationSchema>
export type VerificationReviewInput = z.infer<typeof verificationReviewSchema>

export type ClinicSummary = {
  id: string
  name: string
  city: string
  district: string
  status: VerificationStatus
  roles: ClinicMemberRole[]
}

export type VerificationQueueItem = {
  id: string
  targetType: 'clinic' | 'dentist'
  title: string
  subtitle: string
  status: VerificationStatus
  submittedAt: string
  documentCount: number
}
