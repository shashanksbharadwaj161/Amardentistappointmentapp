import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native'
import { colors, hitTarget, radius } from '../theme'

type ButtonProps = PressableProps & { label: string; variant?: 'primary' | 'secondary' | 'ghost'; loading?: boolean }

export function Button({ label, variant = 'primary', loading = false, disabled, style, ...props }: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.base, styles[variant], pressed && styles.pressed, (disabled || loading) && styles.disabled, typeof style === 'function' ? style({ pressed }) : style]}
      {...props}
    >
      {loading ? <ActivityIndicator color={variant === 'primary' ? colors.paper : colors.ink} /> : <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  base: { minHeight: hitTarget, borderRadius: radius.md, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center' },
  primary: { backgroundColor: colors.ink },
  secondary: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  ghost: { backgroundColor: 'transparent' },
  label: { fontSize: 16, fontWeight: '700' },
  primaryLabel: { color: colors.paper },
  secondaryLabel: { color: colors.ink },
  ghostLabel: { color: colors.teal },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.48 },
})
