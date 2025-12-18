# E2E 測試改進指南

本文檔說明如何使用新的測試輔助工具編寫更穩定、可維護的 E2E 測試。

## 📋 目錄

- [改進概述](#改進概述)
- [環境配置](#環境配置)
- [等待輔助工具](#等待輔助工具)
- [選擇器輔助工具](#選擇器輔助工具)
- [最佳實踐](#最佳實踐)
- [遷移指南](#遷移指南)

## 🎯 改進概述

### 改進前的問題

1. **硬編碼等待**：使用 `page.waitForTimeout(1000)` 等不可靠的等待方式
2. **選擇器脆弱**：過度依賴中文文本內容，UI 變更容易導致測試失敗
3. **配置分散**：環境變數散落在各個文件中，難以管理

### 改進後的優勢

1. **精確等待**：使用基於事件的等待機制（API 響應、元素狀態等）
2. **穩定選擇器**：優先使用語義化選擇器（name、role、testId）
3. **統一配置**：所有環境配置集中在 `.env.test` 文件中

## 🔧 環境配置

### 配置文件

創建 `.env.test` 文件來管理測試環境：

```env
# 應用 URL
BASE_URL=http://localhost:3001

# Directus API URL
DIRECTUS_URL=http://localhost:8055

# 測試用戶憑證
TEST_ADMIN_EMAIL=eric@dacit.net
TEST_ADMIN_PASSWORD=admin123

# 超時設置（毫秒）
DEFAULT_TIMEOUT=5000
API_TIMEOUT=10000
NAVIGATION_TIMEOUT=30000
```

### 使用配置

```typescript
import { TestEnv } from './config/test-env'

// 使用配置
await page.goto('/employees', { timeout: TestEnv.timeouts.navigation })
const users = TestEnv.users
```

## ⏱️ 等待輔助工具

### 1. waitForApiResponse - 等待 API 響應

**用途**：替換 `page.waitForTimeout()` 來等待網絡請求完成

```typescript
import { waitForApiResponse } from './helpers/wait-helpers'

// ❌ 改進前
await submitButton.click()
await page.waitForTimeout(1000) // 不可靠的硬編碼等待

// ✅ 改進後
await submitButton.click()
await waitForApiResponse(page, '/items/employees', TestEnv.timeouts.api)
```

### 2. waitForTableData - 等待表格數據

**用途**：等待表格數據加載完成

```typescript
import { waitForTableData } from './helpers/wait-helpers'

// ❌ 改進前
await page.goto('/employees')
await page.waitForTimeout(1000)
const rows = page.locator('tbody tr')

// ✅ 改進後
await page.goto('/employees')
await waitForTableData(page, 'table', 1, TestEnv.timeouts.default)
```

### 3. waitForSuccessMessage - 等待成功訊息

**用途**：等待操作成功的提示訊息出現

```typescript
import { waitForSuccessMessage } from './helpers/wait-helpers'

// ❌ 改進前
await submitButton.click()
await page.waitForTimeout(1000)
await expect(page.locator('.toast')).toBeVisible()

// ✅ 改進後
await submitButton.click()
await waitForSuccessMessage(page, '成功', TestEnv.timeouts.default)
```

### 4. waitForSearchResults - 等待搜尋結果

**用途**：等待搜尋操作完成並更新結果

```typescript
import { waitForSearchResults } from './helpers/wait-helpers'

// ❌ 改進前
await searchInput.fill('eric')
await page.waitForTimeout(1000)

// ✅ 改進後
await waitForSearchResults(
  page,
  searchInput,
  'eric',
  'tbody tr',
  TestEnv.timeouts.api
)
```

### 5. waitForFilterResults - 等待過濾結果

**用途**：等待過濾操作完成並更新結果

```typescript
import { waitForFilterResults } from './helpers/wait-helpers'

// ❌ 改進前
await branchFilter.selectOption({ index: 1 })
await page.waitForTimeout(1000)

// ✅ 改進後
await waitForFilterResults(
  page,
  async () => {
    await branchFilter.selectOption({ index: 1 })
  },
  'tbody tr',
  TestEnv.timeouts.api
)
```

## 🎯 選擇器輔助工具

### 1. findButton - 查找按鈕

**用途**：使用多種策略查找按鈕，減少對文本的依賴

```typescript
import { findButton, BilingualSelectors } from './helpers/selector-helpers'

// ❌ 改進前 - 依賴中文文本
const addButton = page.locator('button').filter({ hasText: '新增員工' })

// ✅ 改進後 - 使用雙語選擇器
const addButton = findButton(page, { text: BilingualSelectors.add })

// 🌟 最佳方案 - 使用 testId（需要在前端添加 data-testid）
const addButton = findButton(page, { testId: 'add-employee-button' })
```

### 2. findInput - 查找輸入框

**用途**：優先使用語義化屬性查找輸入框

```typescript
import { findInput } from './helpers/selector-helpers'

// ❌ 改進前
const emailInput = page.locator('input[placeholder="請輸入電子郵件"]')

// ✅ 改進後 - 使用 name 屬性
const emailInput = findInput(page, { name: 'email' })

// 🌟 最佳方案 - 使用 label 關聯
const emailInput = findInput(page, { label: /電子郵件|Email/ })
```

### 3. findSelect - 查找下拉選單

**用途**：優先使用語義化屬性查找下拉選單

```typescript
import { findSelect } from './helpers/selector-helpers'

// ❌ 改進前
const branchSelect = page.locator('select').filter({ hasText: '分店' })

// ✅ 改進後
const branchSelect = findSelect(page, { name: 'branch_id' })
```

### 4. findTable - 查找表格

**用途**：查找表格並處理數據行

```typescript
import { findTable, findTableRow } from './helpers/selector-helpers'

// ❌ 改進前
const table = page.locator('table')
const row = table.locator('tbody tr').filter({ hasText: '測試員工' })

// ✅ 改進後
const table = findTable(page)
const row = findTableRow(table, '測試員工')
```

### 5. BilingualSelectors - 雙語選擇器

**用途**：提供中英文通用的文本匹配模式

```typescript
import { BilingualSelectors } from './helpers/selector-helpers'

// 常用雙語選擇器
BilingualSelectors.add        // /新增|Add|Create/i
BilingualSelectors.edit       // /編輯|Edit|Modify/i
BilingualSelectors.delete     // /刪除|Delete|Remove/i
BilingualSelectors.view       // /查看|詳情|View|Detail/i
BilingualSelectors.submit     // /提交|送出|儲存|Submit|Save/i
BilingualSelectors.success    // /成功|Success|完成|Complete/i
```

## 📝 最佳實踐

### 1. 選擇器優先級

按以下優先級選擇元素定位方式：

1. **data-testid**（最穩定）
   ```typescript
   const button = page.locator('[data-testid="add-button"]')
   ```

2. **name 屬性**
   ```typescript
   const input = page.locator('[name="email"]')
   ```

3. **role + name**
   ```typescript
   const button = page.getByRole('button', { name: 'Submit' })
   ```

4. **label 關聯**
   ```typescript
   const input = findInput(page, { label: /電子郵件/ })
   ```

5. **雙語文本**（最後選擇）
   ```typescript
   const button = findButton(page, { text: BilingualSelectors.add })
   ```

### 2. 避免硬編碼等待

```typescript
// ❌ 不好
await page.waitForTimeout(1000)

// ✅ 好
await waitForApiResponse(page, '/api/endpoint')
await page.waitForLoadState('networkidle')
await element.waitFor({ state: 'visible' })
```

### 3. 使用環境配置

```typescript
// ❌ 不好
await element.waitFor({ timeout: 5000 })

// ✅ 好
await element.waitFor({ timeout: TestEnv.timeouts.default })
```

### 4. 錯誤處理

```typescript
// ✅ 好 - 處理可選元素
const optionalButton = page.locator('button.optional')
if (await optionalButton.isVisible()) {
  await optionalButton.click()
}

// ✅ 好 - 使用 try-catch
try {
  await waitForApiResponse(page, '/api/endpoint', 5000)
} catch {
  // 如果沒有 API 調用，使用備用方案
  await page.waitForLoadState('networkidle')
}
```

## 🔄 遷移指南

### 步驟 1：更新 imports

```typescript
// 添加新的導入
import { TestEnv } from './config/test-env'
import { waitForTableData, waitForSuccessMessage } from './helpers/wait-helpers'
import { findButton, findInput, BilingualSelectors } from './helpers/selector-helpers'
```

### 步驟 2：替換硬編碼等待

找到所有 `page.waitForTimeout()` 調用，根據上下文替換為適當的等待方法。

### 步驟 3：改進選擇器

1. 識別脆弱的選擇器（依賴中文文本）
2. 使用輔助工具替換
3. 考慮在前端添加 `data-testid` 屬性

### 步驟 4：更新環境配置

將硬編碼的 URL、超時時間等替換為 `TestEnv` 配置。

### 步驟 5：測試驗證

運行測試確保所有改進都正常工作：

```bash
pnpm test:e2e
```

## 📚 示例對比

查看以下文件對比：

- **改進前**：`e2e/05-employee-management.spec.ts`
- **改進後**：`e2e/05-employee-management.improved.spec.ts`

## 🤝 貢獻指南

編寫新測試時，請遵循本文檔中的最佳實踐：

1. 使用環境配置而非硬編碼值
2. 使用等待輔助工具而非 `waitForTimeout`
3. 使用選擇器輔助工具而非直接文本匹配
4. 優先使用 `data-testid` 等穩定選擇器

## 🔗 相關文件

- **環境配置**：`e2e/config/test-env.ts`
- **等待輔助工具**：`e2e/helpers/wait-helpers.ts`
- **選擇器輔助工具**：`e2e/helpers/selector-helpers.ts`
- **環境變數文件**：`.env.test`

## 📞 問題反饋

如有問題或建議，請聯繫測試團隊或在項目中提交 Issue。
