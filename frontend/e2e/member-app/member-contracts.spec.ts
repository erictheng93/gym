/**
 * E2E Tests for Member Contracts Flow
 * Seed: member1 has one ACTIVE contract (年費會員). Tests never submit the
 * pause request, so the seeded contract stays ACTIVE for other specs.
 */
import { test, expect } from '@playwright/test'
import { loginAsMember } from '../fixtures/auth'

test.describe('Member Contracts', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMember(page)
    await page.goto('/contracts')
  })

  test('should display contracts page heading', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: '我的合約' })).toBeVisible()
  })

  test('should display the active contract card with details', async ({ page }) => {
    const card = page.locator('.contract-card').filter({ hasText: '年費會員' })
    await expect(card).toBeVisible()
    await expect(card.locator('.contract-status')).toHaveText('有效')
    await expect(card.getByText('合約編號')).toBeVisible()
    await expect(card.getByText('有效期間')).toBeVisible()
    await expect(card.getByText('付款狀態')).toBeVisible()
  })

  test.describe('Contract Pause', () => {
    test('should open pause modal and require a reason of at least 5 characters', async ({ page }) => {
      await page.getByRole('button', { name: '申請暫停' }).click()

      await expect(page.getByRole('heading', { name: '申請暫停合約' })).toBeVisible()
      const confirm = page.getByRole('button', { name: '確認暫停' })
      await expect(confirm).toBeDisabled()

      await page.getByLabel('暫停原因').fill('太短')
      await expect(confirm).toBeDisabled()

      await page.getByLabel('暫停原因').fill('出差一個月無法到館')
      await expect(confirm).toBeEnabled()
    })

    test('should close pause modal on cancel', async ({ page }) => {
      await page.getByRole('button', { name: '申請暫停' }).click()
      await expect(page.getByRole('heading', { name: '申請暫停合約' })).toBeVisible()

      await page.getByRole('button', { name: '取消', exact: true }).click()

      await expect(page.getByRole('heading', { name: '申請暫停合約' })).toBeHidden()
    })
  })
})
