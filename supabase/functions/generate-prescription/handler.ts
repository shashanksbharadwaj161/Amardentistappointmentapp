import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1'
import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { json } from '../_shared/http.ts'

type PrescriptionItem = { medicine_name: string; strength: string; dosage: string; route: string; frequency: string; duration: string; instructions: string }
type PrescriptionRecord = { id: string; patient_profile_id: string; status: string; instructions: string; finalized_at: string; prescription_items: PrescriptionItem[] }
export type PrescriptionConfig = { supabaseUrl?: string; publishableKey?: string; serviceRoleKey?: string; webAppUrl?: string }

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function wrap(text: string, width = 82): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const lines: string[] = []
  for (const word of words) {
    const last = lines.at(-1)
    if (!last || last.length + word.length + 1 > width) lines.push(word)
    else lines[lines.length - 1] = `${last} ${word}`
  }
  return lines.length ? lines : ['']
}

export async function buildPrescriptionPdf(record: PrescriptionRecord): Promise<Uint8Array> {
  const document = await PDFDocument.create()
  let page = document.addPage([595, 842])
  const regular = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  let y = 788
  const line = (text: string, size = 10, strong = false, color = rgb(0.08, 0.13, 0.18)) => {
    if (y < 70) { page = document.addPage([595, 842]); y = 788 }
    page.drawText(text.replace(/[^\x20-\x7E]/g, ''), { x: 52, y, size, font: strong ? bold : regular, color })
    y -= size + 8
  }
  line('AMAR DENTIST', 18, true, rgb(0.09, 0.4, 0.38))
  line('Finalized prescription', 14, true)
  line(`Record: ${record.id}`, 8)
  line(`Finalized: ${new Date(record.finalized_at).toISOString()}`, 8)
  y -= 10
  record.prescription_items.forEach((item, index) => {
    line(`${index + 1}. ${item.medicine_name}${item.strength ? ` - ${item.strength}` : ''}`, 11, true)
    for (const value of wrap(`${item.dosage}; ${item.route}; ${item.frequency}; ${item.duration}`)) line(value)
    if (item.instructions) for (const value of wrap(item.instructions)) line(value, 9)
    y -= 6
  })
  if (record.instructions) { line('General instructions', 11, true); for (const value of wrap(record.instructions)) line(value) }
  y -= 14
  line('Generated from a reviewed and finalized clinical record.', 8, false, rgb(0.35, 0.41, 0.45))
  line('Follow the treating dentist instructions. This document is not a new diagnosis.', 8, false, rgb(0.35, 0.41, 0.45))
  return document.save()
}

export function createPrescriptionHandler(config: PrescriptionConfig, clientFactory: typeof createClient = createClient, pdfBuilder = buildPrescriptionPdf) {
  const { supabaseUrl, publishableKey, serviceRoleKey, webAppUrl } = config
  return async (request: Request) => {
    if (!supabaseUrl || !publishableKey || !serviceRoleKey) return json(503, { ok: false, error: { code: 'SERVICE_NOT_CONFIGURED', message: 'Prescription document service is not configured' } })
    const origin = request.headers.get('origin')
    const allowedOrigin = webAppUrl ? new URL(webAppUrl).origin : null
    const cors: Record<string, string> = origin && origin === allowedOrigin ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization, content-type, apikey', 'access-control-allow-methods': 'POST, OPTIONS', vary: 'origin' } : {}
    const respond = (status: number, body: unknown) => json(status, body, cors)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') return respond(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST required' } })
    const authorization = request.headers.get('authorization')
    if (!authorization) return respond(401, { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in required' } })
    let body: { prescriptionId?: string }
    try { body = await request.json() } catch { return respond(400, { ok: false, error: { code: 'INVALID_INPUT', message: 'Valid JSON required' } }) }
    if (!body.prescriptionId || !uuid.test(body.prescriptionId)) return respond(400, { ok: false, error: { code: 'INVALID_INPUT', message: 'Valid prescription id required' } })
    const caller = clientFactory(supabaseUrl, publishableKey, { global: { headers: { authorization } } })
    const { data: userData, error: authError } = await caller.auth.getUser()
    if (authError || !userData.user) return respond(401, { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Invalid session' } })
    const { data: prescription, error: readError } = await caller.from('prescriptions').select('id,patient_profile_id,status,instructions,finalized_at,prescription_items(medicine_name,strength,dosage,route,frequency,duration,instructions)').eq('id', body.prescriptionId).maybeSingle()
    if (readError || !prescription || prescription.status === 'draft') return respond(404, { ok: false, error: { code: 'PRESCRIPTION_NOT_AVAILABLE', message: 'Finalized prescription not found' } })
    const record = prescription as unknown as PrescriptionRecord
    const pdf = await pdfBuilder(record)
    const objectPath = `${record.patient_profile_id}/${record.id}.pdf`
    const service = clientFactory(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error: uploadError } = await service.storage.from('prescriptions').upload(objectPath, pdf, { contentType: 'application/pdf', upsert: true })
    if (uploadError) return respond(500, { ok: false, error: { code: 'DOCUMENT_UPLOAD_FAILED', message: 'Prescription document could not be stored' } })
    const { error: registerError } = await caller.rpc('set_prescription_document', { target_prescription_id: record.id, object_path: objectPath })
    if (registerError) return respond(500, { ok: false, error: { code: 'DOCUMENT_REGISTRATION_FAILED', message: 'Prescription document could not be registered' } })
    const { data: signed, error: signedError } = await service.storage.from('prescriptions').createSignedUrl(objectPath, 300)
    if (signedError || !signed?.signedUrl) return respond(500, { ok: false, error: { code: 'SIGNED_URL_FAILED', message: 'Private download could not be prepared' } })
    return respond(200, { ok: true, data: { url: signed.signedUrl, expiresInSeconds: 300 } })
  }
}
