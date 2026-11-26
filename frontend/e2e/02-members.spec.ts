import { test, expect } from '@playwright/test'
import { login, TEST_USERS } from './fixtures/auth'

const searchInput = 'input.input-search'

test.describe('會員管理', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.admin)
  })

  test('搜尋會員只顯示符合的結果', async ({ page }) => {
    await page.goto('/members')
    await expect(page.getByRole('heading', { level: 1, name: '會員管理' })).toBeVisible()

    await page.locator(searchInput).fill('趙小明')
    await expect(page.locator('.member-row').filter({ hasText: '趙小明' })).toBeVisible()
    await expect(page.locator('.member-row').filter({ hasText: '錢美美' })).toHaveCount(0)
  })

  test('新增會員必填欄位未填時顯示驗證錯誤並停留在表單', async ({ page }) => {
    await page.goto('/members/new')
    await expect(page.getByRole('heading', { level: 1, name: '新增會員' })).toBeVisible()

    await page.locator('button[type="submit"]').click()

    await expect(page.locator('.form-field-error').first()).toBeVisible()
    await expect(page).toHaveURL('/members/new')
  })

  test('新增會員成功後回到列表並可搜尋到', async ({ page }) => {
    const stamp = Date.now().toString()
    const name = `E2E會員${stamp.slice(-6)}`

    await page.goto('/members/new')
    await page.getByPlaceholder('請輸入會員姓名').fill(name)
    await page.getByPlaceholder('0912345678').fill(`09${stamp.slice(-8)}`)
    await page.locator('button[type="submit"]').click()

    await expect(page).toHaveURL('/members')
    await page.locator(searchInput).fill(name)
    await expect(page.locator('.member-row').filter({ hasText: name })).toBeVisible()
  })
})
