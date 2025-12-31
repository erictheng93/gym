/**
 * Hooks Index
 * Aggregates all hook modules for the gym hooks extension
 */

export { registerContractLogsHooks } from './contract-logs.js';
export { registerContractsHooks } from './contracts.js';
export { registerEmployeesHooks } from './employees.js';
export { registerPaymentsHooks } from './payments.js';
export { registerLeaveRequestsHooks } from './leave-requests.js';
export { registerAttendanceHooks } from './attendance.js';
export { registerCheckinHooks } from './checkin.js';
export { registerAuthHooks } from './auth.js';
export { registerNotificationsHooks } from './notifications.js';
export { registerPermissionsHooks } from './permissions.js';
export { registerScheduledHooks } from './schedules.js';

/**
 * Register all hooks with Directus
 * @param {object} directusHooks - Directus hook functions { filter, action, init, schedule }
 * @param {object} context - Directus context { services, database, getSchema }
 * @param {object} utils - Shared utilities (cache, services, etc.)
 */
export function registerAllHooks(directusHooks, context, utils) {
  const { filter, action, init, schedule } = directusHooks;
  const { cacheUtils, emailService, emailServiceLoaded, pushService, pushEnabled, cacheEnabled, invalidateReportCache, recordPerformanceMetric } = utils;

  // 1. Contract Logs Hooks (PAUSE, RESUME, CLASS_USED, TRANSFER)
  registerContractLogsHooks({ action }, context);

  // 2. Contracts Hooks (member status sync)
  registerContractsHooks({ action }, context, cacheUtils);

  // 3. Employees Hooks (user branch_id sync)
  registerEmployeesHooks({ action }, context);

  // 4. Payments Hooks (payment status calculation)
  registerPaymentsHooks({ action, filter }, context);

  // 5. Leave Requests Hooks (HR leave workflow)
  registerLeaveRequestsHooks({ action, filter }, context);

  // 6. Attendance Hooks (HR attendance calculation)
  registerAttendanceHooks({ action }, context);

  // 7. Checkin Hooks (member check-in validation)
  registerCheckinHooks({ action, filter }, context, cacheUtils);

  // 8. Auth Hooks (SSO user/member creation)
  registerAuthHooks({ action }, context, { emailService, emailServiceLoaded });

  // 9. Notifications Hooks (push notification queue)
  registerNotificationsHooks({ action, schedule }, context, { pushService, pushEnabled });

  // 10. Permissions Hooks (RBAC permission checking)
  registerPermissionsHooks({ action, filter, schedule }, context);

  // 11. Scheduled Tasks (expiry check, report refresh)
  registerScheduledHooks({ init, schedule }, context, {
    emailService,
    emailServiceLoaded,
    cacheEnabled,
    invalidateReportCache,
    recordPerformanceMetric,
  });
}

export default registerAllHooks;
