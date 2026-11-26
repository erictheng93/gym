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

## 撰寫原則

- 斷言使用 web-first（`await expect(locator).toBeVisible()`），不要用 `waitForTimeout`。
- 不要寫 `if (await x.isVisible()) { ... }` 的條件分支，這種測試永遠不會失敗。
- 選擇器以實際畫面文字（繁體中文）與 role 為主；應用程式碼目前沒有 `data-testid`。
- 不要用 `test.skip` 讓測試通過：測試錯就修測試，應用程式錯就修應用程式。
