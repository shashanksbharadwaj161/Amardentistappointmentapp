import type { PropsWithChildren, ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { colors, radius, shadow, spacing } from '../theme'

export function SectionCard({ eyebrow, title, action, children }: PropsWithChildren<{ eyebrow?: string; title: string; action?: ReactNode }>) {
  return <View style={styles.card}><View style={styles.heading}><View style={styles.copy}>{eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}<Text style={styles.title}>{title}</Text></View>{action}</View>{children}</View>
}

const styles = StyleSheet.create({
  card: { padding: spacing.xl, gap: spacing.lg, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, ...shadow },
  heading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.lg },
  copy: { flex: 1, gap: 5 },
  eyebrow: { color: colors.teal, fontSize: 10, fontWeight: '800', letterSpacing: 1.2 },
  title: { color: colors.inkDeep, fontSize: 19, lineHeight: 24, fontWeight: '800', letterSpacing: -0.4 },
})
