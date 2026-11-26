/**
 * Coach App Login E2E Tests
 *
 * Login flow, session persistence, logout and the route auth guard.
 */
import { test, expect } from '@playwright/test'
import { loginAsCoach } from '../fixtures/auth'

test.describe('Coach Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
  })

  test('should display login form', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('GymNexus')
    await expect(page.getByText('教練端 COACH')).toBeVisible()

    await expect(page.getByLabel('帳號')).toBeVisible()
    await expect(page.getByLabel('密碼')).toBeVisible()
    await expect(page.getByRole('button', { name: '登入系統' })).toBeVisible()
  })

  test('should disable submit until both fields are filled', async ({ page }) => {
    const submit = page.getByRole('button', { name: '登入系統' })
    await expect(submit).toBeDisabled()

    await page.locator('#identifier').fill('someone@example.com')
    await expect(submit).toBeDisabled()

    await page.locator('#password').fill('secret')
    await expect(submit).toBeEnabled()
  })

  test('should show error for invalid credentials', async ({ page }) => {
    await page.locator('#identifier').fill('invalid@example.com')
    await page.locator('#password').fill('wrongpassword')
    await page.getByRole('button', { name: '登入系統' }).click()

    await expect(page.locator('.error-alert')).toBeVisible()
    await expect(page).toHaveURL(/\/login/)
  })

  test('should successfully login with valid credentials', async ({ page }) => {
    await loginAsCoach(page)

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: '今日課程' })).toBeVisible()
  })

  test('should persist login across page refresh', async ({ page }) => {
    await loginAsCoach(page)

    await page.reload()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('heading', { name: '今日課程' })).toBeVisible()
  })

  test('should logout successfully', async ({ page }) => {
    await loginAsCoach(page)

    await page.locator('.menu-button').click()
    await page.getByRole('button', { name: '登出' }).click()

    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Coach Auth Middleware', () => {
  const protectedRoutes = ['/', '/students', '/classes', '/schedule', '/lessons', '/library']

  for (const route of protectedRoutes) {
    test(`should redirect to login when accessing ${route} without auth`, async ({ page }) => {
      await page.goto(route)
      await expect(page).toHaveURL(/\/login/)
    })
  }
})
