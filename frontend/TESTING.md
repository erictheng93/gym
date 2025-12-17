# 測試指南

本專案使用 Vitest 作為測試框架。

## 快速開始

### 運行測試

```bash
# 在 frontend 目錄下運行
cd frontend

# 運行所有測試
pnpm test

# 監聽模式（推薦開發時使用）
pnpm test -- --watch

# UI 模式（需要額外安裝 @vitest/ui）
pnpm test:ui

# 生成測試覆蓋率報告
pnpm test:coverage
```

## 測試結構

測試文件應該與被測試的文件放在同一目錄，並使用 `.test.ts` 或 `.spec.ts` 作為後綴。

```
app/
  utils/
    validation.ts          # 被測試的文件
    validation.test.ts     # 測試文件
  components/
    Button.vue
    Button.test.ts
```

## 編寫測試

### 基本範例

```typescript
import { describe, it, expect } from 'vitest'
import { myFunction } from './myFunction'

describe('myFunction', () => {
  it('should return correct result', () => {
    const result = myFunction(1, 2)
    expect(result).toBe(3)
  })
})
```

### Vue 組件測試

```typescript
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MyComponent from './MyComponent.vue'

describe('MyComponent', () => {
  it('should render correctly', () => {
    const wrapper = mount(MyComponent, {
      props: {
        title: 'Test Title'
      }
    })
    expect(wrapper.text()).toContain('Test Title')
  })
})
```

## Git Hooks

### Pre-commit Hook

在提交代碼之前，會自動運行與變更文件相關的測試。這由 `husky` 和 `lint-staged` 配置實現。

配置位於 `frontend/package.json` 的 `lint-staged` 欄位：

```json
{
  "lint-staged": {
    "**/*.{ts,tsx,vue}": [
      "vitest related --run"
    ]
  }
}
```

如果測試失敗，提交會被阻止。

### 跳過 Hook（不推薦）

如果需要跳過 pre-commit hook，可以使用：

```bash
git commit --no-verify -m "your message"
```

## CI/CD

### GitHub Actions

專案配置了 GitHub Actions 來在 PR 和 push 到 main 分支時自動運行測試。

配置文件位於 `.github/workflows/test.yml`。

CI 會執行：
1. 安裝依賴
2. 運行所有測試
3. 上傳測試覆蓋率報告到 Codecov

## 測試覆蓋率

生成覆蓋率報告：

```bash
pnpm test:coverage
```

報告會生成在 `frontend/coverage/` 目錄。

## 最佳實踐

1. **測試命名**：使用描述性的測試名稱，說明測試的行為
   ```typescript
   it('should return error when input is invalid')
   ```

2. **測試隔離**：每個測試應該獨立，不依賴其他測試的結果

3. **AAA 模式**：Arrange（準備）、Act（執行）、Assert（斷言）
   ```typescript
   it('should calculate total', () => {
     // Arrange
     const items = [1, 2, 3]

     // Act
     const total = calculateTotal(items)

     // Assert
     expect(total).toBe(6)
   })
   ```

4. **避免測試實現細節**：測試公共 API 和行為，而不是內部實現

5. **使用 describe 分組**：將相關的測試組織在一起

## 常見問題

### 測試運行緩慢

考慮使用 `--run` 參數來避免 watch 模式：

```bash
pnpm test -- --run
```

### 測試找不到模組

確保 `vitest.config.ts` 中的 `alias` 配置正確：

```typescript
resolve: {
  alias: {
    '~': fileURLToPath(new URL('./app', import.meta.url)),
    '@': fileURLToPath(new URL('./app', import.meta.url)),
  }
}
```

## 參考資源

- [Vitest 官方文檔](https://vitest.dev/)
- [Vue Test Utils 官方文檔](https://test-utils.vuejs.org/)
- [@nuxt/test-utils 文檔](https://nuxt.com/docs/getting-started/testing)
