# Google Workspace 整合快速入門

## 概述

Google Workspace 整合功能已完成實作，您現在可以：

1. **匯出報表到 Google Sheets** - 一鍵匯出任何報表到 Google Sheets
2. **使用 Looker Studio 建立進階儀表板** - 連接 BigQuery 建立專業報表

## 已實作的檔案

### 前端檔案

1. **環境變數範本**
   - `frontend/apps/admin-web/.env.example`
   - 包含所有必要的 Google API 設定

2. **Google Sheets API 工具**
   - `frontend/apps/admin-web/app/utils/googleSheets.ts`
   - 提供完整的 Google Sheets 匯出功能
   - 包含 OAuth 2.0 驗證流程

3. **UI 元件**
   - `frontend/apps/admin-web/app/components/GoogleSheetsExport.vue`
   - 可重複使用的匯出按鈕元件

4. **OAuth 回調頁面**
   - `frontend/apps/admin-web/app/pages/settings/google-integration/callback.vue`
   - 處理 Google 驗證回調

5. **設定管理頁面**
   - `frontend/apps/admin-web/app/pages/settings/google-integration/index.vue`
   - 完整的設定嚮導和測試工具

### 文件

1. **Looker Studio 設定指南**
   - `docs/LOOKER_STUDIO_SETUP.md`
   - 包含 BigQuery 設定、資料上傳腳本、儀表板建立等完整教學

---

## 快速開始（5 分鐘設定）

### 步驟 1: 建立 Google Cloud 專案

1. 前往 https://console.cloud.google.com/
2. 建立新專案（例如：gym-nexus-reports）
3. 記下專案 ID

### 步驟 2: 啟用 API

1. 在 Google Cloud Console，前往「API 和服務」→「程式庫」
2. 搜尋並啟用：
   - Google Sheets API
   - Google Drive API

### 步驟 3: 建立 OAuth 憑證

1. 前往「API 和服務」→「憑證」
2. 點擊「建立憑證」→「OAuth 用戶端 ID」
3. 應用程式類型：「網頁應用程式」
4. 名稱：`Gym Nexus Admin`
5. 已授權的重新導向 URI：
   ```
   http://localhost:3001/settings/google-integration/callback
   ```
6. 建立後，複製「用戶端 ID」和「用戶端密鑰」

### 步驟 4: 設定環境變數

1. 複製 `.env.example` 到 `.env`:
   ```bash
   cd frontend/apps/admin-web
   cp .env.example .env
   ```

2. 編輯 `.env`，填入您的憑證：
   ```bash
   NUXT_PUBLIC_GOOGLE_CLIENT_ID=您的用戶端ID.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=您的用戶端密鑰
   ```

3. 其他設定使用預設值即可

### 步驟 5: 重啟開發伺服器

```bash
cd frontend
pnpm run dev:admin
```

### 步驟 6: 完成驗證

1. 在瀏覽器中開啟 http://localhost:3001/settings/google-integration
2. 點擊「使用 Google 帳號登入」
3. 授權應用程式存取 Google Sheets 和 Drive
4. 點擊「測試匯出」驗證設定

完成！您現在可以在任何報表頁面使用 Google Sheets 匯出功能。

---

## 使用方式

### 在報表頁面中加入匯出按鈕

例如在 `pages/reports/index.vue` 中：

```vue
<template>
  <div>
    <!-- 現有的報表內容 -->

    <!-- 加入 Google Sheets 匯出按鈕 -->
    <GoogleSheetsExport
      :data="revenueReportData"
      report-type="revenue"
      :filename="`營收報表_${currentDate}`"
    />
  </div>
</template>

<script setup lang="ts">
import GoogleSheetsExport from '~/components/GoogleSheetsExport.vue'
import { useReports } from '~/composables/useReports'

const { getRevenueReport } = useReports()
const revenueReportData = ref([])

onMounted(async () => {
  const result = await getRevenueReport()
  revenueReportData.value = result.data
})

const currentDate = computed(() =>
  new Date().toISOString().split('T')[0]
)
</script>
```

### 可用的報表類型

`GoogleSheetsExport` 元件支援以下報表類型：

- `revenue` - 營收報表
- `member-growth` - 會員成長報表
- `contract-expiry` - 合約到期提醒
- `member-activity` - 會員活躍度報表

每種報表類型都有專門的欄位對應（中文標題）。

### 直接使用 Composable

如果需要更多控制，可以直接使用 `useGoogleSheets` composable：

```typescript
import { useGoogleSheets } from '~/utils/googleSheets'

const googleSheets = useGoogleSheets()

// 檢查是否已驗證
if (!googleSheets.isAuthenticated()) {
  await googleSheets.authenticate()
}

// 建立新試算表
const result = await googleSheets.createSpreadsheet(
  '我的報表',
  'Sheet1',
  myData
)

console.log('試算表 URL:', result.spreadsheetUrl)

// 或使用專門的匯出函數
await googleSheets.exportRevenueReport(revenueData)
```

---

## Looker Studio 整合

若要使用 Looker Studio 建立進階儀表板，請參閱：

**`docs/LOOKER_STUDIO_SETUP.md`**

該指南包含：
- BigQuery 設定（10 分鐘）
- 資料上傳腳本（15 分鐘）
- Looker Studio 報表建立（30 分鐘）
- 儀表板範本建議

---

## 常見問題

### Q: 我可以使用既有的 Google 專案嗎？

A: 可以！只要在該專案中啟用必要的 API 並建立 OAuth 憑證即可。

### Q: 需要付費嗎？

A: Google Sheets API 和 Drive API 在合理使用範圍內是免費的。BigQuery 有免費額度（每月 10 GB 儲存 + 1 TB 查詢），一般使用情況下不會超過。

### Q: 驗證令牌會過期嗎？

A: 會的，access token 通常 1 小時後過期。但系統會自動提示您重新驗證。

### Q: 可以分享匯出的試算表嗎？

A: 可以！匯出後的試算表在您的 Google Drive 中，您可以設定分享權限。

### Q: 如何撤銷應用程式的存取權限？

A: 前往 https://myaccount.google.com/permissions，找到 Gym Nexus Admin 並點擊「移除存取權」。

### Q: 生產環境需要更改什麼？

A:
1. 更新 `.env` 中的 `NUXT_PUBLIC_GOOGLE_REDIRECT_URI` 為您的生產網域
2. 在 Google Cloud Console 中新增生產環境的重新導向 URI
3. 確保環境變數已正確設定在生產伺服器

---

## 安全性建議

1. **絕對不要** 將 `.env` 檔案提交到 Git
2. **絕對不要** 將用戶端密鑰洩露給第三方
3. 定期輪換服務帳號金鑰（BigQuery 使用）
4. 使用最小權限原則（只授予必要的 API 範圍）
5. 監控 Google Cloud Console 的「API 和服務」使用情況

---

## 下一步

1. ✅ 完成 Google Sheets 基本設定
2. ✅ 測試匯出功能
3. 📝 在所有報表頁面加入匯出按鈕
4. 📊 （選擇性）設定 BigQuery + Looker Studio
5. 🚀 部署到生產環境

---

## 技術支援

遇到問題？檢查：
1. 瀏覽器主控台是否有錯誤訊息
2. `.env` 設定是否正確
3. Google Cloud Console 中 OAuth 憑證是否正確設定
4. 重新導向 URI 是否完全匹配（包括 http/https 和 port）

需要協助請參考：
- `docs/LOOKER_STUDIO_SETUP.md` - 詳細設定指南
- Google Cloud 文件：https://cloud.google.com/docs
- Looker Studio 說明：https://support.google.com/looker-studio
