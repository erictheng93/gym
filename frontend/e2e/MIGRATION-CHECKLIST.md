# E2E 測試遷移清單

使用此清單將現有測試遷移到新的改進模式。

## ✅ 前置準備

- [ ] 安裝 dotenv 依賴：`pnpm add -D dotenv`
- [ ] 創建 `.env.test` 文件並填寫測試配置
- [ ] 閱讀 `TESTING-IMPROVEMENTS.md` 了解改進內容

## 📝 遷移步驟

### 1. 更新測試文件導入

在每個測試文件頂部添加：

```typescript
import { TestEnv } from './config/test-env'
import {
  waitForTableData,
  waitForSuccessMessage,
  waitForSearchResults,
  waitForFilterResults,
} from './helpers/wait-helpers'
import {
  findButton,
  findInput,
  findSelect,
  findTable,
  BilingualSelectors
} from './helpers/selector-helpers'
```

### 2. 替換硬編碼等待

查找並替換每個文件中的 `page.waitForTimeout()`：

#### 搜尋結果等待
```typescript
// ❌ 舊代碼
await searchInput.fill('keyword')
await page.waitForTimeout(1000)

// ✅ 新代碼
await waitForSearchResults(page, searchInput, 'keyword', 'tbody tr', TestEnv.timeouts.api)
```

#### 表格數據等待
```typescript
// ❌ 舊代碼
await page.goto('/employees')
await page.waitForTimeout(1000)

// ✅ 新代碼
await page.goto('/employees')
await waitForTableData(page, 'table', 0, TestEnv.timeouts.default)
```

#### 成功訊息等待
```typescript
// ❌ 舊代碼
await submitButton.click()
await page.waitForTimeout(1000)
const successMessage = page.locator('.toast')
await expect(successMessage).toBeVisible()

// ✅ 新代碼
await submitButton.click()
await waitForSuccessMessage(page, BilingualSelectors.success, TestEnv.timeouts.default)
```

#### 過濾結果等待
```typescript
// ❌ 舊代碼
await branchFilter.selectOption({ index: 1 })
await page.waitForTimeout(1000)

// ✅ 新代碼
await waitForFilterResults(
  page,
  async () => await branchFilter.selectOption({ index: 1 }),
  'tbody tr',
  TestEnv.timeouts.api
)
```

### 3. 改進選擇器

#### 按鈕選擇器
```typescript
// ❌ 舊代碼
const addButton = page.locator('button').filter({ hasText: '新增員工' })

// ✅ 新代碼
const addButton = findButton(page, { text: BilingualSelectors.add })
```

#### 輸入框選擇器
```typescript
// ❌ 舊代碼
const emailInput = page.locator('input[placeholder*="電子郵件"]')

// ✅ 新代碼
const emailInput = findInput(page, { name: 'email' })
```

#### 下拉選單選擇器
```typescript
// ❌ 舊代碼
const branchSelect = page.locator('select').filter({ hasText: '分店' })

// ✅ 新代碼
const branchSelect = findSelect(page, { name: 'branch_id' })
```

### 4. 更新環境配置使用

```typescript
// ❌ 舊代碼
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8056'
await element.waitFor({ timeout: 5000 })

// ✅ 新代碼
import { TestEnv } from './config/test-env'
const API_BASE_URL = TestEnv.apiBaseUrl
await element.waitFor({ timeout: TestEnv.timeouts.default })
```

## 📂 需要遷移的文件

- [ ] `05-employee-management.spec.ts`
  - [ ] 替換所有 waitForTimeout (8 處)
  - [ ] 改進按鈕選擇器
  - [ ] 改進輸入框選擇器
  - [ ] 使用 TestEnv 配置

- [ ] `06-hr-attendance-leave.spec.ts`
  - [ ] 替換所有 waitForTimeout (4 處)
  - [ ] 改進選擇器
  - [ ] 使用 TestEnv 配置

- [ ] `07-cross-branch-operations.spec.ts`
  - [ ] 替換所有 waitForTimeout (6 處)
  - [ ] 改進選擇器
  - [ ] 使用 TestEnv 配置

- [ ] 其他已有測試文件
  - [ ] 檢查並遷移

## 🧪 測試驗證

完成遷移後，運行以下命令驗證：

```bash
# 運行所有測試
pnpm test:e2e

# 運行特定文件
pnpm exec playwright test e2e/05-employee-management.spec.ts

# UI 模式運行（推薦）
pnpm test:e2e:ui
```

## 🎯 遷移優先級

### 高優先級（必須遷移）
1. ✅ 所有 `waitForTimeout` 調用
2. ✅ 環境配置（URL、超時時間）
3. ✅ 依賴中文文本的按鈕選擇器

### 中優先級（建議遷移）
1. 輸入框和下拉選單選擇器
2. 表格相關選擇器
3. 訊息提示選擇器

### 低優先級（可選）
1. 其他通用選擇器改進
2. 添加 data-testid 到前端組件

## 📊 遷移進度追蹤

| 文件 | waitForTimeout | 選擇器 | 環境配置 | 狀態 |
|------|----------------|--------|----------|------|
| 05-employee-management.spec.ts | 0/8 | 0/10 | 0/3 | ⏳ 待處理 |
| 06-hr-attendance-leave.spec.ts | 0/4 | 0/8 | 0/2 | ⏳ 待處理 |
| 07-cross-branch-operations.spec.ts | 0/6 | 0/10 | 0/2 | ⏳ 待處理 |

## 💡 提示

1. **批量替換**：使用 IDE 的查找替換功能批量處理
2. **逐步遷移**：一次遷移一個文件，確保測試通過後再繼續
3. **參考示例**：查看 `05-employee-management.improved.spec.ts` 作為參考
4. **保留備份**：遷移前建議先提交當前代碼或創建分支

## 🔗 相關資源

- [TESTING-IMPROVEMENTS.md](./TESTING-IMPROVEMENTS.md) - 完整改進指南
- [05-employee-management.improved.spec.ts](./05-employee-management.improved.spec.ts) - 改進示例
- [helpers/wait-helpers.ts](./helpers/wait-helpers.ts) - 等待輔助工具
- [helpers/selector-helpers.ts](./helpers/selector-helpers.ts) - 選擇器輔助工具
