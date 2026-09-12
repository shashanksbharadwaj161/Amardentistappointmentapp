import type { VerificationDecision, VerificationQueueItem } from '@amar-dentist/domain'
import { supabase } from './supabase'

const demoQueue: VerificationQueueItem[] = [
  { id: '60000000-0000-4000-8000-000000000001', targetType: 'dentist', title: 'Dr. Nusrat Rahman', subtitle: 'BMDC A-18472 · General dentistry', status: 'submitted', submittedAt: '2026-09-03T00:18:00Z', documentCount: 2 },
  { id: '60000000-0000-4000-8000-000000000002', targetType: 'clinic', title: 'Shapla Dental Studio', subtitle: 'Dhanmondi, Dhaka', status: 'under_review', submittedAt: '2026-09-02T08:30:00Z', documentCount: 3 },
  { id: '60000000-0000-4000-8000-000000000003', targetType: 'dentist', title: 'Dr. Farhan Karim', subtitle: 'BMDC A-22941 · Orthodontics', status: 'submitted', submittedAt: '2026-09-01T11:40:00Z', documentCount: 1 },
]

export type VerificationDetails = {
  evidence: Array<{ id: string; name: string; kind: string; createdAt: string; signedUrl: string | null }>
  history: Array<{ id: string; decision: VerificationDecision; reason: string; decidedAt: string; reviewer: string }>
}

export async function loadVerificationQueue(): Promise<VerificationQueueItem[]> {
  if (!supabase) return demoQueue
  const [{ data: clinics, error: clinicError }, { data: dentists, error: dentistError }, { data: documents, error: documentError }, { data: profiles, error: profileError }] = await Promise.all([
    supabase.from('clinics').select('id,name,city,district,status,submitted_at').in('status', ['submitted', 'under_review']),
    supabase.from('dentist_profiles').select('user_id,bmdc_registration_number,specialties,status,submitted_at').in('status', ['submitted', 'under_review']),
    supabase.from('verification_documents').select('target_type,target_id'),
    supabase.from('profiles').select('id,full_name'),
  ])
  const error = clinicError ?? dentistError ?? documentError ?? profileError
  if (error) throw new Error(error.message)
  const counts = new Map<string, number>()
  for (const document of documents ?? []) {
    const key = `${document.target_type}:${document.target_id}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.full_name]))
  return [
    ...(clinics ?? []).map((clinic): VerificationQueueItem => ({
      id: clinic.id, targetType: 'clinic', title: clinic.name, subtitle: `${clinic.district}, ${clinic.city}`,
      status: clinic.status, submittedAt: clinic.submitted_at, documentCount: counts.get(`clinic:${clinic.id}`) ?? 0,
    })),
    ...(dentists ?? []).map((dentist): VerificationQueueItem => ({
      id: dentist.user_id, targetType: 'dentist', title: names.get(dentist.user_id) || 'Dentist applicant',
      subtitle: `${dentist.bmdc_registration_number} · ${dentist.specialties[0] ?? 'General dentistry'}`,
      status: dentist.status, submittedAt: dentist.submitted_at, documentCount: counts.get(`dentist:${dentist.user_id}`) ?? 0,
    })),
  ].sort((left, right) => left.submittedAt.localeCompare(right.submittedAt))
}

export async function reviewVerification(item: VerificationQueueItem, decision: VerificationDecision, reason: string): Promise<void> {
  if (!supabase) {
    await new Promise((resolve) => setTimeout(resolve, 220))
    return
  }
  const functionName = item.targetType === 'clinic' ? 'decide_clinic_application' : 'decide_dentist_application'
  const idKey = item.targetType === 'clinic' ? 'target_clinic_id' : 'target_user_id'
  const { error } = await supabase.rpc(functionName, { [idKey]: item.id, review_decision: decision, review_reason: reason })
  if (error) throw new Error(error.message)
}

export async function loadVerificationDetails(item: VerificationQueueItem): Promise<VerificationDetails> {
  if (!supabase) return {
    evidence: Array.from({ length: item.documentCount }, (_, index) => ({ id: `${item.id}-${index}`, name: index === 0 ? 'Registration credential.pdf' : `Supporting evidence ${index + 1}.jpg`, kind: index === 0 ? 'bmdc card' : 'supporting document', createdAt: item.submittedAt, signedUrl: null })),
    history: item.status === 'under_review' ? [{ id: `${item.id}-history`, decision: 'changes_requested', reason: 'Please provide a clearer clinic license image.', decidedAt: item.submittedAt, reviewer: 'Platform reviewer' }] : [],
  }
  const client = supabase
  const [{ data: documents, error: documentError }, { data: decisions, error: decisionError }] = await Promise.all([
    client.from('verification_documents').select('id,original_filename,document_kind,storage_path,created_at').eq('target_type', item.targetType).eq('target_id', item.id).order('created_at'),
    client.from('verification_decisions').select('id,decision,reason,decided_at,decided_by').eq('target_type', item.targetType).eq('target_id', item.id).order('decided_at', { ascending: false }),
  ])
  const error = documentError ?? decisionError
  if (error) throw new Error(error.message)
  const reviewerIds = [...new Set((decisions ?? []).map((decision) => decision.decided_by))]
  const { data: reviewers, error: reviewerError } = reviewerIds.length
    ? await client.from('profiles').select('id,full_name').in('id', reviewerIds)
    : { data: [], error: null }
  if (reviewerError) throw new Error(reviewerError.message)
  const reviewerNames = new Map((reviewers ?? []).map((reviewer) => [reviewer.id, reviewer.full_name]))
  const evidence = await Promise.all((documents ?? []).map(async (document) => {
    const { data, error: signedUrlError } = await client.storage.from('verification-documents').createSignedUrl(document.storage_path, 300)
    if (signedUrlError || !data?.signedUrl) throw new Error('PRIVATE_EVIDENCE_UNAVAILABLE')
    return { id: document.id, name: document.original_filename, kind: document.document_kind.replaceAll('_', ' '), createdAt: document.created_at, signedUrl: data?.signedUrl ?? null }
  }))
  return {
    evidence,
    history: (decisions ?? []).map((decision) => ({ id: decision.id, decision: decision.decision as VerificationDecision, reason: decision.reason, decidedAt: decision.decided_at, reviewer: reviewerNames.get(decision.decided_by) || 'Platform reviewer' })),
  }
}
