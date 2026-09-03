import { Platform } from 'react-native'

export const colors = {
  ink: '#142A42',
  inkDeep: '#0C1C2D',
  pearl: '#F5F8F7',
  paper: '#FFFFFF',
  mint: '#79D2BD',
  mintSoft: '#DDF5EE',
  cyan: '#5CB8CF',
  teal: '#176662',
  text: '#14202B',
  muted: '#5A6873',
  line: '#DDE7E5',
  success: '#1D684F',
  warning: '#A06418',
  danger: '#B33A3A',
  mapNight: '#071625',
} as const

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const
export const radius = { sm: 10, md: 16, lg: 24, pill: 999 } as const
export const hitTarget = Platform.OS === 'ios' ? 44 : 48

export const shadow = Platform.select({
  ios: { shadowColor: '#0C1C2D', shadowOpacity: 0.08, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
  android: { elevation: 3 },
  default: { boxShadow: '0 8px 28px rgba(12, 28, 45, 0.08)' },
})
