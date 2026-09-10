import type { Profile } from '@amar-dentist/domain'
import { getActiveNavigationItemId, getBottomNavigation, getNavigationGroups, isNavigationItemActive, isPreviewProfile, performModeSwitch, shouldShowAppShell } from './navigation'

const patient: Profile = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'patient@example.test',
  fullName: 'Test patient',
  locale: 'en',
  activeMode: 'patient',
  roles: ['patient'],
}

describe('app navigation', () => {
  it('matches parent destinations for patient and professional detail routes', () => {
    const patientItems = getBottomNavigation('patient', patient.roles)
    expect(isNavigationItemActive('/patient/dentist/dentist-1', patientItems[1]!)).toBe(true)
    expect(isNavigationItemActive('/patient/review/visit-1', patientItems[2]!)).toBe(true)
    expect(isNavigationItemActive('/patient/consent/clinic-1', patientItems[3]!)).toBe(true)

    const professionalItems = getBottomNavigation('professional', ['patient', 'dentist'])
    expect(getActiveNavigationItemId('/professional/manage-schedule/clinic-1', professionalItems)).toBe('account')
    expect(isNavigationItemActive('/professional/encounter/visit-1', professionalItems[2]!)).toBe(true)
    expect(getActiveNavigationItemId('/patient/chat/thread-1', professionalItems)).toBe('inbox')
  })

  it('selects only the most specific sidebar destination', () => {
    const items = getNavigationGroups('professional', ['patient', 'clinic_owner']).flatMap(({ items }) => items)
    expect(getActiveNavigationItemId('/professional/calendar', items)).toBe('calendar')
    expect(getActiveNavigationItemId('/professional/manage-schedule', items)).toBe('manage-schedule')
    expect(getActiveNavigationItemId('/professional/business', items)).toBe('business')
    expect(getActiveNavigationItemId('/professional', items)).toBe('professional-onboarding')
  })

  it('selects More for compact overflow destinations', () => {
    const patientItems = getBottomNavigation('patient', patient.roles)
    expect(getActiveNavigationItemId('/patient/profiles', patientItems)).toBe('account')
    expect(getActiveNavigationItemId('/patient/assistant', patientItems)).toBe('account')
    expect(getActiveNavigationItemId('/professional/dentist-application', patientItems)).toBe('account')

    const professionalItems = getBottomNavigation('professional', ['patient', 'clinic_owner'])
    expect(getActiveNavigationItemId('/professional/manage-schedule', professionalItems)).toBe('account')
    expect(getActiveNavigationItemId('/professional/team', professionalItems)).toBe('account')
    expect(getActiveNavigationItemId('/professional/business', professionalItems)).toBe('account')
  })

  it('does not expose professional navigation to a patient-only profile', () => {
    expect(getBottomNavigation('professional', patient.roles).map(({ id }) => id)).toEqual(['home', 'find', 'visits', 'records', 'account'])
    const hrefs = getNavigationGroups('professional', patient.roles).flatMap(({ items }) => items.map(({ href }) => href))
    expect(hrefs).not.toContain('/professional/operations')
    expect(hrefs).not.toContain('/professional/business')
  })

  it('filters clinic tools by role while keeping onboarding available', () => {
    const dentistHrefs = getNavigationGroups('professional', ['patient', 'dentist']).flatMap(({ items }) => items.map(({ href }) => href))
    expect(dentistHrefs).toContain('/professional/manage-schedule')
    expect(dentistHrefs).toContain('/professional')
    expect(dentistHrefs).not.toContain('/professional/team')
    expect(dentistHrefs).not.toContain('/professional/business')

    const ownerHrefs = getNavigationGroups('professional', ['patient', 'clinic_owner']).flatMap(({ items }) => items.map(({ href }) => href))
    expect(ownerHrefs).toEqual(expect.arrayContaining(['/professional/team', '/professional/business']))
  })

  it('shows the shell only for authenticated application routes', () => {
    expect(shouldShowAppShell(patient, false, '/dashboard')).toBe(true)
    expect(shouldShowAppShell(patient, false, '/patient/discover')).toBe(true)
    expect(shouldShowAppShell(patient, false, '/')).toBe(false)
    expect(shouldShowAppShell(patient, false, '/sign-in')).toBe(false)
    expect(shouldShowAppShell(patient, false, '/auth/callback')).toBe(false)
    expect(shouldShowAppShell(patient, false, '/auth')).toBe(false)
    expect(shouldShowAppShell(null, false, '/dashboard')).toBe(false)
    expect(shouldShowAppShell(patient, true, '/dashboard')).toBe(false)
  })

  it('identifies only the built-in synthetic preview profile', () => {
    const lookalike = { ...patient, id: '00000000-0000-4000-8000-000000000002', email: 'preview@amardentist.local' }
    expect(isPreviewProfile(patient)).toBe(true)
    expect(isPreviewProfile(lookalike)).toBe(false)
  })

  it('clears busy state and does not redirect when a mode change throws', async () => {
    const busyStates: Array<'patient' | 'professional' | null> = []
    const onSuccess = jest.fn()
    const result = await performModeSwitch({
      mode: 'professional',
      setMode: jest.fn().mockRejectedValue(new Error('network unavailable')),
      setBusy: (mode) => busyStates.push(mode),
      onSuccess,
      fallbackError: 'Try again.',
    })

    expect(result).toBe('Try again.')
    expect(busyStates).toEqual(['professional', null])
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('redirects only after a successful mode change', async () => {
    const onSuccess = jest.fn()
    await expect(performModeSwitch({
      mode: 'professional',
      setMode: jest.fn().mockResolvedValue('Not allowed'),
      setBusy: jest.fn(),
      onSuccess,
      fallbackError: 'Try again.',
    })).resolves.toBe('Not allowed')
    expect(onSuccess).not.toHaveBeenCalled()

    await expect(performModeSwitch({
      mode: 'professional',
      setMode: jest.fn().mockResolvedValue(null),
      setBusy: jest.fn(),
      onSuccess,
      fallbackError: 'Try again.',
    })).resolves.toBeNull()
    expect(onSuccess).toHaveBeenCalledTimes(1)
  })
})
