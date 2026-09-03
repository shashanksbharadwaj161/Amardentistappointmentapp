import { createClient } from 'npm:@supabase/supabase-js@2.112.4'
import { json } from '../_shared/http.ts'

export type AdminInviteConfig = {
  supabaseUrl?: string
  publishableKey?: string
  serviceRoleKey?: string
  adminAppUrl?: string
}

export function createAdminInviteHandler(config: AdminInviteConfig, clientFactory: typeof createClient = createClient) {
  const { supabaseUrl, publishableKey, serviceRoleKey, adminAppUrl } = config

  return async (request: Request) => {
    if (!supabaseUrl || !publishableKey || !serviceRoleKey || !adminAppUrl) {
      return json(503, { ok: false, error: { code: 'SERVICE_NOT_CONFIGURED', message: 'Invitation service is not configured' } })
    }
    const allowedOrigin = new URL(adminAppUrl).origin
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

    const serviceClient = clientFactory(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: role } = await serviceClient.from('user_roles').select('id').eq('user_id', caller.user.id).eq('role', 'super_admin').maybeSingle()
    if (!role) return respond(403, { ok: false, error: { code: 'FORBIDDEN', message: 'Super Admin access required' } })

    let body: { email?: string; displayName?: string; expiresInDays?: number }
    try {
      body = await request.json()
    } catch {
      return respond(400, { ok: false, error: { code: 'INVALID_INPUT', message: 'Valid JSON required' } })
    }

    const email = body.email?.trim().toLowerCase()
    const displayName = body.displayName?.trim()
    const expiresInDays = body.expiresInDays ?? 7
    if (!email || !/^\S+@\S+\.\S+$/.test(email) || !displayName || expiresInDays < 1 || expiresInDays > 30) {
      return respond(400, { ok: false, error: { code: 'INVALID_INPUT', message: 'Check the invitation fields' } })
    }

    const { data: invitationRows, error: recordError } = await callerClient.rpc('create_admin_invitation', {
      invite_email: email,
      invite_display_name: displayName,
      expires_in_days: expiresInDays,
    })
    if (recordError) return respond(409, { ok: false, error: { code: 'INVITATION_CONFLICT', message: 'An active invitation already exists for this email' } })
    const invitationId = invitationRows?.[0]?.id
    if (!invitationId) return respond(500, { ok: false, error: { code: 'INVITATION_RECORD_FAILED', message: 'Invitation could not be recorded' } })

    const { data: invitedUser, error: inviteError } = await serviceClient.auth.admin.inviteUserByEmail(email, {
      data: { full_name: displayName, invited_as: 'admin' },
      redirectTo: `${adminAppUrl.replace(/\/$/, '')}/auth/callback`,
    })
    if (inviteError) {
      const { error: revokeError } = await serviceClient.from('admin_invitations').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', invitationId)
      if (revokeError) return respond(500, { ok: false, error: { code: 'INVITATION_CLEANUP_FAILED', message: 'Invitation delivery failed and requires secure cleanup' } })
      return respond(502, { ok: false, error: { code: 'INVITATION_DELIVERY_FAILED', message: 'Invitation email could not be delivered' } })
    }

    const { data: activated, error: activationError } = await serviceClient.rpc('activate_admin_invitation', { target_invitation_id: invitationId })
    if (activationError || activated !== true) {
      if (invitedUser.user) await serviceClient.auth.admin.deleteUser(invitedUser.user.id)
      await serviceClient.from('admin_invitations').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', invitationId)
      return respond(500, { ok: false, error: { code: 'INVITATION_ACTIVATION_FAILED', message: 'Invitation could not be activated safely' } })
    }

    return respond(201, { ok: true, data: { email, expiresInDays } })
  }
}
