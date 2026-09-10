import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const verificationDir = fileURLToPath(new URL('../../../docs/verification/', import.meta.url))

test('Super Admin preview exposes the Phase 1 controls and accessible invitation flow', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Steady oversight for every care journey.' })).toBeVisible()
  await page.getByRole('button', { name: 'Preview admin console' }).click()

  await expect(page.getByRole('heading', { name: 'Good morning, Administrator.' })).toBeVisible()
  await expect(page.getByText('Database-enforced')).toBeVisible()
  await page.screenshot({ path: `${verificationDir}admin-${testInfo.project.name}.png`, fullPage: true })

  const inviteButton = page.getByRole('button', { name: 'Invite admin' })
  await inviteButton.click()
  await expect(page.getByRole('dialog', { name: 'Invite an administrator' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Display name' })).toBeFocused()
  await page.screenshot({ path: `${verificationDir}admin-invite-${testInfo.project.name}.png`, fullPage: true })

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Invite an administrator' })).toBeHidden()
  await expect(inviteButton).toBeFocused()
})

test('mobile navigation is hidden until requested and restores focus when closed', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile navigation behavior')
  await page.goto('/')
  await page.getByRole('button', { name: 'Preview admin console' }).click()

  const menuButton = page.getByRole('button', { name: 'Open navigation' })
  await expect(menuButton).toBeVisible()
  await menuButton.click()
  await expect(page.getByRole('dialog', { name: 'Navigation menu' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: 'Navigation menu' })).toBeHidden()
  await expect(menuButton).toBeFocused()
})

test('administrator can review private evidence and record a verification decision', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Preview admin console' }).click()
  if (testInfo.project.name === 'mobile-chromium') await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('button', { name: 'Verification', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Verification queue' })).toBeVisible()
  await expect(page.getByText('Registration credential.pdf')).toBeVisible()
  await page.screenshot({ path: `${verificationDir}admin-verification-${testInfo.project.name}.png`, fullPage: true })
  await page.getByRole('button', { name: 'Approve' }).click()
  await expect(page.getByText('Preview only: sample decision updated. No real access or audit records changed.', { exact: true })).toBeVisible()
})

test('Super Admin configures revenue controls without provider secrets', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Preview admin console' }).click()
  if (testInfo.project.name === 'mobile-chromium') await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('button', { name: 'Configuration' }).click()
  await expect(page.getByRole('heading', { name: 'Plans and commission' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Rate percent' }).fill('5.5')
  await page.getByRole('button', { name: 'Preview rate change' }).click()
  await expect(page.getByText('Preview only: sample commission changed for this visit. Nothing was saved or audited.', { exact: true })).toBeVisible()
  await expect(page.getByText('Clinic Pro')).toBeVisible()
  await page.screenshot({ path: `${verificationDir}admin-finance-${testInfo.project.name}.png`, fullPage: true })
})

test('operational Admin preview keeps platform-only destinations disabled', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Preview operational Admin' }).click()
  await expect(page.getByRole('button', { name: 'Invite admin', exact: true })).toHaveCount(0)
  if (testInfo.project.name === 'mobile-chromium') await page.getByRole('button', { name: 'Open navigation' }).click()
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' })
  await expect(navigation.getByRole('button', { name: 'Verification', exact: true })).toBeEnabled()
  await expect(navigation.getByRole('button', { name: 'Cases', exact: true })).toBeEnabled()
  for (const name of ['Users', 'Audit trail', 'Admin invitations', 'AI provider', 'Feature controls', 'Usage limits', 'AI usage and cost', 'Notification delivery', 'Configuration']) {
    await expect(navigation.getByRole('button', { name, exact: true })).toBeDisabled()
  }
  await navigation.getByRole('button', { name: 'Cases', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Cases and moderation' })).toBeVisible()
})

test('Super Admin AI destinations reject invalid quotas and never accept preview credentials', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Preview admin console' }).click()
  const navigate = async (name: string) => {
    if (testInfo.project.name === 'mobile-chromium') await page.getByRole('button', { name: 'Open navigation' }).click()
    await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('button', { name, exact: true }).click()
  }
  await navigate('Usage limits')
  const free = page.getByRole('spinbutton', { name: 'Free limit for Patient AI requests per day', exact: true })
  const paid = page.getByRole('spinbutton', { name: 'Paid limit for Patient AI requests per day', exact: true })
  const save = page.getByRole('button', { name: 'Save Patient AI requests per day', exact: true })
  await free.fill('-1')
  await save.click()
  await expect(page.getByRole('alert')).toHaveText('Use whole numbers from 0 to 2,147,483,647. The paid limit must be at least the free limit.')
  await free.fill('5'); await paid.fill('4'); await save.click()
  await expect(page.getByRole('alert')).toHaveText('Use whole numbers from 0 to 2,147,483,647. The paid limit must be at least the free limit.')
  await paid.fill('40'); await save.click()
  await expect(page.getByRole('status').filter({ hasText: 'Preview only. This usage limit changed on this screen; nothing was saved or audited.' })).toBeVisible()
  await navigate('Feature controls')
  await expect(page.getByRole('heading', { name: 'Feature flags', level: 1 })).toBeVisible()
  await expect(page.getByLabel('New API key')).toHaveCount(0)
  await page.getByRole('button', { name: 'Disable Patient guidance assistant', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Preview only. This feature flag changed on this screen; nothing was saved or audited.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enable Patient guidance assistant', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await navigate('AI provider')
  await expect(page.getByLabel('New API key', { exact: true })).toBeDisabled()
  await expect(page.getByLabel('New API key', { exact: true })).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Rotate sealed credential', exact: true })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: `${verificationDir}admin-ai-provider-${testInfo.project.name}.png`, fullPage: true })
})
