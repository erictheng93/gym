/**
 * E2E Tests for Member Profile page
 * Seed: member1 = 趙小明 / MEM001 / member1@example.com. Edits are never saved.
 */
import { test, expect } from '@playwright/test'
import { loginAsMember, goto } from '../fixtures/auth'

test.describe('Member Profile', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMember(page)
    await goto(page, '/profile')
  })

  test('should display profile header with member info', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: '趙小明' })).toBeVisible()
    await expect(page.locator('.profile-code')).toHaveText('MEM001')
    await expect(page.locator('.status-badge')).toBeVisible()
  })

  test('should display member details', async ({ page }) => {
    const card = page.locator('.info-card')
    await expect(card.locator('.info-row').filter({ hasText: '姓名' })).toContainText('趙小明')
    await expect(card.locator('.info-row').filter({ hasText: '手機' })).toContainText('0911-111-111')
    await expect(card.locator('.info-row').filter({ hasText: 'Email' })).toContainText('member1@example.com')
  })

  test('should display stats card', async ({ page }) => {
    const stats = page.locator('.stats-card')
    await expect(stats.getByText('會員年資')).toBeVisible()
    await expect(stats.getByText('合約狀態')).toBeVisible()
    await expect(stats.getByText('所屬分店')).toBeVisible()
  })

  test('should enter and cancel edit mode', async ({ page }) => {
    await page.getByRole('button', { name: '編輯' }).click()

    await expect(page.locator('#edit-name')).toHaveValue('趙小明')
    await expect(page.locator('#edit-phone')).toBeVisible()
    await expect(page.getByRole('button', { name: '儲存' })).toBeVisible()

    await page.getByRole('button', { name: '取消' }).click()

    await expect(page.locator('.info-card')).toBeVisible()
    await expect(page.locator('#edit-name')).toBeHidden()
  })

  test('should show theme options', async ({ page }) => {
    await expect(page.getByText('外觀主題')).toBeVisible()
    await expect(page.getByRole('button', { name: '淺色' })).toBeVisible()
    await expect(page.getByRole('button', { name: '深色' })).toBeVisible()
  })

  test('should show menu items', async ({ page }) => {
    for (const label of ['健身追蹤', '入場紀錄', '付款紀錄', '通知設定', '問題回報', '聯絡客服']) {
      await expect(page.getByRole('link', { name: new RegExp(label) })).toBeVisible()
    }
  })

  test('should navigate to fitness tracking', async ({ page }) => {
    await page.getByRole('link', { name: /健身追蹤/ }).click()

    await expect(page).toHaveURL(/\/fitness$/)
  })

  test('should show logout button', async ({ page }) => {
    await expect(page.getByRole('button', { name: '登出' })).toBeVisible()
  })
})
