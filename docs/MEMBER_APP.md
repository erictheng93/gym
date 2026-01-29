# Member App (apps/member-app) Documentation

**上次更新時間:** 2026-01-29
**狀態:** 已完成核心功能開發，支援 PWA (Production Ready)

## 1. 專案概述
`member-app` 是 Gym Nexus 的會員端應用程式，採用 **Mobile-First** 設計，支援 PWA (Progressive Web App) 安裝。會員可透過此 App 進行課程預約、查看合約、QR Code 入場及管理個人資料。

### 技術棧
- **Framework:** Nuxt 4.2.1 (Vue 3.5.25, Vite)
- **Language:** TypeScript (Strict Mode)
- **Styling:** Tailwind CSS (Mobile Optimized)
- **State Management:** Composables (Vue 3 Composition API)
- **Validation:** Zod
- **QR Code:** qrcode (v1.5.4)
- **Error Monitoring:** Sentry
- **PWA:** @vite-pwa/nuxt (Workbox)

### PWA 功能
- 可安裝至手機主畫面
- 離線存取支援（IndexedDB + Service Worker）
- 背景同步（3600 秒週期）
- 推播通知
- App Icons (192x192, 512x512, maskable)

## 2. 核心功能模組 (Functional Modules)

### 2.1 首頁 (Home)
- **路徑:** `/`
- **功能:**
  - **QR Code 入場碼**（30 秒自動刷新，含倒數計時）
  - 會員問候語與分店資訊
  - 合約狀態摘要（TIME_BASED / COUNT_BASED）
  - 快速入口連結（預約、合約）

### 2.2 課程預約 (Bookings)
- **路徑:** `/bookings`
- **功能:**
  - 週課表瀏覽（WeeklySchedule 元件）
  - 預約課程 / 取消預約
  - 我的預約（即將到來 / 歷史記錄）
  - 等候名單 (Waitlist) 狀態
  - **課程評價系統**（評分與文字評論）

### 2.3 合約與會籍 (Contracts)
- **路徑:** `/contracts`
- **功能:**
  - 查看所有合約（含方案詳情）
  - 合約狀態顯示（DRAFT, ACTIVE, PAUSED, EXPIRED, TERMINATED）
  - 剩餘點數/堂數顯示（COUNT_BASED）
  - **暫停合約**（輸入暫停原因）
  - **恢復合約**
  - 繳費狀態追蹤

### 2.4 個人中心 (Profile)
- **路徑:** `/profile`
- **功能:**
  - 個人資料顯示與頭像
  - 會員狀態徽章
  - 會員統計（會籍時長、合約狀態）
  - **即時編輯**個人資料（姓名、電話、Email、緊急聯絡人）
  - 子功能導航選單
  - 登出功能
  - App 版本資訊

#### 2.4.1 入場記錄 (`/profile/checkins`)
- 進場記錄列表（依日期分組）
- 顯示：時間、驗證方式、分店、跨店狀態
- 記錄詳情頁 (`/profile/checkins/[id]`)
- 分頁載入

#### 2.4.2 通知中心 (`/profile/notifications`)
- **推播訂閱管理**（啟用/停用）
- **多渠道偏好設定**：
  - Push 推播
  - Email 電子郵件
  - SMS 簡訊
  - LINE 訊息
- **通知類型開關**：
  - 預約提醒
  - 課程提醒
  - 合約到期
  - 繳費通知
  - 促銷活動
- 通知歷史記錄（含分頁）
- 測試通知功能

#### 2.4.3 支付管理 (`/profile/payments`)
- 繳費記錄列表（收入/退款）
- 支付方式篩選（現金、信用卡、LINE Pay、轉帳）
- 金額格式化顯示
- 關聯合約資訊
- 分頁載入

#### 2.4.4 帳號安全 (`/profile/security`)
- 修改密碼功能
- **密碼強度指示器**
- 密碼規則驗證（8+ 字元、含數字）
- 當前/新/確認密碼欄位（含顯示切換）

#### 2.4.5 客戶支援 (`/profile/support`)
- 聯絡方式（電話、LINE、Email）
- **FAQ 常見問題**（7 題預設）
- **問題回報表單**
- 問題類別：預約、合約、付款、App、設施、服務、其他

### 2.5 認證與授權 (Auth)

#### 登入頁面 (`/login`)
- Email / 密碼登入
- **手機 OTP 驗證碼登入**（含倒數計時）
- **社交登入**：
  - LINE
  - Google
  - Apple
- 表單驗證與錯誤訊息

#### 認證流程頁面 (`/auth/*`)
| 路徑 | 說明 |
|------|------|
| `/auth/callback` | OAuth 社交登入回調 |
| `/auth/complete-profile` | 新用戶資料補填 |
| `/auth/forgot-password` | 忘記密碼 |
| `/auth/reset-password` | 重設密碼 |

## 3. 共用元件 (Components)

| 元件 | 說明 |
|------|------|
| `AccessibleModal.vue` | 無障礙 Modal 容器 |
| `BookingCard.vue` | 預約卡片 |
| `ClassSessionCard.vue` | 課程時段卡片 |
| `ErrorBoundary.vue` | 錯誤邊界處理 |
| `OfflineSyncIndicator.vue` | 離線同步狀態指示器 |
| `PushPermissionBanner.vue` | 推播權限請求橫幅 |
| `ReviewFormModal.vue` | 課程評價表單（Lazy Load） |
| `ReviewList.vue` | 評價列表 |
| `SocialLoginButtons.vue` | 社交登入按鈕組 |
| `ToastContainer.vue` | Toast 通知容器 |
| `WeeklySchedule.vue` | 週課表元件 |

## 4. Composables (狀態管理)

應用程式使用 **Composables** 進行狀態管理，共 16 個。

### 認證相關
| Composable | 說明 |
|------------|------|
| `useMemberAuth()` | 會員認證 |
| `useAuthSession()` | Session 管理 |
| `useAuthTokens()` | Token 存取 |
| `useAuthMethods()` | 認證方式 |
| `useSocialAuth()` | 社交登入 |

### 業務功能
| Composable | 說明 |
|------------|------|
| `useBookings()` | 預約操作 |
| `useClasses()` | 課程資料 |
| `useReviews()` | 課程評價 |
| `useNotificationPreferences()` | 通知偏好 |
| `usePushNotifications()` | 推播管理 |

### 工具類
| Composable | 說明 |
|------------|------|
| `useApiError()` | API 錯誤處理 |
| `useFormValidation()` | 表單驗證 |
| `useFocusTrap()` | 焦點陷阱（無障礙） |
| `useOfflineSync()` | 離線同步 |
| `useToast()` | Toast 通知 |
| `useSentry()` | 錯誤監控 |

## 5. 特色功能

### 5.1 QR Code 入場
- 整合於首頁
- 動態生成（含會員代碼、時間戳、合約 ID）
- **30 秒自動刷新**（含倒數計時器）
- 手動刷新按鈕
- 警告狀態（剩餘 < 10 秒）
- 無障礙標籤支援

### 5.2 離線同步
- **IndexedDB** 本地資料儲存
- Service Worker 背景同步
- 離線狀態指示器
- 網路恢復自動同步

### 5.3 課程評價系統
- 課後評價資格檢查
- 星級評分
- 文字評論
- 評價列表顯示

### 5.4 無障礙支援
- ARIA 標籤
- 焦點陷阱（Modal）
- 螢幕閱讀器支援
- 鍵盤導航

## 6. 目錄結構
```
apps/member-app/app/
├── assets/             # CSS 與靜態資源
├── components/         # Mobile UI 元件 (11 個)
├── composables/        # 邏輯複用 (16 個)
├── layouts/            # Mobile 佈局（含底部導航欄）
├── middleware/         # 路由守衛
│   └── auth.ts         # 認證中介層
├── pages/              # 應用程式路由 (14 個)
│   ├── index.vue       # 首頁（QR Code）
│   ├── login.vue       # 登入頁
│   ├── bookings.vue    # 預約頁面
│   ├── contracts.vue   # 合約頁面
│   ├── profile.vue     # 個人中心
│   ├── profile/
│   │   ├── checkins.vue
│   │   ├── checkins/[id].vue
│   │   ├── notifications.vue
│   │   ├── payments.vue
│   │   ├── security.vue
│   │   └── support.vue
│   └── auth/
│       ├── callback.vue
│       ├── complete-profile.vue
│       ├── forgot-password.vue
│       └── reset-password.vue
├── plugins/            # 插件
│   ├── directus.client.ts
│   ├── offline-sync.client.ts
│   └── sentry.client.ts
├── schemas/            # Zod 驗證 Schema
├── types/              # TypeScript 定義
└── utils/              # 工具函數
```

## 7. 統計摘要

| 類別 | 數量 |
|------|------|
| Vue 頁面 | 14 |
| Composables | 16 |
| 元件 | 11 |
| 插件 | 3 |
| 中介層 | 1 |

## 8. 安全性設定

應用程式配置了以下安全標頭：
- Content-Security-Policy (CSP)
- X-Frame-Options
- X-Content-Type-Options
- Referrer-Policy
