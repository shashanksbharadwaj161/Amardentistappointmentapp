import type { MarketplaceDentist } from '@amar-dentist/domain'
import { isMarketplacePreview, type BookingSlot } from './phase3'
import { getCalendarAvailability } from './calendar-data'
import { supabase } from './supabase'
import { CLINIC_TIME_ZONE, clinicDate } from './calendar-dates'

export const PATIENT_CALENDAR_TIMEZONE = CLINIC_TIME_ZONE
export const patientDateKey = clinicDate
const DAY_MS = 86_400_000

export function patientCalendarDate(key: string): Date { return new Date(`${key}T12:00:00+06:00`) }

export function shiftPatientMonth(month: string, amount: number): string {
  const date = new Date(`${month}-01T00:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + amount)
  return date.toISOString().slice(0, 7)
}

export function patientMonthDays(month: string): Array<string | null> {
  const start = new Date(`${month}-01T00:00:00Z`)
  const last = new Date(`${shiftPatientMonth(month, 1)}-01T00:00:00Z`)
  last.setUTCDate(0)
  const result: Array<string | null> = Array.from({ length: start.getUTCDay() }, () => null)
  for (let day = 1; day <= last.getUTCDate(); day++) result.push(`${month}-${String(day).padStart(2, '0')}`)
  while (result.length % 7) result.push(null)
  return result
}

export function patientBookingWindow(month: string, now = new Date()): { from: string; through: string } | null {
  const today = patientDateKey(now)
  // The RPC bounds from_date to server current_date + 180 (UTC). Keep the same horizon.
  const horizon = new Date(new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`).getTime() + 180 * DAY_MS).toISOString().slice(0, 10)
  const start = `${month}-01`
  const end = new Date(new Date(`${shiftPatientMonth(month, 1)}-01T00:00:00Z`).getTime() - DAY_MS).toISOString().slice(0, 10)
  const from = start > today ? start : today
  const through = end < horizon ? end : horizon
  return from <= through ? { from, through } : null
}

export function groupPatientSlots(slots: BookingSlot[], now = new Date()): Record<string, BookingSlot[]> {
  const unique = new Map<string, BookingSlot>()
  for (const slot of slots) {
    const start = new Date(slot.startAt).getTime()
    const end = new Date(slot.endAt).getTime()
    if (Number.isFinite(start) && start > now.getTime() && Number.isFinite(end) && end > start) {
      unique.set(new Date(start).toISOString(), slot)
    }
  }
  const grouped: Record<string, BookingSlot[]> = {}
  for (const slot of [...unique.values()].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt))) {
    const key = patientDateKey(new Date(slot.startAt))
    ;(grouped[key] ??= []).push(slot)
  }
  return grouped
}

export function patientSlotPeriod(start: string): 'morning' | 'afternoon' | 'evening' {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: PATIENT_CALENDAR_TIMEZONE }).format(new Date(start)))
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
}

export async function getPatientCalendarSlots(item: MarketplaceDentist, month: string, now = new Date()): Promise<BookingSlot[]> {
  const window = patientBookingWindow(month, now)
  if (!window) return []
  if (isMarketplacePreview || !supabase) {
    // Patient and professional previews use the same weekly hours and booked visits.
    return getCalendarAvailability('00000000-0000-4000-8000-000000000001', item.clinicId, item.dentistId, item.serviceId, window.from, window.through)
  }
  const { data, error } = await supabase.rpc('available_clinic_slots', {
    target_clinic_id: item.clinicId, target_dentist_id: item.dentistId, target_service_id: item.serviceId,
    from_date: window.from, through_date: window.through,
  })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row: { start_at: string; end_at: string }) => ({ startAt: row.start_at, endAt: row.end_at }))
}

export async function releasePatientCalendarHold(holdId: string): Promise<void> {
  if (isMarketplacePreview || !supabase) return
  const { error } = await supabase.rpc('release_appointment_hold', { target_hold_id: holdId })
  if (error && error.message !== 'ACTIVE_HOLD_NOT_FOUND') throw new Error(error.message)
}
