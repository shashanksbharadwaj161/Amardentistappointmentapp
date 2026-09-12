// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { window.history.replaceState(null, '', '/'); vi.resetModules() })

it.each([
  ['/auth/callback#type=invite&access_token=fixture&refresh_token=fixture', 'invite'],
  ['/auth/callback#type=recovery&access_token=fixture&refresh_token=fixture', 'recovery'],
  ['/auth/callback?type=invite&code=fixture', 'invite'],
  ['/auth/callback#type=invite', null],
  ['/auth/callback#type=signup&access_token=fixture&refresh_token=fixture', null],
  ['/#type=invite&access_token=fixture&refresh_token=fixture', null],
] as const)('captures callback routing intent only for a supported exchange: %s', async (url, expected) => {
  vi.resetModules()
  window.history.replaceState(null, '', url)
  const config = await import('./supabase')
  expect(config.adminPasswordCallbackIntent).toBe(expected)
  expect(config.supabase).toBeNull()
})
