export const APP_ROLES = [
  'patient',
  'dentist',
  'front_desk',
  'clinic_manager',
  'clinic_owner',
  'admin',
  'super_admin',
] as const

export type AppRole = (typeof APP_ROLES)[number]

export const APP_MODES = ['patient', 'professional'] as const
export type AppMode = (typeof APP_MODES)[number]

export const ADMIN_ROLES = ['admin', 'super_admin'] as const satisfies readonly AppRole[]
export const PROFESSIONAL_ROLES = [
  'dentist',
  'front_desk',
  'clinic_manager',
  'clinic_owner',
] as const satisfies readonly AppRole[]

export function isAdminRole(role: AppRole): boolean {
  return ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number])
}

export function canUseMode(roles: readonly AppRole[], mode: AppMode): boolean {
  if (mode === 'patient') return roles.includes('patient')
  return roles.some((role) => PROFESSIONAL_ROLES.includes(role as (typeof PROFESSIONAL_ROLES)[number]))
}

export function availableModes(roles: readonly AppRole[]): AppMode[] {
  return APP_MODES.filter((mode) => canUseMode(roles, mode))
}
