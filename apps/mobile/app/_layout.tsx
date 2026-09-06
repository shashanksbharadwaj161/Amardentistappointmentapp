import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from '../src/providers/AuthProvider'
import { LocaleProvider } from '../src/providers/LocaleProvider'
import { colors } from '../src/theme'

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1 } } }))
  const [reduceMotion, setReduceMotion] = useState(false)
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion)
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => subscription.remove()
  }, [])
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <LocaleProvider>
          <AuthProvider>
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShadowVisible: false, headerStyle: { backgroundColor: colors.pearl }, headerTintColor: colors.ink, contentStyle: { backgroundColor: colors.pearl }, animation: reduceMotion ? 'none' : 'slide_from_right' }}>
              <Stack.Screen name="index" options={{ headerShown: false }} />
              <Stack.Screen name="sign-in" />
              <Stack.Screen name="register" />
              <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
              <Stack.Screen name="reset-password" />
              <Stack.Screen name="dashboard" options={{ headerShown: false }} />
              <Stack.Screen name="professional/index" />
              <Stack.Screen name="professional/clinic-application" />
              <Stack.Screen name="professional/dentist-application" />
              <Stack.Screen name="professional/calendar" />
              <Stack.Screen name="professional/manage-schedule" />
              <Stack.Screen name="professional/team" />
              <Stack.Screen name="professional/operations" />
              <Stack.Screen name="professional/walk-in" />
              <Stack.Screen name="professional/check-in" />
              <Stack.Screen name="professional/inbox" />
              <Stack.Screen name="professional/encounter" />
              <Stack.Screen name="professional/business" />
              <Stack.Screen name="professional/ai-review" />
              <Stack.Screen name="patient/discover" />
              <Stack.Screen name="patient/dentist" />
              <Stack.Screen name="patient/profiles" />
              <Stack.Screen name="patient/appointments" />
              <Stack.Screen name="patient/chat" />
              <Stack.Screen name="patient/waitlist" />
              <Stack.Screen name="patient/review" />
              <Stack.Screen name="patient/records" />
              <Stack.Screen name="patient/consent" />
              <Stack.Screen name="patient/payments" />
              <Stack.Screen name="patient/assistant" />
            </Stack>
          </AuthProvider>
        </LocaleProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
