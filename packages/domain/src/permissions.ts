import type { AppRole } from './roles'

export const PERMISSIONS = [
  'profile:read:self',
  'profile:update:self',
  'admin:access',
  'admin:invite',
  'admin:manage',
  'audit:read',
  'config:read',
  'config:write',
] as const

export type Permission = (typeof PERMISSIONS)[number]

const COMMON: readonly Permission[] = ['profile:read:self', 'profile:update:self', 'config:read']

export const ROLE_PERMISSIONS: Record<AppRole, readonly Permission[]> = {
  patient: COMMON,
  dentist: COMMON,
  front_desk: COMMON,
  clinic_manager: COMMON,
  clinic_owner: COMMON,
  admin: [...COMMON, 'admin:access', 'audit:read'],
  super_admin: [...COMMON, 'admin:access', 'admin:invite', 'admin:manage', 'audit:read', 'config:write'],
}

export function hasPermission(roles: readonly AppRole[], permission: Permission): boolean {
  return roles.some((role) => ROLE_PERMISSIONS[role].includes(permission))
}
