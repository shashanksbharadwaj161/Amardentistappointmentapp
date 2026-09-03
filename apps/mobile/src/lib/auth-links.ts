export type AuthLinkParameters = {
  accessToken: string | null
  refreshToken: string | null
  authorizationCode: string | null
  type: string | null
}

export function parseAuthLink(url: string): AuthLinkParameters | null {
  try {
    const normalized = url.replace('#', url.includes('?') ? '&' : '?')
    const parsed = new URL(normalized)
    return {
      accessToken: parsed.searchParams.get('access_token'),
      refreshToken: parsed.searchParams.get('refresh_token'),
      authorizationCode: parsed.searchParams.get('code'),
      type: parsed.searchParams.get('type'),
    }
  } catch {
    return null
  }
}
