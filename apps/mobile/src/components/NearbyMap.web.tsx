import { readMapCoordinates, type MarketplaceDentist } from '@amar-dentist/domain'
import { divIcon, type Marker as LeafletMarker, type LatLngTuple } from 'leaflet'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import { useLocale } from '../providers/LocaleProvider'
import type { NearbyMapProps } from './NearbyMap.types'
import 'leaflet/dist/leaflet.css'
import './NearbyMap.web.css'

const dhaka: LatLngTuple = [23.764, 90.397]
type Clinic = { id: string; position: LatLngTuple; items: MarketplaceDentist[] }
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function MapController({ clinics, location, fitRequest, locationRequest }: Pick<NearbyMapProps, 'location' | 'fitRequest' | 'locationRequest'> & { clinics: Clinic[] }) {
  const map = useMap()
  const { t } = useLocale()
  const fit = useCallback(() => {
    if (clinics.length) map.fitBounds(clinics.map(clinic => clinic.position), { paddingTopLeft: [60, 66], paddingBottomRight: [76, 66], maxZoom: 14, animate: false })
    else if (location) map.setView([location.latitude, location.longitude], 12, { animate: false })
    else map.setView(dhaka, 12, { animate: false })
  }, [clinics, location, map])
  useEffect(() => { fit() }, [fit, fitRequest])
  useEffect(() => {
    if (location && locationRequest > 0) map.setView([location.latitude, location.longitude], 13, { animate: !reducedMotion() })
  }, [location, locationRequest, map])
  useEffect(() => {
    const observer = new ResizeObserver(() => { map.invalidateSize({ pan: false }); fit() })
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map, fit])
  return <div className="amar-map-controls" onDoubleClick={event => event.stopPropagation()}>
    <button type="button" aria-label={t('mapZoomIn')} title={t('mapZoomIn')} onClick={() => map.zoomIn(undefined, { animate: !reducedMotion() })}>+</button>
    <button type="button" aria-label={t('mapZoomOut')} title={t('mapZoomOut')} onClick={() => map.zoomOut(undefined, { animate: !reducedMotion() })}>−</button>
    <button type="button" className="amar-map-fit" aria-label={t('mapShowAll')} title={t('mapShowAll')} onClick={fit}>⛶</button>
  </div>
}

function ClinicMarker({ clinic, selected, onHighlight, onSelect, focusRequest }: { clinic: Clinic; selected: boolean } & Pick<NearbyMapProps, 'onHighlight' | 'onSelect' | 'focusRequest'>) {
  const marker = useRef<LeafletMarker>(null)
  const { locale, t } = useLocale()
  const currency = (value: number) => `৳${value.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-BD')}`
  const cheapest = Math.min(...clinic.items.map(item => item.priceBdt))
  const icon = useMemo(() => divIcon({
    className: `amar-price-marker${selected ? ' is-selected' : ''}`,
    html: `<span>${currency(cheapest)}</span>`,
    iconSize: [84, 44], iconAnchor: [42, 48], popupAnchor: [0, -42],
  }), [cheapest, locale, selected])
  useEffect(() => { if (selected) marker.current?.openPopup(); else marker.current?.closePopup() }, [selected, focusRequest])
  const clinicName = clinic.items[0]?.clinicName ?? ''
  useEffect(() => {
    marker.current?.getElement()?.setAttribute('aria-label', `${clinicName} · ${t('fromPrice')} ${currency(cheapest)}`)
  }, [clinicName, cheapest, locale, icon, t])
  return <Marker ref={marker} position={clinic.position} icon={icon} title={`${clinicName} · ${t('fromPrice')} ${currency(cheapest)}`} alt={clinicName} keyboard riseOnHover zIndexOffset={selected ? 1000 : 0} eventHandlers={{ click: () => onHighlight(clinic.id) }}>
    <Popup minWidth={220} maxWidth={280} autoPanPadding={[35, 60]}>
      <div className="amar-clinic-popup">
        <p className="amar-popup-label">{t('mapClinicOptions').replace('{count}', clinic.items.length.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-BD'))}</p>
        <h3>{clinicName}</h3>
        <div className="amar-popup-offerings">{clinic.items.map(item => <div className="amar-popup-offering" key={`${item.dentistId}-${item.serviceId}`}>
          <strong>{item.dentistName}</strong>
          <p>{item.serviceName} · {item.durationMinutes.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-BD')} {t('mapMinutes')}</p>
          <div><b>{currency(item.priceBdt)}</b><span>{item.reviewCount > 0 ? `${item.rating.toFixed(1)} ★ (${item.reviewCount})` : t('mapNoReviews')}</span></div>
          <button type="button" onClick={() => onSelect(item)}>{t('mapViewTimes')} <span aria-hidden="true">→</span></button>
        </div>)}</div>
      </div>
    </Popup>
  </Marker>
}

export function NearbyMap(props: NearbyMapProps) {
  const { items, location, selectedClinicId, onHighlight, onSelect } = props
  const { t } = useLocale()
  const hasTileError = useRef(false)
  const [tileStatus, setTileStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [attempt, setAttempt] = useState(0)
  const clinics = useMemo(() => {
    const grouped = new Map<string, Clinic>()
    for (const item of items) {
      const point = readMapCoordinates(item.latitude, item.longitude)
      if (!point) continue
      const clinic = grouped.get(item.clinicId)
      if (clinic) clinic.items.push(item)
      else grouped.set(item.clinicId, { id: item.clinicId, position: [point.latitude, point.longitude], items: [item] })
    }
    return Array.from(grouped.values())
  }, [items])
  useEffect(() => {
    const timeout = window.setTimeout(() => setTileStatus(status => status === 'loading' ? 'error' : status), 12000)
    return () => window.clearTimeout(timeout)
  }, [attempt])
  const retry = () => { hasTileError.current = false; setTileStatus('loading'); setAttempt(value => value + 1) }
  return <div className="amar-nearby-map" role="region" aria-label={t('nearbyMap')}>
    <MapContainer center={dhaka} zoom={12} minZoom={2} maxZoom={19} scrollWheelZoom={false} zoomControl={false} attributionControl keyboard className="amar-map-canvas">
      <TileLayer key={attempt} url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' className="amar-map-tiles" maxZoom={19} keepBuffer={2} eventHandlers={{
        tileerror: () => { hasTileError.current = true; setTileStatus('error') },
        tileload: () => { if (!hasTileError.current) setTileStatus('ready') },
      }} />
      <MapController clinics={clinics} location={location} fitRequest={props.fitRequest} locationRequest={props.locationRequest} />
      {location && readMapCoordinates(location.latitude, location.longitude) ? <CircleMarker center={[location.latitude, location.longitude]} radius={8} pathOptions={{ color: '#FFFFFF', weight: 3, fillColor: '#3086CE', fillOpacity: 1 }}><Popup>{t('mapCurrentLocation')}</Popup></CircleMarker> : null}
      {clinics.map(clinic => <ClinicMarker key={clinic.id} clinic={clinic} selected={selectedClinicId === clinic.id} onHighlight={onHighlight} onSelect={onSelect} focusRequest={props.focusRequest} />)}
    </MapContainer>
    <div className="amar-map-context"><span className="amar-map-context-dot" />{t('mapExplore')}</div>
    {tileStatus !== 'ready' ? <div className="amar-map-notice" role="status">
      <span>{t(tileStatus === 'error' ? 'mapLoadError' : 'mapLoading')}</span>
      {tileStatus === 'error' ? <button type="button" onClick={retry}>{t('mapRetry')}</button> : null}
    </div> : null}
    <div className="amar-map-hint">{t('mapGestureHint')}</div>
  </div>
}
