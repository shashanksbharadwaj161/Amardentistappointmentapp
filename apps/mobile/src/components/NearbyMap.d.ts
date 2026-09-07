import type { MarketplaceDentist } from '@amar-dentist/domain'
type Coordinates={latitude:number;longitude:number}
export function NearbyMap(props:{items:MarketplaceDentist[];location:Coordinates|null;onSelect:(item:MarketplaceDentist)=>void}):import('react').ReactElement
