import { Page, expect } from '@playwright/test'

export interface TestUser {
  email: string
  password: string
}

export const TEST_USERS = {
  admin: {
    email: 'eric@dacit.net',
    password: 'eric',
  },
  manager: {
    email: 'manager@test.com',
    password: 'test123',
  },
  coach: {
    email: 'coach@test.com',
    password: 'test123',
  },
}

export async function login(page: Page, user: TestUser) {
  await page.goto('/login')
  await page.fill('#email', user.email)
  await page.fill('#password', user.password)
  await page.click('button[type="submit"]')

  // Wait for navigation to complete
  await page.waitForURL('/', { timeout: 10000 })

  // Verify login success
  await expect(page).toHaveURL('/')
}

export async function logout(page: Page) {
  // Wait for logout button/menu to be visible
  const logoutButton = page.locator('text=登出').or(page.locator('text=Logout'))
  await expect(logoutButton).toBeVisible({ timeout: 5000 })
  await logoutButton.click()

  // Wait for redirect to login page
  await page.waitForURL('/login', { timeout: 10000 })
  await expect(page).toHaveURL('/login')
}

export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    await page.waitForURL('/', { timeout: 5000 })
    return true
  } catch {
    return false
  }
}
