/**
 * Coach App Students Management E2E Tests
 *
 * Student list page: search and filter controls.
 */
import { test, expect } from '@playwright/test'
import { loginAsCoach } from '../fixtures/auth'

test.describe('Students List', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsCoach(page)
    await page.goto('/students')
  })

  test('should display students page with title', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('學員管理')
  })

  test('should display search bar', async ({ page }) => {
    await expect(page.getByPlaceholder('搜尋學員姓名、電話或會員編號')).toBeVisible()
  })

  test('should display filter pills', async ({ page }) => {
    for (const label of ['全部', '主教練', '副教練', '有效合約']) {
      await expect(page.locator('.filter-pill', { hasText: label })).toBeVisible()
    }
  })

  test('should mark the role filter pill active when clicked', async ({ page }) => {
    const primary = page.locator('.filter-pill', { hasText: '主教練' })
    await primary.click()

    await expect(primary).toHaveClass(/active/)
    await expect(page.locator('.filter-pill', { hasText: '全部' })).not.toHaveClass(/active/)
  })

  test('should show the clear button once a search query is typed', async ({ page }) => {
    const searchInput = page.getByPlaceholder('搜尋學員姓名、電話或會員編號')
    await searchInput.fill('測試')

    await expect(page.locator('.search-clear')).toBeVisible()
    await page.locator('.search-clear').click()
    await expect(searchInput).toHaveValue('')
  })

  test('should show a loaded list or the empty state', async ({ page }) => {
    await expect(
      page.locator('.student-item').first().or(page.getByText('尚未有指派的學員')),
    ).toBeVisible()
  })
})
