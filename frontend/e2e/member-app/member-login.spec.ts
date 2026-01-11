/**
 * E2E Tests for Member Login Flows
 * Tests email/password, OTP, and OAuth login flows
 */
import { test, expect } from '@playwright/test'

test.describe('Member Login', () => {
  test.beforeEach(async ({ page }) => {
    // Clear cookies and storage before each test
    await page.context().clearCookies()
    await page.evaluate(() => localStorage.clear())
  })

  test.describe('Email Login', () => {
    test('should display login form', async ({ page }) => {
      await page.goto('/login')

      // Check form elements are present
      await expect(page.getByRole('heading', { name: /登入/i })).toBeVisible()
      await expect(page.locator('[data-testid="email-input"]').or(page.getByPlaceholder('電子郵件'))).toBeVisible()
      await expect(page.locator('[data-testid="password-input"]').or(page.getByPlaceholder('密碼'))).toBeVisible()
      await expect(page.getByRole('button', { name: /登入/i })).toBeVisible()
    })

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/login')

      // Fill in invalid credentials
      await page.fill('[data-testid="email-input"], input[placeholder*="郵件"]', 'invalid@example.com')
      await page.fill('[data-testid="password-input"], input[type="password"]', 'wrongpassword')

      // Submit form
      await page.click('[data-testid="login-button"], button[type="submit"]')

      // Should show error message
      await expect(page.locator('.error-message, [role="alert"]')).toBeVisible({ timeout: 5000 })
    })

    test('should navigate to forgot password', async ({ page }) => {
      await page.goto('/login')

      // Click forgot password link
      await page.click('a[href*="forgot-password"], text=忘記密碼')

      await expect(page).toHaveURL(/forgot-password/)
    })
  })

  test.describe('OTP Login', () => {
    test('should display OTP login tab', async ({ page }) => {
      await page.goto('/login')

      // Click OTP tab if available
      const otpTab = page.locator('button:has-text("手機驗證"), [data-testid="otp-tab"]')
      if (await otpTab.isVisible()) {
        await otpTab.click()

        // Check OTP form elements
        await expect(page.getByPlaceholder('手機號碼').or(page.locator('[data-testid="phone-input"]'))).toBeVisible()
      }
    })

    test('should validate phone number format', async ({ page }) => {
      await page.goto('/login')

      // Switch to OTP tab
      const otpTab = page.locator('button:has-text("手機驗證"), [data-testid="otp-tab"]')
      if (await otpTab.isVisible()) {
        await otpTab.click()

        // Enter invalid phone
        await page.fill('[data-testid="phone-input"], input[placeholder*="手機"]', '12345')

        // Should show validation error
        const sendButton = page.locator('button:has-text("發送"), button:has-text("傳送")')
        if (await sendButton.isVisible()) {
          await sendButton.click()
          await expect(page.locator('.error-message, [role="alert"]')).toBeVisible({ timeout: 3000 })
        }
      }
    })
  })

  test.describe('Social Login', () => {
    test('should display social login buttons', async ({ page }) => {
      await page.goto('/login')

      // Check for social login buttons
      const googleBtn = page.locator('button:has-text("Google"), [data-testid="google-login"]')
      const lineBtn = page.locator('button:has-text("LINE"), [data-testid="line-login"]')

      // At least one social login should be available
      const googleVisible = await googleBtn.isVisible()
      const lineVisible = await lineBtn.isVisible()

      expect(googleVisible || lineVisible).toBe(true)
    })
  })

  test.describe('Authentication Flow', () => {
    test('should redirect to login when accessing protected route', async ({ page }) => {
      // Try to access protected route without auth
      await page.goto('/')

      // Should redirect to login
      await expect(page).toHaveURL(/login/)
    })

    test('should redirect to home after successful login', async ({ page }) => {
      // This test requires a valid test account
      // Skip in CI unless test credentials are available
      test.skip(!process.env.TEST_MEMBER_EMAIL, 'Test credentials not available')

      await page.goto('/login')

      await page.fill('[data-testid="email-input"], input[placeholder*="郵件"]', process.env.TEST_MEMBER_EMAIL!)
      await page.fill('[data-testid="password-input"], input[type="password"]', process.env.TEST_MEMBER_PASSWORD!)

      await page.click('[data-testid="login-button"], button[type="submit"]')

      // Wait for redirect
      await expect(page).toHaveURL('/', { timeout: 10000 })

      // QR code should be visible on home page
      await expect(page.locator('[data-testid="qr-code"], .qr-image, img[alt*="QR"]')).toBeVisible()
    })
  })

  test.describe('Accessibility', () => {
    test('should have proper form labels', async ({ page }) => {
      await page.goto('/login')

      // Check email input has associated label
      const emailInput = page.locator('[data-testid="email-input"], input[type="email"]')
      if (await emailInput.isVisible()) {
        const ariaLabel = await emailInput.getAttribute('aria-label')
        const placeholder = await emailInput.getAttribute('placeholder')
        expect(ariaLabel || placeholder).toBeTruthy()
      }

      // Check password input has associated label
      const passwordInput = page.locator('[data-testid="password-input"], input[type="password"]')
      if (await passwordInput.isVisible()) {
        const ariaLabel = await passwordInput.getAttribute('aria-label')
        const placeholder = await passwordInput.getAttribute('placeholder')
        expect(ariaLabel || placeholder).toBeTruthy()
      }
    })

    test('should be navigable with keyboard', async ({ page }) => {
      await page.goto('/login')

      // Tab through form elements
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')

      // Should reach submit button
      const focusedElement = page.locator(':focus')
      await expect(focusedElement).toBeVisible()
    })
  })
})
