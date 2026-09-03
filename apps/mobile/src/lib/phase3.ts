import type { MarketplaceDentist, MarketplaceFilter, PatientProfileInput } from '@amar-dentist/domain'
import * as Location from 'expo-location'
import { supabase } from './supabase'

export type PatientProfileSummary = PatientProfileInput & { id: string }
export type BookingSlot = { startAt: string; endAt: string }
export type BookingHold = { id: string; expiresAt: string; endAt: string; priceBdt: number; depositBdt: number }
export type BookingConfirmation = { appointmentId: string; receiptNumber: string; status: string }
export type AppointmentSummary = { id: string; patientProfileId: string; clinicId: string; clinicName: string; serviceName: string; startAt: string; endAt: string; status: string; depositBdt: number; cancellationDisposition: string | null }
export type ChatMessage = { id: string; senderId: string; body: string; createdAt: string }

const previewUserId = '00000000-0000-4000-8000-000000000001'
const previewClinicId = '30000000-0000-4000-8000-000000000001'
const previewDentistId = '20000000-0000-4000-8000-000000000002'
const previewServiceId = '40000000-0000-4000-8000-000000000001'
const previewEnabled = process.env.EXPO_PUBLIC_DEMO_MODE === 'true'
const requestId = () => `amar-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`

const demoMarketplace: MarketplaceDentist[] = [
  { dentistId: previewDentistId, clinicId: previewClinicId, clinicName: 'Shapla Dental Studio', dentistName: 'Dr. Ayesha Rahman', professionalTitle: 'Dental Surgeon', specialties: ['General dentistry', 'Preventive care'], languages: ['bn', 'en'], gender: 'female', yearsExperience: 9, serviceId: previewServiceId, serviceName: 'Dental consultation', durationMinutes: 30, priceBdt: 800, depositBdt: 200, rating: 4.9, reviewCount: 84, distanceKm: 1.8, nextAvailableAt: new Date(Date.now() + 86_400_000).toISOString(), openNow: true },
  { dentistId: '20000000-0000-4000-8000-000000000003', clinicId: '30000000-0000-4000-8000-000000000002', clinicName: 'Riverbend Dental Care', dentistName: 'Dr. Farhan Karim', professionalTitle: 'Dental Surgeon', specialties: ['Restorative dentistry'], languages: ['bn', 'en'], gender: 'male', yearsExperience: 12, serviceId: '40000000-0000-4000-8000-000000000002', serviceName: 'Dental consultation', durationMinutes: 30, priceBdt: 1000, depositBdt: 250, rating: 4.7, reviewCount: 52, distanceKm: 3.4, nextAvailableAt: new Date(Date.now() + 172_800_000).toISOString(), openNow: false },
  { dentistId: '20000000-0000-4000-8000-000000000004', clinicId: '30000000-0000-4000-8000-000000000003', clinicName: 'Pearl Family Dentistry', dentistName: 'Dr. Nusrat Jahan', professionalTitle: 'Paediatric Dentist', specialties: ['Paediatric dentistry'], languages: ['bn'], gender: 'female', yearsExperience: 7, serviceId: '40000000-0000-4000-8000-000000000003', serviceName: 'Child dental consultation', durationMinutes: 40, priceBdt: 1200, depositBdt: 300, rating: 4.8, reviewCount: 39, distanceKm: 5.1, nextAvailableAt: new Date(Date.now() + 259_200_000).toISOString(), openNow: true },
]

export async function requestCurrentLocation(): Promise<{ latitude: number; longitude: number } | null> {
  const permission = await Location.requestForegroundPermissionsAsync()
  if (permission.status !== Location.PermissionStatus.GRANTED) return null
  const result = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
  return { latitude: result.coords.latitude, longitude: result.coords.longitude }
}

export async function searchMarketplace(filters: MarketplaceFilter): Promise<MarketplaceDentist[]> {
  if (!supabase || previewEnabled) {
    const term = filters.query.toLowerCase()
    return demoMarketplace.filter((item) => (!term || `${item.dentistName} ${item.clinicName}`.toLowerCase().includes(term))
      && (!filters.specialty || item.specialties.some((specialty) => specialty.toLowerCase().includes(filters.specialty.toLowerCase())))
      && (!filters.gender || item.gender === filters.gender)
      && (!filters.language || item.languages.includes(filters.language))
      && (filters.maxPriceBdt === null || item.priceBdt <= filters.maxPriceBdt)
      && item.rating >= filters.minimumRating
      && (!filters.openNow || item.openNow))
  }
  const { data, error } = await supabase.rpc('search_marketplace', {
    search_text: filters.query,
    specialty_filter: filters.specialty,
    gender_filter: filters.gender,
    language_filter: filters.language,
    max_price_bdt: filters.maxPriceBdt,
    minimum_rating: filters.minimumRating,
    search_latitude: filters.latitude,
    search_longitude: filters.longitude,
    radius_km: filters.radiusKm,
  })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row: Record<string, unknown>) => ({
    dentistId: String(row.dentist_id), clinicId: String(row.clinic_id), clinicName: String(row.clinic_name), dentistName: String(row.dentist_name),
    professionalTitle: String(row.professional_title), specialties: row.specialties as string[], languages: row.languages as string[],
    gender: row.gender ? String(row.gender) : null, yearsExperience: row.years_experience === null ? null : Number(row.years_experience),
    serviceId: String(row.service_id), serviceName: String(row.service_name), durationMinutes: Number(row.duration_minutes),
    priceBdt: Number(row.price_bdt), depositBdt: Number(row.deposit_bdt), rating: Number(row.rating), reviewCount: Number(row.review_count),
    distanceKm: row.distance_km === null ? null : Number(row.distance_km), nextAvailableAt: null, openNow: false,
  }))
}

export async function getPatientProfiles(userId: string): Promise<PatientProfileSummary[]> {
  if (!supabase || previewEnabled || userId === previewUserId) return [{ id: previewUserId, relationship: 'self', fullName: 'Preview Patient', dateOfBirth: null, gender: null, phone: '', city: 'Dhaka', district: 'Dhaka' }]
  const { data, error } = await supabase.from('patient_profiles').select('id,relationship,full_name,date_of_birth,gender,phone,city,district').order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({ id: row.id, relationship: row.relationship, fullName: row.full_name, dateOfBirth: row.date_of_birth, gender: row.gender, phone: row.phone, city: row.city, district: row.district })) as PatientProfileSummary[]
}

export async function savePatientProfile(input: PatientProfileInput): Promise<string> {
  if (!supabase || previewEnabled) return input.id ?? previewUserId
  const { data, error } = await supabase.rpc('upsert_patient_profile', {
    patient_profile_id: input.id,
    patient_relationship: input.relationship,
    patient_full_name: input.fullName,
    patient_date_of_birth: input.dateOfBirth,
    patient_gender: input.gender,
    patient_phone: input.phone,
    patient_city: input.city,
    patient_district: input.district,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function getBookingSlots(item: MarketplaceDentist): Promise<BookingSlot[]> {
  const from = new Date(); const through = new Date(from); through.setUTCDate(through.getUTCDate() + 13)
  if (!supabase || previewEnabled) {
    return [1, 1, 2, 3, 3, 5].map((offset, index) => { const start = new Date(); start.setUTCDate(start.getUTCDate() + offset); start.setUTCHours(3 + (index % 3), index % 2 ? 30 : 0, 0, 0); return { startAt: start.toISOString(), endAt: new Date(start.getTime() + item.durationMinutes * 60_000).toISOString() } })
  }
  const { data, error } = await supabase.rpc('available_clinic_slots', { target_clinic_id: item.clinicId, target_dentist_id: item.dentistId, target_service_id: item.serviceId, from_date: from.toISOString().slice(0, 10), through_date: through.toISOString().slice(0, 10) })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row: { start_at: string; end_at: string }) => ({ startAt: row.start_at, endAt: row.end_at }))
}

export async function createBookingHold(patientProfileId: string, item: MarketplaceDentist, startAt: string): Promise<BookingHold> {
  if (!supabase || previewEnabled) return { id: requestId(), expiresAt: new Date(Date.now() + 600_000).toISOString(), endAt: new Date(new Date(startAt).getTime() + item.durationMinutes * 60_000).toISOString(), priceBdt: item.priceBdt, depositBdt: item.depositBdt }
  const { data, error } = await supabase.rpc('create_appointment_hold', { target_patient_profile_id: patientProfileId, target_service_id: item.serviceId, target_dentist_id: item.dentistId, requested_start_at: startAt })
  if (error) throw new Error(error.message)
  const row = data[0]
  return { id: row.hold_id, expiresAt: row.expires_at, endAt: row.end_at, priceBdt: Number(row.price_bdt), depositBdt: Number(row.deposit_bdt) }
}

export async function confirmMockBooking(holdId: string): Promise<BookingConfirmation> {
  if (!supabase || previewEnabled) return { appointmentId: requestId(), receiptNumber: `AMR-${Date.now().toString(36).toUpperCase()}`, status: 'confirmed' }
  const confirmationRequestId = requestId()
  const { data, error } = await supabase.rpc('confirm_mock_appointment', { target_hold_id: holdId, request_id: confirmationRequestId })
  if (error) throw new Error(error.message)
  const row = data[0]
  return { appointmentId: row.appointment_id, receiptNumber: row.receipt_number, status: row.appointment_status }
}

export async function getAppointments(userId: string): Promise<AppointmentSummary[]> {
  if (!supabase || previewEnabled || userId === previewUserId) {
    const start = new Date(); start.setUTCDate(start.getUTCDate() + 2); start.setUTCHours(4, 0, 0, 0)
    return [{ id: '60000000-0000-4000-8000-000000000001', patientProfileId: previewUserId, clinicId: previewClinicId, clinicName: 'Shapla Dental Studio', serviceName: 'Dental consultation', startAt: start.toISOString(), endAt: new Date(start.getTime() + 1_800_000).toISOString(), status: 'confirmed', depositBdt: 200, cancellationDisposition: null }]
  }
  const { data, error } = await supabase.from('appointments').select('id,patient_profile_id,clinic_id,start_at,end_at,status,deposit_bdt,cancellation_disposition,clinics(name),clinic_services(name)').order('start_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => { const clinicValue = row.clinics as unknown; const serviceValue = row.clinic_services as unknown; const clinic = (Array.isArray(clinicValue) ? clinicValue[0] : clinicValue) as { name: string } | null; const service = (Array.isArray(serviceValue) ? serviceValue[0] : serviceValue) as { name: string } | null; return { id: row.id, patientProfileId: row.patient_profile_id, clinicId: row.clinic_id, clinicName: clinic?.name ?? '', serviceName: service?.name ?? '', startAt: row.start_at, endAt: row.end_at, status: row.status, depositBdt: Number(row.deposit_bdt), cancellationDisposition: row.cancellation_disposition } })
}

export async function cancelAppointment(appointmentId: string, reason = ''): Promise<string> {
  if (!supabase || previewEnabled) return 'refundable'
  const { data, error } = await supabase.rpc('cancel_appointment', { target_appointment_id: appointmentId, cancellation_reason: reason })
  if (error) throw new Error(error.message)
  return data as string
}

export async function getOrCreateChatThread(patientProfileId: string, clinicId: string, appointmentId: string | null): Promise<string> {
  if (!supabase || previewEnabled) return '70000000-0000-4000-8000-000000000001'
  const { data, error } = await supabase.rpc('get_or_create_chat_thread', { target_patient_profile_id: patientProfileId, target_clinic_id: clinicId, target_appointment_id: appointmentId })
  if (error) throw new Error(error.message)
  return data as string
}

export async function getChatMessages(threadId: string): Promise<ChatMessage[]> {
  if (!supabase || previewEnabled) return [{ id: '71000000-0000-4000-8000-000000000001', senderId: 'clinic', body: 'Your appointment is confirmed. Please arrive 10 minutes early.', createdAt: new Date().toISOString() }]
  const { data, error } = await supabase.from('chat_messages').select('id,sender_id,body,created_at').eq('thread_id', threadId).order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({ id: row.id, senderId: row.sender_id, body: row.body, createdAt: row.created_at }))
}

export async function sendChatMessage(threadId: string, body: string): Promise<string> {
  if (!supabase || previewEnabled) return requestId()
  const { data, error } = await supabase.rpc('send_chat_message', { target_thread_id: threadId, message_body: body })
  if (error) throw new Error(error.message)
  return data as string
}

export function subscribeToChatMessages(threadId: string, onMessage: (message: ChatMessage) => void): () => void {
  const client = supabase
  if (!client || previewEnabled) return () => undefined
  const channel = client.channel(`chat:${threadId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` }, (payload) => {
      const row = payload.new as { id: string; sender_id: string; body: string; created_at: string }
      onMessage({ id: row.id, senderId: row.sender_id, body: row.body, createdAt: row.created_at })
    })
    .subscribe()
  return () => { void client.removeChannel(channel) }
}
