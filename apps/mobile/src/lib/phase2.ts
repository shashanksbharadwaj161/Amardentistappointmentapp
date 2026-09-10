import type {
  ClinicApplicationInput,
  ClinicStaffInvitationInput,
  ClinicServiceInput,
  ClinicSummary,
  DentistApplicationInput,
  LocalAvailabilitySlot,
  VerificationStatus,
  ScheduleExceptionInput,
  WeeklyScheduleBreakInput,
  WeeklyScheduleBlockInput,
} from '@amar-dentist/domain'
import type { DocumentPickerAsset } from 'expo-document-picker'
import { Platform } from 'react-native'
import { isExplicitDemoMode, subscribeToRealtimeChannel } from './realtime'
import { supabase } from './supabase'

export type ProfessionalOverview = {
  dentistStatus: VerificationStatus | null
  dentistReason: string | null
  clinics: ClinicSummary[]
  pendingMemberships: Array<{ id: string; clinicName: string; role: string }>
}

export type CalendarContext = {
  clinic: ClinicSummary | null
  dentistId: string | null
  service: { id: string; name: string; durationMinutes: number } | null
  slots: LocalAvailabilitySlot[]
}

export type ScheduleManagementContext = { clinic: ClinicSummary | null; dentistId: string | null }

const previewId = '00000000-0000-4000-8000-000000000001'

export async function getProfessionalOverview(userId: string): Promise<ProfessionalOverview> {
  if (!supabase || userId === previewId) {
    return {
      dentistStatus: 'submitted',
      dentistReason: null,
      clinics: [{ id: '30000000-0000-4000-8000-000000000001', name: 'Shapla Dental Studio', city: 'Dhaka', district: 'Dhaka', status: 'approved', roles: ['clinic_owner', 'dentist'] }],
      pendingMemberships: [],
    }
  }
  const [{ data: dentist, error: dentistError }, { data: memberships, error: membershipError }] = await Promise.all([
    supabase.from('dentist_profiles').select('status,rejection_reason').eq('user_id', userId).maybeSingle(),
    supabase.from('clinic_memberships').select('id,role,status,clinics(id,name,city,district,status)').eq('user_id', userId).neq('status', 'removed'),
  ])
  if (dentistError) throw new Error(dentistError.message)
  if (membershipError) throw new Error(membershipError.message)

  const clinicMap = new Map<string, ClinicSummary>()
  const pendingMemberships: ProfessionalOverview['pendingMemberships'] = []
  for (const row of memberships ?? []) {
    const clinicValue = row.clinics as unknown
    const clinic = (Array.isArray(clinicValue) ? clinicValue[0] : clinicValue) as { id: string; name: string; city: string; district: string; status: VerificationStatus } | null
    if (!clinic) continue
    if (row.status === 'invited') {
      pendingMemberships.push({ id: row.id, clinicName: clinic.name, role: row.role })
      continue
    }
    const existing = clinicMap.get(clinic.id)
    if (existing) existing.roles.push(row.role as ClinicSummary['roles'][number])
    else clinicMap.set(clinic.id, { ...clinic, roles: [row.role as ClinicSummary['roles'][number]] })
  }
  return {
    dentistStatus: (dentist?.status as VerificationStatus | undefined) ?? null,
    dentistReason: dentist?.rejection_reason ?? null,
    clinics: [...clinicMap.values()],
    pendingMemberships,
  }
}

export async function submitClinicApplication(input: ClinicApplicationInput): Promise<string> {
  if (!supabase) return '30000000-0000-4000-8000-000000000001'
  const { data, error } = await supabase.rpc('create_clinic_application', {
    clinic_name: input.name,
    clinic_phone: input.phone,
    clinic_email: input.email,
    clinic_address: input.address,
    clinic_district: input.district,
    clinic_city: input.city,
    clinic_description: input.description,
    latitude: input.latitude,
    longitude: input.longitude,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function submitDentistApplication(input: DentistApplicationInput): Promise<string> {
  if (!supabase) return previewId
  const { data, error } = await supabase.rpc('submit_dentist_application', {
    registration_number: input.registrationNumber,
    title: input.title,
    biography: input.biography,
    specialty_list: input.specialties,
    language_list: input.languages,
    dentist_gender: input.gender,
    experience_years: input.yearsExperience,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function uploadVerificationDocument(input: {
  userId: string
  targetType: 'clinic' | 'dentist'
  targetId: string
  kind: 'bmdc_card' | 'government_id' | 'clinic_license' | 'clinic_photo' | 'other'
  asset: DocumentPickerAsset
}): Promise<void> {
  if (!supabase || input.userId === previewId) return
  const mimeType = input.asset.mimeType ?? 'application/octet-stream'
  const safeName = input.asset.name.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-100)
  const path = `${input.userId}/${input.targetType}/${input.targetId}/${Date.now()}-${safeName}`
  const body: Blob | ArrayBuffer = Platform.OS === 'web' && input.asset.file
    ? input.asset.file
    : await fetch(input.asset.uri).then((response) => response.arrayBuffer())
  const byteSize = input.asset.size ?? (body instanceof Blob ? body.size : body.byteLength)
  if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) throw new Error('UNSUPPORTED_DOCUMENT_TYPE')
  if (!byteSize || byteSize > 10_485_760) throw new Error('INVALID_DOCUMENT_SIZE')
  const { error: uploadError } = await supabase.storage.from('verification-documents').upload(path, body, { contentType: mimeType, upsert: false })
  if (uploadError) throw new Error(uploadError.message)
  const { error: registerError } = await supabase.rpc('register_verification_document', {
    document_target: input.targetType,
    document_target_id: input.targetId,
    document_type: input.kind,
    document_path: path,
    filename: input.asset.name,
    content_type: mimeType,
    content_size: byteSize,
  })
  if (registerError) {
    await supabase.storage.from('verification-documents').remove([path])
    throw new Error(registerError.message)
  }
}

export async function acceptClinicMembership(membershipId: string): Promise<void> {
  if (!supabase) return
  const { error } = await supabase.rpc('accept_clinic_membership', { target_membership_id: membershipId })
  if (error) throw new Error(error.message)
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

export async function getCalendarContext(userId: string, from: Date, through: Date): Promise<CalendarContext> {
  if (!supabase || userId === previewId) {
    const start = new Date(from)
    const slots: LocalAvailabilitySlot[] = []
    const dayCount = Math.max(0, Math.min(32, Math.floor((through.getTime() - start.getTime()) / 86_400_000) + 1))
    for (let offset = 0; offset < dayCount; offset += 1) {
      const date = new Date(start)
      date.setUTCDate(start.getUTCDate() + offset)
      if (date.getUTCDay() === 5) continue
      for (const startTime of ['09:00', '09:30', '10:30', '11:00', '14:00', '14:30']) {
        const [hour, minute] = startTime.split(':').map(Number)
        const endMinutes = hour! * 60 + minute! + 30
        slots.push({ date: isoDate(date), startTime, endTime: `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}` })
      }
    }
    return {
      clinic: { id: '30000000-0000-4000-8000-000000000001', name: 'Shapla Dental Studio', city: 'Dhaka', district: 'Dhaka', status: 'approved', roles: ['clinic_owner', 'dentist'] },
      dentistId: previewId,
      service: { id: '40000000-0000-4000-8000-000000000001', name: 'Dental consultation', durationMinutes: 30 },
      slots,
    }
  }
  const overview = await getProfessionalOverview(userId)
  const clinic = overview.clinics.find((item) => item.roles.includes('dentist')) ?? overview.clinics[0] ?? null
  if (!clinic) return { clinic: null, dentistId: null, service: null, slots: [] }
  const { data: serviceRow, error: serviceError } = await supabase.from('clinic_services')
    .select('id,name,duration_minutes').eq('clinic_id', clinic.id).eq('is_active', true)
    .or(`dentist_id.is.null,dentist_id.eq.${userId}`).limit(1).maybeSingle()
  if (serviceError) throw new Error(serviceError.message)
  if (!serviceRow) return { clinic, dentistId: userId, service: null, slots: [] }
  const { data: slotRows, error: slotError } = await supabase.rpc('available_clinic_slots', {
    target_clinic_id: clinic.id,
    target_dentist_id: userId,
    target_service_id: serviceRow.id,
    from_date: isoDate(from),
    through_date: isoDate(through),
  })
  if (slotError) throw new Error(slotError.message)
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Dhaka', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  return {
    clinic,
    dentistId: userId,
    service: { id: serviceRow.id, name: serviceRow.name, durationMinutes: serviceRow.duration_minutes },
    slots: (slotRows ?? []).map((row: { slot_date: string; start_at: string; end_at: string }) => ({ date: row.slot_date, startTime: formatter.format(new Date(row.start_at)), endTime: formatter.format(new Date(row.end_at)) })),
  }
}

export function subscribeToAppointmentChanges(dentistId: string, onChange: () => void): () => void {
  const client = supabase
  if (!client || isExplicitDemoMode() || dentistId === previewId) return () => undefined
  return subscribeToRealtimeChannel(client, `dentist-schedule:${dentistId}`, (channel) => channel
    .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `dentist_id=eq.${dentistId}` }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'appointment_holds', filter: `dentist_id=eq.${dentistId}` }, onChange)
  )
}

export async function saveClinicService(input: ClinicServiceInput): Promise<string> {
  if (!supabase) return input.id ?? '40000000-0000-4000-8000-000000000001'
  const { data, error } = await supabase.rpc('upsert_clinic_service', {
    service_id: input.id,
    target_clinic_id: input.clinicId,
    target_dentist_id: input.dentistId,
    service_name: input.name,
    service_description: input.description,
    service_duration_minutes: input.durationMinutes,
    service_price_bdt: input.priceBdt,
    service_deposit_bdt: input.depositBdt,
    service_active: input.active,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function saveWeeklyScheduleBlock(input: WeeklyScheduleBlockInput): Promise<string> {
  if (!supabase) return input.id ?? '50000000-0000-4000-8000-000000000001'
  const { data, error } = await supabase.rpc('upsert_weekly_schedule_block', {
    block_id: input.id,
    target_clinic_id: input.clinicId,
    target_dentist_id: input.dentistId,
    weekday: input.dayOfWeek,
    local_start: input.startTime,
    local_end: input.endTime,
    schedule_timezone: input.timezone,
    active: input.active,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function getScheduleManagementContext(userId: string): Promise<ScheduleManagementContext> {
  const overview = await getProfessionalOverview(userId)
  const clinic = overview.clinics[0] ?? null
  if (!clinic) return { clinic: null, dentistId: null }
  if (clinic.roles.includes('dentist')) return { clinic, dentistId: userId }
  if (!supabase || userId === previewId) return { clinic, dentistId: previewId }
  const { data, error } = await supabase.from('clinic_memberships').select('user_id')
    .eq('clinic_id', clinic.id).eq('role', 'dentist').eq('status', 'active').limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  return { clinic, dentistId: data?.user_id ?? null }
}

export async function saveWeeklyScheduleBreak(input: WeeklyScheduleBreakInput): Promise<string> {
  if (!supabase) return '51000000-0000-4000-8000-000000000001'
  const { data, error } = await supabase.rpc('add_weekly_schedule_break', {
    target_schedule_block_id: input.scheduleBlockId,
    local_start: input.startTime,
    local_end: input.endTime,
    break_label: input.label,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function saveScheduleException(input: ScheduleExceptionInput): Promise<string> {
  if (!supabase) return '52000000-0000-4000-8000-000000000001'
  const { data, error } = await supabase.rpc('add_schedule_exception', {
    target_clinic_id: input.clinicId,
    target_dentist_id: input.dentistId,
    target_date: input.date,
    exception_kind: input.kind,
    local_start: input.startTime,
    local_end: input.endTime,
    exception_reason: input.reason,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function inviteClinicStaff(input: ClinicStaffInvitationInput): Promise<string> {
  if (!supabase) return '53000000-0000-4000-8000-000000000001'
  const { data, error } = await supabase.functions.invoke('clinic-invite', { body: {
    clinicId: input.clinicId, email: input.email, role: input.role, expiresInDays: input.expiresInDays,
  } })
  if (error) throw new Error(error.message)
  if (!data?.ok) throw new Error(data?.error?.code ?? 'INVITATION_FAILED')
  return data.data.email as string
}
