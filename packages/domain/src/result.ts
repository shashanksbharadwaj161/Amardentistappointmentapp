export type ErrorCode =
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_EMAIL_UNVERIFIED'
  | 'AUTH_INVITATION_REQUIRED'
  | 'AUTH_INVITATION_EXPIRED'
  | 'FORBIDDEN'
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'

export type ApiError = {
  code: ErrorCode
  message: string
  details?: Readonly<Record<string, unknown>>
}

export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError }

export const ok = <T>(data: T): Result<T> => ({ ok: true, data })
export const err = (code: ErrorCode, message: string): Result<never> => ({
  ok: false,
  error: { code, message },
})
