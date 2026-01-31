/**
 * Coach App Login E2E Tests
 *
 * Tests the complete login flow for coaches
 */
import { test, expect } from '@playwright/test'

test.describe('Coach Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('http://localhost:3003/login')
  })

  test('should display login form', async ({ page }) => {
    // Check page title
    await expect(page.locator('h1')).toContainText('教練登入')

    // Check form elements exist
    await expect(page.locator('input[type="text"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('should show error for empty credentials', async ({ page }) => {
    // Click submit without filling form
    await page.locator('button[type="submit"]').click()

    // Check for HTML5 validation or custom error
    const emailInput = page.locator('input[type="text"]')
    await expect(emailInput).toHaveAttribute('required', '')
  })

  test('should show error for invalid credentials', async ({ page }) => {
    // Fill in invalid credentials
    await page.locator('input[type="text"]').fill('invalid@example.com')
    await page.locator('input[type="password"]').fill('wrongpassword')

    // Submit form
    await page.locator('button[type="submit"]').click()

    // Wait for error message
    await expect(page.locator('.text-red-500, [class*="error"]')).toBeVisible({ timeout: 5000 })
  })

  test('should successfully login with valid credentials', async ({ page }) => {
    // This test requires a valid test account
    // Skip in CI or use mock API

    // Fill in test credentials
    await page.locator('input[type="text"]').fill('test-coach@example.com')
    await page.locator('input[type="password"]').fill('testpassword123')

    // Submit form
    await page.locator('button[type="submit"]').click()

    // Should redirect to dashboard
    await expect(page).toHaveURL(/\/$/i, { timeout: 10000 })

    // Dashboard should show coach name
    await expect(page.locator('text=今日課程')).toBeVisible()
  })

  test('should persist login across page refresh', async ({ page }) => {
    // Login first
    await page.locator('input[type="text"]').fill('test-coach@example.com')
    await page.locator('input[type="password"]').fill('testpassword123')
    await page.locator('button[type="submit"]').click()

    // Wait for dashboard
    await page.waitForURL(/\/$/)

    // Refresh page
    await page.reload()

    // Should still be on dashboard (not redirected to login)
    await expect(page).toHaveURL(/\/$/)
  })

  test('should logout successfully', async ({ page }) => {
    // Login first
    await page.locator('input[type="text"]').fill('test-coach@example.com')
    await page.locator('input[type="password"]').fill('testpassword123')
    await page.locator('button[type="submit"]').click()

    // Wait for dashboard
    await page.waitForURL(/\/$/)

    // Click menu button (if exists)
    const menuButton = page.locator('[aria-label="menu"], .menu-button, button:has-text("選單")')
    if (await menuButton.isVisible()) {
      await menuButton.click()
    }

    // Click logout
    await page.locator('text=登出').click()

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/)
  })
})

test.describe('Coach Auth Middleware', () => {
  test('should redirect to login when accessing protected route without auth', async ({ page }) => {
    // Try to access dashboard directly
    await page.goto('http://localhost:3003/')

    // Should be redirected to login
    await expect(page).toHaveURL(/\/login/)
  })

  test('should redirect to login when accessing students page without auth', async ({ page }) => {
    await page.goto('http://localhost:3003/students')
    await expect(page).toHaveURL(/\/login/)
  })

  test('should redirect to login when accessing classes page without auth', async ({ page }) => {
    await page.goto('http://localhost:3003/classes')
    await expect(page).toHaveURL(/\/login/)
  })
})
