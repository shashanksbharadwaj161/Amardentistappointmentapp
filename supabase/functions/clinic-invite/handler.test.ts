import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { createClinicInviteHandler } from './handler.ts'

type Scenario = { authenticated?: boolean; recordError?: string; existing?: boolean; lookupError?: boolean; deliveryError?: boolean; activationError?: boolean; cleanupError?: boolean }
type Effects = { invited: boolean; activated: boolean; revoked: boolean; deleted: boolean }
const config = { supabaseUrl: 'https://project.example.test', publishableKey: 'publishable', serviceRoleKey: 'service', appRedirectUrl: 'amardentist://auth/callback', webAppUrl: 'https://app.example.test' }
const clinicId = '30000000-0000-4000-8000-000000000001'

function assertEquals(actual: unknown, expected: unknown) { const left = JSON.stringify(actual); const right = JSON.stringify(expected); if (left !== right) throw new Error(`Expected ${right}, received ${left}`) }
function effects(): Effects { return { invited: false, activated: false, revoked: false, deleted: false } }

function factory(scenario: Scenario, state: Effects) {
  const caller = {
    auth: { getUser: async () => ({ data: { user: scenario.authenticated === false ? null : { id: 'caller' } }, error: null }) },
    rpc: async () => scenario.recordError ? { data: null, error: { message: scenario.recordError } } : { data: 'invite-id', error: null },
  }
  const service = {
    auth: { admin: {
      inviteUserByEmail: async () => { state.invited = true; return { data: { user: { id: 'new-user' } }, error: scenario.deliveryError ? { message: 'failed' } : null } },
      deleteUser: async () => { state.deleted = true; return { error: null } },
    } },
    from: () => { const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: scenario.existing ? { id: 'existing-user' } : null, error: scenario.lookupError ? { message: 'lookup failed' } : null }) }; return chain },
    rpc: async (name: string) => {
      if (name === 'revoke_clinic_invitation_delivery') { state.revoked = true; return { data: !scenario.cleanupError, error: null } }
      state.activated = true
      return scenario.activationError ? { data: null, error: { message: 'failed' } } : { data: true, error: null }
    },
  }
  return ((_url: string, key: string) => key === 'publishable' ? caller : service) as unknown as typeof createClient
}

function request(body: string) { return new Request('https://project.example.test/functions/v1/clinic-invite', { method: 'POST', headers: { authorization: 'Bearer caller', origin: 'https://app.example.test', 'content-type': 'application/json' }, body }) }
const valid = JSON.stringify({ clinicId, email: 'STAFF@EXAMPLE.TEST', role: 'dentist', expiresInDays: 7 })

Deno.test('clinic invite fails closed when service configuration is missing', async () => {
  const response = await createClinicInviteHandler({})(request(valid)); assertEquals(response.status, 503); assertEquals((await response.json()).error.code, 'SERVICE_NOT_CONFIGURED')
})
Deno.test('clinic invite rejects unauthenticated callers', async () => {
  const response = await createClinicInviteHandler(config, factory({ authenticated: false }, effects()))(request(valid)); assertEquals(response.status, 401)
})
Deno.test('clinic invite validates role and clinic id', async () => {
  const response = await createClinicInviteHandler(config, factory({}, effects()))(request('{"clinicId":"bad","email":"bad","role":"owner"}')); assertEquals(response.status, 400)
})
Deno.test('clinic invite maps database clinic authorization to forbidden', async () => {
  const response = await createClinicInviteHandler(config, factory({ recordError: 'CLINIC_MANAGER_REQUIRED' }, effects()))(request(valid)); assertEquals(response.status, 403); assertEquals((await response.json()).error.code, 'FORBIDDEN')
})
Deno.test('clinic invite activates an existing account without creating another auth user', async () => {
  const state = effects(); const response = await createClinicInviteHandler(config, factory({ existing: true }, state))(request(valid)); assertEquals(response.status, 201); assertEquals((await response.json()).data.delivery, 'existing_account'); assertEquals(state.invited, false); assertEquals(state.activated, true)
})
Deno.test('clinic invite delivers and activates a new account email', async () => {
  const state = effects(); const response = await createClinicInviteHandler(config, factory({}, state))(request(valid)); assertEquals(response.status, 201); assertEquals((await response.json()).data, { email: 'staff@example.test', role: 'dentist', delivery: 'email', expiresInDays: 7 }); assertEquals(state.invited, true); assertEquals(state.activated, true)
})
Deno.test('clinic invite revokes its database grant when delivery fails', async () => {
  const state = effects(); const response = await createClinicInviteHandler(config, factory({ deliveryError: true }, state))(request(valid)); assertEquals(response.status, 502); assertEquals(state.revoked, true); assertEquals(state.activated, false)
})
Deno.test('clinic invite deletes a new auth user if activation fails', async () => {
  const state = effects(); const response = await createClinicInviteHandler(config, factory({ activationError: true }, state))(request(valid)); assertEquals(response.status, 500); assertEquals(state.deleted, true); assertEquals(state.revoked, true)
})
