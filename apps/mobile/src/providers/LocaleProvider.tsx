import { messages, type SupportedLocale } from '@amar-dentist/domain'
import { getLocales } from 'expo-localization'
import * as SecureStore from 'expo-secure-store'
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react'
import { Platform } from 'react-native'
import { supabase } from '../lib/supabase'

type MessageKey = keyof typeof messages.en
type LocaleContextValue = {
  locale: SupportedLocale
  setLocale: (locale: SupportedLocale) => void
  t: (key: MessageKey) => string
}

const preferred = getLocales()[0]?.languageCode === 'bn' ? 'bn' : 'en'
const storageKey = 'amar-dentist-locale'
const LocaleContext = createContext<LocaleContextValue | null>(null)

async function readStoredLocale() {
  const value = Platform.OS === 'web' ? globalThis.localStorage?.getItem(storageKey) : await SecureStore.getItemAsync(storageKey)
  return value === 'bn' || value === 'en' ? value : null
}

async function persistLocale(locale: SupportedLocale) {
  if (Platform.OS === 'web') globalThis.localStorage?.setItem(storageKey, locale)
  else await SecureStore.setItemAsync(storageKey, locale)
  if (!supabase) return
  const { data } = await supabase.auth.getUser()
  if (data.user) await supabase.from('profiles').update({ locale }).eq('id', data.user.id)
}

export function LocaleProvider({ children }: PropsWithChildren) {
  const [locale, setLocale] = useState<SupportedLocale>(preferred)
  useEffect(() => { void readStoredLocale().then((stored) => { if (stored) setLocale(stored) }) }, [])
  const changeLocale = (nextLocale: SupportedLocale) => {
    setLocale(nextLocale)
    void persistLocale(nextLocale)
  }
  const value = useMemo(() => ({ locale, setLocale: changeLocale, t: (key: MessageKey) => messages[locale][key] }), [locale])
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useLocale() {
  const value = useContext(LocaleContext)
  if (!value) throw new Error('useLocale must be used within LocaleProvider')
  return value
}
