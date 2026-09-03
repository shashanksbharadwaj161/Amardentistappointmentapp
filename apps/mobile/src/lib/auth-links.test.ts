import { parseAuthLink } from './auth-links'

describe('parseAuthLink', () => {
  it('parses native implicit recovery fragments', () => {
    expect(parseAuthLink('amardentist://reset-password#access_token=access&refresh_token=refresh&type=recovery')).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      authorizationCode: null,
      type: 'recovery',
    })
  })

  it('parses PKCE authorization-code callbacks', () => {
    expect(parseAuthLink('amardentist://auth/callback?code=verification-code')).toEqual({
      accessToken: null,
      refreshToken: null,
      authorizationCode: 'verification-code',
      type: null,
    })
  })

  it('recognizes invitation sessions that must choose a password', () => {
    expect(parseAuthLink('http://localhost:3000#access_token=access&refresh_token=refresh&type=invite')).toEqual({
      accessToken: 'access',
      refreshToken: 'refresh',
      authorizationCode: null,
      type: 'invite',
    })
  })

  it('rejects malformed callback values without throwing', () => {
    expect(parseAuthLink('not a url')).toBeNull()
  })
})
