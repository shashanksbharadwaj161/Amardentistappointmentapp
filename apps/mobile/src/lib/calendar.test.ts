jest.mock('./supabase', () => ({ supabase: { rpc: jest.fn() } }))
jest.mock('./phase3', () => ({ isMarketplacePreview: false, getBookingSlots: jest.fn(), getClinicOperationsContext: jest.fn() }))
jest.mock('./phase2', () => ({ getCalendarContext: jest.fn(), getProfessionalOverview: jest.fn() }))

import type { MarketplaceDentist } from '@amar-dentist/domain'
import { addCalendarDays, calendarWeek, clinicDate, clinicDayStart, formatClinicTime } from './calendar-dates'
import { getCalendarAppointments, getCalendarAvailability } from './calendar-data'
import { getPatientCalendarSlots, groupPatientSlots, patientBookingWindow, patientMonthDays, patientSlotPeriod, releasePatientCalendarHold, shiftPatientMonth } from './patient-calendar'
import { supabase } from './supabase'

describe('clinic-local calendar dates', () => {
  it('changes dates at midnight in Bangladesh, not the device or UTC midnight', () => {
    expect(clinicDate('2026-09-07T17:59:59Z')).toBe('2026-09-07')
    expect(clinicDate('2026-09-07T18:00:00Z')).toBe('2026-09-08')
    expect(clinicDayStart('2026-09-08')).toBe('2026-09-07T18:00:00.000Z')
    expect(formatClinicTime('2026-09-07T18:05:00Z', 'en')).toBe('00:05')
  })
  it('navigates a complete Sunday-start week across month and year boundaries', () => {
    expect(calendarWeek('2026-01-01')).toEqual(['2025-12-28', '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03'])
    expect(addCalendarDays('2024-02-28', 1)).toBe('2024-02-29')
    expect(shiftPatientMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftPatientMonth('2026-01', -1)).toBe('2025-12')
  })
  it('builds aligned month grids with correct leap days', () => {
    const leap = patientMonthDays('2024-02')
    expect(leap.slice(0, 4)).toEqual([null, null, null, null])
    expect(leap.filter(Boolean)).toHaveLength(29)
    expect(leap).toContain('2024-02-29')
    expect(patientMonthDays('2025-02').filter(Boolean)).toHaveLength(28)
    expect(patientMonthDays('2026-08')).toHaveLength(42)
  })
  it('bounds availability requests to future local dates and the server horizon', () => {
    const now = new Date('2026-09-07T20:00:00Z')
    expect(patientBookingWindow('2026-09', now)).toEqual({ from: '2026-09-08', through: '2026-09-30' })
    expect(patientBookingWindow('2026-08', now)).toBeNull()
    expect(patientBookingWindow('2027-03', now)).toEqual({ from: '2027-03-01', through: '2027-03-06' })
    expect(patientBookingWindow('2027-04', now)).toBeNull()
  })
  it('discards stale, invalid and duplicate slots and groups by clinic date', () => {
    const result = groupPatientSlots([
      { startAt: '2026-09-07T19:00:00Z', endAt: '2026-09-07T19:30:00Z' },
      { startAt: '2026-09-08T01:00:00+06:00', endAt: '2026-09-08T01:30:00+06:00' },
      { startAt: '2026-09-07T18:30:00Z', endAt: '2026-09-07T19:00:00Z' },
      { startAt: '2026-09-07T17:00:00Z', endAt: '2026-09-07T17:30:00Z' },
      { startAt: 'bad', endAt: 'bad' },
      { startAt: '2026-09-07T20:00:00Z', endAt: '2026-09-07T19:30:00Z' },
    ], new Date('2026-09-07T18:00:00Z'))
    expect(Object.keys(result)).toEqual(['2026-09-08'])
    expect(result['2026-09-08']).toHaveLength(2)
    expect(result['2026-09-08']![0]!.startAt).toBe('2026-09-07T18:30:00Z')
    expect(patientSlotPeriod('2026-09-08T05:59:00Z')).toBe('morning')
    expect(patientSlotPeriod('2026-09-08T06:00:00Z')).toBe('afternoon')
    expect(patientSlotPeriod('2026-09-08T11:00:00Z')).toBe('evening')
  })
})

describe('calendar server contracts', () => {
  const rpc = jest.mocked(supabase!.rpc)
  beforeEach(() => { jest.useFakeTimers().setSystemTime(new Date('2026-09-07T20:00:00Z')); rpc.mockReset(); rpc.mockResolvedValue({ data: [], error: null } as never) })
  afterEach(() => jest.useRealTimers())
  it('requests the selected month with trusted clinic, dentist and service IDs', async () => {
    await getPatientCalendarSlots({ clinicId: 'clinic', dentistId: 'dentist', serviceId: 'service' } as MarketplaceDentist, '2026-09')
    expect(rpc).toHaveBeenCalledWith('available_clinic_slots', { target_clinic_id: 'clinic', target_dentist_id: 'dentist', target_service_id: 'service', from_date: '2026-09-08', through_date: '2026-09-30' })
  })
  it('releases the active hold through the authenticated RPC before editing', async () => {
    await releasePatientCalendarHold('hold')
    expect(rpc).toHaveBeenCalledWith('release_appointment_hold', { target_hold_id: 'hold' })
    rpc.mockResolvedValue({ data: null, error: { message: 'NETWORK_ERROR' } } as never)
    await expect(releasePatientCalendarHold('hold')).rejects.toThrow('NETWORK_ERROR')
    rpc.mockResolvedValue({ data: null, error: { message: 'ACTIVE_HOLD_NOT_FOUND' } } as never)
    await expect(releasePatientCalendarHold('expired')).resolves.toBeUndefined()
  })
  it('queries visits for the entire local week using exclusive next-day midnight', async () => {
    await getCalendarAppointments('user', 'clinic', '2026-09-06', '2026-09-12')
    expect(rpc).toHaveBeenCalledWith('list_clinic_appointments', { target_clinic_id: 'clinic', from_at: '2026-09-05T18:00:00.000Z', through_at: '2026-09-12T18:00:00.000Z' })
  })
  it('keeps past days view-only and clips weeks that include past days', async () => {
    expect(await getCalendarAvailability('user', 'clinic', 'dentist', 'service', '2026-09-01', '2026-09-07')).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
    await getCalendarAvailability('user', 'clinic', 'dentist', 'service', '2026-09-06', '2026-09-12')
    expect(rpc).toHaveBeenCalledWith('available_clinic_slots', { target_clinic_id: 'clinic', target_dentist_id: 'dentist', target_service_id: 'service', from_date: '2026-09-08', through_date: '2026-09-12' })
  })
  it('does not convert server failures to an empty schedule', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'CLINIC_SCHEDULE_DENIED' } } as never)
    await expect(getCalendarAppointments('user', 'clinic', '2026-09-06', '2026-09-12')).rejects.toThrow('CLINIC_SCHEDULE_DENIED')
  })
})
