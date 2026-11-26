/**
 * E2E Tests for the complete-profile page (shown after social login)
 * Seed: member1 = 趙小明 / 0911-111-111; member2 has 0922-222-222. Nothing is saved:
 * the only API call made is the phone-verification send, which is refused (409).
 */
import { test, expect } from '@playwright/test'
import { loginAsMember, goto } from '../fixtures/auth'

test.describe('Member Complete Profile', () => {
  test('explains how to proceed when there is no member session', async ({ page }) => {
    await goto(page, '/auth/complete-profile')

    await expect(page.getByRole('heading', { name: '尚未綁定會員' })).toBeVisible()
    await expect(page.getByRole('link', { name: '前往登入' })).toBeVisible()
  })

  test('prefills the member and refuses a phone owned by another member', async ({ page }) => {
    await loginAsMember(page)
    await goto(page, '/auth/complete-profile')

    await expect(page.getByRole('heading', { name: '完成會員資料' })).toBeVisible()
    await expect(page.getByLabel('姓名')).toHaveValue('趙小明')

    await page.getByLabel(/手機號碼/).fill('0922-222-222')
    await page.getByRole('button', { name: '發送驗證碼' }).click()

    await expect(page.getByRole('alert')).toContainText('已被其他會員使用')
    await expect(page.getByLabel(/驗證碼/)).toBeHidden()
  })
})
