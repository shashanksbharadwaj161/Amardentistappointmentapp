import type { ClinicSummary } from '@amar-dentist/domain'
import { addCalendarDays, clinicDate, clinicDayStart, formatClinicTime } from './calendar-dates'
import { getCalendarContext, getProfessionalOverview } from './phase2'
import { getClinicOperationsContext, type ClinicAppointment } from './phase3'
import { supabase } from './supabase'

const previewUserId = '00000000-0000-4000-8000-000000000001'
const isPreview = (userId: string) => !supabase || userId === previewUserId

export type CalendarDirectory = {
  clinics: ClinicSummary[]
  clinic: ClinicSummary | null
  dentists: Array<{ id: string; name: string }>
  services: Array<{ id: string; name: string; dentistId: string | null; durationMinutes: number }>
}
export type CalendarAvailability = { date: string; startAt: string; endAt: string; startTime: string; endTime: string }

export async function getCalendarDirectory(userId: string, selectedClinicId?: string): Promise<CalendarDirectory> {
  const overview = await getProfessionalOverview(userId)
  const clinics = overview.clinics.filter((item) => item.status === 'approved')
  const clinic = clinics.find((item) => item.id === selectedClinicId) ?? clinics[0] ?? null
  if (!clinic) return { clinics, clinic, dentists: [], services: [] }
  if (isPreview(userId)) {
    const data = await getClinicOperationsContext(userId, clinic.id)
    return { clinics, clinic, dentists: data.dentists, services: data.services.map((service) => ({ ...service, durationMinutes: 30 })) }
  }
  const [dentists, services] = await Promise.all([
    supabase!.from('clinic_memberships').select('user_id,profiles(full_name)').eq('clinic_id', clinic.id).eq('role', 'dentist').eq('status', 'active'),
    supabase!.from('clinic_services').select('id,name,dentist_id,duration_minutes').eq('clinic_id', clinic.id).eq('is_active', true).order('name'),
  ])
  if (dentists.error || services.error) throw new Error(dentists.error?.message ?? services.error?.message)
  return {
    clinics, clinic,
    dentists: (dentists.data ?? []).map((row) => {
      const value = row.profiles as unknown
      const person = (Array.isArray(value) ? value[0] : value) as { full_name: string } | null
      return { id: row.user_id, name: person?.full_name ?? 'Dentist' }
    }),
    services: (services.data ?? []).map((row) => ({ id: row.id, name: row.name, dentistId: row.dentist_id, durationMinutes: row.duration_minutes })),
  }
}

export async function getCalendarAppointments(userId: string, clinicId: string, from: string, through: string): Promise<ClinicAppointment[]> {
  if (isPreview(userId)) {
    const data = await getClinicOperationsContext(userId, clinicId)
    return data.appointments.filter((item) => clinicDate(item.startAt) >= from && clinicDate(item.startAt) <= through)
  }
  const { data, error } = await supabase!.rpc('list_clinic_appointments', {
    target_clinic_id: clinicId,
    from_at: clinicDayStart(from),
    through_at: clinicDayStart(addCalendarDays(through, 1)),
  })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: String(row.appointment_id), patientProfileId: String(row.patient_profile_id),
    patientName: String(row.patient_name), patientPhone: String(row.patient_phone ?? ''),
    dentistId: String(row.dentist_id), serviceId: String(row.service_id), serviceName: String(row.service_name),
    startAt: String(row.start_at), endAt: String(row.end_at), status: String(row.appointment_status), depositBdt: Number(row.deposit_bdt),
  }))
}

export async function getCalendarAvailability(userId: string, clinicId: string, dentistId: string, serviceId: string, from: string, through: string): Promise<CalendarAvailability[]> {
  const today = clinicDate()
  // The availability RPC rejects a whole range if its first day is in the past.
  const first = from < today ? today : from
  const horizon = addCalendarDays(new Date().toISOString().slice(0, 10), 180)
  const last = through > horizon ? horizon : through
  if (last < first) return []
  if (isPreview(userId)) {
    const [context, operations] = await Promise.all([
      getCalendarContext(userId, new Date(`${first}T12:00:00Z`), new Date(`${last}T12:00:00Z`)),
      getClinicOperationsContext(userId, clinicId),
    ])
    return context.slots.filter((slot) => slot.date >= first && slot.date <= last).map((slot) => ({
      ...slot, startAt: new Date(`${slot.date}T${slot.startTime}:00+06:00`).toISOString(), endAt: new Date(`${slot.date}T${slot.endTime}:00+06:00`).toISOString(),
    })).filter((slot) => new Date(slot.startAt).getTime() > Date.now() && !operations.appointments.some((appointment) =>
      appointment.dentistId === dentistId && ['confirmed', 'checked_in', 'in_progress'].includes(appointment.status)
      && Date.parse(appointment.startAt) < Date.parse(slot.endAt) && Date.parse(appointment.endAt) > Date.parse(slot.startAt)))
  }
  const { data, error } = await supabase!.rpc('available_clinic_slots', {
    target_clinic_id: clinicId, target_dentist_id: dentistId, target_service_id: serviceId, from_date: first, through_date: last,
  })
  if (error) throw new Error(error.message)
  return (data ?? []).map((row: { slot_date: string; start_at: string; end_at: string }) => ({
    date: row.slot_date, startAt: row.start_at, endAt: row.end_at,
    startTime: formatClinicTime(row.start_at, 'en'), endTime: formatClinicTime(row.end_at, 'en'),
  }))
}
