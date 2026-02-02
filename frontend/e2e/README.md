# E2E 测试指南

本目录包含 Gym Nexus 系统的端到端（E2E）测试，使用 Playwright 框架实现。

## 测试覆盖

### Phase 3: E2E 关键流程

| 测试文件 | 测试场景 | 覆盖内容 |
|---------|---------|---------|
| `01-auth-flow.spec.ts` | 登录流程 E2E | 正常登录、错误处理（空字段、错误凭证、无效邮箱）、登出、加载状态、自动跳转 |
| `02-member-contract-flow.spec.ts` | 会员签约流程 E2E | 新增会员 → 选方案 → 建立合约、表单验证、金额自动填充、结束日期计算 |
| `03-contract-pause-resume.spec.ts` | 合约暂停/恢复 E2E | 暂停 → 验证延期 → 恢复、异动记录、天数计算、表单验证 |
| `04-payment-flow.spec.ts` | 支付记录流程 E2E | 新增支付 → 验证统计、支付方式选择、数据过滤、统计更新 |

## 前置要求

### 1. 安装依赖

```bash
cd frontend
pnpm install
```

### 2. 安装 Playwright 浏览器

```bash
pnpm exec playwright install chromium
```

### 3. 启动后端服务

E2E 测试需要后端 API 服务运行：

```bash
cd backend
docker-compose up -d
```

确保以下服务正常运行：
- Backend API: http://localhost:8056
- PostgreSQL: localhost:15432

### 4. 配置测试用户

测试使用以下测试账号（已在 `e2e/fixtures/auth.ts` 中配置）：

```typescript
{
  admin: {
    email: 'eric@dacit.net',
    password: 'eric'
  }
}
```

确保这些用户在数据库中存在并有正确的权限。

## 运行测试

### 运行所有 E2E 测试

```bash
pnpm test:e2e
```

### 以 UI 模式运行（推荐用于调试）

```bash
pnpm test:e2e:ui
```

### 以有头模式运行（查看浏览器操作）

```bash
pnpm test:e2e:headed
```

### 调试模式

```bash
pnpm test:e2e:debug
```

### 运行特定测试文件

```bash
pnpm exec playwright test e2e/01-auth-flow.spec.ts
```

### 运行特定测试用例

```bash
pnpm exec playwright test -g "应该成功登录"
```

## 测试结构

```
e2e/
├── fixtures/
│   ├── auth.ts          # 认证相关的辅助函数和测试用户
│   └── api.ts           # API 请求辅助函数
├── 01-auth-flow.spec.ts           # 登录流程测试
├── 02-member-contract-flow.spec.ts # 会员签约流程测试
├── 03-contract-pause-resume.spec.ts # 合约暂停恢复测试
├── 04-payment-flow.spec.ts         # 支付记录流程测试
└── README.md                        # 本文档
```

## 配置

测试配置位于 `playwright.config.ts`：

```typescript
{
  baseURL: 'http://localhost:3000',  // 前端应用地址
  webServer: {
    command: 'pnpm run dev',         // 自动启动开发服务器
    url: 'http://localhost:3000',
    reuseExistingServer: true        // 复用已运行的服务器
  }
}
```

## 最佳实践

### 1. 使用 test.step() 组织复杂流程

```typescript
await test.step('新增会员', async () => {
  // 步骤内容
})
```

### 2. 使用合理的等待策略

```typescript
// 等待 URL 变化
await page.waitForURL('/members', { timeout: 5000 })

// 等待元素可见
await expect(element).toBeVisible({ timeout: 3000 })
```

### 3. 使用灵活的选择器

```typescript
// 使用 .or() 处理多种可能的 UI 文本
const button = page.locator('text=新增會員').or(
  page.locator('text=新增会员')
)
```

### 4. 清理测试数据

某些测试可能需要清理创建的测试数据，可以使用 `test.afterEach()` 或 API 辅助函数。

## 故障排除

### 测试超时

如果测试经常超时，可以增加超时时间：

```typescript
test.setTimeout(60000) // 60秒
```

### 元素找不到

1. 使用 UI 模式查看测试执行过程
2. 检查选择器是否正确
3. 确认元素是否在页面加载完成后才出现

### 后端连接失败

确保：
1. Docker 服务正在运行
2. Backend API 可访问（http://localhost:8056）
3. 数据库已正确初始化

### 测试数据不一致

如果测试依赖特定的数据状态：
1. 使用 API 创建所需的测试数据
2. 在 `beforeEach` 中重置状态
3. 考虑使用数据库快照

## CI/CD 集成

在 CI 环境中运行测试：

```bash
# 设置环境变量
export CI=true

# 运行测试
pnpm test:e2e
```

CI 环境配置会：
- 禁用 `--only` 标记的测试
- 自动重试失败的测试 2 次
- 使用单个 worker 确保稳定性

## 查看测试报告

测试完成后，可以查看 HTML 报告：

```bash
pnpm exec playwright show-report
```

## 截图和视频

失败的测试会自动截图，配置在 `playwright.config.ts`：

```typescript
{
  screenshot: 'only-on-failure',
  trace: 'on-first-retry'
}
```

## 贡献指南

添加新的 E2E 测试时：

1. 遵循现有的文件命名模式：`{序号}-{功能}-flow.spec.ts`
2. 使用描述性的测试名称
3. 添加适当的注释说明测试目的
4. 更新本 README 文档
5. 确保测试可以独立运行（不依赖其他测试的副作用）

## 相关资源

- [Playwright 文档](https://playwright.dev/)
- [Nuxt 测试指南](https://nuxt.com/docs/getting-started/testing)
