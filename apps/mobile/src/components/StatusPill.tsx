import type { VerificationStatus } from '@amar-dentist/domain'
import { StyleSheet, Text, View } from 'react-native'
import { useLocale } from '../providers/LocaleProvider'
import { colors, radius } from '../theme'

const labels = {
  draft: 'statusDraft', submitted: 'statusSubmitted', under_review: 'statusUnderReview', approved: 'statusApproved', rejected: 'statusRejected', suspended: 'statusSuspended',
} as const

export function StatusPill({ status }: { status: VerificationStatus }) {
  const { t } = useLocale()
  return <View style={[styles.pill, status === 'approved' && styles.approved, (status === 'rejected' || status === 'suspended') && styles.attention]}><Text style={[styles.label, status === 'approved' && styles.approvedLabel, (status === 'rejected' || status === 'suspended') && styles.attentionLabel]}>{t(labels[status])}</Text></View>
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: '#EEF2F4' },
  approved: { backgroundColor: colors.mintSoft },
  attention: { backgroundColor: '#FFF0F0' },
  label: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  approvedLabel: { color: colors.success },
  attentionLabel: { color: colors.danger },
})
