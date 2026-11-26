# E2E 測試（Playwright）

端到端測試，涵蓋三個前端應用。CI 的 `e2e` job（僅 pull request）會在剛 seed 過的資料庫上啟動後端並執行，見下方「CI」。

## 結構

| 路徑 | Playwright project | baseURL |
|------|-------------------|---------|
| `e2e/*.spec.ts` | `admin-web` | http://localhost:3001 |
| `e2e/member-app/` | `member-app` | http://localhost:3002 |
| `e2e/coach-app/` | `coach-app` | http://localhost:3003 |

- `config/test-env.ts`：URL、測試帳號、逾時設定（可用環境變數或 `frontend/.env.test` 覆寫）
- `fixtures/auth.ts`：`login`（admin-web）、`loginAsMember`、`loginAsCoach`

測試中一律使用相對路徑（`page.goto('/members')`），由各 project 的 baseURL 決定應用。

## 前置條件

1. 後端執行中（port 8056），且資料庫已執行 seed：

   ```bash
   cd backend
   docker compose up -d
   bun run db:push && bun run db:seed
   bun run dev
   ```

   許多斷言依賴 seed 資料（例如會員 `趙小明` / `MEM001`、方案、合約）。請使用剛 seed 過的資料庫。

2. 安裝瀏覽器：`cd frontend && bunx playwright install chromium`

三個前端 dev server 由 `playwright.config.ts` 的 `webServer` 自動啟動；若已在執行則直接沿用。

## 預設測試帳號（來自 `backend/src/db/seed.ts`）

| 角色 | 帳號 | 密碼 | 環境變數 |
|------|------|------|---------|
| 管理員 | admin@gym.com | admin | `TEST_ADMIN_EMAIL` / `TEST_ADMIN_PASSWORD` |
| 店長 | manager.taipei@gym.com | manager123 | `TEST_MANAGER_*` |
| 教練 | coach.chen@gym.com | coach123 | `TEST_COACH_*` |
| 會員 | member1@example.com | member123 | `TEST_MEMBER_*` |

## 執行

```bash
cd frontend
bun run test:e2e                          # 全部
bunx playwright test --project=admin-web  # 單一應用
bunx playwright test e2e/01-auth-flow.spec.ts
bun run test:e2e:ui                       # UI 模式除錯
bunx playwright test --list               # 只檢查能否解析
bunx playwright show-report
```

## CI

`.github/workflows/ci.yml` 的 `e2e` job（matrix：目前只有 `admin-web`）：PostGIS service →
`drizzle-kit push` → `db:seed` → 以 `ENABLE_CRON=false RELAX_RATE_LIMITS=true` 啟動後端 →
`E2E_APPS=admin-web bunx playwright test --project=admin-web`。失敗時上傳 `playwright-report/`、
`test-results/`（含 trace 與 `backend.log`）為 artifact：`gh run download <run-id>`。

- `E2E_APPS`（逗號分隔）決定 `webServer` 啟動哪些 dev server，未設定時三個都啟動。
- `RELAX_RATE_LIMITS=true`：整套測試約登入 50 次，正式環境的登入限制（15 分鐘 5 次）會鎖住；
  `NODE_ENV=production` 時此變數無效。

### 尚未接入 CI 的 project

- `member-app`、`coach-app`：尚未在 CI 執行過（`--list` 可解析），待 admin-web 穩定後另行加入 matrix。

### 已知的 production bug（`test.fail()`）

下列測試以 `test.fail()` 標記：測試照常執行，且必須失敗；bug 修好後 Playwright 會回報
「expected to fail」，屆時移除標記即可。

| 測試 | 原因 |
|------|------|
| `14-dashboard-war-room`：KPI 卡片、合約到期警示、匯出 JSON | `/api/admin/dashboard/*`、`/api/admin/analytics/checkin-heatmap` 只存在於 `rust-backend/`，Hono 後端回 404 |
| `15-bi-reports`：會員分析 | `/api/admin/analytics/*`、`/api/admin/reports/member-growth` 同上 |
| `15-bi-reports`：營運報表期間切換 | `useReports` 期待舊的回應格式（`summary.net_revenue`），實際 `/api/reports/*` 回 `{ data: { total, byBranch, byDay } }`，頁面拋出 TypeError |

## 撰寫原則

- 進入頁面後要互動（填表、點擊）時用 `fixtures/auth.ts` 的 `goto(page, path)`：它會等 Nuxt hydration 完成。hydration 前輸入的文字會被 Vue 重設，點擊也沒有作用。
- 斷言使用 web-first（`await expect(locator).toBeVisible()`），不要用 `waitForTimeout`。
- 不要寫 `if (await x.isVisible()) { ... }` 的條件分支，這種測試永遠不會失敗。
- 選擇器以實際畫面文字（繁體中文）與 role 為主；應用程式碼目前沒有 `data-testid`。
- 不要用 `test.skip` 讓測試通過：測試錯就修測試，應用程式錯就修應用程式；修不了的 production bug 用 `test.fail()` 並加上 `// BUG:` 說明。
