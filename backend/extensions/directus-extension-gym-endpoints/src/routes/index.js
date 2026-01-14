/**
 * Routes Index
 * Aggregates all route modules for the gym endpoints extension
 */

import { registerOtpRoutes } from './otp.js';
import { registerAuthRoutes } from './auth.js';
import { registerCheckinRoutes } from './checkin.js';
import { registerClassesRoutes } from './classes.js';
import { registerBookingsRoutes } from './bookings.js';
import { registerPushRoutes } from './push.js';
import { registerMemberRoutes } from './member.js';
import { registerContractsRoutes } from './contracts.js';
import { registerReportsRoutes } from './reports.js';
import { registerNotificationsRoutes } from './notifications.js';
import { registerAdminRoutes } from './admin.js';
import { registerReviewsRoutes } from './reviews.js';
import { registerQuotaRoutes } from './quota.js';
import { registerAnalyticsRoutes } from './analytics.js';
import { registerBillingRoutes } from './billing.js';
import { registerAuditRoutes } from './audit.js';
import { registerPaymentRoutes } from './payment.js';
import { registerHealthRoutes } from './health.js';
import { registerCsrfRoutes } from './csrf.js';

/**
 * Register all routes with the router
 * @param {object} router - Express router
 * @param {object} context - Directus context { services, database, getSchema, env }
 * @param {object} middleware - Middleware functions { memberAuth, adminNotification }
 */
export function registerAllRoutes(router, context, middleware) {
  const { memberAuth, adminNotification } = middleware;

  // Health check routes (no auth required, registered first)
  registerHealthRoutes(router, context);

  // OTP routes (no auth required)
  registerOtpRoutes(router, context);

  // Auth routes (member auth required for some routes)
  registerAuthRoutes(router, context, memberAuth);

  // Checkin routes (member auth required)
  registerCheckinRoutes(router, context, memberAuth);

  // Classes routes (public + member auth)
  registerClassesRoutes(router, context, memberAuth);

  // Bookings routes (member auth required)
  registerBookingsRoutes(router, context, memberAuth);

  // Push notification routes (member auth required)
  registerPushRoutes(router, context, memberAuth);

  // Member profile routes (member auth required)
  registerMemberRoutes(router, context, memberAuth);

  // Contract routes (member auth required)
  registerContractsRoutes(router, context, memberAuth);

  // Reports routes (public, permission checked internally)
  registerReportsRoutes(router, context);

  // Notification preference routes (member auth required)
  registerNotificationsRoutes(router, context, memberAuth);

  // Admin routes (admin notification middleware)
  registerAdminRoutes(router, context, adminNotification);

  // Review routes (member auth required + public)
  registerReviewsRoutes(router, context, memberAuth);

  // Quota routes (authentication required, checked internally)
  registerQuotaRoutes(router, context);

  // Analytics routes (authentication required, checked internally)
  registerAnalyticsRoutes(router, context);

  // Billing routes (authentication required, checked internally)
  registerBillingRoutes(router, context);

  // Audit routes (authentication required, checked internally)
  registerAuditRoutes(router, context);

  // Payment routes (authentication required, checked internally)
  registerPaymentRoutes(router, context);
}

export default registerAllRoutes;
