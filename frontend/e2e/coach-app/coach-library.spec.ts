/**
 * Coach App Teaching Library E2E Tests
 *
 * Teaching materials library page, filters and creation page.
 */
import { test, expect } from '@playwright/test'
import { loginAsCoach, goto } from '../fixtures/auth'

test.describe('Library Page', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
    await goto(page, '/library')
  })

  test('should display library page with title and subtitle', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('教學資源庫')
    await expect(page.getByText('動作示範與訓練資源')).toBeVisible()
  })

  test('should display add button linking to /library/new', async ({ page }) => {
    await expect(page.locator('.add-button')).toHaveAttribute('href', '/library/new')
  })

  test('should display type segmented control', async ({ page }) => {
    for (const label of ['全部', '動作', '影片', '文件']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible()
    }
  })

  test('should display search bar and difficulty filter pills', async ({ page }) => {
    await expect(page.getByPlaceholder('搜尋動作名稱...')).toBeVisible()
    for (const label of ['初階', '中階', '進階']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible()
    }
  })

  test('should show materials grid or empty state', async ({ page }) => {
    await expect(
      page.locator('.materials-grid').or(page.getByText('沒有找到教學資源')),
    ).toBeVisible()
  })

  test('should mark the type segment active when clicked', async ({ page }) => {
    const exercise = page.getByRole('button', { name: '動作', exact: true })
    await exercise.click()

    await expect(exercise).toHaveClass(/active/)
    await expect(page.getByRole('button', { name: '全部', exact: true })).not.toHaveClass(/active/)
  })

  test('should toggle the difficulty filter pill', async ({ page }) => {
    const beginner = page.getByRole('button', { name: '初階', exact: true })

    await beginner.click()
    await expect(beginner).toHaveClass(/active/)

    await beginner.click()
    await expect(beginner).not.toHaveClass(/active/)
  })
})

test.describe('Create Material', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
  })

  test('should navigate to new material page from the add button', async ({ page }) => {
    await goto(page, '/library')
    await page.locator('.add-button').click()

    await expect(page).toHaveURL(/\/library\/new/)
    await expect(page.locator('h1')).toHaveText('新增教學資源')
  })

  test('should display material creation form', async ({ page }) => {
    await goto(page, '/library/new')

    await expect(page.getByPlaceholder('例如：槓鈴深蹲')).toBeVisible()
    await expect(page.getByPlaceholder('動作簡介...')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })
})
