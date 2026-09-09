jest.mock('./supabase', () => ({ supabase: null }))
jest.mock('expo-location', () => ({
  PermissionStatus: { GRANTED: 'granted' },
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}))

import { marketplaceFilterSchema } from '@amar-dentist/domain'
import * as Location from 'expo-location'
import { Platform } from 'react-native'
import { requestCurrentLocation, searchMarketplace } from './phase3'

describe('marketplace location and filtering', () => {
  afterEach(() => { jest.useRealTimers(); jest.clearAllMocks(); jest.restoreAllMocks() })

  it('shows no invented distances before location access', async () => {
    const items = await searchMarketplace(marketplaceFilterSchema.parse({}))
    expect(items.length).toBeGreaterThan(0)
    expect(items.every((item) => item.distanceKm === null)).toBe(true)
  })

  it('uses the actual origin and applies the radius in preview', async () => {
    const atClinic = await searchMarketplace(marketplaceFilterSchema.parse({ latitude: 23.7808, longitude: 90.4077, radiusKm: 1 }))
    expect(atClinic).toHaveLength(1)
    expect(atClinic[0]?.distanceKm).toBe(0)
    const inTokyo = await searchMarketplace(marketplaceFilterSchema.parse({ latitude: 35.6762, longitude: 139.6503, radiusKm: 50 }))
    expect(inTokyo).toHaveLength(0)
  })

  it('combines specialty, opening, language and price filters', async () => {
    const items = await searchMarketplace(marketplaceFilterSchema.parse({ specialty: 'general', openNow: true, language: 'en', maxPriceBdt: 900 }))
    expect(items).toHaveLength(1)
    expect(items[0]?.clinicName).toBe('Shapla Dental Studio')
    expect(await searchMarketplace(marketplaceFilterSchema.parse({ query: 'unknown clinic' }))).toHaveLength(0)
  })

  it('does not request coordinates after permission is denied', async () => {
    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'denied' } as Location.LocationPermissionResponse)
    await expect(requestCurrentLocation()).resolves.toBeNull()
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled()
  })

  it('ends an unresponsive location request so the UI can recover', async () => {
    jest.useFakeTimers()
    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'granted' } as Location.LocationPermissionResponse)
    jest.mocked(Location.getCurrentPositionAsync).mockReturnValue(new Promise(() => {}))
    const result = requestCurrentLocation()
    const rejection = expect(result).rejects.toThrow('LOCATION_TIMEOUT')
    await jest.advanceTimersByTimeAsync(15_000)
    await rejection
    expect(jest.getTimerCount()).toBe(0)
  })

  it('requests a recent web position once without the unbounded Expo permission call', async () => {
    jest.replaceProperty(Platform, 'OS', 'web')
    const getCurrentPosition = jest.fn((success) => success({ coords: { latitude: 0, longitude: 0 } }))
    Object.defineProperty(globalThis, 'navigator', { value: { geolocation: { getCurrentPosition } }, configurable: true })
    await expect(requestCurrentLocation()).resolves.toEqual({ latitude: 0, longitude: 0 })
    expect(getCurrentPosition).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 })
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled()
  })

  it('lets the UI recover even when the browser never answers a location prompt', async () => {
    jest.useFakeTimers()
    jest.replaceProperty(Platform, 'OS', 'web')
    Object.defineProperty(globalThis, 'navigator', { value: { geolocation: { getCurrentPosition: jest.fn() } }, configurable: true })
    const result = requestCurrentLocation()
    const rejection = expect(result).rejects.toThrow('LOCATION_TIMEOUT')
    await jest.advanceTimersByTimeAsync(15_000)
    await rejection
    expect(jest.getTimerCount()).toBe(0)
  })
})
