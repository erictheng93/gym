/**
 * E2E Tests for Member Login Flows
 * Covers email/password, OTP tab validation, social buttons and route protection.
 */
import { test, expect } from '@playwright/test'
import { loginAsMember, goto } from '../fixtures/auth'

test.describe('Member Login', () => {
  test.describe('Email Login', () => {
    test('should display login form', async ({ page }) => {
      await goto(page, '/login')

      await expect(page.getByRole('heading', { name: 'GYM NEXUS' })).toBeVisible()
      await expect(page.locator('#email')).toBeVisible()
      await expect(page.locator('#password')).toBeVisible()
      await expect(page.getByRole('button', { name: '登入', exact: true })).toBeVisible()
    })

    test('should show error for invalid credentials', async ({ page }) => {
      await goto(page, '/login')

      await page.locator('#email').fill('invalid@example.com')
      await page.locator('#password').fill('wrongpassword')
      await page.getByRole('button', { name: '登入', exact: true }).click()

      await expect(page.locator('.error-message')).toBeVisible()
      await expect(page).toHaveURL(/\/login/)
    })

    test('should navigate to forgot password', async ({ page }) => {
      await goto(page, '/login')

      await page.getByRole('link', { name: '忘記密碼？' }).click()

      await expect(page).toHaveURL(/\/auth\/forgot-password/)
    })

    test('should redirect to home after successful login', async ({ page }) => {
      await loginAsMember(page)

      await expect(page).toHaveURL('/')
    })
  })

  test.describe('OTP Login', () => {
    test('should validate phone number format', async ({ page }) => {
      await goto(page, '/login')

      await page.getByRole('button', { name: '手機驗證' }).click()
      await page.locator('#phone').fill('12345')
      await page.getByRole('button', { name: '發送驗證碼' }).click()

      await expect(page.locator('.error-message')).toContainText('手機號碼')
    })
  })

  test.describe('Social Login', () => {
    test('should display social login buttons', async ({ page }) => {
      await goto(page, '/login')

      await expect(page.getByRole('button', { name: 'LINE' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Google' })).toBeVisible()
    })
  })

  test.describe('Authentication Flow', () => {
    test('should redirect to login when accessing protected route', async ({ page }) => {
      await goto(page, '/')

      await expect(page).toHaveURL(/\/login/)
    })
  })
})
