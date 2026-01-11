/**
 * Gym Business Logic Hooks
 *
 * 1. 合約暫停自動延長：當 contract_logs 新增 PAUSE 紀錄時，自動延長 contracts.end_date
 * 2. 會員狀態自動更新：根據合約狀態自動更新 members.member_status
 * 3. 員工帳號同步：當員工建立/更新時，自動同步 branch_id 到 directus_users
 * 4. 付款狀態自動計算：當 payments 變更時，自動計算 contracts.payment_status
 * 5. 合約到期自動更新：檢查合約是否過期並自動更新狀態
 * 6. 合約到期通知：合約即將到期時，自動創建通知紀錄
 * 7. HR 休假審核流程：驗證上級審核下級，記錄審核歷史，更新休假餘額
 * 8. HR 考勤自動計算：打卡時自動計算工時、遲到、加班等
 * 9. 會員入場驗證：驗證會員合約有效性，記錄入場紀錄
 * 10. Social Login 自動建立會員
 * 11. 權限檢查系統：基於 job_titles.permissions_config 的細粒度權限控制
 * 12. 推播通知系統：排程處理通知佇列
 * 13. 配額檢查系統：租戶配額驗證，防止超限創建資源
 *
 * 模組化架構重構
 */

import { registerAllHooks } from './hooks/index.js';

// ============================================
// 動態模組載入狀態
// ============================================
let cacheModule = null;
let cacheEnabled = false;

let pushService = null;
let pushEnabled = false;

let emailService = null;
let emailServiceLoaded = false;

let lineService = null;
let lineServiceLoaded = false;

let smsService = null;
let smsServiceLoaded = false;

let notificationService = null;
let notificationServiceLoaded = false;

// ============================================
// 動態載入模組
// ============================================

// 載入 Redis 緩存模組
import('./cache.js').then((module) => {
  cacheModule = module;
  cacheEnabled = true;
  // Status logged('[GymHook] Redis cache module loaded successfully');
}).catch(() => {
  // Status logged('[GymHook] Redis cache module not available, running without cache');
});

// 載入 Email 服務模組
import('./email-service.js').then((module) => {
  emailService = module;
  emailServiceLoaded = true;
  // Status logged('[GymHook] Email service module loaded');
}).catch(() => {
  // Status logged('[GymHook] Email service module not available');
});

// 載入 LINE 服務模組
import('./line-service.js').then((module) => {
  lineService = module;
  lineServiceLoaded = true;
  // Status logged('[GymHook] LINE service module loaded');
}).catch(() => {
  // Status logged('[GymHook] LINE service module not available');
});

// 載入 SMS 服務模組
import('./sms-service.js').then((module) => {
  smsService = module;
  smsServiceLoaded = true;
  // Status logged('[GymHook] SMS service module loaded');
}).catch(() => {
  // Status logged('[GymHook] SMS service module not available');
});

// 載入統一通知服務模組
import('./notification-service.js').then((module) => {
  notificationService = module;
  notificationServiceLoaded = true;
  // Status logged('[GymHook] NotificationService module loaded');
}).catch(() => {
  // Status logged('[GymHook] NotificationService module not available');
});

// 載入推播服務模組
import('./push-service.js').then((module) => {
  pushService = module;
  pushEnabled = true;
  // Status logged('[GymHook] Push notification module loaded');
}).catch(() => {
  // Status logged('[GymHook] Push notification module not available');
});

// ============================================
// 緩存函數包裝器
// ============================================
const isCacheAvailable = () => cacheEnabled && cacheModule?.isCacheAvailable?.();
const getCachedMemberContract = async (id) => cacheEnabled ? cacheModule?.getCachedMemberContract?.(id) : null;
const setCachedMemberContract = async (id, data) => cacheEnabled && cacheModule?.setCachedMemberContract?.(id, data);
const invalidateMemberContract = async (id) => cacheEnabled && cacheModule?.invalidateMemberContract?.(id);
const getCachedMemberStatus = async (id) => cacheEnabled ? cacheModule?.getCachedMemberStatus?.(id) : null;
const setCachedMemberStatus = async (id, status) => cacheEnabled && cacheModule?.setCachedMemberStatus?.(id, status);
const invalidateContract = async (id, memberId) => cacheEnabled && cacheModule?.invalidateContract?.(id, memberId);
const recordPerformanceMetric = async (op, duration) => cacheEnabled && cacheModule?.recordPerformanceMetric?.(op, duration);
const invalidateReportCache = async (reportType) => cacheEnabled && cacheModule?.invalidateReportCache?.(reportType);

// ============================================
// 主要 Hook 導出
// ============================================
export default ({ filter, action, init, schedule }, { services, database, getSchema }) => {
  const { ItemsService, UsersService } = services;

  // 建立上下文物件
  const context = {
    services,
    database,
    getSchema,
    ItemsService,
    UsersService,
  };

  // 建立緩存工具物件
  const cacheUtils = {
    isCacheAvailable,
    getCachedMemberContract,
    setCachedMemberContract,
    invalidateMemberContract,
    getCachedMemberStatus,
    setCachedMemberStatus,
    invalidateContract,
    recordPerformanceMetric,
    invalidateReportCache,
  };

  // 建立工具物件
  const utils = {
    cacheUtils,
    emailService,
    emailServiceLoaded,
    pushService,
    pushEnabled,
    cacheEnabled,
    invalidateReportCache,
    recordPerformanceMetric,
  };

  // 註冊所有模組化鉤子
  registerAllHooks(
    { filter, action, init, schedule },
    context,
    utils
  );

  // ============================================
  // 初始化通知服務
  // ============================================
  if (typeof init === 'function') {
    init('app.after', async () => {
      try {
        // 初始化推播服務
        if (pushEnabled && pushService) {
          const env = {
            VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
            VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
            VAPID_SUBJECT: process.env.VAPID_SUBJECT || 'mailto:admin@gym-nexus.com',
          };

          pushEnabled = pushService.initPushService(env);
          if (pushEnabled) {
            // Status logged('[GymHook] Push notifications enabled');
          } else {
            // Status logged('[GymHook] Push notifications disabled (VAPID keys not configured)');
          }
        }

        // 初始化 Email 服務
        if (emailServiceLoaded && emailService) {
          const schema = await getSchema();
          const emailEnabled = emailService.initEmailService(services, schema);
          if (emailEnabled) {
            // Status logged('[GymHook] Email notifications enabled');
          }
        }

        // 初始化統一通知服務
        if (notificationServiceLoaded && notificationService) {
          const schema = await getSchema();
          const env = {
            LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN,
            LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET,
            VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
            VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
            VAPID_SUBJECT: process.env.VAPID_SUBJECT || 'mailto:admin@gym-nexus.com',
            EMAIL_SMTP_HOST: process.env.EMAIL_SMTP_HOST,
            MITAKE_USERNAME: process.env.MITAKE_USERNAME,
            MITAKE_PASSWORD: process.env.MITAKE_PASSWORD,
            MITAKE_API_URL: process.env.MITAKE_API_URL,
            MITAKE_COST_PER_SMS: process.env.MITAKE_COST_PER_SMS,
            NODE_ENV: process.env.NODE_ENV,
          };

          notificationService.initNotificationService({
            services,
            schema,
            env,
            database,
          });

          // Status logged('[GymHook] NotificationService initialized with channels:', notificationService.getEnabledChannels().join(', ') || 'none');
        }
      } catch (error) {
        // Error logged('[GymHook] Notification services init error:', error);
      }
    });
  }

  // Status logged('[GymHook] Gym business logic hooks registered (modular architecture)');
};
