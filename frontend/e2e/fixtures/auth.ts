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

  // 等待頁面動畫完成
  await page.waitForTimeout(500)

  // 填寫 email 和密碼
  await emailInput.fill(user.email)

  const passwordInput = page.locator('#password')
  await passwordInput.fill(user.password)

  // 點擊提交按鈕並等待 API 響應
  const submitButton = page.locator('button[type="submit"]')

  // 同時監聽 API 響應和導航
  await Promise.all([
    // 等待 auth/login API 響應
    page.waitForResponse(
      response => response.url().includes('/auth/login'),
      { timeout: TestEnv.timeouts.api }
    ).catch(() => null),
    submitButton.click()
  ])

  // 等待導航到首頁或等待頁面穩定
  try {
    await page.waitForURL('/', { timeout: TestEnv.timeouts.navigation })
  } catch {
    // 如果導航超時，檢查是否已經在首頁
    const currentUrl = page.url()
    if (!currentUrl.endsWith('/') && !currentUrl.includes('/?')) {
      throw new Error(`Login failed: expected URL to be /, got ${currentUrl}`)
    }
  }

  // 驗證登入成功 - 檢查是否有導航選單
  await expect(page.locator('nav, [role="navigation"]').first()).toBeVisible({
    timeout: TestEnv.timeouts.default
  })
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
