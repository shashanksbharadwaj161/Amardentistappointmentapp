import { ScrollView, StyleSheet, View, type ViewProps } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, spacing } from '../theme'

export function Screen({ children, scroll = true, maxWidth = 720, style }: ViewProps & { scroll?: boolean; maxWidth?: number }) {
  const content = <View style={[styles.content, { maxWidth }, style]}>{children}</View>
  return <SafeAreaView style={styles.safe}>{scroll ? <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">{content}</ScrollView> : content}</SafeAreaView>
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.pearl },
  scroll: { flexGrow: 1 },
  content: { flex: 1, width: '100%', alignSelf: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
})
