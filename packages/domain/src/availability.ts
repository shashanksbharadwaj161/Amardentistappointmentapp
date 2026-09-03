import type { ScheduleExceptionKind } from './phase2'

export type AvailabilityScheduleBlock = {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
  active?: boolean
}

export type AvailabilityBreak = {
  scheduleBlockId: string
  startTime: string
  endTime: string
}

export type AvailabilityException = {
  date: string
  kind: ScheduleExceptionKind
  startTime: string | null
  endTime: string | null
  dentistId?: string | null
}

export type LocalAvailabilitySlot = { date: string; startTime: string; endTime: string }

function minutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number)
  return hour! * 60 + minute!
}

function time(total: number): string {
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function datesBetween(start: string, end: string): string[] {
  const result: string[] = []
  const cursor = new Date(`${start}T00:00:00Z`)
  const finish = new Date(`${end}T00:00:00Z`)
  while (cursor <= finish) {
    result.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  return result
}

function overlaps(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA < endB && endA > startB
}

export function generateLocalAvailability(input: {
  fromDate: string
  throughDate: string
  durationMinutes: number
  dentistId: string
  scheduleBlocks: AvailabilityScheduleBlock[]
  breaks?: AvailabilityBreak[]
  exceptions?: AvailabilityException[]
}): LocalAvailabilitySlot[] {
  const { fromDate, throughDate, durationMinutes, dentistId, scheduleBlocks } = input
  if (durationMinutes < 5 || durationMinutes % 5 !== 0 || throughDate < fromDate) return []
  const result = new Map<string, LocalAvailabilitySlot>()
  const allBreaks = input.breaks ?? []
  const allExceptions = input.exceptions ?? []

  for (const date of datesBetween(fromDate, throughDate)) {
    const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay()
    const dateExceptions = allExceptions.filter((exception) => exception.date === date && (!exception.dentistId || exception.dentistId === dentistId))
    const closed = dateExceptions.some((exception) =>
      (exception.kind === 'clinic_closed' || exception.kind === 'unavailable') && exception.startTime === null,
    )
    if (closed) continue

    const windows = scheduleBlocks
      .filter((block) => block.active !== false && block.dayOfWeek === dayOfWeek)
      .map((block) => ({ id: block.id, start: minutes(block.startTime), end: minutes(block.endTime) }))
    for (const exception of dateExceptions) {
      if (exception.kind === 'available' && exception.startTime && exception.endTime) {
        windows.push({ id: `exception:${date}:${exception.startTime}`, start: minutes(exception.startTime), end: minutes(exception.endTime) })
      }
    }

    for (const window of windows) {
      for (let start = window.start; start + durationMinutes <= window.end; start += durationMinutes) {
        const end = start + durationMinutes
        const blockedByBreak = allBreaks.some((item) => item.scheduleBlockId === window.id
          && overlaps(start, end, minutes(item.startTime), minutes(item.endTime)))
        const blockedByException = dateExceptions.some((exception) => exception.kind === 'unavailable'
          && exception.startTime && exception.endTime
          && overlaps(start, end, minutes(exception.startTime), minutes(exception.endTime)))
        if (blockedByBreak || blockedByException) continue
        const slot = { date, startTime: time(start), endTime: time(end) }
        result.set(`${date}:${slot.startTime}:${slot.endTime}`, slot)
      }
    }
  }

  return [...result.values()].sort((left, right) => `${left.date}${left.startTime}`.localeCompare(`${right.date}${right.startTime}`))
}
