/**
 * Routes Index
 * Aggregates all route modules for the gym endpoints extension
 */

export { registerOtpRoutes } from './otp.js';
export { registerAuthRoutes } from './auth.js';
export { registerCheckinRoutes } from './checkin.js';
export { registerClassesRoutes } from './classes.js';
export { registerBookingsRoutes } from './bookings.js';
export { registerPushRoutes } from './push.js';
export { registerMemberRoutes } from './member.js';
export { registerContractsRoutes } from './contracts.js';
export { registerReportsRoutes } from './reports.js';
export { registerNotificationsRoutes } from './notifications.js';
export { registerAdminRoutes } from './admin.js';
export { registerReviewsRoutes } from './reviews.js';

/**
 * Register all routes with the router
 * @param {object} router - Express router
 * @param {object} context - Directus context { services, database, getSchema, env }
 * @param {object} middleware - Middleware functions { memberAuth, adminNotification }
 */
export function registerAllRoutes(router, context, middleware) {
  const { memberAuth, adminNotification } = middleware;

  // OTP routes (no auth required)
  registerOtpRoutes(router, context);

  // Auth routes (no auth required)
  registerAuthRoutes(router, context);

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
}

export default registerAllRoutes;
