import { describe, expect, it } from 'vitest'
import { canMarkNoShow, cancellationDisposition, holdExpiresAt, rankMarketplace, waitlistOfferExpiresAt } from './booking'
import { bookingHoldSchema, marketplaceFilterSchema, patientProfileSchema, waitlistRequestSchema, type MarketplaceDentist } from './phase3'

const now = new Date('2026-09-03T10:00:00.000Z')

describe('Phase 3 booking rules', () => {
  it('allows refund or transfer only at least 24 hours before the appointment', () => {
    expect(cancellationDisposition({ now, appointmentStartsAt: new Date('2026-09-04T10:00:00.000Z') })).toBe('refundable')
    expect(cancellationDisposition({ now, appointmentStartsAt: new Date('2026-09-04T10:00:00.000Z'), rescheduling: true })).toBe('transferable')
    expect(cancellationDisposition({ now, appointmentStartsAt: new Date('2026-09-04T09:59:59.000Z') })).toBe('forfeited')
  })

  it('waits fifteen minutes before a no-show can be recorded', () => {
    const start = new Date('2026-09-03T10:00:00.000Z')
    expect(canMarkNoShow(new Date('2026-09-03T10:14:59.999Z'), start)).toBe(false)
    expect(canMarkNoShow(new Date('2026-09-03T10:15:00.000Z'), start)).toBe(true)
  })

  it('uses ten-minute booking holds and fifteen-minute waitlist offers', () => {
    expect(holdExpiresAt(now).toISOString()).toBe('2026-09-03T10:10:00.000Z')
    expect(waitlistOfferExpiresAt(now).toISOString()).toBe('2026-09-03T10:15:00.000Z')
  })

  it('validates owned patient, marketplace, hold, and waitlist inputs', () => {
    expect(patientProfileSchema.safeParse({ relationship: 'child', fullName: 'A Patient', dateOfBirth: '2018-05-01' }).success).toBe(true)
    expect(marketplaceFilterSchema.safeParse({ latitude: 23.8, longitude: null }).success).toBe(false)
    expect(bookingHoldSchema.safeParse({ patientProfileId: crypto.randomUUID(), serviceId: crypto.randomUUID(), dentistId: crypto.randomUUID(), startAt: '2026-09-04T10:00:00+06:00' }).success).toBe(true)
    expect(waitlistRequestSchema.safeParse({ patientProfileId: crypto.randomUUID(), clinicId: crypto.randomUUID(), serviceId: crypto.randomUUID(), preferredDate: '2026-09-04', earliestTime: '15:00', latestTime: '09:00' }).success).toBe(false)
  })

  it('ranks strong nearby availability without hiding unrated clinics', () => {
    const base: MarketplaceDentist = { dentistId: 'd', clinicId: 'c', clinicName: 'B Clinic', dentistName: 'Dentist', professionalTitle: 'Dentist', specialties: [], languages: ['bn'], gender: null, yearsExperience: 3, serviceId: 's', serviceName: 'Consultation', durationMinutes: 30, priceBdt: 800, depositBdt: 200, rating: 4.7, reviewCount: 30, distanceKm: 3, nextAvailableAt: '2026-09-03T12:00:00.000Z', openNow: true }
    const ranked = rankMarketplace([
      { ...base, clinicId: 'far', clinicName: 'Far Clinic', distanceKm: 90, rating: 5 },
      { ...base, clinicId: 'near', clinicName: 'Near Clinic' },
      { ...base, clinicId: 'new', clinicName: 'New Clinic', rating: 0, reviewCount: 0, distanceKm: 1 },
    ], now)
    expect(ranked.map((item) => item.clinicId)).toEqual(['near', 'far', 'new'])
  })
})
