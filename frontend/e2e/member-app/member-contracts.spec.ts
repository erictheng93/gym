/**
 * E2E Tests for Member Contracts Flow
 * Seed: member1 has one ACTIVE contract (年費會員).
 */
import { test, expect } from '@playwright/test'
import { loginAsMember, goto } from '../fixtures/auth'

test.describe('Member Contracts', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMember(page)
    await goto(page, '/contracts')
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

  // Member self-service pause was removed in #121 pending a product decision:
  // pausing changes the end date and is a staff-only flow.
  test('should direct the member to the front desk for pause/resume instead of offering it', async ({ page }) => {
    const card = page.locator('.contract-card').filter({ hasText: '年費會員' })
    await expect(card.locator('.contract-hint')).toHaveText('如需暫停或恢復合約，請洽櫃檯協助。')
    await expect(page.getByRole('button', { name: '申請暫停' })).toHaveCount(0)
  })
})
