/**
 * Gym Custom API Endpoints
 *
 * 1. OTP Authentication - Send/Verify OTP for member login
 * 2. QR Code Checkin - Verify QR code and process member check-in
 * 3. Class Bookings - Book/cancel classes with atomic operations
 * 4. Push Notifications - VAPID key and subscription management
 * 5. Reports - 報表查詢和刷新
 * 6. Member Profile - 會員資料管理
 * 7. Contracts - 合約暫停/恢復
 * 8. Notification Preferences - 通知偏好設定 (LINE/Push/Email/SMS)
 * 9. Admin - 管理員通知設定
 * 10. Reviews - 課程評價系統
 */

// ============================================
// 模組化導入
// ============================================
import { initRedis } from './utils/redis.js';
import { logger } from './utils/logger.js';
import { createMemberAuthMiddleware } from './middleware/member-auth.js';
import { createAdminNotificationMiddleware } from './middleware/admin-auth.js';
import { createTenantContextMiddleware } from './middleware/tenant-context.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createRateLimiter } from './middleware/rate-limiter.js';
import { createApiLogger } from './middleware/api-logger.js';
import { createErrorHandler, setupProcessErrorHandlers } from './middleware/error-handler.js';
import { registerAllRoutes } from './routes/index.js';

// 設置進程級錯誤處理
setupProcessErrorHandlers();

// 初始化 Redis 連接（非阻塞）
initRedis();

export default {
  id: 'gym',
  handler: (router, { services, database, getSchema, env }) => {
    const { ItemsService, UsersService } = services;

    // 初始化中間件
    const authMiddleware = createAuthMiddleware(env, database);
    const memberAuthMiddleware = createMemberAuthMiddleware(env);
    const adminNotificationMiddleware = createAdminNotificationMiddleware(database);
    const tenantContextMiddleware = createTenantContextMiddleware(database);
    const apiLoggerMiddleware = createApiLogger({ database });

    // ============================================
    // Middleware: Parse JSON body
    // ============================================
    router.use((req, res, next) => {
      // Ensure JSON content type is handled
      if (req.is('application/json')) {
        // Body should already be parsed by Directus
      }
      next();
    });

    // ============================================
    // Middleware: Authentication (应用于所有路由，注入accountability)
    // ============================================
    router.use(authMiddleware);

    // ============================================
    // Middleware: Tenant Context (應用於所有路由)
    // ============================================
    router.use(tenantContextMiddleware);

    // ============================================
    // Middleware: API Usage Logger (應用於所有路由)
    // ============================================
    router.use(apiLoggerMiddleware);

    // ============================================
    // Middleware: API Rate Limiter (應用於所有路由)
    // ============================================
    router.use(createRateLimiter());

    // ============================================
    // 註冊所有路由
    // ============================================
    const context = {
      services,
      database,
      getSchema,
      env,
      ItemsService,
      UsersService,
    };

    const middleware = {
      memberAuth: memberAuthMiddleware,
      adminNotification: adminNotificationMiddleware,
      tenantContext: tenantContextMiddleware,
    };

    registerAllRoutes(router, context, middleware);

    // 全局錯誤處理（必須在所有路由之後）
    router.use(createErrorHandler());

    logger.info('Gym API endpoints registered with tenant isolation');
  },
};
