import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  decimal,
  date,
  time,
  timestamp,
  jsonb,
  inet,
  real,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// =============================================================================
// ENUMS (as const for type safety)
// =============================================================================

export const STATUS = ['active', 'archived'] as const;
export const BRANCH_TYPE = ['HEADQUARTER', 'BRANCH'] as const;
export const EMPLOYMENT_STATUS = ['ACTIVE', 'RESIGNED', 'SUSPENDED'] as const;
export const EMPLOYMENT_TYPE = ['FULL_TIME', 'PART_TIME', 'CONTRACT'] as const;
export const MEMBER_STATUS = ['ACTIVE', 'INACTIVE', 'PAUSED', 'EXPIRED'] as const;
export const GENDER = ['MALE', 'FEMALE', 'OTHER'] as const;
export const PLAN_TYPE = ['TIME_BASED', 'COUNT_BASED'] as const;
export const CONTRACT_STATUS = ['DRAFT', 'ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED', 'TRANSFERRED'] as const;
export const PAYMENT_STATUS = ['UNPAID', 'PARTIAL', 'PAID', 'REFUNDED'] as const;
export const PAYMENT_METHOD = ['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'BANK_TRANSFER', 'LINE_PAY', 'OTHER'] as const;
export const PAYMENT_TYPE = ['INCOME', 'REFUND'] as const;
export const LEAVE_TYPE = ['ANNUAL', 'SICK', 'PERSONAL', 'MATERNITY', 'BEREAVEMENT', 'OTHER'] as const;
export const LEAVE_STATUS = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export const LOG_TYPE = ['PAUSE', 'RESUME', 'EXTEND', 'TRANSFER', 'CANCEL', 'CLASS_USED', 'RENEWAL'] as const;
export const TENANT_STATUS = ['trial', 'active', 'suspended', 'cancelled'] as const;
export const TENANT_PLAN = ['starter', 'professional', 'enterprise', 'custom'] as const;
export const BILLING_CYCLE = ['monthly', 'yearly'] as const;
export const USER_ROLE = ['super_admin', 'admin', 'manager', 'coach', 'staff'] as const;
export const CLASS_CATEGORY = ['YOGA', 'CARDIO', 'STRENGTH', 'DANCE', 'SPINNING', 'PILATES', 'BOXING', 'SWIMMING', 'OTHER'] as const;
export const DIFFICULTY_LEVEL = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] as const;
export const SESSION_STATUS = ['SCHEDULED', 'CANCELLED', 'COMPLETED'] as const;
export const BOOKING_STATUS = ['CONFIRMED', 'WAITLIST', 'CANCELLED', 'ATTENDED', 'NO_SHOW'] as const;
export const CHECKIN_METHOD = ['QR_CODE', 'MANUAL', 'CARD', 'BIOMETRIC'] as const;
export const OTP_TYPE = ['phone', 'email'] as const;
export const AUDIT_ACTION = ['create', 'read', 'update', 'delete', 'login', 'logout', 'login_failed', 'permission_denied', 'export', 'import', 'config_change', 'password_change', 'password_reset', 'quota_exceeded', 'payment', 'refund'] as const;
export const AUDIT_SEVERITY = ['debug', 'info', 'warning', 'error', 'critical'] as const;

// =============================================================================
// AUTH TABLES (New - replacing Directus auth)
// =============================================================================

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }),
  role: varchar('role', { length: 50 }).notNull().$type<typeof USER_ROLE[number]>(),
  employeeId: uuid('employee_id'),
  tenantId: uuid('tenant_id'),
  isActive: boolean('is_active').default(true),
  emailVerified: boolean('email_verified').default(false),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  dateUpdated: timestamp('date_updated', { withTimezone: true }),
});

export const sessions = pgTable('sessions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
});

// =============================================================================
// MULTI-TENANT TABLES
// =============================================================================

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  dateUpdated: timestamp('date_updated', { withTimezone: true }),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).unique().notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  planType: varchar('plan_type', { length: 50 }).default('starter').$type<typeof TENANT_PLAN[number]>(),
  maxBranches: integer('max_branches').default(1),
  maxMembers: integer('max_members').default(100),
  maxEmployees: integer('max_employees').default(10),
  maxStorageMb: integer('max_storage_mb').default(1024),
  tenantStatus: varchar('tenant_status', { length: 20 }).default('trial').$type<typeof TENANT_STATUS[number]>(),
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  billingCycle: varchar('billing_cycle', { length: 20 }).default('monthly').$type<typeof BILLING_CYCLE[number]>(),
  nextBillingDate: date('next_billing_date'),
  monthlyPrice: decimal('monthly_price', { precision: 10, scale: 2 }),
  settings: jsonb('settings').default({}),
  createdBy: uuid('created_by'),
}, (table) => [
  index('idx_tenants_status').on(table.status),
  index('idx_tenants_tenant_status').on(table.tenantStatus),
  index('idx_tenants_slug').on(table.slug),
  index('idx_tenants_plan_type').on(table.planType),
]);

// =============================================================================
// CORE BUSINESS TABLES
// =============================================================================

export const branches = pgTable('branches', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  dateUpdated: timestamp('date_updated', { withTimezone: true }),
  name: varchar('name', { length: 255 }).notNull(),
  type: varchar('type', { length: 20 }).notNull().$type<typeof BRANCH_TYPE[number]>(),
  address: text('address'),
  phone: varchar('phone', { length: 50 }),
  taxId: varchar('tax_id', { length: 20 }),
  settings: jsonb('settings').default({}),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
}, (table) => [
  index('idx_branches_tenant_id').on(table.tenantId),
  index('idx_branches_tenant_status').on(table.tenantId, table.status),
]);

export const jobTitles = pgTable('job_titles', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  dateUpdated: timestamp('date_updated', { withTimezone: true }),
  name: varchar('name', { length: 100 }).notNull(),
  permissionsConfig: jsonb('permissions_config').default({}),
});

export const employees = pgTable('employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  dateUpdated: timestamp('date_updated', { withTimezone: true }),
  employeeCode: varchar('employee_code', { length: 20 }).unique(),
  fullName: varchar('full_name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  branchId: uuid('branch_id').references(() => branches.id),
  jobTitleId: uuid('job_title_id').references(() => jobTitles.id),
  userId: uuid('user_id').references(() => users.id),
  employmentStatus: varchar('employment_status', { length: 20 }).default('ACTIVE').$type<typeof EMPLOYMENT_STATUS[number]>(),
  employmentType: varchar('employment_type', { length: 20 }).$type<typeof EMPLOYMENT_TYPE[number]>(),
  hireDate: date('hire_date'),
  basicSalary: decimal('basic_salary', { precision: 12, scale: 2 }),
  customPermissions: jsonb('custom_permissions'),
  tenantId: uuid('tenant_id'),
}, (table) => [
  index('idx_employees_branch').on(table.branchId),
  index('idx_employees_tenant').on(table.tenantId),
]);

export const membershipPlans = pgTable('membership_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  dateUpdated: timestamp('date_updated', { withTimezone: true }),
  name: varchar('name', { length: 100 }).notNull(),
  planType: varchar('plan_type', { length: 20 }).notNull().$type<typeof PLAN_TYPE[number]>(),
  durationMonths: integer('duration_months'),
  classCounts: integer('class_counts'),
  price: decimal('price', { precision: 12, scale: 2 }).notNull(),
  allowTransfer: boolean('allow_transfer').default(false),
  allowPause: boolean('allow_pause').default(false),
  description: text('description'),
});

export const members = pgTable('members', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  dateUpdated: timestamp('date_updated', { withTimezone: true }),
  memberCode: varchar('member_code', { length: 20 }).unique(),
  fullName: varchar('full_name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  branchId: uuid('branch_id').references(() => branches.id),
  memberStatus: varchar('member_status', { length: 20 }).default('ACTIVE').$type<typeof MEMBER_STATUS[number]>(),
  joinDate: date('join_date'),
  salesPersonId: uuid('sales_person_id').references(() => employees.id),
  gender: varchar('gender', { length: 10 }).$type<typeof GENDER[number]>(),
  birthday: date('birthday'),
  address: text('address'),
  emergencyContact: varchar('emergency_contact', { length: 100 }),
  emergencyPhone: varchar('emergency_phone', { length: 50 }),
  tags: jsonb('tags'),
  notes: text('notes'),
  height: real('height'),
  tenantId: uuid('tenant_id'),
}, (table) => [
  index('idx_members_branch').on(table.branchId),
  index('idx_members_status').on(table.memberStatus),
  index('idx_members_tenant').on(table.tenantId),
]);

export const contracts = pgTable('contracts', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  dateUpdated: timestamp('date_updated', { withTimezone: true }),
  contractNo: varchar('contract_no', { length: 30 }).unique(),
  memberId: uuid('member_id').notNull().references(() => members.id),
  planId: uuid('plan_id').references(() => membershipPlans.id),
  signDate: date('sign_date'),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  originalEndDate: date('original_end_date'),
  contractStatus: varchar('contract_status', { length: 20 }).default('DRAFT').$type<typeof CONTRACT_STATUS[number]>(),
  remainingCounts: integer('remaining_counts'),
  totalAmount: decimal('total_amount', { precision: 12, scale: 2 }),
  paymentStatus: varchar('payment_status', { length: 20 }).default('UNPAID').$type<typeof PAYMENT_STATUS[number]>(),
  salesPersonId: uuid('sales_person_id').references(() => employees.id),
  branchId: uuid('branch_id').references(() => branches.id),
  notes: text('notes'),
  digitalSignature: uuid('digital_signature'),
  contractPdf: uuid('contract_pdf'),
  tenantId: uuid('tenant_id'),
}, (table) => [
  index('idx_contracts_member').on(table.memberId),
  index('idx_contracts_branch').on(table.branchId),
  index('idx_contracts_status').on(table.contractStatus),
  index('idx_contracts_tenant').on(table.tenantId),
]);

export const contractLogs = pgTable('contract_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  contractId: uuid('contract_id').notNull().references(() => contracts.id),
  logType: varchar('log_type', { length: 20 }).notNull().$type<typeof LOG_TYPE[number]>(),
  startDate: date('start_date'),
  endDate: date('end_date'),
  daysAffected: integer('days_affected'),
  reason: text('reason'),
  createdByEmployee: uuid('created_by_employee').references(() => employees.id),
  branchId: uuid('branch_id').references(() => branches.id),
  originalMemberId: uuid('original_member_id').references(() => members.id),
  targetMemberId: uuid('target_member_id').references(() => members.id),
}, (table) => [
  index('idx_contract_logs_contract').on(table.contractId),
]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  dateUpdated: timestamp('date_updated', { withTimezone: true }),
  contractId: uuid('contract_id').references(() => contracts.id),
  memberId: uuid('member_id').references(() => members.id),
  amount: decimal('amount', { precision: 12, scale: 2 }).notNull(),
  paymentMethod: varchar('payment_method', { length: 20 }).$type<typeof PAYMENT_METHOD[number]>(),
  paymentDate: timestamp('payment_date', { withTimezone: true }),
  paymentType: varchar('payment_type', { length: 20 }).default('INCOME').$type<typeof PAYMENT_TYPE[number]>(),
  branchId: uuid('branch_id').references(() => branches.id),
  receivedBy: uuid('received_by').references(() => employees.id),
  notes: text('notes'),
  tenantId: uuid('tenant_id'),
}, (table) => [
  index('idx_payments_contract').on(table.contractId),
  index('idx_payments_branch').on(table.branchId),
  index('idx_payments_tenant').on(table.tenantId),
]);

// =============================================================================
// HR TABLES
// =============================================================================

export const attendances = pgTable('attendances', {
  id: uuid('id').primaryKey().defaultRandom(),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  checkIn: timestamp('check_in', { withTimezone: true }),
  checkOut: timestamp('check_out', { withTimezone: true }),
  workHours: decimal('work_hours', { precision: 5, scale: 2 }),
  branchId: uuid('branch_id').references(() => branches.id),
  locationIp: varchar('location_ip', { length: 50 }),
  locationGps: varchar('location_gps', { length: 255 }),
}, (table) => [
  index('idx_attendances_employee').on(table.employeeId),
]);

export const leaveRequests = pgTable('leave_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  dateUpdated: timestamp('date_updated', { withTimezone: true }),
  employeeId: uuid('employee_id').notNull().references(() => employees.id),
  leaveType: varchar('leave_type', { length: 20 }).notNull().$type<typeof LEAVE_TYPE[number]>(),
  startDate: timestamp('start_date', { withTimezone: true }).notNull(),
  endDate: timestamp('end_date', { withTimezone: true }).notNull(),
  leaveStatus: varchar('leave_status', { length: 20 }).default('PENDING').$type<typeof LEAVE_STATUS[number]>(),
  approverId: uuid('approver_id').references(() => employees.id),
  reason: text('reason'),
}, (table) => [
  index('idx_leave_requests_employee').on(table.employeeId),
]);

// =============================================================================
// CLASS BOOKING SYSTEM
// =============================================================================

export const classes = pgTable('classes', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  dateUpdated: timestamp('date_updated', { withTimezone: true }),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  durationMinutes: integer('duration_minutes').notNull().default(60),
  maxCapacity: integer('max_capacity').notNull().default(20),
  instructorId: uuid('instructor_id').references(() => employees.id),
  branchId: uuid('branch_id').notNull().references(() => branches.id),
  category: varchar('category', { length: 50 }).$type<typeof CLASS_CATEGORY[number]>(),
  difficultyLevel: varchar('difficulty_level', { length: 20 }).default('BEGINNER').$type<typeof DIFFICULTY_LEVEL[number]>(),
  imageUrl: varchar('image_url', { length: 500 }),
  isActive: boolean('is_active').default(true),
  requiresCount: boolean('requires_count').default(true),
  countDeduction: integer('count_deduction').default(1),
}, (table) => [
  index('idx_classes_branch').on(table.branchId),
  index('idx_classes_category').on(table.category, table.isActive),
]);

export const classSchedules = pgTable('class_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  dateUpdated: timestamp('date_updated', { withTimezone: true }),
  classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id').notNull().references(() => branches.id),
  instructorId: uuid('instructor_id').references(() => employees.id),
  dayOfWeek: integer('day_of_week').notNull(),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  room: varchar('room', { length: 50 }),
  maxCapacity: integer('max_capacity'),
  isRecurring: boolean('is_recurring').default(true),
  validFrom: date('valid_from'),
  validUntil: date('valid_until'),
}, (table) => [
  index('idx_schedules_class').on(table.classId),
  uniqueIndex('uq_schedule').on(table.classId, table.branchId, table.dayOfWeek, table.startTime),
]);

export const classSessions = pgTable('class_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  dateUpdated: timestamp('date_updated', { withTimezone: true }),
  scheduleId: uuid('schedule_id').references(() => classSchedules.id),
  classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id').notNull().references(() => branches.id),
  instructorId: uuid('instructor_id').references(() => employees.id),
  sessionDate: date('session_date').notNull(),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  room: varchar('room', { length: 50 }),
  maxCapacity: integer('max_capacity').notNull(),
  currentCount: integer('current_count').default(0),
  waitlistCount: integer('waitlist_count').default(0),
  sessionStatus: varchar('session_status', { length: 20 }).default('SCHEDULED').$type<typeof SESSION_STATUS[number]>(),
  cancelledReason: text('cancelled_reason'),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancelledBy: uuid('cancelled_by'),
}, (table) => [
  index('idx_sessions_date').on(table.branchId, table.sessionDate, table.startTime),
  uniqueIndex('uq_session').on(table.classId, table.branchId, table.sessionDate, table.startTime),
]);

export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  dateUpdated: timestamp('date_updated', { withTimezone: true }),
  sessionId: uuid('session_id').notNull().references(() => classSessions.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').notNull().references(() => members.id),
  contractId: uuid('contract_id').references(() => contracts.id),
  bookingStatus: varchar('booking_status', { length: 20 }).default('CONFIRMED').$type<typeof BOOKING_STATUS[number]>(),
  waitlistPosition: integer('waitlist_position'),
  bookedAt: timestamp('booked_at', { withTimezone: true }).defaultNow(),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  cancelReason: text('cancel_reason'),
  attendedAt: timestamp('attended_at', { withTimezone: true }),
  countDeducted: boolean('count_deducted').default(false),
}, (table) => [
  index('idx_bookings_member').on(table.memberId, table.bookingStatus),
  index('idx_bookings_session').on(table.sessionId, table.bookingStatus),
  uniqueIndex('uq_member_session').on(table.sessionId, table.memberId),
]);

// =============================================================================
// CHECK-IN SYSTEM
// =============================================================================

export const checkIns = pgTable('check_ins', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  dateUpdated: timestamp('date_updated', { withTimezone: true }),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
  checkInTime: timestamp('check_in_time', { withTimezone: true }).defaultNow(),
  checkInMethod: varchar('check_in_method', { length: 20 }).notNull().$type<typeof CHECKIN_METHOD[number]>(),
  locationIp: varchar('location_ip', { length: 50 }),
  locationDevice: varchar('location_device', { length: 100 }),
  notes: text('notes'),
}, (table) => [
  index('idx_check_ins_member_id').on(table.memberId),
  index('idx_check_ins_branch_id').on(table.branchId),
  index('idx_check_ins_time').on(table.checkInTime),
]);

// =============================================================================
// NOTIFICATIONS
// =============================================================================

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  notificationType: varchar('notification_type', { length: 50 }).notNull(),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message'),
  referenceType: varchar('reference_type', { length: 255 }),
  referenceId: uuid('reference_id'),
  branchId: uuid('branch_id').references(() => branches.id),
  targetUserId: uuid('target_user_id').references(() => users.id),
  isRead: boolean('is_read').default(false),
  readAt: timestamp('read_at', { withTimezone: true }),
});

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  userId: uuid('user_id').references(() => users.id),
  memberId: uuid('member_id').references(() => members.id),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
});

// =============================================================================
// OTP AUTHENTICATION
// =============================================================================

export const otpTokens = pgTable('otp_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifier: varchar('identifier', { length: 100 }).notNull(),
  identifierType: varchar('identifier_type', { length: 20 }).notNull().$type<typeof OTP_TYPE[number]>(),
  code: varchar('code', { length: 6 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  attempts: integer('attempts').default(0),
  maxAttempts: integer('max_attempts').default(3),
  verified: boolean('verified').default(false),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
});

export const otpSendLogs = pgTable('otp_send_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  identifier: varchar('identifier', { length: 100 }).notNull(),
  identifierType: varchar('identifier_type', { length: 20 }).notNull().$type<typeof OTP_TYPE[number]>(),
  sentAt: timestamp('sent_at', { withTimezone: true }).defaultNow(),
  ipAddress: inet('ip_address'),
  success: boolean('success').default(true),
  errorMessage: text('error_message'),
});

// =============================================================================
// BILLING & SUBSCRIPTIONS
// =============================================================================

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  dateUpdated: timestamp('date_updated', { withTimezone: true }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  planType: varchar('plan_type', { length: 50 }).notNull().$type<typeof TENANT_PLAN[number]>(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  billingCycle: varchar('billing_cycle', { length: 20 }).notNull().default('monthly').$type<typeof BILLING_CYCLE[number]>(),
  currentPeriodStart: date('current_period_start').notNull(),
  currentPeriodEnd: date('current_period_end').notNull(),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  monthlyPrice: decimal('monthly_price', { precision: 10, scale: 2 }),
  yearlyPrice: decimal('yearly_price', { precision: 10, scale: 2 }),
  metadata: jsonb('metadata').default({}),
}, (table) => [
  index('idx_subscriptions_tenant').on(table.tenantId),
  index('idx_subscriptions_status').on(table.status),
]);

export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  dateUpdated: timestamp('date_updated', { withTimezone: true }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  subscriptionId: uuid('subscription_id').references(() => subscriptions.id, { onDelete: 'set null' }),
  invoiceNumber: varchar('invoice_number', { length: 50 }).unique().notNull(),
  amountSubtotal: decimal('amount_subtotal', { precision: 10, scale: 2 }).notNull(),
  amountTax: decimal('amount_tax', { precision: 10, scale: 2 }).default('0'),
  amountTotal: decimal('amount_total', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('TWD'),
  status: varchar('status', { length: 20 }).notNull().default('draft'),
  dueDate: date('due_date').notNull(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  paymentMethod: varchar('payment_method', { length: 50 }),
  paymentTransactionId: varchar('payment_transaction_id', { length: 100 }),
  lineItems: jsonb('line_items').default([]),
  notes: text('notes'),
  metadata: jsonb('metadata').default({}),
}, (table) => [
  index('idx_invoices_tenant').on(table.tenantId),
  index('idx_invoices_status').on(table.status),
]);

export const usageRecords = pgTable('usage_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  recordDate: date('record_date').notNull().default(sql`CURRENT_DATE`),
  membersCount: integer('members_count').default(0),
  employeesCount: integer('employees_count').default(0),
  branchesCount: integer('branches_count').default(0),
  storageMb: integer('storage_mb').default(0),
  apiCallsCount: integer('api_calls_count').default(0),
  apiBandwidthMb: integer('api_bandwidth_mb').default(0),
  activeContractsCount: integer('active_contracts_count').default(0),
  dailyRevenue: decimal('daily_revenue', { precision: 12, scale: 2 }).default('0'),
  metadata: jsonb('metadata').default({}),
}, (table) => [
  index('idx_usage_records_tenant').on(table.tenantId),
  uniqueIndex('uq_usage_tenant_date').on(table.tenantId, table.recordDate),
]);

// =============================================================================
// AUDIT LOGS
// =============================================================================

export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  userId: uuid('user_id'),
  employeeId: uuid('employee_id').references(() => employees.id, { onDelete: 'set null' }),
  branchId: uuid('branch_id').references(() => branches.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 50 }).notNull().$type<typeof AUDIT_ACTION[number]>(),
  resourceType: varchar('resource_type', { length: 100 }).notNull(),
  resourceId: uuid('resource_id'),
  description: text('description'),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  diff: jsonb('diff'),
  requestMethod: varchar('request_method', { length: 10 }),
  requestPath: text('request_path'),
  requestParams: jsonb('request_params'),
  responseStatus: integer('response_status'),
  responseTimeMs: integer('response_time_ms'),
  severity: varchar('severity', { length: 20 }).default('info').$type<typeof AUDIT_SEVERITY[number]>(),
  category: varchar('category', { length: 50 }),
  metadata: jsonb('metadata').default({}),
}, (table) => [
  index('idx_audit_logs_tenant').on(table.tenantId),
  index('idx_audit_logs_user').on(table.userId),
  index('idx_audit_logs_action').on(table.action),
  index('idx_audit_logs_date').on(table.dateCreated),
]);

// =============================================================================
// FILES TABLE (replacing directus_files)
// =============================================================================

export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  dateCreated: timestamp('date_created', { withTimezone: true }).defaultNow(),
  dateUpdated: timestamp('date_updated', { withTimezone: true }),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  filename: varchar('filename', { length: 255 }).notNull(),
  originalFilename: varchar('original_filename', { length: 255 }),
  mimeType: varchar('mime_type', { length: 100 }),
  size: integer('size'),
  storageKey: varchar('storage_key', { length: 500 }).notNull(),
  folder: varchar('folder', { length: 255 }),
  title: varchar('title', { length: 255 }),
  description: text('description'),
  width: integer('width'),
  height: integer('height'),
  metadata: jsonb('metadata').default({}),
}, (table) => [
  index('idx_files_tenant').on(table.tenantId),
  index('idx_files_folder').on(table.folder),
]);

// =============================================================================
// RELATIONS
// =============================================================================

export const usersRelations = relations(users, ({ one, many }) => ({
  employee: one(employees, {
    fields: [users.employeeId],
    references: [employees.id],
  }),
  tenant: one(tenants, {
    fields: [users.tenantId],
    references: [tenants.id],
  }),
  sessions: many(sessions),
}));

export const tenantsRelations = relations(tenants, ({ many }) => ({
  branches: many(branches),
  subscriptions: many(subscriptions),
  invoices: many(invoices),
  usageRecords: many(usageRecords),
}));

export const branchesRelations = relations(branches, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [branches.tenantId],
    references: [tenants.id],
  }),
  employees: many(employees),
  members: many(members),
  contracts: many(contracts),
  classes: many(classes),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  branch: one(branches, {
    fields: [employees.branchId],
    references: [branches.id],
  }),
  jobTitle: one(jobTitles, {
    fields: [employees.jobTitleId],
    references: [jobTitles.id],
  }),
  user: one(users, {
    fields: [employees.userId],
    references: [users.id],
  }),
  attendances: many(attendances),
  leaveRequests: many(leaveRequests),
}));

export const membersRelations = relations(members, ({ one, many }) => ({
  branch: one(branches, {
    fields: [members.branchId],
    references: [branches.id],
  }),
  salesPerson: one(employees, {
    fields: [members.salesPersonId],
    references: [employees.id],
  }),
  contracts: many(contracts),
  bookings: many(bookings),
  checkIns: many(checkIns),
}));

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  member: one(members, {
    fields: [contracts.memberId],
    references: [members.id],
  }),
  plan: one(membershipPlans, {
    fields: [contracts.planId],
    references: [membershipPlans.id],
  }),
  branch: one(branches, {
    fields: [contracts.branchId],
    references: [branches.id],
  }),
  salesPerson: one(employees, {
    fields: [contracts.salesPersonId],
    references: [employees.id],
  }),
  logs: many(contractLogs),
  payments: many(payments),
}));

export const classesRelations = relations(classes, ({ one, many }) => ({
  branch: one(branches, {
    fields: [classes.branchId],
    references: [branches.id],
  }),
  instructor: one(employees, {
    fields: [classes.instructorId],
    references: [employees.id],
  }),
  schedules: many(classSchedules),
  sessions: many(classSessions),
}));

export const classSessionsRelations = relations(classSessions, ({ one, many }) => ({
  class: one(classes, {
    fields: [classSessions.classId],
    references: [classes.id],
  }),
  schedule: one(classSchedules, {
    fields: [classSessions.scheduleId],
    references: [classSchedules.id],
  }),
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  session: one(classSessions, {
    fields: [bookings.sessionId],
    references: [classSessions.id],
  }),
  member: one(members, {
    fields: [bookings.memberId],
    references: [members.id],
  }),
  contract: one(contracts, {
    fields: [bookings.contractId],
    references: [contracts.id],
  }),
}));
