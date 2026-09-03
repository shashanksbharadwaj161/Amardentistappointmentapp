import { describe, expect, it } from 'vitest'
import {
  clinicApplicationSchema,
  clinicServiceSchema,
  generateLocalAvailability,
  scheduleExceptionSchema,
  verificationReviewSchema,
  weeklyScheduleBreakSchema,
} from './index'

describe('Phase 2 validation', () => {
  it('requires paired coordinates and valid deposit pricing', () => {
    expect(clinicApplicationSchema.safeParse({
      name: 'Calm Dental', phone: '01700000000', email: '', address: '12 Care Road', district: 'Dhaka', city: 'Dhaka',
      latitude: 23.8, longitude: null,
    }).success).toBe(false)
    expect(clinicServiceSchema.safeParse({
      clinicId: '10000000-0000-4000-8000-000000000001', dentistId: null, name: 'Consultation',
      description: '', durationMinutes: 30, priceBdt: 500, depositBdt: 600,
    }).success).toBe(false)
  })

  it('requires reasons for non-approval decisions and clinic-wide closure scope', () => {
    expect(verificationReviewSchema.safeParse({
      targetType: 'clinic', targetId: '10000000-0000-4000-8000-000000000001', decision: 'rejected', reason: '',
    }).success).toBe(false)
    expect(scheduleExceptionSchema.safeParse({
      clinicId: '10000000-0000-4000-8000-000000000001', dentistId: '10000000-0000-4000-8000-000000000002',
      date: '2026-09-10', kind: 'clinic_closed', startTime: null, endTime: null, reason: 'Holiday',
    }).success).toBe(false)
  })

  it('rejects reversed recurring break times', () => {
    expect(weeklyScheduleBreakSchema.safeParse({ scheduleBlockId: '10000000-0000-4000-8000-000000000001', startTime: '13:00', endTime: '12:30', label: 'Lunch' }).success).toBe(false)
  })
})

describe('shared availability engine', () => {
  const base = {
    fromDate: '2026-09-07',
    throughDate: '2026-09-07',
    durationMinutes: 30,
    dentistId: 'dentist-1',
    scheduleBlocks: [{ id: 'monday', dayOfWeek: 1, startTime: '09:00', endTime: '12:00' }],
  }

  it('generates duration-aligned slots and removes break overlaps', () => {
    expect(generateLocalAvailability({ ...base, breaks: [{ scheduleBlockId: 'monday', startTime: '10:00', endTime: '10:30' }] }))
      .toEqual([
        { date: '2026-09-07', startTime: '09:00', endTime: '09:30' },
        { date: '2026-09-07', startTime: '09:30', endTime: '10:00' },
        { date: '2026-09-07', startTime: '10:30', endTime: '11:00' },
        { date: '2026-09-07', startTime: '11:00', endTime: '11:30' },
        { date: '2026-09-07', startTime: '11:30', endTime: '12:00' },
      ])
  })

  it('honors full-day closure, partial unavailability, and extra availability', () => {
    expect(generateLocalAvailability({ ...base, exceptions: [{ date: '2026-09-07', kind: 'clinic_closed', startTime: null, endTime: null }] })).toEqual([])
    expect(generateLocalAvailability({ ...base, exceptions: [
      { date: '2026-09-07', kind: 'unavailable', startTime: '09:30', endTime: '11:30', dentistId: 'dentist-1' },
      { date: '2026-09-07', kind: 'available', startTime: '13:00', endTime: '14:00', dentistId: 'dentist-1' },
    ] })).toEqual([
      { date: '2026-09-07', startTime: '09:00', endTime: '09:30' },
      { date: '2026-09-07', startTime: '11:30', endTime: '12:00' },
      { date: '2026-09-07', startTime: '13:00', endTime: '13:30' },
      { date: '2026-09-07', startTime: '13:30', endTime: '14:00' },
    ])
  })
})
