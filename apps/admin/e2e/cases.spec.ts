import { expect,test } from '@playwright/test'
import { fileURLToPath } from 'node:url'
const verificationDir=fileURLToPath(new URL('../../../docs/verification/',import.meta.url))
test('case decisions require reasons and fit narrow screens',async({page},testInfo)=>{
  await page.goto('/')
  await page.getByRole('button',{name:'Preview admin console'}).click()
  if(testInfo.project.name==='mobile-chromium')await page.getByRole('button',{name:'Open navigation'}).click()
  await page.getByRole('button',{name:'Cases',exact:true}).click()
  await page.getByRole('button',{name:/moderation · open/}).click()
  await page.getByRole('button',{name:'Hide reported review'}).click()
  await expect(page.getByRole('alert')).toContainText('Enter a reason')
  await page.getByRole('textbox',{name:'Decision and reason'}).fill('Reviewed the report against moderation policy.')
  await page.getByRole('combobox',{name:'Status'}).selectOption('resolved')
  await page.screenshot({path:`${verificationDir}admin-cases-${testInfo.project.name}.png`,fullPage:true})
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  await page.getByRole('button',{name:'Save case decision'}).click()
  await expect(page.getByRole('status')).toContainText('Case updated')
  await expect(page.getByRole('button',{name:/moderation · resolved/})).toBeVisible()
})
