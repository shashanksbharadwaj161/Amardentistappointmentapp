import type { MarketplaceDentist } from '@amar-dentist/domain'

export type Coordinates = { latitude: number; longitude: number }
export type NearbyMapProps = {
  items: MarketplaceDentist[]
  location: Coordinates | null
  selectedClinicId: string | null
  onHighlight: (clinicId: string) => void
  onSelect: (item: MarketplaceDentist) => void
  fitRequest: number
  locationRequest: number
  focusRequest: number
}
