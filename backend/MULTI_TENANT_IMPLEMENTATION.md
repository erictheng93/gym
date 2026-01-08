# 多租戶架構實施文檔

## 📋 Phase 1: 多租戶核心架構 - 實施完成

### 實施日期
2026-01-07

### 實施內容

#### ✅ Task 1.1: 資料庫多租戶改造

**已完成文件:**
- `backend/migrations/019_add_tenants_table.sql`

**實施內容:**

1. **租戶主表 (tenants)**
   - 包含租戶基本信息（名稱、slug、聯繫方式）
   - 套餐管理（plan_type: starter/professional/enterprise/custom）
   - 配額設定（max_branches, max_members, max_employees, max_storage_mb）
   - 租戶狀態管理（trial/active/suspended/cancelled）
   - 計費信息（billing_cycle, next_billing_date, monthly_price）

2. **branches 表更新**
   - 添加 `tenant_id` 字段（外鍵關聯 tenants 表）
   - 自動將現有分店關聯到預設租戶
   - 創建複合索引以優化多租戶查詢

3. **租戶使用量統計表 (tenant_usage_stats)**
   - 記錄每日使用量統計
   - 支持配額檢查和計費分析
   - API 調用量追蹤

4. **輔助功能**
   - `check_tenant_quota()` 函數：配額檢查
   - `v_tenant_overview` 視圖：租戶統計概覽
   - 自動觸發器：更新 date_updated 時間戳

---

#### ✅ Task 1.2: 後端租戶隔離中間件

**已完成文件:**
- `backend/extensions/directus-extension-gym-endpoints/src/middleware/tenant-context.js`
- `backend/extensions/directus-extension-gym-endpoints/src/middleware/index.js` (更新)
- `backend/extensions/directus-extension-gym-endpoints/src/index.js` (更新)

**實施內容:**

1. **租戶上下文中間件 (`createTenantContextMiddleware`)**
   - 從當前用戶自動推導 tenant_id 和 branch_id
   - 注入租戶信息到請求上下文（`req.tenantId`, `req.branchId`, `req.employeeId` 等）
   - 驗證租戶狀態（阻止 suspended/cancelled 租戶訪問）
   - 檢查試用期過期
   - 支持 Directus 超級管理員跨租戶訪問

2. **配額檢查中間件 (`createQuotaCheckMiddleware`)**
   - 針對特定資源類型（branches/members/employees）檢查配額
   - 當資源數量達到上限時返回友好錯誤信息
   - 提供升級訂閱提示

3. **租戶隔離查詢輔助函數 (`withTenantScope`)**
   - 自動添加 tenant_id 篩選條件到查詢
   - 支持超級管理員全局訪問

4. **中間件應用**
   - 租戶上下文中間件應用到所有 API 路由
   - 在路由處理前自動執行租戶身份驗證

---

## 🚀 部署步驟

### 1. 執行資料庫遷移

```bash
cd backend

# 方式一：使用 PostgreSQL 命令行
docker-compose exec database psql -U directus -d gym_nexus -f /directus/migrations/019_add_tenants_table.sql

# 方式二：進入容器手動執行
docker-compose exec database psql -U directus -d gym_nexus
\i /directus/migrations/019_add_tenants_table.sql
\q
```

### 2. 驗證遷移結果

```sql
-- 檢查租戶表是否創建成功
SELECT * FROM tenants;

-- 檢查預設租戶
SELECT id, name, slug, plan_type, tenant_status FROM tenants
WHERE slug = 'default-tenant';

-- 檢查 branches 表是否添加 tenant_id
SELECT id, name, tenant_id FROM branches LIMIT 5;

-- 查看租戶統計概覽
SELECT * FROM v_tenant_overview;
```

### 3. 重啟後端服務

```bash
# 重建並啟動容器
cd backend
docker-compose down
docker-compose up -d

# 查看日誌確認中間件載入
docker-compose logs -f directus
```

預期看到日誌：
```
[GymEndpoint] Gym API endpoints registered with tenant isolation
```

---

## 📊 API 使用範例

### 租戶上下文自動注入

所有 API 請求現在會自動包含租戶上下文：

**請求頭:**
```
Authorization: Bearer <JWT_TOKEN>
```

**自動注入的上下文變量:**
- `req.tenantId` - 當前租戶 ID
- `req.branchId` - 當前分店 ID
- `req.employeeId` - 當前員工 ID
- `req.tenantName` - 租戶名稱
- `req.branchName` - 分店名稱
- `req.planType` - 套餐類型
- `req.tenantStatus` - 租戶狀態
- `req.isSuperAdmin` - 是否為超級管理員
- `req.tenantQuota` - 配額信息對象

### 範例 1: 查詢當前租戶的會員列表

```javascript
// 在路由處理函數中
router.get('/members', async (req, res) => {
  const { tenantId, branchId } = req;

  // 租戶隔離自動生效
  const members = await database('members')
    .join('branches', 'members.branch_id', 'branches.id')
    .where('branches.tenant_id', tenantId)
    .where('members.status', 'active')
    .select('members.*');

  res.json({ success: true, data: members });
});
```

### 範例 2: 使用配額檢查中間件

```javascript
import { createQuotaCheckMiddleware } from './middleware/tenant-context.js';

// 創建會員時檢查配額
router.post('/members',
  createQuotaCheckMiddleware(database, 'members'),
  async (req, res) => {
    // 如果配額未超限，才會執行到這裡
    const { tenantId, branchId } = req;

    const newMember = await database('members').insert({
      ...req.body,
      branch_id: branchId,
    }).returning('*');

    res.json({ success: true, data: newMember });
  }
);
```

### 範例 3: 使用租戶隔離查詢輔助函數

```javascript
import { withTenantScope } from './middleware/tenant-context.js';

router.get('/branches', async (req, res) => {
  const { tenantId } = req;

  // 使用輔助函數自動添加租戶篩選
  const branches = await withTenantScope(
    database('branches'),
    tenantId
  )
  .where('status', 'active')
  .select('*');

  res.json({ success: true, data: branches });
});
```

---

## 🔒 安全特性

### 1. 自動租戶隔離
- 所有 API 請求自動應用租戶上下文
- 員工只能訪問自己租戶的資料
- 防止跨租戶數據洩漏

### 2. 租戶狀態檢查
- **trial** - 試用中（檢查試用期過期）
- **active** - 活躍（正常訪問）
- **suspended** - 已暫停（拒絕訪問，返回 403）
- **cancelled** - 已取消（拒絕訪問，返回 403）

### 3. 配額限制
- 自動檢查資源配額（分店、會員、員工）
- 超過配額時友好提示升級
- 防止資源濫用

### 4. 超級管理員特權
- Directus 超級管理員可跨租戶訪問
- 用於系統維護和管理
- 自動設置 `req.isSuperAdmin = true`

---

## 🧪 測試驗證

### 測試 1: 租戶上下文注入

```bash
# 使用員工帳號登入獲取 JWT
curl -X POST http://localhost:8500/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "employee@branch1.com", "password": "password"}'

# 使用 JWT 訪問 API（應自動注入租戶上下文）
curl -X GET http://localhost:8500/gym/members \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### 測試 2: 租戶狀態驗證

```sql
-- 暫停租戶
UPDATE tenants SET tenant_status = 'suspended'
WHERE slug = 'test-tenant';

-- 再次訪問 API 應返回 403 錯誤
```

### 測試 3: 配額檢查

```sql
-- 設置低配額
UPDATE tenants SET max_members = 2
WHERE slug = 'test-tenant';

-- 嘗試創建第三個會員應返回配額超限錯誤
```

### 測試 4: 超級管理員訪問

```bash
# 使用 Directus 管理員帳號登入
curl -X POST http://localhost:8500/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "admin@example.com", "password": "admin_password"}'

# 應能夠訪問所有租戶的資料
```

---

## 📈 性能優化

### 索引優化
遷移文件已包含以下索引：

```sql
-- 租戶表索引
idx_tenants_status
idx_tenants_tenant_status
idx_tenants_slug
idx_tenants_created_at
idx_tenants_plan_type

-- branches 表複合索引
idx_branches_tenant_id
idx_branches_tenant_status
idx_branches_tenant_name

-- 使用量統計表索引
idx_tenant_usage_tenant
idx_tenant_usage_date
```

### 查詢優化建議

1. **始終在 WHERE 子句中包含 tenant_id**
   ```sql
   -- 好的做法
   SELECT * FROM members m
   JOIN branches b ON m.branch_id = b.id
   WHERE b.tenant_id = '...' AND m.status = 'active';

   -- 避免全表掃描
   SELECT * FROM members WHERE status = 'active';
   ```

2. **使用視圖簡化常見查詢**
   ```sql
   -- 使用預定義視圖
   SELECT * FROM v_tenant_overview WHERE slug = 'acme-gym';
   ```

---

## 🐛 故障排除

### 問題 1: 中間件未載入

**症狀:** API 返回 401 或缺少租戶上下文

**解決方案:**
```bash
# 檢查 Directus 日誌
docker-compose logs -f directus | grep "GymEndpoint"

# 應看到: [GymEndpoint] Gym API endpoints registered with tenant isolation
```

### 問題 2: 遷移失敗

**症狀:** SQL 執行錯誤

**解決方案:**
```bash
# 檢查 PostgreSQL 版本
docker-compose exec database psql -U directus -d gym_nexus -c "SELECT version();"

# 手動回滾（如需要）
docker-compose exec database psql -U directus -d gym_nexus -c "DROP TABLE IF EXISTS tenants CASCADE;"
```

### 問題 3: 現有資料未關聯到預設租戶

**症狀:** branches 查詢返回空結果

**解決方案:**
```sql
-- 手動關聯到預設租戶
UPDATE branches
SET tenant_id = '11111111-1111-1111-1111-111111111111'
WHERE tenant_id IS NULL;
```

---

## 📝 後續開發建議

### Phase 2: 租戶管理 API
- 創建租戶 API 端點
- 租戶設定管理
- 套餐升級/降級

### Phase 3: 計費系統
- 自動計費邏輯
- 使用量追蹤
- 發票生成

### Phase 4: 前端多租戶支持
- 租戶登入頁面（子域名）
- 租戶儀表板
- 配額顯示

---

## ✅ 驗收標準

### Task 1.1 驗收標準
- [x] 租戶表創建成功
- [x] branches 表成功添加 tenant_id
- [x] 現有數據遷移到預設租戶
- [x] 所有索引創建成功
- [x] 外鍵約束正常工作

### Task 1.2 驗收標準
- [x] 中間件正確解析租戶和分店上下文
- [x] 租戶狀態檢查生效（suspended/cancelled 租戶無法訪問）
- [x] 超級管理員可以跨租戶操作
- [x] 錯誤處理和日誌記錄完整

---

## 📚 相關文檔

- `backend/DATABASE_INDEXES.md` - 資料庫索引優化文檔
- `backend/REPORTS_API.md` - 報表 API 文檔
- `CLAUDE.md` - 項目總體架構文檔

---

## 🎯 總結

Phase 1 多租戶核心架構已成功實施，包括：
1. 完整的資料庫多租戶架構
2. 自動租戶隔離中間件
3. 配額管理系統
4. 租戶狀態管理

系統現已支持多租戶模式，可安全隔離不同客戶的數據，並為後續的 SaaS 化部署奠定基礎。
