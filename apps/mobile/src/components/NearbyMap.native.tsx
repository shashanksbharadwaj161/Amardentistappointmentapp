import { readMapCoordinates, type MarketplaceDentist } from '@amar-dentist/domain'
import { useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native'
import MapView, { Callout, Marker, type LatLng } from 'react-native-maps'
import { useLocale } from '../providers/LocaleProvider'
import { colors } from '../theme'
import type { NearbyMapProps } from './NearbyMap.types'

const dhaka = { latitude: 23.7808, longitude: 90.4077, latitudeDelta: 0.09, longitudeDelta: 0.09 }
const edgePadding = { top: 80, right: 52, bottom: 80, left: 52 }
type ClinicMarker = { clinicId: string; coordinate: LatLng; items: MarketplaceDentist[] }

export function NearbyMap({
  items, location, onSelect, selectedClinicId, onHighlight, fitRequest, locationRequest, focusRequest,
}: NearbyMapProps) {
  const { locale, t } = useLocale()
  const map = useRef<MapView>(null)
  const lastFit = useRef('')
  const [ready, setReady] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(true)
  const clinics = useMemo(() => {
    const groups = new Map<string, ClinicMarker>()
    for (const item of items) {
      const coordinate = readMapCoordinates(item.latitude, item.longitude)
      if (!coordinate) continue
      const existing = groups.get(item.clinicId)
      if (existing) existing.items.push(item)
      else groups.set(item.clinicId, { clinicId: item.clinicId, coordinate, items: [item] })
    }
    return [...groups.values()].map((clinic) => ({
      ...clinic,
      items: clinic.items.sort((a, b) => a.priceBdt - b.priceBdt || a.dentistName.localeCompare(b.dentistName)),
    }))
  }, [items])
  const selected = clinics.find((clinic) => clinic.clinicId === selectedClinicId)
  const currentLocation = readMapCoordinates(location?.latitude, location?.longitude)
  const currency = useMemo(() => new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-BD', {
    style: 'currency', currency: 'BDT', maximumFractionDigits: 0,
  }), [locale])

  useEffect(() => {
    let mounted = true
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled)
    }).catch(() => { /* Keep the motion-free default when accessibility settings are unavailable. */ })
    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => { mounted = false; listener.remove() }
  }, [])

  // Results arrive after the map mounts. Only camera-relevant changes should reset its bounds.
  useEffect(() => {
    if (!ready || !map.current || !clinics.length) return
    const bounds = clinics.map(({ clinicId, coordinate }) => `${clinicId}:${coordinate.latitude},${coordinate.longitude}`).sort().join('|')
    const fitKey = `${fitRequest}|${bounds}`
    if (lastFit.current === fitKey) return
    lastFit.current = fitKey
    if (clinics.length === 1) {
      map.current.animateToRegion({ ...clinics[0]!.coordinate, latitudeDelta: 0.022, longitudeDelta: 0.022 }, reduceMotion ? 0 : 350)
    } else {
      map.current.fitToCoordinates(clinics.map((clinic) => clinic.coordinate), { edgePadding, animated: !reduceMotion })
    }
  }, [clinics, fitRequest, ready, reduceMotion])

  useEffect(() => {
    const coordinate = readMapCoordinates(selected?.coordinate.latitude, selected?.coordinate.longitude)
    if (ready && coordinate) {
      map.current?.animateToRegion({ ...coordinate, latitudeDelta: 0.012, longitudeDelta: 0.012 }, reduceMotion ? 0 : 350)
    }
  }, [selectedClinicId, selected?.coordinate.latitude, selected?.coordinate.longitude, focusRequest, ready, reduceMotion])

  useEffect(() => {
    const coordinate = readMapCoordinates(location?.latitude, location?.longitude)
    if (ready && coordinate && locationRequest > 0) {
      map.current?.animateToRegion({ ...coordinate, latitudeDelta: 0.025, longitudeDelta: 0.025 }, reduceMotion ? 0 : 350)
    }
  }, [location?.latitude, location?.longitude, locationRequest, ready, reduceMotion])

  return (
    <MapView
      ref={map}
      style={StyleSheet.absoluteFill}
      initialRegion={dhaka}
      userInterfaceStyle="dark"
      onMapReady={() => setReady(true)}
      showsUserLocation={Boolean(currentLocation)}
      showsMyLocationButton={false}
      showsCompass
      showsScale
      loadingEnabled
      loadingBackgroundColor={colors.mapNight}
      loadingIndicatorColor={colors.mint}
      toolbarEnabled={false}
      rotateEnabled={false}
      pitchEnabled={false}
    >
      {clinics.map((clinic) => {
        const first = clinic.items[0]!
        const highlighted = clinic.clinicId === selectedClinicId
        const isOpen = clinic.items.some((item) => item.openNow)
        return (
          <Marker
            key={clinic.clinicId}
            identifier={clinic.clinicId}
            coordinate={clinic.coordinate}
            pinColor={highlighted ? colors.mint : isOpen ? colors.teal : colors.muted}
            zIndex={highlighted ? 10 : 1}
            title={first.clinicName}
            description={currency.format(first.priceBdt)}
            accessibilityLabel={`${first.clinicName}, ${currency.format(first.priceBdt)}`}
            onPress={() => onHighlight(clinic.clinicId)}
          >
            <Callout onPress={() => onSelect(first)} accessibilityRole="button" accessibilityLabel={`${t('mapViewTimes')}: ${first.serviceName}`}>
              <View style={styles.callout}>
                <Text style={styles.title}>{first.clinicName}</Text>
                <Text style={styles.secondary}>{t('mapClinicOptions').replace('{count}', String(clinic.items.length))}</Text>
                <View style={styles.divider} />
                <Text style={styles.dentist}>{first.dentistName}</Text>
                <Text style={styles.secondary}>{first.serviceName}</Text>
                <Text style={styles.price}>{currency.format(first.priceBdt)}</Text>
                <Text style={styles.link}>{t('mapViewTimes')} →</Text>
              </View>
            </Callout>
          </Marker>
        )
      })}
    </MapView>
  )
}

const styles = StyleSheet.create({
  callout: { width: 224, gap: 5, padding: 9, borderRadius: 10, backgroundColor: colors.paper },
  title: { color: colors.inkDeep, fontSize: 16, lineHeight: 22, fontWeight: '800' },
  secondary: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  divider: { marginVertical: 5, height: 1, backgroundColor: colors.line },
  dentist: { color: colors.ink, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  price: { color: colors.ink, fontSize: 17, fontWeight: '700', lineHeight: 24 },
  link: { marginTop: 5, color: colors.teal, fontSize: 14, lineHeight: 20, fontWeight: '700' },
})
