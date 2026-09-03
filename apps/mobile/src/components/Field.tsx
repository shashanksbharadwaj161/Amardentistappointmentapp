import { forwardRef } from 'react'
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { colors, hitTarget, radius } from '../theme'

type FieldProps = TextInputProps & { label: string; error?: string; hint?: string }

export const Field = forwardRef<TextInput, FieldProps>(function Field({ label, error, hint, ...props }, ref) {
  const help = error ?? hint
  return (
    <View style={styles.group}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        ref={ref}
        style={[styles.input, error && styles.invalid]}
        placeholderTextColor={colors.muted}
        accessibilityLabel={label}
        accessibilityHint={help}
        {...props}
      />
      {help ? <Text style={[styles.help, error && styles.error]}>{help}</Text> : null}
    </View>
  )
})

const styles = StyleSheet.create({
  group: { gap: 7 },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  input: { minHeight: hitTarget + 4, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: colors.paper, paddingHorizontal: 16, color: colors.text, fontSize: 16 },
  invalid: { borderColor: colors.danger },
  help: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  error: { color: colors.danger },
})
