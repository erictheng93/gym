import { Page, expect } from '@playwright/test'
import { TestEnv } from '../config/test-env'
import { findInput, findButton } from '../helpers/selector-helpers'
import { waitForApiResponse } from '../helpers/wait-helpers'

export interface TestUser {
  email: string
  password: string
}

export const TEST_USERS = TestEnv.users

export async function login(page: Page, user: TestUser) {
  await page.goto('/login')

  // 等待登入頁面完全加載
  const emailInput = findInput(page, { name: 'email' }).or(page.locator('#email'))
  await emailInput.waitFor({ state: 'visible', timeout: TestEnv.timeouts.default })

  // 填寫 email 和密碼
  await emailInput.fill(user.email)

  const passwordInput = findInput(page, { name: 'password' }).or(page.locator('#password'))
  await passwordInput.fill(user.password)

  // 點擊提交按鈕
  const submitButton = findButton(page, { text: /登入|Login|Sign In/i }).or(
    page.locator('button[type="submit"]')
  )

  // 等待登入 API 響應
  const loginPromise = waitForApiResponse(page, '/auth/login', TestEnv.timeouts.api).catch(() => null)

  await submitButton.click()

  // 等待 API 響應或導航完成
  await Promise.race([
    loginPromise,
    page.waitForURL('/', { timeout: TestEnv.timeouts.navigation })
  ])

  // 驗證登入成功
  await expect(page).toHaveURL('/', { timeout: TestEnv.timeouts.default })
}

export async function logout(page: Page) {
  // 等待登出按鈕/選單可見
  const logoutButton = findButton(page, { text: /登出|Logout|Sign Out/i })
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
