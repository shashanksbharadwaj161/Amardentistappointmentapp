import { distanceBetweenKm, marketplaceFilterSchema, readMapCoordinates, type GuestWalkInInput, type MarketplaceDentist, type MarketplaceFilter, type PatientProfileInput, type ReviewInput, type WaitlistRequestInput } from '@amar-dentist/domain'
import * as Location from 'expo-location'
import { Platform } from 'react-native'
import { getProfessionalOverview } from './phase2'
import { isExplicitDemoMode, subscribeToRealtimeChannel } from './realtime'
import { supabase } from './supabase'

export type PatientProfileSummary = PatientProfileInput & { id: string }
export type BookingSlot = { startAt: string; endAt: string }
export type BookingHold = { id: string; expiresAt: string; endAt: string; priceBdt: number; depositBdt: number }
export type BookingConfirmation = { appointmentId: string; receiptNumber: string; status: string }
export type AppointmentSummary = { id: string; patientProfileId: string; clinicId: string; clinicName: string; dentistId: string; serviceId: string; serviceName: string; durationMinutes: number; priceBdt: number; startAt: string; endAt: string; status: string; depositBdt: number; cancellationDisposition: string | null; reviewSubmitted: boolean }
export type ChatMessage = { id: string; senderId: string; body: string; createdAt: string }
export type WaitlistSummary = { id: string; patientProfileId: string; clinicId: string; clinicName: string; dentistId: string | null; serviceId: string; serviceName: string; preferredDate: string; earliestTime: string | null; latestTime: string | null; status: string; offeredStartAt: string | null; offerExpiresAt: string | null }
export type ClinicAppointment = { id: string; patientProfileId: string; patientName: string; patientPhone: string; dentistId: string; serviceId: string; serviceName: string; startAt: string; endAt: string; status: string; depositBdt: number }
export type ClinicWaitlistEntry = { id: string; patientProfileId: string; patientName: string; patientPhone: string; dentistId: string | null; serviceId: string; serviceName: string; preferredDate: string; earliestTime: string | null; latestTime: string | null; status: string; offeredStartAt: string | null; offerExpiresAt: string | null }
export type ClinicChatThread = { id: string; patientProfileId: string; patientName: string; appointmentId: string | null; lastMessage: string; lastMessageAt: string }
export type ClinicOperator = { id: string; name: string }
export type ClinicOperationService = { id: string; name: string; dentistId: string | null }
export type ClinicOperationsContext = { clinics: Array<{ id: string; name: string; roles: string[] }>; clinic: { id: string; name: string; roles: string[] } | null; dentists: ClinicOperator[]; services: ClinicOperationService[]; dentistId: string | null; service: { id: string; name: string } | null; slots: BookingSlot[]; appointments: ClinicAppointment[]; waitlist: ClinicWaitlistEntry[]; chats: ClinicChatThread[] }

const previewUserId = '00000000-0000-4000-8000-000000000001'
const previewClinicId = '30000000-0000-4000-8000-000000000001'
const previewDentistId = '20000000-0000-4000-8000-000000000002'
const previewServiceId = '40000000-0000-4000-8000-000000000001'
const previewEnabled = process.env.EXPO_PUBLIC_DEMO_MODE === 'true'
export const isMarketplacePreview = !supabase || previewEnabled
const requestId = () => `amar-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`

function previewFutureDate(days: number, hour: number, minute = 0): Date {
  const value = new Date()
  value.setUTCDate(value.getUTCDate() + days)
  value.setUTCHours(hour, minute, 0, 0)
  return value
}

const demoMarketplace: MarketplaceDentist[] = [
  { dentistId: previewDentistId, clinicId: previewClinicId, clinicName: 'Shapla Dental Studio', dentistName: 'Dr. Ayesha Rahman', professionalTitle: 'Dental Surgeon', specialties: ['General dentistry', 'Preventive care'], languages: ['bn', 'en'], gender: 'female', yearsExperience: 9, serviceId: previewServiceId, serviceName: 'Dental consultation', durationMinutes: 30, priceBdt: 800, depositBdt: 200, rating: 4.9, reviewCount: 84, distanceKm: 1.8, nextAvailableAt: new Date(Date.now() + 86_400_000).toISOString(), openNow: true, latitude: 23.7808, longitude: 90.4077 },
  { dentistId: '20000000-0000-4000-8000-000000000003', clinicId: '30000000-0000-4000-8000-000000000002', clinicName: 'Riverbend Dental Care', dentistName: 'Dr. Farhan Karim', professionalTitle: 'Dental Surgeon', specialties: ['Restorative dentistry'], languages: ['bn', 'en'], gender: 'male', yearsExperience: 12, serviceId: '40000000-0000-4000-8000-000000000002', serviceName: 'Dental consultation', durationMinutes: 30, priceBdt: 1000, depositBdt: 250, rating: 4.7, reviewCount: 52, distanceKm: 3.4, nextAvailableAt: new Date(Date.now() + 172_800_000).toISOString(), openNow: false, latitude: 23.7519, longitude: 90.3777 },
  { dentistId: '20000000-0000-4000-8000-000000000004', clinicId: '30000000-0000-4000-8000-000000000003', clinicName: 'Pearl Family Dentistry', dentistName: 'Dr. Nusrat Jahan', professionalTitle: 'Paediatric Dentist', specialties: ['Paediatric dentistry'], languages: ['bn'], gender: 'female', yearsExperience: 7, serviceId: '40000000-0000-4000-8000-000000000003', serviceName: 'Child dental consultation', durationMinutes: 40, priceBdt: 1200, depositBdt: 300, rating: 4.8, reviewCount: 39, distanceKm: 5.1, nextAvailableAt: new Date(Date.now() + 259_200_000).toISOString(), openNow: true, latitude: 23.7389, longitude: 90.3954 },
]

export async function requestCurrentLocation(): Promise<{ latitude: number; longitude: number } | null> {
  if (Platform.OS === 'web') {
    if (typeof navigator === 'undefined' || !navigator.geolocation) throw new Error('LOCATION_UNAVAILABLE')
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('LOCATION_TIMEOUT')), 15_000)
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => { clearTimeout(timeout); resolve(readMapCoordinates(coords.latitude, coords.longitude)) },
        (error) => {
          clearTimeout(timeout)
          if (error.code === 1) resolve(null)
          else reject(new Error(error.code === 3 ? 'LOCATION_TIMEOUT' : 'LOCATION_UNAVAILABLE'))
        },
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
      )
    })
  }
  const permission = await Location.requestForegroundPermissionsAsync()
  if (permission.status !== Location.PermissionStatus.GRANTED) return null
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => { timeout = setTimeout(() => reject(new Error('LOCATION_TIMEOUT')), 15_000) }),
    ])
    return readMapCoordinates(result.coords.latitude, result.coords.longitude)
  } finally { clearTimeout(timeout) }
}

export async function searchMarketplace(input: MarketplaceFilter): Promise<MarketplaceDentist[]> {
  const filters = marketplaceFilterSchema.parse(input)
  if (isMarketplacePreview) {
    const term = filters.query.toLowerCase()
    const origin = readMapCoordinates(filters.latitude, filters.longitude)
    return demoMarketplace.map((item) => {
      const destination = readMapCoordinates(item.latitude, item.longitude)
      return { ...item, distanceKm: origin && destination ? distanceBetweenKm(origin, destination) : null }
    }).filter((item) => (!term || `${item.dentistName} ${item.clinicName}`.toLowerCase().includes(term))
      && (!filters.specialty || item.specialties.some((specialty) => specialty.toLowerCase().includes(filters.specialty.toLowerCase())))
      && (!filters.gender || item.gender === filters.gender)
      && (!filters.language || item.languages.includes(filters.language))
      && (filters.maxPriceBdt === null || item.priceBdt <= filters.maxPriceBdt)
      && item.rating >= filters.minimumRating
      && (!filters.openNow || item.openNow)
      && (!origin || item.distanceKm !== null && item.distanceKm <= filters.radiusKm))
  }
  if (!supabase) throw new Error('MARKETPLACE_UNAVAILABLE')
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
  return (data ?? []).map((row: Record<string, unknown>): MarketplaceDentist => {
    const coordinates = readMapCoordinates(row.latitude, row.longitude)
    const distance = row.distance_km === null || row.distance_km === undefined ? null : Number(row.distance_km)
    return {
      dentistId: String(row.dentist_id), clinicId: String(row.clinic_id), clinicName: String(row.clinic_name), dentistName: String(row.dentist_name),
      professionalTitle: String(row.professional_title), specialties: row.specialties as string[], languages: row.languages as string[],
      gender: row.gender ? String(row.gender) : null, yearsExperience: row.years_experience === null ? null : Number(row.years_experience),
      serviceId: String(row.service_id), serviceName: String(row.service_name), durationMinutes: Number(row.duration_minutes),
      priceBdt: Number(row.price_bdt), depositBdt: Number(row.deposit_bdt), rating: Number(row.rating), reviewCount: Number(row.review_count),
      distanceKm: distance !== null && Number.isFinite(distance) && distance >= 0 ? distance : null,
      nextAvailableAt: null, openNow: row.open_now === true,
      latitude: coordinates?.latitude ?? null, longitude: coordinates?.longitude ?? null,
    }
  }).filter((item: MarketplaceDentist) => !filters.openNow || item.openNow)
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
    const start = previewFutureDate(2, 4)
    const completed = previewFutureDate(-3, 5)
    return [
      { id: '60000000-0000-4000-8000-000000000001', patientProfileId: previewUserId, clinicId: previewClinicId, clinicName: 'Shapla Dental Studio', dentistId: previewDentistId, serviceId: previewServiceId, serviceName: 'Dental consultation', durationMinutes: 30, priceBdt: 800, startAt: start.toISOString(), endAt: new Date(start.getTime() + 1_800_000).toISOString(), status: 'confirmed', depositBdt: 200, cancellationDisposition: null, reviewSubmitted: false },
      { id: '60000000-0000-4000-8000-000000000002', patientProfileId: previewUserId, clinicId: previewClinicId, clinicName: 'Shapla Dental Studio', dentistId: previewDentistId, serviceId: previewServiceId, serviceName: 'Dental consultation', durationMinutes: 30, priceBdt: 800, startAt: completed.toISOString(), endAt: new Date(completed.getTime() + 1_800_000).toISOString(), status: 'completed', depositBdt: 200, cancellationDisposition: null, reviewSubmitted: false },
    ]
  }
  const { data, error } = await supabase.from('appointments').select('id,patient_profile_id,clinic_id,dentist_id,service_id,duration_minutes,price_bdt,start_at,end_at,status,deposit_bdt,cancellation_disposition,clinics(name),clinic_services(name),appointment_reviews(id)').order('start_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => { const clinicValue = row.clinics as unknown; const serviceValue = row.clinic_services as unknown; const reviewsValue = row.appointment_reviews as unknown; const clinic = (Array.isArray(clinicValue) ? clinicValue[0] : clinicValue) as { name: string } | null; const service = (Array.isArray(serviceValue) ? serviceValue[0] : serviceValue) as { name: string } | null; return { id: row.id, patientProfileId: row.patient_profile_id, clinicId: row.clinic_id, clinicName: clinic?.name ?? '', dentistId: row.dentist_id, serviceId: row.service_id, serviceName: service?.name ?? '', durationMinutes: row.duration_minutes, priceBdt: Number(row.price_bdt), startAt: row.start_at, endAt: row.end_at, status: row.status, depositBdt: Number(row.deposit_bdt), cancellationDisposition: row.cancellation_disposition, reviewSubmitted: Array.isArray(reviewsValue) ? reviewsValue.length > 0 : Boolean(reviewsValue) } })
}

export async function cancelAppointment(appointmentId: string, reason = ''): Promise<string> {
  if (!supabase || previewEnabled) return 'refundable'
  const { data, error } = await supabase.rpc('cancel_appointment', { target_appointment_id: appointmentId, cancellation_reason: reason })
  if (error) throw new Error(error.message)
  return data as string
}

export async function rescheduleAppointment(appointmentId: string, holdId: string): Promise<BookingConfirmation> {
  if (!supabase || previewEnabled) return { appointmentId: requestId(), receiptNumber: `AMR-${Date.now().toString(36).toUpperCase()}`, status: 'confirmed' }
  const { data, error } = await supabase.rpc('reschedule_appointment', { target_appointment_id: appointmentId, target_hold_id: holdId, request_id: requestId() })
  if (error) throw new Error(error.message)
  const row = data[0]
  return { appointmentId: row.appointment_id, receiptNumber: row.receipt_number, status: 'confirmed' }
}

export async function issueCheckinToken(appointmentId: string): Promise<string> {
  if (!supabase || previewEnabled) return `${requestId()}-${requestId()}`
  const { data, error } = await supabase.rpc('issue_checkin_token', { target_appointment_id: appointmentId })
  if (error) throw new Error(error.message)
  return data as string
}

export async function getWaitlistEntries(): Promise<WaitlistSummary[]> {
  if (!supabase || previewEnabled) {
    const offered = previewFutureDate(1, 4, 30)
    return [
      { id: '72000000-0000-4000-8000-000000000001', patientProfileId: previewUserId, clinicId: previewClinicId, clinicName: 'Shapla Dental Studio', dentistId: previewDentistId, serviceId: previewServiceId, serviceName: 'Dental consultation', preferredDate: offered.toISOString().slice(0, 10), earliestTime: '09:00', latestTime: '12:00', status: 'offered', offeredStartAt: offered.toISOString(), offerExpiresAt: new Date(Date.now() + 900_000).toISOString() },
    ]
  }
  const { error: cleanupError } = await supabase.rpc('expire_waitlist_offers')
  if (cleanupError) throw new Error(cleanupError.message)
  const { data, error } = await supabase.from('waitlist_entries').select('id,patient_profile_id,clinic_id,dentist_id,service_id,preferred_date,earliest_time,latest_time,status,offered_start_at,offer_expires_at,clinics(name),clinic_services(name)').in('status', ['waiting', 'offered']).order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => {
    const clinicValue = row.clinics as unknown; const serviceValue = row.clinic_services as unknown
    const clinic = (Array.isArray(clinicValue) ? clinicValue[0] : clinicValue) as { name: string } | null
    const service = (Array.isArray(serviceValue) ? serviceValue[0] : serviceValue) as { name: string } | null
    return { id: row.id, patientProfileId: row.patient_profile_id, clinicId: row.clinic_id, clinicName: clinic?.name ?? '', dentistId: row.dentist_id, serviceId: row.service_id, serviceName: service?.name ?? '', preferredDate: row.preferred_date, earliestTime: row.earliest_time, latestTime: row.latest_time, status: row.status, offeredStartAt: row.offered_start_at, offerExpiresAt: row.offer_expires_at }
  })
}

export async function joinWaitlist(input: WaitlistRequestInput): Promise<string> {
  if (!supabase || previewEnabled) return requestId()
  const { data, error } = await supabase.rpc('join_waitlist', {
    target_patient_profile_id: input.patientProfileId, target_clinic_id: input.clinicId,
    target_dentist_id: input.dentistId, target_service_id: input.serviceId,
    target_date: input.preferredDate, target_earliest_time: input.earliestTime, target_latest_time: input.latestTime,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function confirmWaitlistOffer(waitlistId: string): Promise<BookingConfirmation> {
  if (!supabase || previewEnabled) return { appointmentId: requestId(), receiptNumber: `AMR-${Date.now().toString(36).toUpperCase()}`, status: 'confirmed' }
  const { data, error } = await supabase.rpc('confirm_waitlist_offer', { target_waitlist_id: waitlistId, request_id: requestId() })
  if (error) throw new Error(error.message)
  const row = data[0]
  return { appointmentId: row.appointment_id, receiptNumber: row.receipt_number, status: row.appointment_status }
}

export async function submitAppointmentReview(input: ReviewInput): Promise<string> {
  if (!supabase || previewEnabled) return requestId()
  const { data, error } = await supabase.rpc('submit_appointment_review', { target_appointment_id: input.appointmentId, review_rating: input.rating, review_comment: input.comment })
  if (error) throw new Error(error.message)
  return data as string
}

export async function getClinicOperationsContext(userId: string, selectedClinicId?: string): Promise<ClinicOperationsContext> {
  const overview = await getProfessionalOverview(userId)
  const clinics = overview.clinics.filter((item) => item.status === 'approved').map(({ id, name, roles }) => ({ id, name, roles }))
  const clinic = (selectedClinicId ? overview.clinics.find((item) => item.id === selectedClinicId && item.status === 'approved') : overview.clinics.find((item) => item.status === 'approved')) ?? null
  if (!clinic) return { clinics, clinic: null, dentists: [], services: [], dentistId: null, service: null, slots: [], appointments: [], waitlist: [], chats: [] }
  if (!supabase || previewEnabled || userId === previewUserId) {
    const start = previewFutureDate(0, 5)
    const next = previewFutureDate(1, 4)
    return {
      clinics, clinic: { id: clinic.id, name: clinic.name, roles: clinic.roles },
      dentists: [{ id: previewDentistId, name: 'Dr. Ayesha Rahman' }],
      services: [{ id: previewServiceId, name: 'Dental consultation', dentistId: null }], dentistId: previewDentistId,
      service: { id: previewServiceId, name: 'Dental consultation' },
      slots: [{ startAt: next.toISOString(), endAt: new Date(next.getTime() + 1_800_000).toISOString() }],
      appointments: [
        { id: '73000000-0000-4000-8000-000000000001', patientProfileId: previewUserId, patientName: 'Preview Patient', patientPhone: '01700000000', dentistId: previewDentistId, serviceId: previewServiceId, serviceName: 'Dental consultation', startAt: start.toISOString(), endAt: new Date(start.getTime() + 1_800_000).toISOString(), status: 'confirmed', depositBdt: 200 },
        { id: '73000000-0000-4000-8000-000000000002', patientProfileId: '74000000-0000-4000-8000-000000000001', patientName: 'Walk-in patient', patientPhone: '', dentistId: previewDentistId, serviceId: previewServiceId, serviceName: 'Dental consultation', startAt: new Date(start.getTime() - 1_800_000).toISOString(), endAt: start.toISOString(), status: 'checked_in', depositBdt: 0 },
      ],
      waitlist: [{ id: '75000000-0000-4000-8000-000000000001', patientProfileId: previewUserId, patientName: 'Waiting patient', patientPhone: '01700000001', dentistId: previewDentistId, serviceId: previewServiceId, serviceName: 'Dental consultation', preferredDate: next.toISOString().slice(0, 10), earliestTime: '09:00', latestTime: '12:00', status: 'waiting', offeredStartAt: null, offerExpiresAt: null }],
      chats: [{ id: '70000000-0000-4000-8000-000000000001', patientProfileId: previewUserId, patientName: 'Preview Patient', appointmentId: '73000000-0000-4000-8000-000000000001', lastMessage: 'Please confirm arrival time.', lastMessageAt: new Date().toISOString() }],
    }
  }
  const { error: cleanupError } = await supabase.rpc('expire_waitlist_offers')
  if (cleanupError) throw new Error(cleanupError.message)
  const [dentistResult, serviceResult] = await Promise.all([
    supabase.from('clinic_memberships').select('user_id,profiles(full_name)').eq('clinic_id', clinic.id).eq('role', 'dentist').eq('status', 'active'),
    supabase.from('clinic_services').select('id,name,duration_minutes,dentist_id').eq('clinic_id', clinic.id).eq('is_active', true).order('name'),
  ])
  if (dentistResult.error) throw new Error(dentistResult.error.message)
  if (serviceResult.error) throw new Error(serviceResult.error.message)
  const dentists = (dentistResult.data ?? []).map((row) => { const value = row.profiles as unknown; const person = (Array.isArray(value) ? value[0] : value) as { full_name: string } | null; return { id: row.user_id, name: person?.full_name ?? 'Dentist' } })
  const services = (serviceResult.data ?? []).map((row) => ({ id: row.id, name: row.name, dentistId: row.dentist_id }))
  const dentistId = clinic.roles.includes('dentist') ? userId : dentists[0]?.id ?? null
  const serviceRow = dentistId ? (serviceResult.data ?? []).find((row) => !row.dentist_id || row.dentist_id === dentistId) ?? null : null
  const from = new Date(); from.setUTCHours(0, 0, 0, 0); const through = new Date(from); through.setUTCDate(through.getUTCDate() + 8)
  const [appointmentResult, waitlistResult, chatResult, slotResult] = await Promise.all([
    supabase.rpc('list_clinic_appointments', { target_clinic_id: clinic.id, from_at: from.toISOString(), through_at: through.toISOString() }),
    supabase.rpc('list_clinic_waitlist', { target_clinic_id: clinic.id }),
    supabase.rpc('list_clinic_chat_threads', { target_clinic_id: clinic.id }),
    dentistId && serviceRow ? supabase.rpc('available_clinic_slots', { target_clinic_id: clinic.id, target_dentist_id: dentistId, target_service_id: serviceRow.id, from_date: from.toISOString().slice(0, 10), through_date: new Date(through.getTime() - 86_400_000).toISOString().slice(0, 10) }) : Promise.resolve({ data: [], error: null }),
  ])
  const error = appointmentResult.error ?? waitlistResult.error ?? chatResult.error ?? slotResult.error
  if (error) throw new Error(error.message)
  return {
    clinics, clinic: { id: clinic.id, name: clinic.name, roles: clinic.roles }, dentists, services, dentistId,
    service: serviceRow ? { id: serviceRow.id, name: serviceRow.name } : null,
    slots: (slotResult.data ?? []).map((row: { start_at: string; end_at: string }) => ({ startAt: row.start_at, endAt: row.end_at })),
    appointments: (appointmentResult.data ?? []).map((row: Record<string, unknown>) => ({ id: String(row.appointment_id), patientProfileId: String(row.patient_profile_id), patientName: String(row.patient_name), patientPhone: String(row.patient_phone ?? ''), dentistId: String(row.dentist_id), serviceId: String(row.service_id), serviceName: String(row.service_name), startAt: String(row.start_at), endAt: String(row.end_at), status: String(row.appointment_status), depositBdt: Number(row.deposit_bdt) })),
    waitlist: (waitlistResult.data ?? []).map((row: Record<string, unknown>) => ({ id: String(row.waitlist_id), patientProfileId: String(row.patient_profile_id), patientName: String(row.patient_name), patientPhone: String(row.patient_phone ?? ''), dentistId: row.dentist_id ? String(row.dentist_id) : null, serviceId: String(row.service_id), serviceName: String(row.service_name), preferredDate: String(row.preferred_date), earliestTime: row.earliest_time ? String(row.earliest_time) : null, latestTime: row.latest_time ? String(row.latest_time) : null, status: String(row.waitlist_status), offeredStartAt: row.offered_start_at ? String(row.offered_start_at) : null, offerExpiresAt: row.offer_expires_at ? String(row.offer_expires_at) : null })),
    chats: (chatResult.data ?? []).map((row: Record<string, unknown>) => ({ id: String(row.thread_id), patientProfileId: String(row.patient_profile_id), patientName: String(row.patient_name), appointmentId: row.appointment_id ? String(row.appointment_id) : null, lastMessage: String(row.last_message ?? ''), lastMessageAt: String(row.last_message_at) })),
  }
}

export async function getClinicWaitlistOfferSlots(clinicId: string, serviceId: string, dentistId: string): Promise<BookingSlot[]> {
  if (!supabase || previewEnabled) {
    const start = previewFutureDate(1, 4)
    return [{ startAt: start.toISOString(), endAt: new Date(start.getTime() + 1_800_000).toISOString() }]
  }
  const from = new Date(); const through = new Date(from); through.setUTCDate(through.getUTCDate() + 8)
  const { data, error } = await supabase.rpc('available_clinic_slots', { target_clinic_id: clinicId, target_dentist_id: dentistId, target_service_id: serviceId, from_date: from.toISOString().slice(0, 10), through_date: through.toISOString().slice(0, 10) })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row: { start_at: string; end_at: string }) => ({ startAt: row.start_at, endAt: row.end_at }))
}

export async function createGuestWalkIn(input: GuestWalkInInput): Promise<string> {
  if (!supabase || previewEnabled) return requestId()
  const { data, error } = await supabase.rpc('create_guest_walk_in_appointment', { target_clinic_id: input.clinicId, guest_full_name: input.fullName, guest_phone: input.phone, target_service_id: input.serviceId, target_dentist_id: input.dentistId, requested_start_at: input.startAt })
  if (error) throw new Error(error.message)
  return data[0].appointment_id as string
}

export async function redeemCheckinToken(token: string): Promise<string> {
  if (!supabase || previewEnabled) return '73000000-0000-4000-8000-000000000001'
  const { data, error } = await supabase.rpc('redeem_checkin_token', { raw_token: token.trim() })
  if (error) throw new Error(error.message)
  return data as string
}

export async function markAppointmentNoShow(appointmentId: string): Promise<void> {
  if (!supabase || previewEnabled) return
  const { error } = await supabase.rpc('mark_appointment_no_show', { target_appointment_id: appointmentId })
  if (error) throw new Error(error.message)
}

export async function markAppointmentCompleted(appointmentId: string): Promise<void> {
  if (!supabase || previewEnabled) return
  const { error } = await supabase.rpc('mark_appointment_completed', { target_appointment_id: appointmentId })
  if (error) throw new Error(error.message)
}

export async function offerWaitlistSlot(clinicId: string, serviceId: string, dentistId: string, startAt: string): Promise<string> {
  if (!supabase || previewEnabled) return requestId()
  const { data, error } = await supabase.rpc('offer_waitlist_slot', { target_clinic_id: clinicId, target_service_id: serviceId, offered_dentist_id: dentistId, offered_slot_start_at: startAt })
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
  if (!client || isExplicitDemoMode()) return () => undefined
  return subscribeToRealtimeChannel(client, `chat:${threadId}`, (channel) => channel
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${threadId}` }, (payload) => {
      const row = payload.new as { id: string; sender_id: string; body: string; created_at: string }
      onMessage({ id: row.id, senderId: row.sender_id, body: row.body, createdAt: row.created_at })
    })
  )
}
