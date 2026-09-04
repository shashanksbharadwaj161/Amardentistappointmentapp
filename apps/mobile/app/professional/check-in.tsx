import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera'
import { Redirect, Stack } from 'expo-router'
import { Camera, CheckCircle2, QrCode, ShieldCheck } from 'lucide-react-native'
import { useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native'
import { Button } from '../../src/components/Button'
import { Screen } from '../../src/components/Screen'
import { redeemCheckinToken } from '../../src/lib/phase3'
import { useAuth } from '../../src/providers/AuthProvider'
import { useLocale } from '../../src/providers/LocaleProvider'
import { colors, radius, spacing } from '../../src/theme'

export default function ProfessionalCheckInScreen() {
  const { profile, loading } = useAuth()
  const { t } = useLocale()
  const [permission, requestPermission] = useCameraPermissions()
  const [scannerOpen, setScannerOpen] = useState(false)
  const [manualToken, setManualToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [checkedInId, setCheckedInId] = useState<string | null>(null)
  if (!loading && !profile) return <Redirect href="/" />
  if (!profile) return null

  const redeem = async (token: string) => {
    if (token.trim().length < 16 || busy || checkedInId) return setError(t('invalidCheckinCode'))
    setBusy(true); setError(null); setScannerOpen(false)
    try { setCheckedInId(await redeemCheckinToken(token)) } catch { setError(t('checkinFailed')) } finally { setBusy(false) }
  }
  const scan = ({ data }: BarcodeScanningResult) => { void redeem(data) }
  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission()
      if (!result.granted) return setError(t('cameraPermissionDenied'))
    }
    setError(null); setScannerOpen(true)
  }
  const reset = () => { setCheckedInId(null); setManualToken(''); setError(null); setScannerOpen(false) }

  return <Screen maxWidth={720} style={styles.screen}>
    <Stack.Screen options={{ title: t('scanCheckin'), headerBackTitle: t('back') }} />
    <View style={styles.heading}><QrCode size={28} color={colors.teal} /><View style={styles.headingCopy}><Text style={styles.title}>{t('scanCheckin')}</Text><Text style={styles.subtitle}>{t('scanCheckinBody')}</Text></View></View>
    <View style={styles.privacy}><ShieldCheck size={17} color={colors.teal} /><Text style={styles.privacyText}>{t('checkinSecurity')}</Text></View>

    {checkedInId ? <View style={styles.success}><View style={styles.successIcon}><CheckCircle2 size={44} color={colors.success} /></View><Text style={styles.successTitle}>{t('patientCheckedIn')}</Text><Text style={styles.successBody}>{t('patientCheckedInBody')}</Text><Button label={t('scanAnother')} onPress={reset} /></View> : <>
      {scannerOpen ? <View style={styles.cameraFrame}><CameraView style={styles.camera} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={busy ? undefined : scan} /><View pointerEvents="none" style={styles.scanGuide}><View style={styles.scanWindow} /></View></View> : <Button label={t('openCamera')} onPress={() => void openScanner()} />}
      {busy ? <ActivityIndicator color={colors.teal} /> : null}
      <View style={styles.manual}><View style={styles.manualHeading}><Camera size={18} color={colors.teal} /><Text style={styles.manualTitle}>{t('manualCheckin')}</Text></View><Text style={styles.manualBody}>{t('manualCheckinBody')}</Text><TextInput accessibilityLabel={t('checkinCode')} value={manualToken} onChangeText={setManualToken} placeholder={t('pasteCheckinCode')} placeholderTextColor={colors.muted} autoCapitalize="none" autoCorrect={false} multiline style={styles.tokenInput} /><Button label={t('checkInPatient')} variant="secondary" loading={busy} disabled={manualToken.trim().length < 16} onPress={() => void redeem(manualToken)} /></View>
    </>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </Screen>
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.xl, gap: spacing.xl }, heading: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, headingCopy: { flex: 1, gap: 5 }, title: { color: colors.inkDeep, fontSize: 31, fontWeight: '800', letterSpacing: -0.9 }, subtitle: { color: colors.muted, fontSize: 13, lineHeight: 20 }, privacy: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.mintSoft }, privacyText: { flex: 1, color: colors.teal, fontSize: 12, lineHeight: 18 },
  cameraFrame: { position: 'relative', height: 380, overflow: 'hidden', borderRadius: radius.lg, backgroundColor: colors.mapNight }, camera: { flex: 1 }, scanGuide: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' }, scanWindow: { width: 210, height: 210, borderWidth: 3, borderColor: colors.mint, borderRadius: radius.md }, manual: { gap: spacing.md, padding: spacing.xl, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, backgroundColor: colors.paper }, manualHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, manualTitle: { color: colors.inkDeep, fontSize: 16, fontWeight: '800' }, manualBody: { color: colors.muted, fontSize: 12, lineHeight: 18 }, tokenInput: { minHeight: 84, padding: spacing.md, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.pearl, color: colors.text, fontSize: 13 }, error: { color: colors.danger, fontSize: 13 },
  success: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.xxl }, successIcon: { width: 86, height: 86, alignItems: 'center', justifyContent: 'center', borderRadius: 43, backgroundColor: colors.mintSoft }, successTitle: { color: colors.inkDeep, fontSize: 30, fontWeight: '800', textAlign: 'center' }, successBody: { maxWidth: 420, color: colors.muted, fontSize: 14, lineHeight: 22, textAlign: 'center' },
})
