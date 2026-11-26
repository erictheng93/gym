/**
 * E2E Tests for Member Body Measurements
 * Seed data has no measurements for member1, so the empty state is asserted.
 */
import { test, expect } from '@playwright/test'
import { loginAsMember, goto } from '../fixtures/auth'

test.describe('Member Body Measurements', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMember(page)
  })

  test.describe('Measurements List Page', () => {
    test.beforeEach(async ({ page }) => {
      await goto(page, '/fitness/measurements')
    })

    test('should display page with period selector and empty state', async ({ page }) => {
      await expect(page.getByRole('heading', { level: 1, name: '體態記錄' })).toBeVisible()
      await expect(page.getByRole('button', { name: '7天' })).toBeVisible()
      await expect(page.getByRole('button', { name: '30天' })).toBeVisible()
      await expect(page.getByRole('button', { name: '90天' })).toBeVisible()
      await expect(page.getByRole('heading', { name: '還沒有體態記錄' })).toBeVisible()
    })

    test('should navigate back to fitness page', async ({ page }) => {
      await page.locator('a.back-btn').click()

      await expect(page).toHaveURL(/\/fitness$/)
    })

    test('should navigate to new measurement form', async ({ page }) => {
      await page.locator('.add-btn').click()

      await expect(page).toHaveURL(/\/fitness\/measurements\/new$/)
    })
  })

  test.describe('New Measurement Page', () => {
    test('should display new measurement form fields', async ({ page }) => {
      await goto(page, '/fitness/measurements/new')

      await expect(page.getByRole('heading', { level: 1, name: '記錄體態' })).toBeVisible()
      await expect(page.getByLabel('日期')).toBeVisible()
      await expect(page.locator('#weight')).toBeVisible()
      await expect(page.locator('#body_fat')).toBeVisible()
      await expect(page.locator('#muscle_mass')).toBeVisible()
      await expect(page.locator('#bmi')).toBeVisible()
    })
  })
})
