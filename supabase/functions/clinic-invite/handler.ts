import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { json } from '../_shared/http.ts'

export type ClinicInviteConfig = {
  supabaseUrl?: string
  publishableKey?: string
  serviceRoleKey?: string
  appRedirectUrl?: string
  webAppUrl?: string
}

const allowedRoles = ['clinic_manager', 'dentist', 'front_desk'] as const

export function createClinicInviteHandler(config: ClinicInviteConfig, clientFactory: typeof createClient = createClient) {
  const { supabaseUrl, publishableKey, serviceRoleKey, appRedirectUrl, webAppUrl } = config
  return async (request: Request) => {
    if (!supabaseUrl || !publishableKey || !serviceRoleKey || !appRedirectUrl || !webAppUrl) {
      return json(503, { ok: false, error: { code: 'SERVICE_NOT_CONFIGURED', message: 'Clinic invitation service is not configured' } })
    }
    const allowedOrigin = new URL(webAppUrl).origin
    const requestOrigin = request.headers.get('origin')
    const cors: Record<string, string> = requestOrigin === allowedOrigin ? {
      'access-control-allow-origin': allowedOrigin,
      'access-control-allow-headers': 'authorization, content-type, apikey',
      'access-control-allow-methods': 'POST, OPTIONS',
      vary: 'origin',
    } : {}
    const respond = (status: number, body: unknown) => json(status, body, cors)
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
    if (request.method !== 'POST') return respond(405, { ok: false, error: { code: 'METHOD_NOT_ALLOWED', message: 'POST required' } })
    const authorization = request.headers.get('authorization')
    if (!authorization) return respond(401, { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Sign in required' } })

    const callerClient = clientFactory(supabaseUrl, publishableKey, { global: { headers: { authorization } } })
    const { data: caller, error: authError } = await callerClient.auth.getUser()
    if (authError || !caller.user) return respond(401, { ok: false, error: { code: 'UNAUTHENTICATED', message: 'Invalid session' } })

    let body: { clinicId?: string; email?: string; role?: string; expiresInDays?: number }
    try { body = await request.json() } catch {
      return respond(400, { ok: false, error: { code: 'INVALID_INPUT', message: 'Valid JSON required' } })
    }
    const clinicId = body.clinicId?.trim()
    const email = body.email?.trim().toLowerCase()
    const role = body.role?.trim()
    const expiresInDays = body.expiresInDays ?? 7
    if (!clinicId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clinicId)
      || !email || !/^\S+@\S+\.\S+$/.test(email) || !allowedRoles.includes(role as typeof allowedRoles[number])
      || expiresInDays < 1 || expiresInDays > 30) {
      return respond(400, { ok: false, error: { code: 'INVALID_INPUT', message: 'Check the clinic invitation fields' } })
    }

    const { data: invitationId, error: recordError } = await callerClient.rpc('invite_clinic_member', {
      target_clinic_id: clinicId, invite_email: email, member_role: role, expires_in_days: expiresInDays,
    })
    if (recordError) {
      const forbidden = recordError.message === 'CLINIC_MANAGER_REQUIRED'
      return respond(forbidden ? 403 : 409, { ok: false, error: { code: forbidden ? 'FORBIDDEN' : 'INVITATION_CONFLICT', message: forbidden ? 'Clinic manager access required' : 'An active invitation already exists' } })
    }
    if (!invitationId) return respond(500, { ok: false, error: { code: 'INVITATION_RECORD_FAILED', message: 'Invitation could not be recorded' } })

    const serviceClient = clientFactory(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: existingProfile, error: profileError } = await serviceClient.from('profiles').select('id').eq('email', email).maybeSingle()
    if (profileError) {
      await serviceClient.rpc('revoke_clinic_invitation_delivery', { target_invitation_id: invitationId })
      return respond(500, { ok: false, error: { code: 'ACCOUNT_LOOKUP_FAILED', message: 'Invitation delivery could not be prepared' } })
    }

    let invitedUserId: string | null = null
    let delivery: 'existing_account' | 'email' = 'existing_account'
    if (!existingProfile) {
      delivery = 'email'
      const { data: invited, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
        data: { invited_as: role, clinic_id: clinicId }, redirectTo: appRedirectUrl,
      })
      if (inviteError) {
        const { data: revoked } = await serviceClient.rpc('revoke_clinic_invitation_delivery', { target_invitation_id: invitationId })
        return respond(revoked ? 502 : 500, { ok: false, error: { code: revoked ? 'INVITATION_DELIVERY_FAILED' : 'INVITATION_CLEANUP_FAILED', message: revoked ? 'Invitation email could not be delivered' : 'Invitation delivery failed and requires secure cleanup' } })
      }
      invitedUserId = invited.user?.id ?? null
    }

    const { data: activated, error: activationError } = await serviceClient.rpc('activate_clinic_invitation', { target_invitation_id: invitationId })
    if (activationError || activated !== true) {
      if (invitedUserId) await serviceClient.auth.admin.deleteUser(invitedUserId)
      await serviceClient.rpc('revoke_clinic_invitation_delivery', { target_invitation_id: invitationId })
      return respond(500, { ok: false, error: { code: 'INVITATION_ACTIVATION_FAILED', message: 'Invitation could not be activated safely' } })
    }
    return respond(201, { ok: true, data: { email, role, delivery, expiresInDays } })
  }
}
