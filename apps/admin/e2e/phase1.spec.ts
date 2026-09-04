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
  await expect(page.getByText('Application approved and access updated.')).toBeVisible()
})

test('Super Admin configures revenue controls without provider secrets', async ({ page }, testInfo) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Preview admin console' }).click()
  if (testInfo.project.name === 'mobile-chromium') await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('button', { name: 'Configuration' }).click()
  await expect(page.getByRole('heading', { name: 'Plans and commission' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Rate percent' }).fill('5.5')
  await page.getByRole('button', { name: 'Save audited rate' }).click()
  await expect(page.getByText('Default platform commission saved and audited.')).toBeVisible()
  await expect(page.getByText('Clinic Pro')).toBeVisible()
  await page.screenshot({ path: `${verificationDir}admin-finance-${testInfo.project.name}.png`, fullPage: true })
})
