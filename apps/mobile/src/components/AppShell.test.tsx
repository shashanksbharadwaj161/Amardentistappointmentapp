import type { Profile } from '@amar-dentist/domain'
import { render, screen } from '@testing-library/react-native'
import * as ReactNative from 'react-native'
import { navigationMessages } from '../lib/navigation-messages'
import { AppShell } from './AppShell'

const mockNavigate = jest.fn()
const mockReplace = jest.fn()
const mockUseAuth = jest.fn()
let mockPathname = '/patient/discover'

jest.mock('lucide-react-native', () => {
  const React = require('react')
  const { View } = require('react-native')
  const Icon = (props: Record<string, unknown>) => React.createElement(View, props)
  return {
    BriefcaseBusiness: Icon,
    CalendarDays: Icon,
    CalendarRange: Icon,
    CircleUserRound: Icon,
    ClipboardCheck: Icon,
    ClipboardList: Icon,
    CreditCard: Icon,
    HeartHandshake: Icon,
    Home: Icon,
    Inbox: Icon,
    MapPin: Icon,
    MessageCircleHeart: Icon,
    Settings2: Icon,
    ShieldCheck: Icon,
    Stethoscope: Icon,
    UsersRound: Icon,
  }
})

jest.mock('expo-router', () => ({
  router: { navigate: mockNavigate, replace: mockReplace },
  usePathname: () => mockPathname,
}))

jest.mock('../providers/AuthProvider', () => ({ useAuth: () => mockUseAuth() }))
jest.mock('./BrandMark', () => ({ BrandMark: () => null }))
jest.mock('../providers/LocaleProvider', () => ({
  useLocale: () => ({ locale: 'en', t: (key: string) => ({
    calendar: 'Calendar',
    businessOperations: 'Business operations',
    clinicInbox: 'Clinic inbox',
    manageSchedule: 'Manage schedule',
    manageTeam: 'Manage team',
    professional: 'Professional',
    professionalOnboarding: 'Professional onboarding',
    patient: 'Patient',
  })[key] ?? key }),
}))

const previewProfile: Profile = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'preview@amardentist.local',
  fullName: 'Preview account',
  locale: 'en',
  activeMode: 'patient',
  roles: ['patient', 'clinic_owner'],
}

function setWindow(width: number, height: number) {
  const dimensions = { width, height, scale: 1, fontScale: 1 }
  ReactNative.Dimensions.set({ window: dimensions, screen: dimensions })
}

describe('AppShell navigation semantics', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockPathname = '/patient/discover'
    mockUseAuth.mockReturnValue({ profile: previewProfile, loading: false, setMode: jest.fn() })
  })

  it('renders five compact tabs with exactly one selected and a preview notice', async () => {
    setWindow(390, 844)
    await render(<AppShell><ReactNative.Text>Route content</ReactNative.Text></AppShell>)

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(5)
    expect(tabs.filter((tab) => tab.props.accessibilityState?.selected)).toHaveLength(1)
    expect(screen.getByRole('tab', { name: 'Find' }).props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByText(navigationMessages.en.previewNotice)).toBeTruthy()
  })

  it('marks Manage schedule instead of Calendar in the expanded sidebar', async () => {
    setWindow(1280, 720)
    mockPathname = '/professional/manage-schedule'
    mockUseAuth.mockReturnValue({
      profile: { ...previewProfile, activeMode: 'professional' },
      loading: false,
      setMode: jest.fn(),
    })
    await render(<AppShell><ReactNative.Text>Route content</ReactNative.Text></AppShell>)

    expect(screen.getByRole('tab', { name: 'Manage schedule' }).props.accessibilityState).toMatchObject({ selected: true })
    expect(screen.getByRole('tab', { name: 'Calendar' }).props.accessibilityState).toMatchObject({ selected: false })
  })

  it('does not label a real profile as preview based on email alone', async () => {
    setWindow(390, 844)
    mockUseAuth.mockReturnValue({
      profile: { ...previewProfile, id: '00000000-0000-4000-8000-000000000002' },
      loading: false,
      setMode: jest.fn(),
    })
    await render(<AppShell><ReactNative.Text>Route content</ReactNative.Text></AppShell>)

    expect(screen.queryByText(navigationMessages.en.previewNotice)).toBeNull()
  })
})
