# Email 設定指南

本文檔說明如何設定 Gym Nexus 的 Email 通知功能，使用 Amazon SES 作為 SMTP 服務。

## 目錄

- [概覽](#概覽)
- [Amazon SES 設定步驟](#amazon-ses-設定步驟)
- [環境變數設定](#環境變數設定)
- [驗證設定](#驗證設定)
- [Email 模板](#email-模板)
- [故障排除](#故障排除)
- [費用估算](#費用估算)
- [其他 SMTP 服務](#其他-smtp-服務)

---

## 概覽

### 系統架構

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Directus      │────▶│   Amazon SES    │────▶│   會員信箱      │
│   (Hooks)       │     │   (SMTP)        │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### 支援的通知類型

| 通知類型 | 觸發時機 | 自動發送 |
|----------|----------|----------|
| 合約到期提醒 (7天/3天/1天) | 每日排程檢查 | ✅ |
| 新會員歡迎信 | SSO 首次登入 | ✅ |
| 課程預約確認 | 預約成功 | 需手動觸發 |
| 課程提醒 | 課程前 24h/2h | 需手動觸發 |
| 課程取消通知 | 課程取消 | 需手動觸發 |
| 付款確認 | 付款完成 | 需手動觸發 |
| 密碼重設 | 用戶請求 | Directus 內建 |

### 相關檔案

```
backend/
├── docker-compose.yml              # Email 環境變數
├── .env                            # 實際的 SMTP 認證（不進 Git）
├── .env.example                    # 環境變數範例
└── extensions/
    └── directus-extension-gym-hooks/
        └── src/
            ├── email-service.js    # Email 服務模組
            └── index.js            # Hook 整合
```

---

## Amazon SES 設定步驟

### Step 1: 登入 AWS Console

1. 前往 [AWS Console](https://console.aws.amazon.com/)
2. 登入你的 AWS 帳號（如果沒有，需要先註冊）

### Step 2: 選擇區域

在右上角選擇區域，建議選擇離台灣最近的：

| 區域代碼 | 區域名稱 | SMTP Endpoint | 建議 |
|----------|----------|---------------|------|
| `ap-northeast-1` | Tokyo (東京) | `email-smtp.ap-northeast-1.amazonaws.com` | ⭐ 推薦 |
| `ap-southeast-1` | Singapore (新加坡) | `email-smtp.ap-southeast-1.amazonaws.com` | 備選 |
| `us-east-1` | N. Virginia | `email-smtp.us-east-1.amazonaws.com` | 功能最完整 |
| `eu-west-1` | Ireland | `email-smtp.eu-west-1.amazonaws.com` | 歐洲用戶 |

### Step 3: 進入 SES 服務

1. 在 AWS Console 搜尋欄輸入 **SES**
2. 點擊 **Amazon Simple Email Service**

### Step 4: 驗證寄件者身份

#### 方式 A: Email 驗證（快速測試）

適用於開發測試，設定簡單但只能用這個 Email 寄信。

1. 左側選單 → **Verified identities**
2. 點擊 **Create identity**
3. 選擇 **Email address**
4. 輸入你的 Email 地址（例：`admin@gym-nexus.com`）
5. 點擊 **Create identity**
6. 前往你的信箱，找到 AWS 發送的驗證信
7. 點擊信中的確認連結
8. 返回 AWS Console，確認狀態變為 **Verified**

#### 方式 B: Domain 驗證（正式使用）

適用於正式環境，可以使用該網域下任何 Email 地址寄信。

1. 左側選單 → **Verified identities**
2. 點擊 **Create identity**
3. 選擇 **Domain**
4. 輸入你的網域（例：`gym-nexus.com`）
5. 展開 **Advanced DKIM settings**，保持預設的 **Easy DKIM**
6. 點擊 **Create identity**
7. AWS 會提供 DNS 記錄，你需要在 DNS 服務商設定：

**DKIM 記錄（必須，3 筆 CNAME）：**

```
名稱: xxx._domainkey.gym-nexus.com
類型: CNAME
值:   xxx.dkim.amazonses.com

名稱: yyy._domainkey.gym-nexus.com
類型: CNAME
值:   yyy.dkim.amazonses.com

名稱: zzz._domainkey.gym-nexus.com
類型: CNAME
值:   zzz.dkim.amazonses.com
```

**MAIL FROM 設定（選用，提高送達率）：**

```
名稱: mail.gym-nexus.com
類型: MX
值:   10 feedback-smtp.ap-northeast-1.amazonses.com

名稱: mail.gym-nexus.com
類型: TXT
值:   "v=spf1 include:amazonses.com ~all"
```

8. 在你的 DNS 服務商（Cloudflare、GoDaddy、Route 53 等）新增這些記錄
9. 返回 AWS Console，等待驗證完成（通常 5-30 分鐘）
10. 狀態變為 **Verified** 即設定完成

### Step 5: 建立 SMTP 認證

1. 左側選單 → **SMTP settings**
2. 記下 **SMTP endpoint**（例：`email-smtp.ap-northeast-1.amazonaws.com`）
3. 點擊 **Create SMTP credentials**
4. IAM User Name 可自訂（例：`ses-smtp-gym-nexus`）
5. 點擊 **Create user**
6. **重要！** 立即複製或下載認證資訊：

```
SMTP Username: AKIAXXXXXXXXXXXXXXXX
SMTP Password: BGXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
```

> ⚠️ **警告：密碼只會顯示一次！** 如果忘記，需要重新建立認證。

### Step 6: 申請正式發送權限（脫離 Sandbox）

新帳號預設在 **Sandbox 模式**，有以下限制：
- 只能發送給已驗證的 Email 地址
- 每日發送上限 200 封
- 每秒發送上限 1 封

**申請正式權限：**

1. 左側選單 → **Account dashboard**
2. 在 **Sending statistics** 區塊找到 **Request production access**
3. 填寫申請表單：

| 欄位 | 建議填寫內容 |
|------|--------------|
| Mail type | **Transactional** |
| Website URL | 你的網站網址 |
| Use case description | 見下方範例 |

**Use case description 範例：**

```
We operate a gym/fitness center management system (Gym Nexus).

Types of emails we send:
1. Membership expiry reminders (7 days, 3 days, 1 day before)
2. Class booking confirmations
3. Class reminders (24h and 2h before)
4. Welcome emails for new members
5. Payment confirmations

All emails are transactional and sent only to our registered members
who have opted-in to receive notifications.

Expected volume: 500-2000 emails per month
We have implemented proper unsubscribe mechanisms and follow
AWS SES best practices.
```

4. 提交申請
5. AWS 通常在 24 小時內審核完成
6. 審核通過後會收到 Email 通知

---

## 環境變數設定

### 建立 .env 檔案

```bash
cd backend
cp .env.example .env
```

### 編輯 .env

```env
# ============================================
# Email Configuration (Amazon SES)
# ============================================

# 寄件者名稱和地址（Domain 需已驗證）
EMAIL_FROM=Gym Nexus <noreply@gym-nexus.com>

# Amazon SES SMTP 設定
EMAIL_SMTP_HOST=email-smtp.ap-northeast-1.amazonaws.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=AKIAXXXXXXXXXXXXXXXX
EMAIL_SMTP_PASSWORD=BGXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
EMAIL_SMTP_SECURE=false
EMAIL_SMTP_IGNORE_TLS=false
```

### 重啟服務

```bash
docker-compose down && docker-compose up -d
```

---

## 驗證設定

### 檢查 Directus Logs

```bash
docker-compose logs directus | grep -i email
```

**成功的輸出：**
```
[GymHook] Email service module loaded
[GymHook] Email notifications enabled
```

**失敗的輸出：**
```
[EmailService] SMTP not configured. Email notifications disabled.
```

### 測試發送

可以透過 Directus 的內建密碼重設功能測試：

1. 前往 Directus Admin (`http://localhost:8055`)
2. 登出後點擊「忘記密碼」
3. 輸入已驗證的 Email
4. 檢查是否收到重設信

---

## Email 模板

Email 模板定義在 `backend/extensions/directus-extension-gym-hooks/src/email-service.js`。

### 可用模板

| 函數名稱 | 用途 |
|----------|------|
| `buildContractExpiryEmail()` | 合約到期提醒 |
| `buildBookingConfirmationEmail()` | 課程預約確認 |
| `buildBookingReminderEmail()` | 課程提醒 |
| `buildClassCancelledEmail()` | 課程取消通知 |
| `buildWelcomeEmail()` | 新會員歡迎信 |
| `buildPaymentConfirmationEmail()` | 付款確認 |
| `buildPasswordResetEmail()` | 密碼重設 |
| `buildLeaveRequestEmail()` | 休假申請通知 (HR) |

### 自訂模板

修改 `email-service.js` 中的 `wrapTemplate()` 函數可以自訂品牌顏色和樣式：

```javascript
function wrapTemplate(content, { brandColor = '#6366f1', logoUrl = null } = {})
```

---

## 故障排除

### 常見問題

#### 1. Email 沒有收到

**檢查項目：**
- [ ] SMTP 認證是否正確
- [ ] 寄件者 Email/Domain 是否已驗證
- [ ] 是否還在 Sandbox 模式（只能發給已驗證的收件者）
- [ ] 檢查垃圾郵件資料夾

**查看錯誤日誌：**
```bash
docker-compose logs directus | grep -i "email\|smtp\|mail"
```

#### 2. SMTP 連線失敗

**可能原因：**
- 防火牆阻擋 Port 587
- SMTP 認證錯誤
- 區域選擇錯誤

**測試連線：**
```bash
# 使用 telnet 測試
telnet email-smtp.ap-northeast-1.amazonaws.com 587

# 或使用 openssl
openssl s_client -starttls smtp -connect email-smtp.ap-northeast-1.amazonaws.com:587
```

#### 3. 認證錯誤 (535 Authentication failed)

**解決方案：**
1. 確認 SMTP Username 和 Password 正確
2. 重新建立 SMTP credentials
3. 確認 IAM User 有 `ses:SendRawEmail` 權限

#### 4. 寄件者未授權 (554 Message rejected)

**解決方案：**
1. 確認 `EMAIL_FROM` 的 Email 或 Domain 已驗證
2. 等待 Domain 驗證完成（檢查 DKIM 狀態）

### AWS SES 監控

在 AWS Console 中可以查看：
- **Sending statistics**: 發送量、退信率、投訴率
- **Reputation dashboard**: 帳號信譽狀態
- **Suppression list**: 被退信的 Email 清單

---

## 費用估算

### Amazon SES 定價（2024）

| 項目 | 費用 |
|------|------|
| 發送 Email | $0.10 / 1,000 封 |
| 接收 Email | $0.10 / 1,000 封 |
| 附件 | $0.12 / GB |
| 專用 IP | $24.95 / 月 |

### 免費額度

從 **Amazon EC2** 發送的 Email：
- **62,000 封/月** 免費

### 費用試算

| 月發送量 | 費用（非 EC2） | 費用（EC2） |
|----------|----------------|-------------|
| 1,000 封 | $0.10 | 免費 |
| 5,000 封 | $0.50 | 免費 |
| 10,000 封 | $1.00 | 免費 |
| 50,000 封 | $5.00 | 免費 |
| 100,000 封 | $10.00 | $3.80 |

---

## 其他 SMTP 服務

如果不想使用 Amazon SES，也可以使用其他服務：

### Gmail SMTP

```env
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=your-email@gmail.com
EMAIL_SMTP_PASSWORD=your-app-password  # 需使用 App Password
EMAIL_SMTP_SECURE=false
```

> 需要開啟 2FA 並建立 [App Password](https://myaccount.google.com/apppasswords)

### SendGrid

```env
EMAIL_SMTP_HOST=smtp.sendgrid.net
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=apikey
EMAIL_SMTP_PASSWORD=SG.xxxxx  # SendGrid API Key
EMAIL_SMTP_SECURE=false
```

### Mailgun

```env
EMAIL_SMTP_HOST=smtp.mailgun.org
EMAIL_SMTP_PORT=587
EMAIL_SMTP_USER=postmaster@your-domain.mailgun.org
EMAIL_SMTP_PASSWORD=your-mailgun-password
EMAIL_SMTP_SECURE=false
```

---

## 參考資源

- [Amazon SES 開發者指南](https://docs.aws.amazon.com/ses/latest/dg/Welcome.html)
- [SES SMTP 設定](https://docs.aws.amazon.com/ses/latest/dg/send-email-smtp.html)
- [Directus Email 設定](https://docs.directus.io/self-hosted/config-options.html#email)
- [Nodemailer 文檔](https://nodemailer.com/about/)
