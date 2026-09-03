import 'react-native-url-polyfill/auto'
import { createClient } from '@supabase/supabase-js'
import * as SecureStore from 'expo-secure-store'
import { Platform } from 'react-native'

const url = process.env.EXPO_PUBLIC_SUPABASE_URL
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY

const secureStorage = {
  getItem: async (key: string) => {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null
    return SecureStore.getItemAsync(key)
  },
  setItem: async (key: string, value: string) => {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(key, value)
    else await SecureStore.setItemAsync(key, value)
  },
  removeItem: async (key: string) => {
    if (Platform.OS === 'web') globalThis.localStorage?.removeItem(key)
    else await SecureStore.deleteItemAsync(key)
  },
}

export const isSupabaseConfigured = Boolean(url && publishableKey)

export const supabase = isSupabaseConfigured
  ? createClient(url!, publishableKey!, {
      auth: { storage: secureStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: Platform.OS === 'web' },
    })
  : null
