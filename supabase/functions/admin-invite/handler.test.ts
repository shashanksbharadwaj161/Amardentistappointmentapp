import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { createAdminInviteHandler } from './handler.ts'

type Scenario = {
  authenticated?: boolean
  superAdmin?: boolean
  recordError?: boolean
  deliveryError?: boolean
  revokeError?: boolean
  activationError?: boolean
}

type Effects = { revoked: boolean; audited: boolean; deleted: boolean }

const config = { supabaseUrl: 'https://project.example.test', publishableKey: 'publishable', serviceRoleKey: 'service', adminAppUrl: 'https://admin.example.test' }

function assertEquals(actual: unknown, expected: unknown) {
  const left = JSON.stringify(actual)
  const right = JSON.stringify(expected)
  if (left !== right) throw new Error(`Expected ${right}, received ${left}`)
}

function createFactory(scenario: Scenario, effects: Effects) {
  const caller = {
    auth: { getUser: async () => ({ data: { user: scenario.authenticated === false ? null : { id: 'caller-id' } }, error: null }) },
    rpc: async () => scenario.recordError ? { data: null, error: { message: 'duplicate' } } : { data: [{ id: 'invitation-id' }], error: null },
  }
  const service = {
    auth: { admin: {
      inviteUserByEmail: async () => ({ data: { user: { id: 'invited-user-id' } }, error: scenario.deliveryError ? { message: 'delivery failed' } : null }),
      deleteUser: async () => { effects.deleted = true; return { error: null } },
    } },
    rpc: async () => {
      if (scenario.activationError) return { data: null, error: { message: 'activation failed' } }
      effects.audited = true
      return { data: true, error: null }
    },
    from: (table: string) => {
      if (table === 'user_roles') {
        const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: scenario.superAdmin === false ? null : { id: 1 }, error: null }) }
        return chain
      }
      if (table === 'admin_invitations') return { update: () => ({ eq: async () => { effects.revoked = true; return { error: scenario.revokeError ? { message: 'cleanup failed' } : null } } }) }
      throw new Error(`Unexpected table: ${table}`)
    },
  }
  return ((_url: string, key: string) => key === 'publishable' ? caller : service) as unknown as typeof createClient
}

function effects(): Effects {
  return { revoked: false, audited: false, deleted: false }
}

function request(body: string) {
  return new Request('https://project.example.test/functions/v1/admin-invite', {
    method: 'POST',
    headers: { authorization: 'Bearer caller', origin: 'https://admin.example.test', 'content-type': 'application/json' },
    body,
  })
}

Deno.test('returns a stable configuration error before processing requests', async () => {
  const response = await createAdminInviteHandler({})(request('{}'))
  assertEquals(response.status, 503)
  assertEquals((await response.json()).error.code, 'SERVICE_NOT_CONFIGURED')
})

Deno.test('rejects callers without a valid session', async () => {
  const state = effects()
  const response = await createAdminInviteHandler(config, createFactory({ authenticated: false }, state))(request('{}'))
  assertEquals(response.status, 401)
  assertEquals((await response.json()).error.code, 'UNAUTHENTICATED')
})

Deno.test('rejects authenticated callers without the Super Admin role', async () => {
  const state = effects()
  const response = await createAdminInviteHandler(config, createFactory({ superAdmin: false }, state))(request('{}'))
  assertEquals(response.status, 403)
  assertEquals((await response.json()).error.code, 'FORBIDDEN')
})

Deno.test('validates invitation fields before writing', async () => {
  const state = effects()
  const response = await createAdminInviteHandler(config, createFactory({}, state))(request('{"email":"bad","displayName":""}'))
  assertEquals(response.status, 400)
  assertEquals((await response.json()).error.code, 'INVALID_INPUT')
})

Deno.test('returns a stable success response after atomic activation and audit', async () => {
  const state = effects()
  const response = await createAdminInviteHandler(config, createFactory({}, state))(request('{"email":" ADMIN@EXAMPLE.TEST ","displayName":" Admin User ","expiresInDays":7}'))
  assertEquals(response.status, 201)
  assertEquals(await response.json(), { ok: true, data: { email: 'admin@example.test', expiresInDays: 7 } })
  assertEquals(state.audited, true)
})

Deno.test('revokes the database invitation when email delivery fails', async () => {
  const state = effects()
  const response = await createAdminInviteHandler(config, createFactory({ deliveryError: true }, state))(request('{"email":"admin@example.test","displayName":"Admin User"}'))
  assertEquals(response.status, 502)
  assertEquals((await response.json()).error.code, 'INVITATION_DELIVERY_FAILED')
  assertEquals(state.revoked, true)
  assertEquals(state.audited, false)
})

Deno.test('reports a secure cleanup failure without activating the invitation', async () => {
  const state = effects()
  const response = await createAdminInviteHandler(config, createFactory({ deliveryError: true, revokeError: true }, state))(request('{"email":"admin@example.test","displayName":"Admin User"}'))
  assertEquals(response.status, 500)
  assertEquals((await response.json()).error.code, 'INVITATION_CLEANUP_FAILED')
  assertEquals(state.audited, false)
})

Deno.test('fails closed and removes the auth invite when activation cannot be audited', async () => {
  const state = effects()
  const response = await createAdminInviteHandler(config, createFactory({ activationError: true }, state))(request('{"email":"admin@example.test","displayName":"Admin User"}'))
  assertEquals(response.status, 500)
  assertEquals((await response.json()).error.code, 'INVITATION_ACTIVATION_FAILED')
  assertEquals(state.revoked, true)
  assertEquals(state.deleted, true)
  assertEquals(state.audited, false)
})
