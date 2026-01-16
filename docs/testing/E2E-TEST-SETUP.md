# E2E 测试启动指南

## 🚀 快速启动

按照以下步骤启动所有服务并运行 E2E 测试：

### 1️⃣ 启动 Docker Desktop

**Windows:**
1. 在开始菜单搜索 "Docker Desktop"
2. 点击启动 Docker Desktop
3. 等待 Docker Desktop 完全启动（右下角托盘图标显示为绿色）
4. 确认 Docker 正在运行：
   ```bash
   docker ps
   ```

### 2️⃣ 启动后端服务（Directus + PostgreSQL）

```bash
cd backend
docker-compose up -d
```

验证后端服务运行：
```bash
# 检查容器状态
docker-compose ps

# 应该看到两个容器运行中：
# - backend-database-1
# - backend-directus-1

# 访问 Directus Admin
# 浏览器打开：http://localhost:8055
```

### 3️⃣ 启动前端开发服务器

**在新的终端窗口中：**
```bash
cd frontend
pnpm run dev
```

前端服务应该在 **http://localhost:3001** 运行。

**注意**：测试配置使用端口 3001（在 `e2e/config/test-env.ts` 中配置）

### 4️⃣ 验证测试账号

确保以下测试用户在数据库中存在：

```typescript
// 主要测试账号（在 e2e/config/test-env.ts 中配置）
{
  email: 'eric@dacit.net',
  password: 'eric'
}
```

如果测试账号不存在，可以通过 Directus Admin 创建：
1. 访问 http://localhost:8055
2. 使用管理员账号登录
3. 创建测试用户

### 5️⃣ 运行 E2E 测试

**方式 1：运行所有测试（推荐）**
```bash
cd frontend
pnpm test:e2e
```

**方式 2：UI 模式（可视化调试）**
```bash
pnpm test:e2e:ui
```

**方式 3：有头模式（查看浏览器操作）**
```bash
pnpm test:e2e:headed
```

**方式 4：调试模式**
```bash
pnpm test:e2e:debug
```

**方式 5：运行特定测试文件**
```bash
npx playwright test e2e/01-auth-flow.spec.ts
npx playwright test e2e/02-member-contract-flow.spec.ts
npx playwright test e2e/03-contract-pause-resume.spec.ts
npx playwright test e2e/04-payment-flow.spec.ts
```

---

## 📋 测试覆盖

### Phase 3: E2E 关键流程

| 测试文件 | 测试数量 | 覆盖场景 |
|---------|---------|---------|
| `01-auth-flow.spec.ts` | 7 | 登录、错误处理、登出、加载状态、自动跳转 |
| `02-member-contract-flow.spec.ts` | 5 | 新增会员、选方案、建立合约、表单验证 |
| `03-contract-pause-resume.spec.ts` | 4 | 合约暂停、验证延期、恢复、异动记录 |
| `04-payment-flow.spec.ts` | 8 | 新增支付、验证统计、支付方式、数据过滤 |

**总计：24 个测试用例**

---

## 🔧 故障排除

### Docker Desktop 无法启动

**问题：** `The system cannot find the file specified.`

**解决方案：**
1. 确保 Docker Desktop 已安装
2. 手动启动 Docker Desktop 应用程序
3. 等待其完全启动（右下角托盘图标变绿）
4. 重试启动后端服务

### 后端服务无法访问

**问题：** 无法访问 http://localhost:8055

**检查步骤：**
```bash
cd backend
docker-compose ps
docker-compose logs directus
```

**常见原因：**
- 端口 8055 被占用
- PostgreSQL 未正常启动
- Directus 配置错误

**解决方案：**
```bash
# 重启服务
docker-compose down
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 前端服务端口冲突

**问题：** 端口 3001 已被占用

**解决方案：**
1. 修改 `frontend/e2e/config/test-env.ts` 中的 `baseUrl`
2. 或者终止占用 3001 端口的进程

### 测试账号登录失败

**问题：** 测试无法使用 `eric@dacit.net` 登录

**解决方案：**
1. 登录 Directus Admin：http://localhost:8055
2. 检查用户 `eric@dacit.net` 是否存在
3. 如果不存在，创建该用户
4. 确保密码为 `eric`
5. 确保用户有适当的权限

### 测试超时

**问题：** 测试经常超时

**解决方案：**
1. 检查网络连接
2. 确保后端和前端服务正常运行
3. 增加超时时间（在 `e2e/config/test-env.ts` 中调整 `timeouts`）

### Playwright 浏览器未安装

**问题：** 提示浏览器未安装

**解决方案：**
```bash
cd frontend
npx playwright install chromium
```

---

## 🛠️ 环境配置

### 自定义配置（可选）

可以创建 `frontend/.env.test` 文件来覆盖默认配置：

```env
# 应用 URL
BASE_URL=http://localhost:3001

# Directus API URL
DIRECTUS_URL=http://localhost:8055

# 测试用户
TEST_ADMIN_EMAIL=eric@dacit.net
TEST_ADMIN_PASSWORD=eric

# 超时设置（毫秒）
DEFAULT_TIMEOUT=5000
API_TIMEOUT=10000
NAVIGATION_TIMEOUT=30000
```

---

## 📊 查看测试报告

测试完成后，自动生成 HTML 报告：

```bash
npx playwright show-report
```

报告包含：
- 测试结果概览
- 失败测试的截图
- 测试执行跟踪
- 性能指标

---

## 🔍 调试测试

### 使用 Playwright UI 模式

```bash
pnpm test:e2e:ui
```

UI 模式提供：
- 交互式测试执行
- 实时查看测试步骤
- 断点调试
- 时间旅行（回放）

### 使用 Debug 模式

```bash
pnpm test:e2e:debug
```

Debug 模式会：
- 打开 Playwright Inspector
- 逐步执行测试
- 允许暂停和继续
- 显示元素选择器

### 查看测试失败截图

失败的测试会自动截图，保存在：
```
frontend/test-results/
```

---

## 📝 CI/CD 集成

在 CI 环境中运行测试：

```bash
# 设置环境变量
export CI=true

# 运行测试
pnpm test:e2e
```

CI 模式特性：
- 禁用 `--only` 标记的测试
- 失败测试自动重试 2 次
- 使用单个 worker 确保稳定性
- 生成 JUnit 格式报告

---

## 🔗 相关资源

- **E2E 测试详细文档**：`frontend/e2e/README.md`
- **Playwright 官方文档**：https://playwright.dev/
- **Directus API 文档**：https://docs.directus.io/
- **项目文档**：`CLAUDE.md`

---

## ✅ 成功标志

所有服务正常运行时，你应该能够：

1. ✅ 访问 Directus Admin：http://localhost:8055
2. ✅ 访问前端应用：http://localhost:3001
3. ✅ 使用测试账号登录前端
4. ✅ 运行所有 24 个 E2E 测试并通过

---

**需要帮助？** 查看项目 README 或联系开发团队。
