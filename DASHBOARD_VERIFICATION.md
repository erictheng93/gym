# Dashboard 手動驗證指南

## 🎯 目標
驗證 Admin Web Dashboard 能正確顯示統計數據並與 Directus API 整合

---

## 📝 前置準備

### 1. 確認服務正在運行
```bash
# 檢查 Docker 容器狀態
docker ps | grep -E "directus|postgres"

# 預期輸出：
# backend-directus-1  (running)
# backend-database-1  (running)
```

### 2. 啟動前端開發伺服器
```bash
# 在新的終端視窗執行
cd D:\Code\Gym\frontend\apps\admin-web
npm run dev

# 等待看到：
# ✓ Vite server built in XXXms
# ➜ Local:   http://0.0.0.0:3001/
```

---

## 🔍 驗證步驟

### **Step 1: 訪問登入頁面**

1. 開啟瀏覽器（建議 Chrome）
2. 訪問：http://localhost:3001
3. **預期結果**：
   - ✅ 頁面自動重定向到 `/login`
   - ✅ 看到「Gym Nexus」標題
   - ✅ 有 Email 和 Password 輸入框
   - ✅ 有「登入」按鈕

**如果失敗**：
- 檢查 Console (F12) 是否有紅色錯誤
- 檢查 Network 標籤是否有 404/500 錯誤
- 確認 `.env` 文件中 `DIRECTUS_URL=http://localhost:8055`

---

### **Step 2: 執行登入**

1. 輸入帳號密碼：
   ```
   Email:    eric@dacit.net
   Password: eric
   ```

2. 點擊「登入」按鈕

3. **預期結果**：
   - ✅ 頁面重定向到 Dashboard (`/`)
   - ✅ 不再停留在 `/login` 頁面
   - ✅ Console 無認證錯誤

**如果失敗**：
- 檢查 Network 標籤中 `/auth/login` 請求
- 查看回應是否包含 `access_token`
- 確認 Directus 服務正常：`curl http://localhost:8055/server/ping`

---

### **Step 3: 驗證 Dashboard 統計卡片**

開啟瀏覽器 DevTools (F12) → Console 標籤，同時檢查頁面顯示。

#### **3.1 檢查會員統計**
**位置**：Dashboard 第一張卡片

**預期顯示**：
```
總會員數：17
活躍會員：17
本週新增：+0
活躍率：100%
```

**驗證方法**：
```javascript
// 在 Console 執行
fetch('http://localhost:8055/items/members?aggregate[count]=*', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('directus_token')
  }
}).then(r => r.json()).then(d => console.log('Total Members:', d.data[0].count))
```

#### **3.2 檢查合約統計**
**位置**：Dashboard 第三張卡片

**預期顯示**：
```
活躍合約：17
待簽署：0
```

**驗證方法**：
```javascript
// 在 Console 執行
fetch('http://localhost:8055/items/contracts?filter[contract_status][_eq]=ACTIVE&aggregate[count]=*', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('directus_token')
  }
}).then(r => r.json()).then(d => console.log('Active Contracts:', d.data[0].count))
```

#### **3.3 檢查營收統計**
**位置**：Dashboard 第四張卡片

**預期顯示**：
```
本月營收：$0
今日營收：$0
```

**說明**：因為種子資料的付款日期是過去的，所以本月營收為 0 是正常的。

---

### **Step 4: 驗證最近會員列表**

**位置**：Dashboard 左下方「最近加入會員」區塊

**預期顯示**：
- ✅ 顯示最多 5 名會員
- ✅ 每位會員顯示：
  - 頭像（姓名首字）
  - 完整姓名（如：趙雅芳）
  - 會員編號（如：M2024-XY01）
  - 狀態徽章（ACTIVE - 綠色）
  - 加入日期

**驗證方法**：
```javascript
// 在 Console 執行
fetch('http://localhost:8055/items/members?limit=5&sort=-date_created&fields=id,full_name,member_code,member_status,date_created', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('directus_token')
  }
}).then(r => r.json()).then(d => console.table(d.data))
```

---

### **Step 5: 驗證最近合約列表**

**位置**：Dashboard 右下方「最近簽訂合約」區塊

**預期顯示**：
- ✅ 顯示最多 5 份合約
- ✅ 每份合約顯示：
  - 合約編號（如：CT2024-XY-001）
  - 會員姓名
  - 狀態徽章（ACTIVE - 綠色）
  - 金額（如：$9,800）

**驗證方法**：
```javascript
// 在 Console 執行
fetch('http://localhost:8055/items/contracts?limit=5&sort=-date_created&fields=id,contract_no,contract_status,total_amount,date_created,member_id.full_name', {
  headers: {
    'Authorization': 'Bearer ' + localStorage.getItem('directus_token')
  }
}).then(r => r.json()).then(d => console.table(d.data))
```

---

### **Step 6: 驗證快速操作按鈕**

**位置**：Dashboard 最下方「快速操作」區塊

**預期顯示**：
- ✅ 新增會員
- ✅ 新增合約
- ✅ 會員入場
- ✅ 報表

**驗證方法**：
1. 點擊「新增會員」→ 應跳轉到 `/members/new`
2. 使用瀏覽器「返回」鍵回到 Dashboard
3. 點擊「新增合約」→ 應跳轉到 `/contracts/new`
4. 點擊「會員入場」→ 應跳轉到 `/checkin`
5. 點擊「報表」→ 應跳轉到 `/reports`

---

## 🐛 常見問題排查

### **問題 1: 頁面一直載入中**
**原因**：Directus API 連線失敗

**解決方法**：
```bash
# 檢查 Directus 服務
curl http://localhost:8055/server/ping

# 檢查 .env 文件
cat frontend/apps/admin-web/.env

# 應該看到：
# DIRECTUS_URL=http://localhost:8055
```

---

### **問題 2: 統計數字顯示為 0**
**原因**：API 請求失敗或權限問題

**解決方法**：
1. 開啟 DevTools → Network 標籤
2. 重新整理頁面
3. 查找 `/items/members` 和 `/items/contracts` 請求
4. 檢查回應狀態碼（應為 200）
5. 查看回應內容是否包含資料

---

### **問題 3: 會員列表顯示亂碼（如：\u981e\udc99\udce9）**
**原因**：資料庫字元編碼問題

**解決方法**：
這是正常的 Unicode 編碼，只是顯示方式問題。資料本身是正確的中文。

**驗證**：
```javascript
// 在 Console 執行
console.log('\u981e\udc99\udce9\udc9b\udc85\udce8\udc8a\udcb3')
// 應顯示：趙雅芳
```

---

### **問題 4: Console 顯示 CORS 錯誤**
**原因**：Directus CORS 設定問題

**解決方法**：
檢查 `backend/docker-compose.yml` 中的 CORS 設定：
```yaml
CORS_ENABLED: "true"
CORS_ORIGIN: "http://localhost:3000,http://localhost:3001,..."
```

確保包含 `http://localhost:3001`

---

## ✅ 驗收檢查清單

完成所有步驟後，確認以下項目：

- [ ] ✅ 能成功登入系統
- [ ] ✅ Dashboard 顯示「總會員數：17」
- [ ] ✅ Dashboard 顯示「活躍合約：17」
- [ ] ✅ 最近會員列表顯示 5 名會員
- [ ] ✅ 最近合約列表顯示 5 份合約
- [ ] ✅ 快速操作按鈕能正常跳轉
- [ ] ✅ Console 無紅色錯誤訊息
- [ ] ✅ Network 標籤中 API 請求狀態碼為 200

---

## 📸 成功案例截圖參考

**Dashboard 應該看起來像這樣：**

```
┌─────────────────────────────────────────────────────────────┐
│  早安，Eric                                   2025年12月26日 │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  [👥]  總會員      [✓]  活躍會員   [📄]  活躍合約  [💰]  月營收│
│   17              17              17            $0          │
│  +0 本週新增      100% 活躍率     0 待簽署      今日 $0     │
│                                                               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  最近加入會員                │  最近簽訂合約                  │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━│━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│  [趙] 趙雅芳 M2024-XY01      │  CT2024-XY-001               │
│      [ACTIVE]  12/16         │  趙雅芳  [ACTIVE]  $9,800    │
│                               │                               │
│  [孫] 孫國強 M2024-XY02      │  CT2024-XY-002               │
│      [ACTIVE]  12/16         │  孫國強  [ACTIVE]  $6,000    │
│                               │                               │
├─────────────────────────────────────────────────────────────┤
│  快速操作                                                     │
│  [+會員] [+合約] [入場] [報表]                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 下一步

完成驗證後，繼續執行：
1. ✅ 建立端到端測試資料（執行 `seed-e2e-test.sql`）
2. ✅ 實作 Directus Hooks（自動化業務邏輯）
3. ✅ 測試完整業務流程

---

**驗證完成後請回報**：
- 哪些項目成功 ✅
- 哪些項目失敗 ❌
- Console 錯誤訊息（如有）
