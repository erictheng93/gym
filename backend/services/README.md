# BigQuery 資料同步服務

將 Gym Nexus 報表資料同步到 Google BigQuery，供 Looker Studio 使用。

## 安裝

```bash
cd backend/services
npm install
```

## 設定

### 1. 複製環境變數範本

```bash
cp .env.example .env
```

### 2. 編輯 `.env` 並填入您的設定

```bash
DIRECTUS_URL=http://localhost:8055
GOOGLE_PROJECT_ID=your_project_id_here
BIGQUERY_DATASET_ID=gym_nexus_reports
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./config/google-service-account-key.json
```

### 3. 下載服務帳號金鑰

1. 前往 [Google Cloud Console](https://console.cloud.google.com/)
2. 選擇您的專案
3. 前往「IAM 與管理」→「服務帳號」
4. 選擇或建立服務帳號
5. 點擊「金鑰」→「新增金鑰」→「JSON」
6. 下載的 JSON 檔案儲存到 `backend/config/google-service-account-key.json`

### 4. 確保 BigQuery 資料表已建立

參考 `docs/LOOKER_STUDIO_SETUP.md` 建立 BigQuery 資料集和資料表。

## 使用方式

### 手動執行一次同步

```bash
# 同步最近 30 天的資料
node bigquery-export.js

# 指定日期範圍
node bigquery-export.js --start-date 2025-01-01 --end-date 2025-01-31

# 指定合約到期提前天數
node bigquery-export.js --days-ahead 90
```

### 啟動排程器（自動同步）

```bash
# 啟動排程器（前台執行）
node cron-sync.js

# 使用 PM2 在背景執行（建議用於生產環境）
npm install -g pm2
pm2 start cron-sync.js --name bigquery-sync
pm2 save
pm2 startup
```

## 排程時間

預設排程：

- **每天 03:00** - 完整同步（最近 30 天資料）
- **每小時 XX:05** - 增量同步（今日資料）
- **每週日 02:00** - 完整同步（最近 90 天資料）

可在 `cron-sync.js` 中自訂排程時間。

## 錯誤處理

如果同步失敗，請檢查：

1. **環境變數設定** - 確認 `.env` 檔案設定正確
2. **服務帳號權限** - 確認服務帳號有 BigQuery 資料編輯者權限
3. **Directus API** - 確認 Directus 服務正在運行
4. **BigQuery 資料表** - 確認資料表已建立且 schema 正確
5. **網路連線** - 確認可以連接到 Google Cloud

查看詳細錯誤訊息：
```bash
node bigquery-export.js 2>&1 | tee sync-log.txt
```

## 監控

### 使用 PM2 監控

```bash
# 查看狀態
pm2 status

# 查看日誌
pm2 logs bigquery-sync

# 查看最近 100 行日誌
pm2 logs bigquery-sync --lines 100

# 重啟服務
pm2 restart bigquery-sync
```

### 日誌輸出

腳本會輸出詳細的同步進度和結果：

```
========================================
開始同步報表資料到 BigQuery...
時間: 2025-12-26T03:00:00.000Z
========================================

1. 同步營收報表...
準備上傳 30 筆營收資料...
✓ 已上傳 30 筆營收資料到 BigQuery

2. 同步會員成長報表...
準備上傳 30 筆會員成長資料...
✓ 已上傳 30 筆會員成長資料到 BigQuery

...

========================================
同步完成！
========================================

摘要:
  成功: 4
  失敗: 0
  營收資料: 30 筆
  會員成長: 30 筆
  合約到期: 15 筆
  會員活躍度: 30 筆
```

## 進階設定

### 自訂排程時間

編輯 `cron-sync.js`：

```javascript
// 每天凌晨 3:00
cron.schedule('0 3 * * *', async () => {
  // ...
})

// 每小時
cron.schedule('5 * * * *', async () => {
  // ...
})

// 每週日凌晨 2:00
cron.schedule('0 2 * * 0', async () => {
  // ...
})
```

Cron 表達式格式：
```
┌───────────── 分鐘 (0 - 59)
│ ┌───────────── 小時 (0 - 23)
│ │ ┌───────────── 日 (1 - 31)
│ │ │ ┌───────────── 月 (1 - 12)
│ │ │ │ ┌───────────── 星期 (0 - 7, 0和7都是星期日)
│ │ │ │ │
* * * * *
```

### 啟動時立即執行同步

在 `.env` 中設定：
```bash
SYNC_ON_STARTUP=true
```

## 疑難排解

### 問題：找不到服務帳號金鑰檔案

**錯誤訊息**：
```
Error: Cannot find module './config/google-service-account-key.json'
```

**解決方法**：
1. 確認金鑰檔案路徑正確
2. 檢查 `.env` 中的 `GOOGLE_SERVICE_ACCOUNT_KEY_PATH` 設定
3. 確認檔案存在：`ls -la backend/config/google-service-account-key.json`

### 問題：權限不足

**錯誤訊息**：
```
Error: Permission denied
```

**解決方法**：
確認服務帳號具有以下權限：
- BigQuery 資料編輯者 (roles/bigquery.dataEditor)
- BigQuery 工作使用者 (roles/bigquery.jobUser)

### 問題：資料表不存在

**錯誤訊息**：
```
Error: Table not found
```

**解決方法**：
參考 `docs/LOOKER_STUDIO_SETUP.md` 建立 BigQuery 資料表。

### 問題：Directus API 無法連接

**錯誤訊息**：
```
Error: connect ECONNREFUSED
```

**解決方法**：
1. 確認 Directus 服務正在運行：`docker-compose ps`
2. 檢查 `DIRECTUS_URL` 設定
3. 測試 API：`curl http://localhost:8055/gym/reports/revenue`

## 生產環境部署

### 使用 PM2

```bash
# 安裝 PM2
npm install -g pm2

# 啟動服務
pm2 start cron-sync.js --name bigquery-sync

# 設定開機自動啟動
pm2 startup
pm2 save

# 設定日誌輪轉
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

### 使用 systemd

建立 `/etc/systemd/system/bigquery-sync.service`：

```ini
[Unit]
Description=Gym Nexus BigQuery Data Sync
After=network.target

[Service]
Type=simple
User=your_user
WorkingDirectory=/path/to/backend/services
ExecStart=/usr/bin/node cron-sync.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=bigquery-sync

[Install]
WantedBy=multi-user.target
```

啟動服務：
```bash
sudo systemctl enable bigquery-sync
sudo systemctl start bigquery-sync
sudo systemctl status bigquery-sync

# 查看日誌
sudo journalctl -u bigquery-sync -f
```

## 相關文件

- [Looker Studio 設定指南](../../docs/LOOKER_STUDIO_SETUP.md)
- [報表 API 文件](../REPORTS_API.md)
- [BigQuery 文件](https://cloud.google.com/bigquery/docs)
