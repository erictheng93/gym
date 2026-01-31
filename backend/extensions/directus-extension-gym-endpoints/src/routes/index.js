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
import { registerGoalsRoutes } from './goals.js';
import { registerMeasurementsRoutes } from './measurements.js';
import { registerWorkoutsRoutes } from './workouts.js';
import { registerIssuesRoutes } from './issues.js';
import { registerDashboardRoutes } from './dashboard.js';
// Phase 3: Coach App & Booking System
import { registerCoachRoutes } from './coach.js';
import { registerMemberCoachesRoutes } from './member-coaches.js';
import { registerLessonPlansRoutes } from './lesson-plans.js';
import { registerTeachingMaterialsRoutes } from './teaching-materials.js';
// Phase 5: Marketing & HR Advanced Features
import { registerLeadsRoutes } from './leads.js';
import { registerSegmentationRoutes } from './segmentation.js';
import { registerCouponsRoutes } from './coupons.js';
import { registerCampaignsRoutes } from './campaigns.js';
import { registerPerformanceRoutes } from './performance.js';
import { registerPayrollRoutes } from './payroll.js';

/**
 * Register all routes with the router
 * @param {object} router - Express router
 * @param {object} context - Directus context { services, database, getSchema, env }
 * @param {object} middleware - Middleware functions { memberAuth, coachAuth, adminNotification }
 */
export function registerAllRoutes(router, context, middleware) {
  const { memberAuth, coachAuth, adminNotification } = middleware;

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

  // Goals routes (member auth required)
  registerGoalsRoutes(router, context, memberAuth);

  // Measurements routes (member auth required)
  registerMeasurementsRoutes(router, context, memberAuth);

  // Workouts routes (member auth required)
  registerWorkoutsRoutes(router, context, memberAuth);

  // Issues routes (member auth required)
  registerIssuesRoutes(router, context, memberAuth);

  // Dashboard routes (HQ War Room, authentication required)
  registerDashboardRoutes(router, context);

  // Phase 3: Coach App & Booking System
  // Coach routes (coach auth required)
  registerCoachRoutes(router, context, coachAuth);

  // Member-Coaches routes (student management, coach auth required)
  registerMemberCoachesRoutes(router, context, coachAuth);

  // Lesson Plans routes (coach auth required)
  registerLessonPlansRoutes(router, context, coachAuth);

  // Teaching Materials routes (coach auth required)
  registerTeachingMaterialsRoutes(router, context, coachAuth);

  // Phase 5: Marketing & HR Advanced Features (authentication checked internally)
  // Leads management (CRM)
  registerLeadsRoutes(router, context);

  // Member segmentation (RFM Analysis)
  registerSegmentationRoutes(router, context);

  // Coupons management
  registerCouponsRoutes(router, context);

  // Campaigns management
  registerCampaignsRoutes(router, context);

  // Performance reviews
  registerPerformanceRoutes(router, context);

  // Payroll management
  registerPayrollRoutes(router, context);
}

export default registerAllRoutes;
