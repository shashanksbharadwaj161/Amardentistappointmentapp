import { Image, View, Text, StyleSheet } from 'react-native'
import { colors } from '../theme'

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <View style={styles.row} accessible accessibilityRole="header">
      <Image
        accessibilityIgnoresInvertColors
        source={require('../../assets/brand-mascot.png')}
        resizeMode="contain"
        style={[styles.mark, compact && styles.compactMark]}
      />
      {!compact && <Text style={styles.wordmark}>Amar Dentist</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  mark: { width: 44, height: 44 },
  compactMark: { width: 38, height: 38 },
  wordmark: { color: colors.ink, fontSize: 18, fontWeight: '800', letterSpacing: -0.4 },
})
