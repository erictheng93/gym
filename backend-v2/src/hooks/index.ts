/**
 * Business Logic Hooks Index
 * Exports all hook functions for use in routes and services
 *
 * Migrated from Directus hooks (15 modules) to TypeScript
 */

// Utility functions
export {
  calculateMemberStatus,
  calculatePaymentStatus,
  generateMemberCode,
  generateContractNo,
  getActionName,
  getModuleName,
  daysBetween,
  addDays,
} from './utils.js';

// Contract hooks - member status sync
export {
  syncMemberStatusOnContractChange,
  onContractCreate,
  onContractUpdate,
  activateContract,
  expireContract,
  cancelContract,
} from './contracts.js';

// Payment hooks - payment status calculation
export {
  updateContractPaymentStatus,
  onPaymentCreate,
  onPaymentUpdate,
  onPaymentDelete,
  getContractPaymentSummary,
} from './payments.js';

// Contract log hooks - PAUSE, RESUME, TRANSFER, etc.
export {
  onContractLogCreate,
  handlePauseLog,
  handleResumeLog,
  handleClassUsedLog,
  handleTransferLog,
  handleExtendLog,
} from './contract-logs.js';

// Check-in hooks - validation and session deduction
export {
  validateCheckIn,
  deductSessionCount,
  hasCheckedInToday,
  processCheckIn,
} from './check-ins.js';

// Lead hooks - auto-assignment and notifications
export {
  autoAssignLead,
  onLeadCreate,
  onLeadStatusChange,
  onLeadReassign,
} from './leads.js';

// Notification hooks - push and in-app notifications
export {
  buildNotificationPayload,
  queueBookingReminders,
  queueContractExpiryReminders,
  onClassSessionCancelled,
  createNotification,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from './notifications.js';
