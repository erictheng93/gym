import { Page, expect } from '@playwright/test'
import { TestEnv } from '../config/test-env'

export interface TestUser {
  email: string
  password: string
}

export const TEST_USERS = TestEnv.users

export async function login(page: Page, user: TestUser) {
  await page.goto('/login')

  // 等待登入頁面完全加載 - 使用簡單的 id 選擇器
  const emailInput = page.locator('#email')
  await emailInput.waitFor({ state: 'visible', timeout: TestEnv.timeouts.default })

  // 等待頁面完全穩定
  await page.waitForLoadState('networkidle').catch(() => null)
  await page.waitForTimeout(1000)

  // 清除並填寫 email - 使用 click + type 確保輸入
  await emailInput.click()
  await emailInput.clear()
  await emailInput.pressSequentially(user.email, { delay: 50 })

  // 確認 email 已填寫
  await page.waitForTimeout(200)

  // 清除並填寫密碼
  const passwordInput = page.locator('#password')
  await passwordInput.click()
  await passwordInput.clear()
  await passwordInput.pressSequentially(user.password, { delay: 50 })

  // 確認密碼已填寫
  await page.waitForTimeout(200)

  // 點擊提交按鈕
  const submitButton = page.locator('button[type="submit"]')
  await submitButton.click()

  // 等待 API 響應或頁面跳轉
  await Promise.race([
    page.waitForURL(url => !url.toString().includes('/login'), { timeout: TestEnv.timeouts.navigation }),
    page.waitForResponse(
      response => response.url().includes('/auth/login') && response.status() === 200,
      { timeout: TestEnv.timeouts.api }
    ).then(() => page.waitForURL(url => !url.toString().includes('/login'), { timeout: TestEnv.timeouts.navigation }))
  ]).catch(() => null)

  // 等待頁面穩定
  await page.waitForLoadState('networkidle', { timeout: TestEnv.timeouts.default }).catch(() => null)

  // 驗證登入成功 - 確認不在登入頁面
  const currentUrl = page.url()
  if (currentUrl.includes('/login')) {
    throw new Error(`Login failed: still on login page at ${currentUrl}`)
  }
}

export async function logout(page: Page) {
  // 等待登出按鈕可見 - 使用文字匹配
  const logoutButton = page.locator('button').filter({ hasText: /登出|Logout/i })
  await expect(logoutButton).toBeVisible({ timeout: TestEnv.timeouts.default })
  await logoutButton.click()

  // 等待重定向到登入頁面
  await page.waitForURL('/login', { timeout: TestEnv.timeouts.navigation })
  await expect(page).toHaveURL('/login')
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.waitForURL('/', { timeout: TestEnv.timeouts.default })
    return true
  } catch {
    return false
  }
}
