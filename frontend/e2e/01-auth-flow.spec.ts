import { test, expect } from '@playwright/test'
import { TEST_USERS, login, goto } from './fixtures/auth'

const sidebar = '.sidebar'
const SESSION_KEY = 'gn_sess_ctx'

test.describe('登入流程', () => {
  test('登入成功後進入首頁並顯示側邊欄', async ({ page }) => {
    await login(page, TEST_USERS.admin)

    await expect(page).toHaveURL('/')
    await expect(page.locator(sidebar)).toBeVisible()
    await expect(page.locator('.user-email')).toHaveText(TEST_USERS.admin.email)
  })

  test('空白送出顯示必填錯誤', async ({ page }) => {
    await goto(page, '/login')
    await page.locator('button[type="submit"]').click()

    await expect(page.locator('.error-banner')).toContainText('請填寫帳號和密碼')
    await expect(page).toHaveURL('/login')
  })

  test('錯誤帳密顯示錯誤並停留在登入頁', async ({ page }) => {
    await goto(page, '/login')
    await page.locator('#email').fill('wrong@example.com')
    await page.locator('#password').fill('wrongpassword')
    await page.locator('button[type="submit"]').click()

    await expect(page.locator('.error-banner')).toBeVisible()
    await expect(page).toHaveURL('/login')
  })

  test('Email 格式無效時被瀏覽器驗證攔下', async ({ page }) => {
    await goto(page, '/login')
    const email = page.locator('#email')
    await email.fill('invalid-email')
    await page.locator('#password').fill('password123')
    await page.locator('button[type="submit"]').click()

    expect(await email.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false)
    await expect(page).toHaveURL('/login')
  })

  test('登出後回到登入頁並清除 session 快取', async ({ page }) => {
    await login(page, TEST_USERS.admin)
    expect(await page.evaluate(k => sessionStorage.getItem(k), SESSION_KEY)).toBeTruthy()

    await page.locator('.logout-btn').click()

    await expect(page).toHaveURL('/login')
    await expect(page.locator('#email')).toBeVisible()
    expect(await page.evaluate(k => sessionStorage.getItem(k), SESSION_KEY)).toBeNull()
  })

  test('已登入時造訪登入頁會導回首頁', async ({ page }) => {
    await login(page, TEST_USERS.admin)
    await goto(page, '/login')

    await expect(page).toHaveURL('/')
  })

  test('重新整理後維持登入狀態，不跳回登入頁', async ({ page }) => {
    await login(page, TEST_USERS.admin)

    await page.reload({ waitUntil: 'domcontentloaded' })
    expect(page.url()).not.toContain('/login')

    await expect(page.locator(sidebar)).toBeVisible()
    await expect(page).toHaveURL('/')
  })

  test('清除 cookies 後造訪受保護頁面會被導向登入頁', async ({ page, context }) => {
    await login(page, TEST_USERS.admin)
    await context.clearCookies()

    await goto(page, '/members')

    await expect(page).toHaveURL('/login')
  })
})
