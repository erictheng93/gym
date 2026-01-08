/**
 * Hooks Index
 * Aggregates all hook modules for the gym hooks extension
 */

import { registerContractLogsHooks } from './contract-logs.js';
import { registerContractsHooks } from './contracts.js';
import { registerEmployeesHooks } from './employees.js';
import { registerPaymentsHooks } from './payments.js';
import { registerLeaveRequestsHooks } from './leave-requests.js';
import { registerAttendanceHooks } from './attendance.js';
import { registerCheckinHooks } from './checkin.js';
import { registerAuthHooks } from './auth.js';
import { registerNotificationsHooks } from './notifications.js';
import { registerPermissionsHooks } from './permissions.js';
import { registerScheduledHooks } from './schedules.js';
import { registerQuotaCheckHooks } from './quota-check.js';
import { registerStorageQuotaCheckHooks } from './storage-quota-check.js';
import { registerBillingTasks } from '../cron/billing-tasks.js';
import { registerAnalyticsTasks } from '../cron/analytics-tasks.js';

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

  // 12. Quota Check Hooks (tenant quota validation)
  registerQuotaCheckHooks({ filter }, context);

  // 13. Storage Quota Check Hooks (file upload quota validation)
  registerStorageQuotaCheckHooks({ filter }, context);

  // 14. Billing Cron Tasks (usage collection, invoice generation)
  if (typeof schedule === 'function') {
    registerBillingTasks(schedule, context);
  }

  // 15. Analytics Cron Tasks (API usage aggregation, log cleanup)
  if (typeof schedule === 'function') {
    registerAnalyticsTasks(schedule, context);
  }
}

export default registerAllHooks;
