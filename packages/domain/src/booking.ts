import type { MarketplaceDentist } from './phase3'

export type DepositDisposition = 'refundable' | 'transferable' | 'forfeited'

export function cancellationDisposition(input: {
  now: Date
  appointmentStartsAt: Date
  rescheduling?: boolean
}): DepositDisposition {
  const hoursUntilStart = (input.appointmentStartsAt.getTime() - input.now.getTime()) / 3_600_000
  if (hoursUntilStart >= 24) return input.rescheduling ? 'transferable' : 'refundable'
  return 'forfeited'
}

export function canMarkNoShow(now: Date, appointmentStartsAt: Date): boolean {
  return now.getTime() >= appointmentStartsAt.getTime() + 15 * 60_000
}

export function holdExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + 10 * 60_000)
}

export function waitlistOfferExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + 15 * 60_000)
}

function normalizedDistance(value: number | null): number {
  return value === null ? 250 : Math.min(250, Math.max(0, value))
}

function availabilityDelayHours(value: string | null, now: Date): number {
  if (!value) return 24 * 31
  return Math.max(0, Math.min(24 * 31, (new Date(value).getTime() - now.getTime()) / 3_600_000))
}

export function rankMarketplace(items: MarketplaceDentist[], now = new Date()): MarketplaceDentist[] {
  return [...items].sort((left, right) => {
    const score = (item: MarketplaceDentist) =>
      item.rating * 18
      + Math.min(20, Math.log10(item.reviewCount + 1) * 10)
      + (item.openNow ? 8 : 0)
      - normalizedDistance(item.distanceKm) * 0.18
      - availabilityDelayHours(item.nextAvailableAt, now) * 0.025
    const difference = score(right) - score(left)
    return difference || left.clinicName.localeCompare(right.clinicName) || left.dentistName.localeCompare(right.dentistName)
  })
}
