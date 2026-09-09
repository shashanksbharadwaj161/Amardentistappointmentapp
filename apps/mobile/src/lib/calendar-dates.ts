export const CLINIC_TIME_ZONE = 'Asia/Dhaka'

/** Calendar dates are clinic-local civil dates, never the device's UTC date. */
export function clinicDate(value: Date | string = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function calendarWeek(date: string): string[] {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay()
  const first = addCalendarDays(date, -weekday)
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(first, index))
}

export function clinicDayStart(date: string): string {
  return new Date(`${date}T00:00:00+06:00`).toISOString()
}

export function formatCalendarDate(date: string, locale: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', { ...options, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
}

export function formatClinicTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', { timeZone: CLINIC_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value))
}
