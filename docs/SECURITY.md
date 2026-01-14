# Gym Nexus 安全架構文檔

**更新日期：** 2025-01-14
**版本：** 1.0.0

## 📊 安全概覽

本文檔描述 Gym Nexus 系統的安全架構、已實施的安全措施和最佳實踐指南。

## 🔒 前端安全措施

### 1. Content Security Policy (CSP)

**admin-web 和 member-app** 都已配置完整的 CSP 標頭：

```javascript
'Content-Security-Policy': [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.sentry.io",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.directus.io https://*.sentry.io",
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'"
].join('; ')
```

### 2. 安全標頭

兩個前端應用都配置了以下安全標頭：

| 標頭 | 值 | 用途 |
|------|-----|------|
| X-Frame-Options | DENY | 防止 Clickjacking |
| X-Content-Type-Options | nosniff | 防止 MIME 類型嗅探 |
| X-XSS-Protection | 1; mode=block | XSS 過濾（舊版瀏覽器） |
| Referrer-Policy | strict-origin-when-cross-origin | 控制 Referer 標頭 |
| Permissions-Policy | camera=(), microphone=(), geolocation=() | 禁用不必要的功能 |

### 3. Sentry 錯誤追蹤

兩個應用統一使用 `@sentry/vue ^10.32.1` 進行錯誤追蹤。

## 🛡️ 後端安全措施

### 1. 認證系統

- **JWT Bearer Token 認證**：所有 API 請求使用 JWT token
- **Token 驗證**：`middleware/auth.js` 驗證所有請求的 token
- **會員專用認證**：`middleware/member-auth.js` 處理會員端認證
- **管理員認證**：`middleware/admin-auth.js` 處理管理員認證

### 2. 安全標頭中間件

`middleware/security-headers.js` 為所有 API 回應添加：

```javascript
res.setHeader('X-Content-Type-Options', 'nosniff');
res.setHeader('X-Frame-Options', 'DENY');
res.setHeader('X-XSS-Protection', '1; mode=block');
res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
```

### 3. CSRF 保護

`middleware/csrf.js` 提供 CSRF 保護（默認禁用）：

- 由於使用 JWT Bearer Token（非 Cookie），傳統 CSRF 攻擊已被緩解
- 可選啟用額外的 CSRF token 驗證層
- CSRF token 端點：`GET /gym/csrf/token`

### 4. 速率限制

`middleware/rate-limiter.js` 實現 API 速率限制：

- 使用 Redis 作為後端存儲
- 防止暴力破解和 DDoS 攻擊
- 可配置的限制閾值

### 5. 多租戶隔離

`middleware/tenant-context.js` 實現租戶隔離：

- 每個請求注入租戶上下文
- 所有查詢自動過濾租戶 ID
- 防止跨租戶數據訪問

### 6. 權限系統

`hooks/permissions.js` 實現細粒度權限控制：

- 基於角色的訪問控制 (RBAC)
- 權限配置存儲在 `job_titles.permissions_config`
- 支援員工級別的自定義權限覆蓋

### 7. 審計日誌

`routes/audit.js` 提供完整的審計日誌功能：

- 記錄所有敏感操作
- 支援按日期、操作類型、資源類型過濾
- 支援 CSV 導出
- 自動清理舊日誌

## 📝 審計日誌 API

### 端點

| 方法 | 路徑 | 描述 |
|------|------|------|
| GET | /gym/audit/logs | 獲取審計日誌列表 |
| GET | /gym/audit/logs/:id | 獲取單個日誌詳情 |
| POST | /gym/audit/logs | 創建審計日誌 |
| GET | /gym/audit/stats | 獲取統計數據 |
| GET | /gym/audit/export | 導出日誌 (CSV) |
| DELETE | /gym/audit/logs/cleanup | 清理舊日誌（僅超級管理員） |

### 記錄的事件

- 用戶登入/登出
- 資料創建/修改/刪除
- 權限變更
- 敏感操作（如合約簽署、退款）

## 🔐 安全最佳實踐

### 開發階段

1. **不要硬編碼敏感信息**
   - 使用環境變量存儲 API keys、密碼
   - 使用 `.env` 文件（已加入 `.gitignore`）

2. **輸入驗證**
   - 使用 Zod schema 驗證所有用戶輸入
   - 前端和後端都要驗證

3. **錯誤處理**
   - 不要在生產環境暴露詳細錯誤信息
   - 使用 Sentry 追蹤錯誤

### 部署階段

1. **HTTPS**
   - 所有生產環境必須使用 HTTPS
   - 使用 Cloudflare 提供的 SSL/TLS

2. **環境變量**
   - 生產環境使用強密碼
   - 定期輪換 JWT 密鑰

3. **數據庫**
   - 使用強密碼
   - 限制網絡訪問
   - 定期備份

## 🔧 配置檢查清單

### 前端

- [x] CSP headers 配置
- [x] X-Frame-Options: DENY
- [x] X-Content-Type-Options: nosniff
- [x] Sentry 錯誤追蹤配置
- [x] TypeScript 嚴格模式

### 後端

- [x] JWT 認證
- [x] 安全 headers 中間件
- [x] 速率限制
- [x] 多租戶隔離
- [x] 權限系統
- [x] 審計日誌
- [x] CSRF 保護（可選）

### 數據庫

- [x] 100+ 優化索引
- [x] 行級安全 (RLS) 概念通過租戶隔離實現
- [x] 敏感數據加密

## 📞 安全事件響應

如發現安全漏洞，請：

1. 不要公開披露
2. 聯繫系統管理員
3. 提供詳細的重現步驟

---

**維護者：** Gym Nexus 開發團隊
