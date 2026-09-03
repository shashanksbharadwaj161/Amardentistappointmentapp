import { describe, expect, it } from 'vitest'
import { availableModes, hasPermission, signUpSchema } from './index'

describe('authorization rules', () => {
  it('never grants admin access to ordinary roles', () => {
    expect(hasPermission(['patient', 'dentist'], 'admin:access')).toBe(false)
    expect(hasPermission(['admin'], 'admin:access')).toBe(true)
  })

  it('shows professional mode only to professional roles', () => {
    expect(availableModes(['patient'])).toEqual(['patient'])
    expect(availableModes(['patient', 'dentist'])).toEqual(['patient', 'professional'])
  })
})

describe('auth validation', () => {
  it('normalizes valid email addresses', () => {
    const result = signUpSchema.parse({
      fullName: 'Rahima Akter',
      email: '  RAHIMA@example.com ',
      password: 'StrongPass1',
      confirmPassword: 'StrongPass1',
      acceptedTerms: true,
    })
    expect(result.email).toBe('rahima@example.com')
  })

  it('rejects a password mismatch', () => {
    expect(() =>
      signUpSchema.parse({
        fullName: 'Rahima Akter',
        email: 'rahima@example.com',
        password: 'StrongPass1',
        confirmPassword: 'StrongPass2',
        acceptedTerms: true,
      }),
    ).toThrow()
  })
})
