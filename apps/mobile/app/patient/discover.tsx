import { distanceBetweenKm, marketplaceFilterSchema, rankMarketplace, readMapCoordinates, type MarketplaceDentist } from '@amar-dentist/domain'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Redirect, router, Stack } from 'expo-router'
import { ArrowRight, Check, CheckCircle2, Clock3, List, LocateFixed, Map, MapPin, Search, SlidersHorizontal, Star, X } from 'lucide-react-native'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Field } from '../../src/components/Field'
import { NearbyMap } from '../../src/components/NearbyMap'
import type { Coordinates } from '../../src/components/NearbyMap.types'
import { Screen } from '../../src/components/Screen'
import { isMarketplacePreview, requestCurrentLocation, searchMarketplace } from '../../src/lib/phase3'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors } from '../../src/theme'

export default function DiscoverDentistsScreen() {
  const { profile, loading } = useAuth()
  const { locale, t } = useLocale()
  const { width, height } = useWindowDimensions()
  const wide = width >= 1050
  const compact = width < 600
  const numberLocale = locale === 'bn' ? 'bn-BD' : 'en-BD'
  const count = (key: 'mapCareOptions' | 'mapLocations', value: number) => t(key).replace('{count}', value.toLocaleString(numberLocale))
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [openNow, setOpenNow] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [specialty, setSpecialty] = useState('')
  const [maximumPrice, setMaximumPrice] = useState('')
  const [minimumRating, setMinimumRating] = useState(0)
  const [gender, setGender] = useState<'female' | 'male' | null>(null)
  const [language, setLanguage] = useState<'bn' | 'en' | null>(null)
  const [mapVisible, setMapVisible] = useState(true)
  const [location, setLocation] = useState<Coordinates | null>(null)
  const [nearby, setNearby] = useState(false)
  const [locating, setLocating] = useState(false)
  const [locationFailed, setLocationFailed] = useState(false)
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null)
  const [fitRequest, setFitRequest] = useState(0)
  const [locationRequest, setLocationRequest] = useState(0)
  const [focusRequest, setFocusRequest] = useState(0)
  const [sort, setSort] = useState<'recommended' | 'price' | 'nearest'>('recommended')
  const resultsScroll = useRef<ScrollView>(null)
  useEffect(() => { const timer = setTimeout(() => setDebouncedQuery(query), 300); return () => clearTimeout(timer) }, [query])
  const parsed = useMemo(() => marketplaceFilterSchema.safeParse({ query: debouncedQuery, specialty, gender, language, maxPriceBdt: maximumPrice.trim() ? Number(maximumPrice) : null, minimumRating, openNow, latitude: nearby ? location?.latitude ?? null : null, longitude: nearby ? location?.longitude ?? null : null }), [debouncedQuery, gender, language, location, maximumPrice, minimumRating, nearby, openNow, specialty])
  const marketplace = useQuery({ queryKey: ['marketplace', parsed.success ? parsed.data : null], queryFn: () => searchMarketplace(parsed.success ? parsed.data : marketplaceFilterSchema.parse({})), enabled: Boolean(profile) && parsed.success, placeholderData: keepPreviousData, staleTime: 30000 })
  const ranked = useMemo(() => rankMarketplace((marketplace.data ?? []).map(item => {
    const point = readMapCoordinates(item.latitude, item.longitude)
    return location && point ? { ...item, distanceKm: distanceBetweenKm(location, point) } : item
  })), [marketplace.data, location])
  const items = useMemo(() => [...ranked].sort((a, b) => sort === 'price' ? a.priceBdt - b.priceBdt : sort === 'nearest' ? (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) : 0), [ranked, sort])
  const displayed = useMemo(() => selectedClinicId ? [...items.filter(item => item.clinicId === selectedClinicId), ...items.filter(item => item.clinicId !== selectedClinicId)] : items, [items, selectedClinicId])
  const mappedClinicCount = new Set(items.filter(item => readMapCoordinates(item.latitude, item.longitude)).map(item => item.clinicId)).size
  const hasMissingCoordinates = items.some(item => !readMapCoordinates(item.latitude, item.longitude))
  const activeFilterCount = [openNow, specialty, maximumPrice, minimumRating, gender, language, nearby].filter(Boolean).length
  const filtered = Boolean(query || activeFilterCount)
  useEffect(() => { if (selectedClinicId && !items.some(item => item.clinicId === selectedClinicId)) setSelectedClinicId(null) }, [items, selectedClinicId])
  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null

  const clearFilters = () => { setQuery(''); setDebouncedQuery(''); setOpenNow(false); setSpecialty(''); setMaximumPrice(''); setMinimumRating(0); setGender(null); setLanguage(null); setNearby(false); setSelectedClinicId(null); setFitRequest(value => value + 1) }
  const browseAll = () => { setNearby(false); setSelectedClinicId(null); setFitRequest(value => value + 1) }
  const locate = async () => {
    if (locating) return
    setLocating(true); setLocationFailed(false)
    try {
      const current = await requestCurrentLocation()
      if (current) { setLocation(current); setNearby(true); setSelectedClinicId(null); setLocationRequest(value => value + 1); setSort('nearest') }
      else setLocationFailed(true)
    } catch { setLocationFailed(true) }
    finally { setLocating(false) }
  }
  const highlight = (clinicId: string) => { setSelectedClinicId(clinicId); setFocusRequest(value => value + 1); resultsScroll.current?.scrollTo({ y: 0, animated: false }) }
  const openDentist = (item: MarketplaceDentist) => router.push({ pathname: '/patient/dentist', params: { item: JSON.stringify(item) } })
  const renderResults = <>
    <View style={styles.resultsHeader} accessibilityLiveRegion="polite"><Text style={styles.resultsTitle}>{count('mapCareOptions', items.length)}</Text>{marketplace.isFetching ? <ActivityIndicator size="small" color={colors.teal} /> : null}</View>
    <Text style={styles.resultsHint}>{t('mapResultsHint')}</Text>
    <View style={styles.sortRow} accessibilityLabel={t('mapSort')}>{(['recommended', 'price', ...(location ? ['nearest'] : [])] as Array<typeof sort>).map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: sort === value }} onPress={() => setSort(value)} style={[styles.sortButton, sort === value && styles.sortActive]}><Text style={[styles.sortText, sort === value && styles.sortActiveText]}>{t(value === 'price' ? 'mapLowestPrice' : value === 'nearest' ? 'mapNearest' : 'mapRecommended')}</Text></Pressable>)}</View>
    {marketplace.isPending && parsed.success ? <View style={styles.state}><ActivityIndicator color={colors.teal} /><Text style={styles.stateBody}>{t('mapSearching')}</Text></View>
      : marketplace.isError ? <View style={styles.state}><Text style={styles.stateTitle}>{t('mapSearchError')}</Text><Button label={t('retry')} variant="secondary" onPress={() => void marketplace.refetch()} /></View>
      : items.length === 0 ? <View style={styles.state}><View style={styles.emptyIcon}><Search size={26} color={colors.teal} /></View><Text style={styles.stateTitle}>{t(filtered ? 'mapEmptyTitle' : 'mapNoClinicsTitle')}</Text><Text style={styles.stateBody}>{t(nearby ? 'mapEmptyNearby' : filtered ? 'mapEmptyBody' : 'mapNoClinicsBody')}</Text>{filtered ? <Button label={t(nearby ? 'mapBrowseAll' : 'mapResetFilters')} variant="secondary" onPress={nearby ? browseAll : clearFilters} /> : <Button label={t('retry')} variant="secondary" onPress={() => void marketplace.refetch()} />}</View>
      : displayed.map(item => <View key={`${item.clinicId}-${item.dentistId}-${item.serviceId}`} style={[styles.result, selectedClinicId === item.clinicId && styles.resultSelected]}>
        <View style={styles.identity}><View style={styles.avatar}><Text style={styles.avatarText}>{item.dentistName.replace(/^Dr\.?\s*/i, '').split(' ').map(part => part[0]).slice(0, 2).join('')}</Text></View><View style={styles.identityCopy}><Text style={styles.name}>{item.dentistName}</Text><Text style={styles.profession}>{item.professionalTitle}</Text></View><CheckCircle2 accessibilityLabel={t('verifiedProfessionals')} size={18} color={colors.teal} /></View>
        <Text style={styles.clinic}>{item.clinicName}</Text>
        <Text style={styles.specialties}>{item.specialties.join(' · ')}</Text>
        <View style={styles.metadata}>{item.reviewCount > 0 ? <View style={styles.inline}><Star size={14} color={colors.warning} fill={colors.warning} /><Text style={styles.rating}>{item.rating.toLocaleString(numberLocale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</Text><Text style={styles.quiet}>({item.reviewCount.toLocaleString(numberLocale)})</Text></View> : <Text style={styles.quiet}>{t('mapNoReviews')}</Text>}{item.distanceKm !== null ? <View style={styles.inline}><MapPin size={13} color={colors.muted} /><Text style={styles.quiet}>{item.distanceKm.toLocaleString(numberLocale, { maximumFractionDigits: 1 })} km</Text></View> : null}<View style={styles.inline}><Clock3 size={13} color={item.openNow ? colors.teal : colors.muted} /><Text style={[styles.quiet, item.openNow && styles.openText]}>{t(item.openNow ? 'openNow' : 'mapCheckAvailability')}</Text></View></View>
        <View style={styles.serviceRow}><View style={styles.serviceCopy}><Text style={styles.serviceName}>{item.serviceName}</Text><Text style={styles.quiet}>{item.durationMinutes.toLocaleString(numberLocale)} {t('mapMinutes')} · {t('mapPriceLabel')}</Text></View><Text style={styles.price}>৳{item.priceBdt.toLocaleString(numberLocale)}</Text></View>
        <View style={styles.resultActions}>{mapVisible && readMapCoordinates(item.latitude, item.longitude) ? <Pressable accessibilityRole="button" accessibilityLabel={`${t('mapShowClinic')}: ${item.clinicName}`} onPress={() => highlight(item.clinicId)} style={styles.showMap}><MapPin size={16} color={colors.teal} /><Text style={styles.showMapText}>{t('mapShowClinic')}</Text></Pressable> : <View style={styles.actionSpacer} />}<Pressable accessibilityRole="button" accessibilityLabel={`${t('mapViewTimes')}: ${item.dentistName}, ${item.serviceName}`} onPress={() => openDentist(item)} style={({ pressed }) => [styles.bookButton, pressed && styles.pressed]}><Text style={styles.bookText}>{t('mapViewTimes')}</Text><ArrowRight size={16} color={colors.paper} /></Pressable></View>
      </View>)}
  </>

  return <Screen maxWidth={mapVisible && wide ? 1400 : 940} style={[styles.screen, compact && styles.screenCompact]}>
    <Stack.Screen options={{ title: t('discoverDentists'), headerBackTitle: t('back') }} />
    <View style={styles.heading}><View style={styles.headingCopy}><Text style={[styles.title, compact && styles.titleCompact]}>{t('mapHeading')}</Text><Text style={styles.subtitle}>{t('mapSubheading')}</Text></View>{!compact ? <View style={styles.trust}><CheckCircle2 size={17} color={colors.teal} /><Text style={styles.trustText}>{t('verifiedProfessionals')}</Text></View> : null}</View>
    {isMarketplacePreview ? <Text style={styles.preview}>{t('mapPreview')}</Text> : null}
    <View style={styles.searchRow}><View style={styles.searchBox}><Search size={21} color={colors.teal} /><TextInput accessibilityLabel={t('searchDentistClinic')} placeholder={t('searchDentistClinic')} placeholderTextColor={colors.muted} value={query} onChangeText={setQuery} maxLength={100} style={styles.searchInput} />{query ? <Pressable accessibilityRole="button" accessibilityLabel={t('mapClearSearch')} onPress={() => setQuery('')} style={styles.clearSearch}><X size={18} color={colors.muted} /></Pressable> : null}</View><Pressable accessibilityRole="button" accessibilityLabel={t('filters')} accessibilityState={{ expanded: filtersOpen }} onPress={() => setFiltersOpen(value => !value)} style={[styles.filterButton, filtersOpen && styles.controlSelected]}><SlidersHorizontal size={20} color={colors.ink} />{!compact ? <Text style={styles.controlText}>{t('filters')}</Text> : null}{activeFilterCount ? <Text style={styles.filterCount}>{activeFilterCount.toLocaleString(numberLocale)}</Text> : null}</Pressable></View>
    {filtersOpen ? <View style={styles.filterPanel}>
      <View style={styles.filterFields}><View style={styles.filterField}><Field label={t('specialties')} value={specialty} onChangeText={setSpecialty} maxLength={80} /></View><View style={styles.filterField}><Field label={t('maximumPrice')} value={maximumPrice} onChangeText={setMaximumPrice} keyboardType="number-pad" maxLength={10} /></View></View>
      <View style={styles.filterGroups}><View style={styles.filterGroup}><Text style={styles.filterLabel}>{t('minimumRating')}</Text><View style={styles.choices}>{[0, 4, 4.5].map(value => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: minimumRating === value }} style={[styles.choice, minimumRating === value && styles.controlSelected]} onPress={() => setMinimumRating(value)}><Text style={styles.choiceText}>{value ? `${value.toLocaleString(numberLocale)}+ ★` : t('anyRating')}</Text></Pressable>)}</View></View>
      <View style={styles.filterGroup}><Text style={styles.filterLabel}>{t('gender')}</Text><View style={styles.choices}>{([null, 'female', 'male'] as const).map(value => <Pressable key={value ?? 'any'} accessibilityRole="radio" accessibilityState={{ checked: gender === value }} style={[styles.choice, gender === value && styles.controlSelected]} onPress={() => setGender(value)}><Text style={styles.choiceText}>{value ? t(value) : t('any')}</Text></Pressable>)}</View></View>
      <View style={styles.filterGroup}><Text style={styles.filterLabel}>{t('languages')}</Text><View style={styles.choices}>{([null, 'bn', 'en'] as const).map(value => <Pressable key={value ?? 'any'} accessibilityRole="radio" accessibilityState={{ checked: language === value }} style={[styles.choice, language === value && styles.controlSelected]} onPress={() => setLanguage(value)}><Text style={styles.choiceText}>{value === 'bn' ? t('bangla') : value === 'en' ? t('english') : t('any')}</Text></Pressable>)}</View></View></View>
      <Button label={t('mapResetFilters')} variant="ghost" onPress={clearFilters} />
    </View> : null}
    {!parsed.success ? <Text accessibilityRole="alert" style={styles.errorText}>{t('mapPriceError')}</Text> : null}
    <View style={styles.toolbar}><View style={styles.segment}>{[{ value: true, Icon: Map, label: 'mapList' as const }, { value: false, Icon: List, label: 'listOnly' as const }].map(({ value, Icon, label }) => <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: mapVisible === value }} onPress={() => setMapVisible(value)} style={[styles.segmentButton, mapVisible === value && styles.segmentActive]}><Icon size={16} color={mapVisible === value ? colors.ink : colors.muted} /><Text style={[styles.segmentText, mapVisible === value && styles.segmentTextActive]}>{t(label)}</Text></Pressable>)}</View>
      <View style={styles.toolbarActions}><Pressable accessibilityRole="checkbox" accessibilityState={{ checked: openNow }} onPress={() => setOpenNow(value => !value)} style={[styles.chip, openNow && styles.controlSelected]}>{openNow ? <Check size={14} color={colors.teal} /> : <View style={styles.statusDot} />}<Text style={styles.controlText}>{t('openNow')}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel={t('useMyLocation')} accessibilityState={{ busy: locating, disabled: locating }} disabled={locating} onPress={() => void locate()} style={styles.locateButton}>{locating ? <ActivityIndicator size="small" color={colors.teal} /> : <LocateFixed size={17} color={colors.teal} />}<Text style={styles.locateText}>{t(locating ? 'mapLocating' : 'useMyLocation')}</Text></Pressable></View>
    </View>
    {nearby ? <View style={styles.locationBar}><Text style={styles.locationText}>{t('mapNearby')}</Text><Pressable accessibilityRole="button" onPress={browseAll} style={styles.browseAll}><Text style={styles.locateText}>{t('mapBrowseAll')}</Text><X size={14} color={colors.teal} /></Pressable></View> : null}
    {locationFailed ? <Text accessibilityRole="alert" style={styles.locationWarning}>{t('mapLocationDenied')}</Text> : null}
    <View style={[styles.workspace, wide && mapVisible && styles.workspaceWide]}>
      {mapVisible ? <View style={[styles.mapColumn, wide && styles.mapColumnWide]}>
        <View style={[styles.mapFrame, { height: wide ? Math.max(460, Math.min(height - 420, 640)) : compact ? 380 : 450 }]}><NearbyMap items={items} location={location} selectedClinicId={selectedClinicId} onHighlight={highlight} onSelect={openDentist} fitRequest={fitRequest} locationRequest={locationRequest} focusRequest={focusRequest} /></View>
        <View style={styles.mapFooter}><View style={styles.inline}><MapPin size={14} color={colors.teal} /><Text style={styles.mapFooterText}>{count('mapLocations', mappedClinicCount)}</Text></View><Pressable accessibilityRole="button" onPress={() => { setSelectedClinicId(null); setFitRequest(value => value + 1) }} style={styles.fitButton}><Text style={styles.locateText}>{t('mapShowAll')}</Text></Pressable></View>
        {hasMissingCoordinates ? <Text style={styles.coordinateNote}>{t('mapMissingCoordinates')}</Text> : null}
      </View> : null}
      {wide && mapVisible ? <ScrollView ref={resultsScroll} style={[styles.resultsPane, { maxHeight: Math.max(510, Math.min(height - 370, 690)) }]} contentContainerStyle={styles.resultsContent}>{renderResults}</ScrollView> : <View style={styles.resultsContent}>{renderResults}</View>}
    </View>
  </Screen>
}

const styles = StyleSheet.create({
  screen: { paddingTop: 28, paddingBottom: 32 }, screenCompact: { paddingHorizontal: 16, paddingTop: 20 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 24, marginBottom: 22 }, headingCopy: { flex: 1, gap: 8 }, title: { fontSize: 34, lineHeight: 42, fontWeight: '800', letterSpacing: -0.9, color: colors.inkDeep }, titleCompact: { fontSize: 28, lineHeight: 36, letterSpacing: -0.5 }, subtitle: { color: colors.muted, fontSize: 15, lineHeight: 23, maxWidth: 690 }, trust: { flexDirection: 'row', alignItems: 'center', gap: 8 }, trustText: { color: colors.teal, fontSize: 12, fontWeight: '600' }, preview: { color: colors.teal, backgroundColor: colors.mintSoft, fontSize: 12, lineHeight: 19, padding: 10, borderRadius: 8, marginBottom: 14 },
  searchRow: { flexDirection: 'row', gap: 10 }, searchBox: { flex: 1, minWidth: 0, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 12 }, searchInput: { flex: 1, minWidth: 0, minHeight: 50, fontSize: 15, color: colors.text }, clearSearch: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }, filterButton: { minWidth: 54, minHeight: 54, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper }, filterCount: { fontSize: 12, fontWeight: '700', color: colors.teal }, controlText: { color: colors.ink, fontSize: 13, fontWeight: '600' }, controlSelected: { backgroundColor: colors.mintSoft, borderColor: colors.teal },
  filterPanel: { gap: 20, padding: 20, marginTop: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper, borderRadius: 14 }, filterFields: { flexDirection: 'row', gap: 20, flexWrap: 'wrap' }, filterField: { flexGrow: 1, flexBasis: 230 }, filterGroups: { flexDirection: 'row', gap: 24, flexWrap: 'wrap' }, filterGroup: { gap: 8, flexGrow: 1 }, filterLabel: { fontSize: 13, fontWeight: '700', color: colors.ink }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { paddingHorizontal: 13, minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: colors.line, borderRadius: 9 }, choiceText: { fontSize: 13, color: colors.ink }, errorText: { marginTop: 12, fontSize: 14, color: colors.danger },
  toolbar: { marginVertical: 18, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14 }, segment: { flexDirection: 'row', backgroundColor: '#E7EEEB', padding: 3, borderRadius: 11 }, segmentButton: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 42, paddingHorizontal: 14, borderRadius: 8 }, segmentActive: { backgroundColor: colors.paper }, segmentText: { color: colors.muted, fontSize: 13, fontWeight: '600' }, segmentTextActive: { color: colors.ink }, toolbarActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 }, chip: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, borderWidth: 1, borderColor: colors.line, borderRadius: 24, backgroundColor: colors.paper }, statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.teal }, locateButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }, locateText: { fontSize: 12, color: colors.teal, fontWeight: '700' }, locationBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 14 }, locationText: { color: colors.muted, fontSize: 13 }, browseAll: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }, locationWarning: { color: colors.muted, fontSize: 13, lineHeight: 21, marginBottom: 16 },
  workspace: { gap: 20 }, workspaceWide: { flexDirection: 'row-reverse', alignItems: 'flex-start', gap: 26 }, mapColumn: { minWidth: 0 }, mapColumnWide: { flex: 1.65 }, mapFrame: { borderRadius: 16, overflow: 'hidden', backgroundColor: colors.mapNight }, mapFooter: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingTop: 6 }, mapFooterText: { fontSize: 12, color: colors.muted }, fitButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 4 }, coordinateNote: { fontSize: 12, lineHeight: 18, color: colors.muted, marginTop: 2 }, resultsPane: { flex: 1, minWidth: 340 }, resultsContent: { paddingBottom: 12 }, resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }, resultsTitle: { fontSize: 21, fontWeight: '700', color: colors.inkDeep }, resultsHint: { color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 6, marginBottom: 12 }, sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }, sortButton: { minHeight: 40, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 8 }, sortActive: { backgroundColor: '#E7EEEB' }, sortText: { fontSize: 12, color: colors.muted }, sortActiveText: { color: colors.ink, fontWeight: '700' },
  result: { padding: 16, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.line, backgroundColor: colors.paper, borderRadius: 12, marginBottom: 10 }, resultSelected: { backgroundColor: '#EAF7F2' }, identity: { flexDirection: 'row', alignItems: 'center', gap: 10 }, avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#E6EEEB', alignItems: 'center', justifyContent: 'center' }, avatarText: { fontWeight: '700', fontSize: 13, color: colors.teal }, identityCopy: { flex: 1, minWidth: 0, gap: 2 }, name: { fontSize: 16, lineHeight: 22, fontWeight: '700', color: colors.inkDeep }, profession: { color: colors.muted, fontSize: 12, lineHeight: 18 }, clinic: { marginTop: 6, color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '600' }, specialties: { color: colors.muted, fontSize: 12, lineHeight: 18 }, metadata: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginTop: 2 }, inline: { flexDirection: 'row', alignItems: 'center', gap: 4 }, rating: { color: colors.ink, fontSize: 12, fontWeight: '700' }, quiet: { fontSize: 12, lineHeight: 18, color: colors.muted }, openText: { color: colors.teal }, serviceRow: { marginTop: 8, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line, flexDirection: 'row', gap: 12, alignItems: 'center' }, serviceCopy: { flex: 1, minWidth: 0, gap: 3 }, serviceName: { color: colors.ink, fontSize: 12, lineHeight: 18, fontWeight: '600' }, price: { color: colors.inkDeep, fontSize: 20, fontWeight: '700' }, resultActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginTop: 5 }, showMap: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, flexShrink: 1 }, showMapText: { fontSize: 11, lineHeight: 17, color: colors.teal, flexShrink: 1, fontWeight: '600' }, actionSpacer: { flex: 1 }, bookButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, paddingHorizontal: 14, borderRadius: 9, backgroundColor: colors.ink }, bookText: { fontSize: 13, color: colors.paper, fontWeight: '700' }, pressed: { opacity: 0.8 },
  state: { gap: 16, paddingVertical: 32, paddingHorizontal: 12, alignItems: 'flex-start' }, emptyIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.mintSoft, alignItems: 'center', justifyContent: 'center' }, stateTitle: { color: colors.inkDeep, fontSize: 19, lineHeight: 26, fontWeight: '700' }, stateBody: { fontSize: 14, lineHeight: 22, color: colors.muted },
})
