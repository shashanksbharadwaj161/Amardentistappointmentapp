import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { buildPrescriptionPdf, createPrescriptionHandler } from './handler.ts'

const config = { supabaseUrl: 'https://project.example.test', publishableKey: 'publishable', serviceRoleKey: 'service', webAppUrl: 'https://app.example.test' }
const prescriptionId = '85000000-0000-4000-8000-000000000001'
const patientId = '00000000-0000-4000-8000-000000000001'
function assert(value: boolean, message: string) { if (!value) throw new Error(message) }
function request(body: string) { return new Request('https://project.example.test/functions/v1/generate-prescription', { method: 'POST', headers: { authorization: 'Bearer caller', 'content-type': 'application/json' }, body }) }

function factory(options: { authenticated?: boolean; available?: boolean } = {}) {
  const row = { id: prescriptionId, patient_profile_id: patientId, status: 'finalized', instructions: 'After food', finalized_at: '2026-09-04T00:00:00Z', prescription_items: [{ medicine_name: 'Medicine A', strength: '500 mg', dosage: '1 tablet', route: 'oral', frequency: 'twice daily', duration: '3 days', instructions: '' }] }
  const caller = { auth: { getUser: async () => ({ data: { user: options.authenticated === false ? null : { id: 'caller' } }, error: null }) }, from: () => { const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: options.available === false ? null : row, error: null }) }; return chain }, rpc: async () => ({ error: null }) }
  const bucket = { upload: async () => ({ error: null }), createSignedUrl: async () => ({ data: { signedUrl: 'https://signed.example.test/document' }, error: null }) }
  const service = { storage: { from: () => bucket } }
  return ((_url: string, key: string) => key === 'publishable' ? caller : service) as unknown as typeof createClient
}

Deno.test('prescription document service fails closed without configuration', async () => { const response = await createPrescriptionHandler({})(request('{}')); assert(response.status === 503, 'expected 503') })
Deno.test('prescription document rejects invalid input', async () => { const response = await createPrescriptionHandler(config, factory())(request('{"prescriptionId":"bad"}')); assert(response.status === 400, 'expected 400') })
Deno.test('prescription document rejects unauthenticated callers', async () => { const response = await createPrescriptionHandler(config, factory({ authenticated: false }))(request(JSON.stringify({ prescriptionId }))); assert(response.status === 401, 'expected 401') })
Deno.test('prescription document hides unavailable records', async () => { const response = await createPrescriptionHandler(config, factory({ available: false }))(request(JSON.stringify({ prescriptionId }))); assert(response.status === 404, 'expected 404') })
Deno.test('prescription document returns a short-lived private link', async () => { const response = await createPrescriptionHandler(config, factory(), async () => new Uint8Array([1, 2, 3]))(request(JSON.stringify({ prescriptionId }))); const body = await response.json(); assert(response.status === 200, 'expected 200'); assert(body.data.expiresInSeconds === 300, 'expected five-minute link') })
Deno.test('prescription PDF builder emits a valid PDF', async () => { const bytes = await buildPrescriptionPdf({ id: prescriptionId, patient_profile_id: patientId, status: 'finalized', instructions: 'After food', finalized_at: '2026-09-04T00:00:00Z', prescription_items: [{ medicine_name: 'Medicine A', strength: '500 mg', dosage: '1 tablet', route: 'oral', frequency: 'twice daily', duration: '3 days', instructions: '' }] }); assert(new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-', 'expected PDF signature') })
