/**
 * Coach App Lessons (教案管理) E2E Tests
 *
 * Lesson plan list, template view and creation page.
 */
import { test, expect } from '@playwright/test'
import { loginAsCoach, goto } from '../fixtures/auth'

test.describe('Lessons List', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
    await goto(page, '/lessons')
  })

  test('should display lessons page with title and subtitle', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('教案管理')
    await expect(page.getByText('建立與管理訓練教案')).toBeVisible()
  })

  test('should display add button linking to /lessons/new', async ({ page }) => {
    await expect(page.locator('.add-button')).toHaveAttribute('href', '/lessons/new')
  })

  test('should display segmented control and search bar', async ({ page }) => {
    await expect(page.getByRole('button', { name: '我的教案' })).toBeVisible()
    await expect(page.getByRole('button', { name: '教案範本' })).toBeVisible()
    await expect(page.getByPlaceholder('搜尋教案標題...')).toBeVisible()
  })

  test('should show plan items or empty state', async ({ page }) => {
    await expect(
      page.locator('.plan-item').first().or(page.getByText('尚未建立教案')),
    ).toBeVisible()
  })

  test('should switch to templates view', async ({ page }) => {
    const templatesTab = page.getByRole('button', { name: '教案範本' })
    await templatesTab.click()

    await expect(templatesTab).toHaveClass(/active/)
    await expect(page.getByRole('button', { name: '我的教案' })).not.toHaveClass(/active/)
    await expect(
      page.locator('.plan-item').first().or(page.getByText('沒有可用的範本')),
    ).toBeVisible()
  })
})

test.describe('Create Lesson', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
  })

  test('should navigate to new lesson page from the add button', async ({ page }) => {
    await goto(page, '/lessons')
    await page.locator('.add-button').click()

    await expect(page).toHaveURL(/\/lessons\/new/)
    await expect(page.locator('h1')).toHaveText('新增教案')
  })

  test('should display lesson creation form', async ({ page }) => {
    await goto(page, '/lessons/new')

    await expect(page.getByPlaceholder('例如：上肢力量訓練')).toBeVisible()
    await expect(page.getByPlaceholder('其他注意事項...')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })
})
