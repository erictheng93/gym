# E2E 測試改進總結

## 📋 改進概述

本次改進針對 E2E 測試的三個主要問題：

1. ⚠️ **硬編碼等待**：使用 `page.waitForTimeout()` 導致測試不穩定
2. ⚠️ **選擇器依賴**：過度依賴中文文本內容，UI 變更易失敗
3. ⚠️ **環境變數**：缺少統一的測試環境配置管理

## ✅ 已完成的改進

### 1. 測試輔助工具 (Wait Helpers)

創建了 `e2e/helpers/wait-helpers.ts`，提供以下輔助函數：

| 函數 | 用途 | 替換 |
|------|------|------|
| `waitForApiResponse` | 等待 API 響應完成 | `waitForTimeout(1000)` |
| `waitForTableData` | 等待表格數據加載 | `waitForTimeout` + 手動檢查 |
| `waitForSuccessMessage` | 等待成功訊息出現 | `waitForTimeout` + `toBeVisible` |
| `waitForSearchResults` | 等待搜尋結果更新 | `waitForTimeout` |
| `waitForFilterResults` | 等待過濾結果更新 | `waitForTimeout` |
| `waitForElementStable` | 等待元素穩定（位置不再變化） | 手動檢查 |
| `waitForSelectOptions` | 等待下拉選單選項加載 | `waitForTimeout` |
| `waitForPagination` | 等待分頁數據加載 | `waitForTimeout` |
| `waitForDialog` | 等待對話框出現並穩定 | `waitForTimeout` |

**影響範圍**：
- `05-employee-management.spec.ts`：8 處 `waitForTimeout`
- `06-hr-attendance-leave.spec.ts`：4 處 `waitForTimeout`
- `07-cross-branch-operations.spec.ts`：6 處 `waitForTimeout`

### 2. 選擇器輔助工具 (Selector Helpers)

創建了 `e2e/helpers/selector-helpers.ts`，提供：

#### 核心輔助函數
- `findButton` - 智能查找按鈕（優先使用 testId、name、role）
- `findInput` - 智能查找輸入框（優先使用 name、label、type）
- `findSelect` - 智能查找下拉選單（優先使用 name、label）
- `findTable` / `findTableRow` / `findTableCell` - 表格相關查找
- `findDialog` - 查找對話框/彈窗
- `findPageTitle` - 查找頁面標題
- `findPagination` - 查找分頁控件
- `findSuccessMessage` / `findErrorMessage` - 查找訊息提示

#### 雙語選擇器 (BilingualSelectors)
提供中英文通用的文本匹配模式：
- `add`, `edit`, `delete`, `view` - 操作按鈕
- `submit`, `cancel`, `confirm`, `close` - 表單按鈕
- `success`, `error`, `pending` - 狀態訊息
- `clockIn`, `clockOut`, `approve`, `reject` - 業務操作

**優勢**：
- 減少對中文文本的依賴
- 提供統一的查找策略
- 支持中英文雙語環境
- 便於維護和重構

### 3. 環境配置管理

#### 配置文件
- `.env.test` - 測試環境變數配置文件
- `e2e/config/test-env.ts` - 環境配置管理模組

#### 配置項目
```typescript
TestEnv = {
  baseUrl: 'http://localhost:3001',
  directusUrl: 'http://localhost:8055',
  users: {
    admin: { email, password },
    manager: { email, password },
    coach: { email, password }
  },
  timeouts: {
    default: 5000,
    api: 10000,
    navigation: 30000
  },
  database: { host, port, name, user, password },
  isCI: boolean,
  retries: number
}
```

#### 更新的文件
- `playwright.config.ts` - 使用 TestEnv 配置
- `e2e/fixtures/auth.ts` - 使用 TestEnv.users 和超時配置
- `e2e/fixtures/api.ts` - 使用 TestEnv.directusUrl

## 📁 新增文件

```
frontend/
├── .env.test                                    # 測試環境配置
├── e2e/
│   ├── config/
│   │   └── test-env.ts                         # 環境配置管理
│   ├── helpers/
│   │   ├── wait-helpers.ts                     # 等待輔助工具
│   │   └── selector-helpers.ts                 # 選擇器輔助工具
│   ├── 05-employee-management.improved.spec.ts # 改進示例
│   ├── TESTING-IMPROVEMENTS.md                 # 完整改進指南
│   ├── MIGRATION-CHECKLIST.md                  # 遷移清單
│   └── IMPROVEMENTS-SUMMARY.md                 # 本文檔
└── package.json                                 # 新增 dotenv 依賴
```

## 📊 改進效果

### 測試穩定性
- ✅ 消除硬編碼等待，使用事件驅動等待
- ✅ 減少因時間不確定性導致的測試失敗
- ✅ 提高測試運行速度（避免不必要的等待）

### 維護性
- ✅ 選擇器更穩定，減少 UI 變更影響
- ✅ 統一配置管理，易於修改
- ✅ 代碼更清晰，易於理解

### 可擴展性
- ✅ 輔助工具可復用
- ✅ 支持中英文雙語
- ✅ 便於添加新的測試

## 🎯 使用示例

### 改進前
```typescript
// 硬編碼等待
await searchInput.fill('eric')
await page.waitForTimeout(1000)

// 依賴中文文本
const addButton = page.locator('button').filter({ hasText: '新增員工' })
```

### 改進後
```typescript
// 使用等待輔助工具
import { waitForSearchResults } from './helpers/wait-helpers'
await waitForSearchResults(page, searchInput, 'eric', 'tbody tr', TestEnv.timeouts.api)

// 使用選擇器輔助工具
import { findButton, BilingualSelectors } from './helpers/selector-helpers'
const addButton = findButton(page, { text: BilingualSelectors.add })
```

## 📝 下一步行動

### 立即行動
1. ✅ 安裝依賴：`pnpm add -D dotenv @types/node`（已完成）
2. ⏳ 配置 `.env.test` 文件
3. ⏳ 遷移現有測試文件

### 推薦順序
1. 先遷移 `05-employee-management.spec.ts`（有完整示例可參考）
2. 再遷移 `06-hr-attendance-leave.spec.ts`
3. 最後遷移 `07-cross-branch-operations.spec.ts`

### 長期改進
1. 在前端組件中添加 `data-testid` 屬性
2. 統一所有測試的選擇器策略
3. 建立測試最佳實踐文檔

## 📚 相關文檔

- **詳細指南**：[TESTING-IMPROVEMENTS.md](./TESTING-IMPROVEMENTS.md)
- **遷移清單**：[MIGRATION-CHECKLIST.md](./MIGRATION-CHECKLIST.md)
- **改進示例**：[05-employee-management.improved.spec.ts](./05-employee-management.improved.spec.ts)
- **等待工具**：[helpers/wait-helpers.ts](./helpers/wait-helpers.ts)
- **選擇器工具**：[helpers/selector-helpers.ts](./helpers/selector-helpers.ts)

## 💡 最佳實踐

### 選擇器優先級
1. `data-testid` （最穩定）
2. `name` 屬性
3. `role` + `name`
4. `label` 關聯
5. 雙語文本匹配（最後選擇）

### 等待策略
1. 優先使用 API 響應等待
2. 其次使用元素狀態等待
3. 避免使用固定時間等待

### 環境配置
1. 所有配置集中在 `.env.test`
2. 使用 `TestEnv` 統一訪問
3. 避免硬編碼值

## 🤝 貢獻

如需添加新的輔助工具或改進現有工具，請：

1. 參考現有代碼風格
2. 添加 JSDoc 註釋
3. 提供使用示例
4. 更新相關文檔

## 📞 問題反饋

如有問題或建議，請：
- 查看 [TESTING-IMPROVEMENTS.md](./TESTING-IMPROVEMENTS.md) 詳細指南
- 參考 [05-employee-management.improved.spec.ts](./05-employee-management.improved.spec.ts) 示例
- 聯繫測試團隊或提交 Issue
