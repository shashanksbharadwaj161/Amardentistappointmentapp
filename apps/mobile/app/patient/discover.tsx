import { marketplaceFilterSchema, rankMarketplace, type MarketplaceDentist } from '@amar-dentist/domain'
import { useQuery } from '@tanstack/react-query'
import { Redirect, router, Stack } from 'expo-router'
import { CheckCircle2, ChevronRight, LocateFixed, MapPin, Search, SlidersHorizontal, Star } from 'lucide-react-native'
import { useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Screen } from '../../src/components/Screen'
import { requestCurrentLocation, searchMarketplace } from '../../src/lib/phase3'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, hitTarget, radius, shadow, spacing } from '../../src/theme'

export default function DiscoverDentistsScreen() {
  const { profile, loading } = useAuth()
  const { locale, t } = useLocale()
  const [query, setQuery] = useState('')
  const [openNow, setOpenNow] = useState(false)
  const [mapVisible, setMapVisible] = useState(true)
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locationMessage, setLocationMessage] = useState<string | null>(null)
  const filters = useMemo(() => marketplaceFilterSchema.parse({ query, openNow, latitude: location?.latitude ?? null, longitude: location?.longitude ?? null }), [location, openNow, query])
  const marketplace = useQuery({ queryKey: ['marketplace', filters], queryFn: () => searchMarketplace(filters), enabled: Boolean(profile) })
  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null
  const items = rankMarketplace(marketplace.data ?? [])

  const locate = async () => {
    try {
      const current = await requestCurrentLocation()
      setLocation(current)
      setLocationMessage(current ? t('locationReady') : t('locationDenied'))
    } catch { setLocationMessage(t('locationDenied')) }
  }
  const openDentist = (item: MarketplaceDentist) => router.push({ pathname: '/patient/dentist', params: { item: JSON.stringify(item) } })

  return <Screen maxWidth={920} style={styles.screen}>
    <Stack.Screen options={{ title: t('discoverDentists'), headerBackTitle: t('back') }} />
    <View style={styles.heading}><Text style={styles.kicker}>{t('nearbyMap')}</Text><Text style={styles.title}>{t('discoverDentists')}</Text><Text style={styles.subtitle}>{t('discoverSubtitle')}</Text></View>
    <View style={styles.searchRow}><View style={styles.searchBox}><Search size={19} color={colors.muted} /><TextInput accessibilityLabel={t('searchDentistClinic')} placeholder={t('searchDentistClinic')} placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} style={styles.searchInput} /></View><Pressable accessibilityRole="button" accessibilityLabel={t('filters')} style={styles.filterButton}><SlidersHorizontal size={20} color={colors.ink} /></Pressable></View>
    <View style={styles.controls}><View style={styles.segment}><Pressable accessibilityRole="tab" accessibilityState={{ selected: mapVisible }} style={[styles.segmentButton, mapVisible && styles.segmentActive]} onPress={() => setMapVisible(true)}><Text style={[styles.segmentText, mapVisible && styles.segmentTextActive]}>{t('mapList')}</Text></Pressable><Pressable accessibilityRole="tab" accessibilityState={{ selected: !mapVisible }} style={[styles.segmentButton, !mapVisible && styles.segmentActive]} onPress={() => setMapVisible(false)}><Text style={[styles.segmentText, !mapVisible && styles.segmentTextActive]}>{t('listOnly')}</Text></Pressable></View><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: openNow }} style={[styles.chip, openNow && styles.chipActive]} onPress={() => setOpenNow((value) => !value)}><View style={[styles.chipDot, openNow && styles.chipDotActive]} /><Text style={[styles.chipText, openNow && styles.chipTextActive]}>{t('openNow')}</Text></Pressable></View>

    {mapVisible ? <View style={styles.map} accessibilityLabel={t('nearbyMap')}>
      <View style={styles.roadOne} /><View style={styles.roadTwo} /><View style={styles.roadThree} />
      {items.slice(0, 3).map((item, index) => <Pressable key={item.clinicId} accessibilityRole="button" accessibilityLabel={`${item.clinicName}, ${item.distanceKm ?? ''}`} onPress={() => openDentist(item)} style={[styles.marker, index === 0 ? styles.markerOne : index === 1 ? styles.markerTwo : styles.markerThree]}><MapPin size={18} color={colors.inkDeep} fill={colors.mint} /></Pressable>)}
      <View style={styles.mapLabel}><LocateFixed size={14} color={colors.cyan} /><Text style={styles.mapLabelText}>{location ? t('locationReady') : t('locationOptional')}</Text></View>
    </View> : null}

    <Button label={t('useMyLocation')} variant="secondary" onPress={() => void locate()} />
    {locationMessage ? <View style={styles.locationNote}><CheckCircle2 size={16} color={colors.teal} /><Text style={styles.locationText}>{locationMessage}</Text></View> : null}

    {marketplace.isLoading ? <ActivityIndicator color={colors.teal} style={styles.loader} /> : marketplace.isError ? <View style={styles.error}><Text style={styles.errorText}>{t('authUnavailable')}</Text><Button label={t('retry')} variant="secondary" onPress={() => void marketplace.refetch()} /></View> : <View style={styles.list}>{items.map((item) => <Pressable key={`${item.clinicId}-${item.dentistId}-${item.serviceId}`} accessibilityRole="button" onPress={() => openDentist(item)} style={styles.card}>
      <View style={styles.cardTop}><View style={styles.avatar}><Text style={styles.avatarText}>{item.dentistName.split(' ').at(-1)?.slice(0, 1)}</Text></View><View style={styles.cardCopy}><View style={styles.verifiedRow}><Text style={styles.name}>{item.dentistName}</Text><CheckCircle2 size={15} color={colors.teal} /></View><Text style={styles.clinic}>{item.professionalTitle} · {item.clinicName}</Text><Text style={styles.specialty} numberOfLines={1}>{item.specialties.join(' · ')}</Text></View><ChevronRight size={20} color={colors.muted} /></View>
      <View style={styles.metaRow}><View style={styles.rating}><Star size={14} color={colors.warning} fill={colors.warning} /><Text style={styles.metaStrong}>{item.rating.toFixed(1)}</Text><Text style={styles.metaQuiet}>({item.reviewCount} {t('reviews')})</Text></View>{item.distanceKm !== null ? <Text style={styles.metaQuiet}>{item.distanceKm.toFixed(1)} km {t('distanceAway')}</Text> : null}</View>
      <View style={styles.cardFooter}><View><Text style={styles.priceLabel}>{t('fromPrice')}</Text><Text style={styles.price}>৳{item.priceBdt.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-BD')} <Text style={styles.priceMeta}>· {item.durationMinutes} min</Text></Text></View><View style={styles.availability}><View style={styles.availableDot} /><Text style={styles.availableText}>{item.openNow ? t('openNow') : t('availableSoon')}</Text></View></View>
    </Pressable>)}</View>}
  </Screen>
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xl }, heading: { gap: spacing.sm, marginBottom: spacing.xl },
  kicker: { color: colors.teal, fontSize: 11, fontWeight: '800', letterSpacing: 1.2 }, title: { color: colors.inkDeep, fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -1.2 }, subtitle: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  searchRow: { flexDirection: 'row', gap: spacing.sm }, searchBox: { minHeight: hitTarget, flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md }, searchInput: { flex: 1, color: colors.text, fontSize: 14 }, filterButton: { width: hitTarget, height: hitTarget, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper },
  controls: { marginVertical: spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }, segment: { flexDirection: 'row', padding: 3, backgroundColor: '#E8EFED', borderRadius: radius.pill }, segmentButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.pill }, segmentActive: { backgroundColor: colors.paper, ...shadow }, segmentText: { color: colors.muted, fontSize: 12, fontWeight: '700' }, segmentTextActive: { color: colors.ink },
  chip: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: spacing.md, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper }, chipActive: { borderColor: colors.mint, backgroundColor: colors.mintSoft }, chipDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.line }, chipDotActive: { backgroundColor: colors.success }, chipText: { color: colors.muted, fontSize: 11, fontWeight: '700' }, chipTextActive: { color: colors.ink },
  map: { height: 240, marginBottom: spacing.lg, overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.mapNight, borderWidth: 1, borderColor: '#1C3442' }, roadOne: { position: 'absolute', width: '130%', height: 4, top: 94, left: -40, backgroundColor: '#27414E', transform: [{ rotate: '-8deg' }] }, roadTwo: { position: 'absolute', width: 4, height: '140%', top: -30, left: '58%', backgroundColor: '#223B48', transform: [{ rotate: '22deg' }] }, roadThree: { position: 'absolute', width: '80%', height: 2, top: 170, left: 40, backgroundColor: '#305160', transform: [{ rotate: '14deg' }] }, marker: { position: 'absolute', width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20, backgroundColor: '#173645', borderWidth: 1, borderColor: colors.cyan }, markerOne: { left: '20%', top: 56 }, markerTwo: { right: '22%', top: 92 }, markerThree: { left: '46%', bottom: 38 }, mapLabel: { position: 'absolute', left: spacing.md, right: spacing.md, bottom: spacing.md, minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: '#111F29E8' }, mapLabelText: { flex: 1, color: '#C5D7DE', fontSize: 11 },
  locationNote: { flexDirection: 'row', gap: 8, marginTop: spacing.md, alignItems: 'flex-start' }, locationText: { flex: 1, color: colors.muted, fontSize: 11, lineHeight: 17 }, loader: { marginVertical: spacing.xxxl }, error: { gap: spacing.md, paddingVertical: spacing.xl }, errorText: { color: colors.danger }, list: { gap: spacing.md, marginTop: spacing.xl }, card: { padding: spacing.lg, gap: spacing.md, backgroundColor: colors.paper, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line }, cardTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md }, avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.mintSoft }, avatarText: { color: colors.teal, fontSize: 18, fontWeight: '800' }, cardCopy: { flex: 1, gap: 3 }, verifiedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 }, name: { color: colors.inkDeep, fontSize: 15, fontWeight: '800' }, clinic: { color: colors.muted, fontSize: 12 }, specialty: { color: colors.teal, fontSize: 11, fontWeight: '600' }, metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }, rating: { flexDirection: 'row', alignItems: 'center', gap: 4 }, metaStrong: { color: colors.ink, fontSize: 12, fontWeight: '800' }, metaQuiet: { color: colors.muted, fontSize: 11 }, cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }, priceLabel: { color: colors.muted, fontSize: 10 }, price: { color: colors.inkDeep, fontSize: 17, fontWeight: '800' }, priceMeta: { color: colors.muted, fontSize: 11, fontWeight: '500' }, availability: { flexDirection: 'row', alignItems: 'center', gap: 6 }, availableDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success }, availableText: { color: colors.success, fontSize: 11, fontWeight: '700' },
})
