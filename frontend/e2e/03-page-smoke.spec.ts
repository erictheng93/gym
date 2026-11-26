import { test, expect } from '@playwright/test'
import { login, TEST_USERS } from './fixtures/auth'

/**
 * Every admin-web page renders its own <h1> for an authenticated admin.
 * Asserting the exact title catches wrong routes (Nuxt 404 also has a heading),
 * crashed pages and auth redirects.
 */
const pages: Array<[path: string, title: string]> = [
  ['/members', '會員管理'],
  ['/contracts', '合約管理'],
  ['/contracts/new', '新增合約'],
  ['/payments', '收款管理'],
  ['/payments/new', '新增收款'],
  ['/plans', '會籍方案'],
  ['/plans/new', '新增方案'],
  ['/branches', '分店管理'],
  ['/checkin', '會員入場'],
  ['/hr', '人資管理'],
  ['/hr/employees', '員工管理'],
  ['/hr/employees/new', '新增員工'],
  ['/hr/attendance', '考勤打卡'],
  ['/hr/leaves', '休假管理'],
  ['/hr/performance', '績效考核'],
  ['/hr/performance/new', '新增績效考核'],
  ['/hr/performance/templates', 'KPI 範本管理'],
  ['/hr/performance/dashboard', '團隊績效儀表板'],
  ['/hr/payroll', '薪資管理'],
  ['/hr/payroll/generate', '產生薪資'],
  ['/hr/payroll/export', '匯出薪資報表'],
  ['/hr/promotions', '員工異動紀錄'],
  ['/hr/promotions/new', '新增員工異動'],
  ['/leads', '潛在客戶管理'],
  ['/leads/new', '新增潛在客戶'],
  ['/leads/analytics', '數據分析'],
  ['/marketing/segmentation', '會員分群'],
  ['/marketing/segmentation/champions', '冠軍客戶'],
  ['/marketing/coupons', '優惠券管理'],
  ['/marketing/coupons/new', '新增優惠券'],
  ['/marketing/campaigns', '行銷活動'],
  ['/marketing/campaigns/new', '新增行銷活動'],
  ['/marketing/reports/roi', 'ROI 報表'],
]

test.describe('admin-web 頁面載入', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, TEST_USERS.admin)
  })

  for (const [path, title] of pages) {
    test(`${path} 顯示「${title}」`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1, name: title, exact: true })).toBeVisible()
      await expect(page).toHaveURL(path)
    })
  }
})

test.describe('未登入存取受保護頁面', () => {
  for (const path of ['/members', '/contracts', '/hr/employees']) {
    test(`${path} 導向登入頁`, async ({ page }) => {
      await page.goto(path)
      await expect(page).toHaveURL('/login')
    })
  }
})
