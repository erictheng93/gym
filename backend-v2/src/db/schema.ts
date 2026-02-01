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
export const EMPLOYMENT_STATUS = ['ACTIVE', 'RESIGNED', 'LEAVE'] as const;
export const EMPLOYMENT_TYPE = ['FULL_TIME', 'PART_TIME', 'FREELANCE'] as const;
export const MEMBER_STATUS = ['ACTIVE', 'EXPIRED', 'SUSPENDED', 'BANNED'] as const;
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
});

export const sessions = pgTable('sessions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// =============================================================================
// MULTI-TENANT TABLES
// =============================================================================

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
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
  status: varchar('status', { length: 20 }).default('published'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 20 }).notNull(),
  type: varchar('type', { length: 20 }).notNull().default('BRANCH').$type<typeof BRANCH_TYPE[number]>(),
  address: text('address'),
  phone: varchar('phone', { length: 50 }),
  taxId: varchar('tax_id', { length: 20 }),
  settings: jsonb('settings').default({}),
  tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
}, (table) => [
  index('idx_branches_tenant_id').on(table.tenantId),
  index('idx_branches_tenant_status').on(table.tenantId, table.status),
]);

export const jobTitles = pgTable('job_titles', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  name: varchar('name', { length: 100 }).notNull(),
  code: varchar('code', { length: 20 }).notNull(),
  description: text('description'),
  level: integer('level').default(0),
  sort: integer('sort'),
  permissionsConfig: jsonb('permissions_config').notNull().default('{}'),
  tenantId: uuid('tenant_id').references(() => tenants.id),
}, (table) => [
  index('idx_job_titles_tenant').on(table.tenantId),
]);

export const employees = pgTable('employees', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  branchId: uuid('branch_id').notNull().references(() => branches.id),
  jobTitleId: uuid('job_title_id').notNull().references(() => jobTitles.id),
  employeeCode: varchar('employee_code', { length: 20 }).notNull().unique(),
  fullName: varchar('full_name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 50 }),
  email: varchar('email', { length: 255 }),
  status: varchar('status', { length: 20 }).notNull().default('ACTIVE').$type<typeof EMPLOYMENT_STATUS[number]>(),
  employmentType: varchar('employment_type', { length: 20 }).notNull().$type<typeof EMPLOYMENT_TYPE[number]>(),
  hireDate: date('hire_date').notNull(),
  resignDate: date('resign_date'),
  basicSalary: decimal('basic_salary', { precision: 12, scale: 2 }),
  customPermissions: jsonb('custom_permissions'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  tenantId: uuid('tenant_id'),
}, (table) => [
  index('idx_employees_branch').on(table.branchId),
  index('idx_employees_tenant').on(table.tenantId),
]);

export const membershipPlans = pgTable('membership_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  code: varchar('code', { length: 20 }).notNull(),
  planType: varchar('type', { length: 20 }).notNull().$type<typeof PLAN_TYPE[number]>(),
  description: text('description'),
  durationMonths: integer('duration_months'),
  classCounts: integer('class_counts'),
  price: decimal('price', { precision: 12, scale: 2 }).notNull(),
  allowPause: boolean('allow_pause').notNull().default(false),
  maxPauseDays: integer('max_pause_days'),
  allowTransfer: boolean('allow_transfer').notNull().default(false),
  isActive: boolean('is_active').notNull().default(true),
  sort: integer('sort'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  tenantId: uuid('tenant_id').references(() => tenants.id),
  branchId: uuid('branch_id').references(() => branches.id),
}, (table) => [
  index('idx_membership_plans_tenant').on(table.tenantId),
  index('idx_membership_plans_branch').on(table.branchId),
]);

export const members = pgTable('members', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberCode: varchar('member_code', { length: 20 }).notNull().unique(),
  fullName: varchar('full_name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 50 }).notNull(),
  email: varchar('email', { length: 255 }),
  gender: varchar('gender', { length: 10 }).$type<typeof GENDER[number]>(),
  birthday: date('birthday'),
  idNumber: varchar('id_number', { length: 20 }),
  address: text('address'),
  emergencyContact: varchar('emergency_contact', { length: 100 }),
  emergencyPhone: varchar('emergency_phone', { length: 50 }),
  branchId: uuid('branch_id').notNull().references(() => branches.id),
  salesPersonId: uuid('sales_person_id').references(() => employees.id),
  status: varchar('status', { length: 20 }).notNull().default('ACTIVE').$type<typeof MEMBER_STATUS[number]>(),
  joinDate: date('join_date').notNull(),
  tags: jsonb('tags'),
  notes: text('notes'),
  avatar: uuid('avatar'),
  height: real('height'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  tenantId: uuid('tenant_id'),
}, (table) => [
  index('idx_members_branch').on(table.branchId),
  index('idx_members_status').on(table.status),
  index('idx_members_tenant').on(table.tenantId),
]);

export const contracts = pgTable('contracts', {
  id: uuid('id').primaryKey().defaultRandom(),
  contractNo: varchar('contract_no', { length: 30 }).notNull().unique(),
  memberId: uuid('member_id').notNull().references(() => members.id),
  planId: uuid('plan_id').notNull().references(() => membershipPlans.id),
  branchId: uuid('branch_id').notNull().references(() => branches.id),
  salesPersonId: uuid('sales_person_id').references(() => employees.id),
  status: varchar('status', { length: 20 }).notNull().default('published').$type<typeof CONTRACT_STATUS[number]>(),
  signDate: date('sign_date'),
  startDate: date('start_date').notNull(),
  originalEndDate: date('original_end_date').notNull(),
  endDate: date('end_date').notNull(),
  remainingCounts: integer('remaining_counts'),
  totalAmount: decimal('total_amount', { precision: 12, scale: 2 }).notNull(),
  paidAmount: decimal('paid_amount', { precision: 12, scale: 2 }).notNull().default('0'),
  paymentStatus: varchar('payment_status', { length: 20 }).notNull().default('UNPAID').$type<typeof PAYMENT_STATUS[number]>(),
  digitalSignature: uuid('digital_signature'),
  contractPdf: uuid('contract_pdf'),
  termsAccepted: boolean('terms_accepted').notNull().default(false),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => employees.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  tenantId: uuid('tenant_id'),
}, (table) => [
  index('idx_contracts_member').on(table.memberId),
  index('idx_contracts_branch').on(table.branchId),
  index('idx_contracts_status').on(table.status),
  index('idx_contracts_tenant').on(table.tenantId),
]);

export const contractLogs = pgTable('contract_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  contractId: uuid('contract_id').notNull().references(() => contracts.id),
  logType: varchar('log_type', { length: 20 }).notNull().$type<typeof LOG_TYPE[number]>(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  days: integer('days').notNull(),
  reason: varchar('reason', { length: 255 }),
  originalMemberId: uuid('original_member_id').references(() => members.id),
  targetMemberId: uuid('target_member_id').references(() => members.id),
  createdBy: uuid('created_by').references(() => employees.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  tenantId: uuid('tenant_id').references(() => tenants.id),
}, (table) => [
  index('idx_contract_logs_contract').on(table.contractId),
]);

export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().defaultRandom(),
  contractId: uuid('contract_id').notNull().references(() => contracts.id),
  memberId: uuid('member_id').notNull().references(() => members.id),
  branchId: uuid('branch_id').notNull().references(() => branches.id),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  paymentMethod: varchar('payment_method', { length: 20 }).notNull().$type<typeof PAYMENT_METHOD[number]>(),
  paymentDate: timestamp('payment_date', { withTimezone: true }).defaultNow().notNull(),
  type: varchar('type', { length: 20 }).notNull().default('INCOME').$type<typeof PAYMENT_TYPE[number]>(),
  receiptNo: varchar('receipt_no', { length: 30 }),
  notes: varchar('notes', { length: 255 }),
  createdBy: uuid('created_by').references(() => employees.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  tenantId: uuid('tenant_id'),
}, (table) => [
  index('idx_payments_contract').on(table.contractId),
  index('idx_payments_branch').on(table.branchId),
  index('idx_payments_member').on(table.memberId),
]);

// =============================================================================
// HR TABLES
// =============================================================================

export const attendances = pgTable('attendances', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
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

export const CHECKIN_TYPE = ['ENTRY', 'CLASS', 'FACILITY'] as const;

export const checkIns = pgTable('check_ins', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id').notNull().references(() => branches.id, { onDelete: 'cascade' }),
  contractId: uuid('contract_id').references(() => contracts.id, { onDelete: 'set null' }),
  checkInTime: timestamp('check_in_time', { withTimezone: true }).defaultNow(),
  checkInType: varchar('check_in_type', { length: 20 }).default('ENTRY').$type<typeof CHECKIN_TYPE[number]>(),
  checkInMethod: varchar('check_in_method', { length: 20 }).$type<typeof CHECKIN_METHOD[number]>(),
  processedById: uuid('processed_by_id').references(() => employees.id),
  locationIp: varchar('location_ip', { length: 50 }),
  locationDevice: varchar('location_device', { length: 100 }),
  notes: text('notes'),
}, (table) => [
  index('idx_check_ins_member_id').on(table.memberId),
  index('idx_check_ins_branch_id').on(table.branchId),
  index('idx_check_ins_time').on(table.checkInTime),
]);

// =============================================================================
// LEADS (潛在客戶)
// =============================================================================

export const LEAD_SOURCE = ['WALK_IN', 'REFERRAL', 'WEBSITE', 'SOCIAL_MEDIA', 'EVENT', 'AD', 'OTHER'] as const;
export const LEAD_STATUS = ['NEW', 'CONTACTED', 'QUALIFIED', 'TRIAL', 'NEGOTIATION', 'CONVERTED', 'LOST'] as const;

export const leads = pgTable('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  fullName: varchar('full_name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  email: varchar('email', { length: 100 }),
  source: varchar('source', { length: 30 }).$type<typeof LEAD_SOURCE[number]>(),
  sourceDetail: text('source_detail'),
  branchId: uuid('branch_id').notNull().references(() => branches.id),
  assignedToId: uuid('assigned_to_id').references(() => employees.id),
  leadStatus: varchar('lead_status', { length: 30 }).default('NEW').$type<typeof LEAD_STATUS[number]>(),
  notes: text('notes'),
  interests: jsonb('interests').default([]),
  expectedBudget: decimal('expected_budget', { precision: 10, scale: 2 }),
  convertedMemberId: uuid('converted_member_id').references(() => members.id),
  convertedAt: timestamp('converted_at', { withTimezone: true }),
}, (table) => [
  index('idx_leads_branch').on(table.branchId),
  index('idx_leads_status').on(table.leadStatus),
  index('idx_leads_assigned').on(table.assignedToId),
]);

// =============================================================================
// CAMPAIGNS (行銷活動)
// =============================================================================

export const CAMPAIGN_TYPE = ['PROMOTION', 'REFERRAL', 'SEASONAL', 'MEMBERSHIP', 'EVENT', 'OTHER'] as const;
export const DISCOUNT_TYPE = ['PERCENTAGE', 'FIXED', 'FREE_TRIAL', 'GIFT'] as const;

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  branchId: uuid('branch_id').references(() => branches.id),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  campaignType: varchar('campaign_type', { length: 30 }).$type<typeof CAMPAIGN_TYPE[number]>(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  targetAudience: text('target_audience'),
  budget: decimal('budget', { precision: 10, scale: 2 }),
  discountType: varchar('discount_type', { length: 30 }).$type<typeof DISCOUNT_TYPE[number]>(),
  discountValue: decimal('discount_value', { precision: 10, scale: 2 }),
  isActive: boolean('is_active').default(true),
  terms: text('terms'),
  createdById: uuid('created_by_id').references(() => employees.id),
}, (table) => [
  index('idx_campaigns_tenant').on(table.tenantId),
  index('idx_campaigns_dates').on(table.startDate, table.endDate),
]);

// =============================================================================
// COUPONS (優惠券)
// =============================================================================

export const COUPON_DISCOUNT_TYPE = ['PERCENTAGE', 'FIXED'] as const;

export const coupons = pgTable('coupons', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id),
  branchId: uuid('branch_id').references(() => branches.id),
  campaignId: uuid('campaign_id').references(() => campaigns.id),
  code: varchar('code', { length: 20 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  description: text('description'),
  discountType: varchar('discount_type', { length: 20 }).notNull().$type<typeof COUPON_DISCOUNT_TYPE[number]>(),
  discountValue: decimal('discount_value', { precision: 10, scale: 2 }).notNull(),
  minPurchase: decimal('min_purchase', { precision: 10, scale: 2 }),
  maxDiscount: decimal('max_discount', { precision: 10, scale: 2 }),
  validFrom: date('valid_from').notNull(),
  validUntil: date('valid_until').notNull(),
  usageLimit: integer('usage_limit'),
  usageLimitPerMember: integer('usage_limit_per_member').default(1),
  isActive: boolean('is_active').default(true),
  applicablePlans: jsonb('applicable_plans').default([]),
}, (table) => [
  index('idx_coupons_tenant').on(table.tenantId),
  index('idx_coupons_code').on(table.code),
  uniqueIndex('uq_coupons_code_tenant').on(table.code, table.tenantId),
]);

export const couponUsages = pgTable('coupon_usages', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  couponId: uuid('coupon_id').notNull().references(() => coupons.id, { onDelete: 'cascade' }),
  memberId: uuid('member_id').references(() => members.id),
  contractId: uuid('contract_id').references(() => contracts.id),
  discountAmount: decimal('discount_amount', { precision: 10, scale: 2 }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_coupon_usages_coupon').on(table.couponId),
  index('idx_coupon_usages_member').on(table.memberId),
]);

// =============================================================================
// NOTIFICATIONS
// =============================================================================

export const NOTIFICATION_PRIORITY = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  notificationType: varchar('notification_type', { length: 50 }),
  type: varchar('type', { length: 50 }),
  title: varchar('title', { length: 255 }).notNull(),
  message: text('message'),
  data: text('data'),
  referenceType: varchar('reference_type', { length: 255 }),
  referenceId: uuid('reference_id'),
  branchId: uuid('branch_id').references(() => branches.id),
  targetUserId: uuid('target_user_id').references(() => users.id),
  targetMemberId: uuid('target_member_id').references(() => members.id),
  targetEmployeeId: uuid('target_employee_id').references(() => employees.id),
  recipientType: varchar('recipient_type', { length: 20 }),
  recipientId: uuid('recipient_id'),
  priority: varchar('priority', { length: 20 }).default('NORMAL').$type<typeof NOTIFICATION_PRIORITY[number]>(),
  isRead: boolean('is_read').default(false),
  readStatus: boolean('read_status').default(false),
  readAt: timestamp('read_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  tenantId: uuid('tenant_id').references(() => tenants.id),
}, (table) => [
  index('idx_notifications_branch').on(table.branchId),
  index('idx_notifications_target_employee').on(table.targetEmployeeId),
  index('idx_notifications_tenant').on(table.tenantId),
  index('idx_notifications_recipient').on(table.recipientType, table.recipientId),
]);

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  userId: uuid('user_id').references(() => users.id),
  memberId: uuid('member_id').references(() => members.id),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  isActive: boolean('is_active').default(true),
  errorCount: integer('error_count').default(0),
  notifyBookingReminder: boolean('notify_booking_reminder').default(true),
  notifyClassCancelled: boolean('notify_class_cancelled').default(true),
  notifyContractExpiry: boolean('notify_contract_expiry').default(true),
  tenantId: uuid('tenant_id').references(() => tenants.id),
}, (table) => [
  index('idx_push_subscriptions_member').on(table.memberId),
  index('idx_push_subscriptions_user').on(table.userId),
]);

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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
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
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
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
  index('idx_audit_logs_date').on(table.createdAt),
]);

// =============================================================================
// FILES TABLE (replacing directus_files)
// =============================================================================

export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
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

// =============================================================================
// LEAD ACTIVITIES (潛在客戶活動記錄)
// =============================================================================

export const LEAD_ACTIVITY_TYPE = ['CALL', 'EMAIL', 'VISIT', 'TRIAL', 'FOLLOW_UP', 'NOTE', 'OTHER'] as const;

export const leadActivities = pgTable('lead_activities', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: varchar('status', { length: 20 }).default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  leadId: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  activityType: varchar('activity_type', { length: 30 }).notNull().$type<typeof LEAD_ACTIVITY_TYPE[number]>(),
  content: text('content'),
  createdBy: uuid('created_by').references(() => employees.id),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  outcome: text('outcome'),
  tenantId: uuid('tenant_id').references(() => tenants.id),
}, (table) => [
  index('idx_lead_activities_lead').on(table.leadId),
  index('idx_lead_activities_type').on(table.activityType),
]);

export const leadActivitiesRelations = relations(leadActivities, ({ one }) => ({
  lead: one(leads, {
    fields: [leadActivities.leadId],
    references: [leads.id],
  }),
  createdByEmployee: one(employees, {
    fields: [leadActivities.createdBy],
    references: [employees.id],
  }),
}));

export const leadsRelations = relations(leads, ({ one, many }) => ({
  branch: one(branches, {
    fields: [leads.branchId],
    references: [branches.id],
  }),
  assignedTo: one(employees, {
    fields: [leads.assignedToId],
    references: [employees.id],
  }),
  convertedMember: one(members, {
    fields: [leads.convertedMemberId],
    references: [members.id],
  }),
  activities: many(leadActivities),
}));

// =============================================================================
// MEMBER CREDENTIALS (Password Authentication)
// =============================================================================

export const memberCredentials = pgTable('member_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').notNull().unique().references(() => members.id, { onDelete: 'cascade' }),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  failedAttempts: integer('failed_attempts').default(0),
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
  passwordResetTokenHash: varchar('password_reset_token_hash', { length: 255 }),
  passwordResetExpiresAt: timestamp('password_reset_expires_at', { withTimezone: true }),
  lastPasswordChangeAt: timestamp('last_password_change_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (table) => [
  index('idx_member_credentials_member').on(table.memberId),
]);

// =============================================================================
// MEMBER SOCIAL ACCOUNTS (OAuth)
// =============================================================================

export const SOCIAL_PROVIDER = ['google', 'line', 'apple'] as const;

export const memberSocialAccounts = pgTable('member_social_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 20 }).notNull().$type<typeof SOCIAL_PROVIDER[number]>(),
  providerUserId: varchar('provider_user_id', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }),
  displayName: varchar('display_name', { length: 255 }),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
  rawProfile: jsonb('raw_profile'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (table) => [
  index('idx_member_social_member').on(table.memberId),
  uniqueIndex('uq_member_social_provider').on(table.provider, table.providerUserId),
]);

export const memberSocialAccountsRelations = relations(memberSocialAccounts, ({ one }) => ({
  member: one(members, {
    fields: [memberSocialAccounts.memberId],
    references: [members.id],
  }),
}));

// =============================================================================
// CLASS REVIEWS
// =============================================================================

export const classReviews = pgTable('class_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
  sessionId: uuid('session_id').references(() => classSessions.id, { onDelete: 'set null' }),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
  rating: integer('rating').notNull(), // 1-5
  comment: text('comment'),
  isAnonymous: boolean('is_anonymous').default(false),
  isPublic: boolean('is_public').default(true),
  // Moderation
  status: varchar('status', { length: 20 }).default('published'), // draft, published, hidden
  moderatedAt: timestamp('moderated_at', { withTimezone: true }),
  moderatedBy: uuid('moderated_by').references(() => employees.id),
  // Response from staff
  staffResponse: text('staff_response'),
  staffResponseAt: timestamp('staff_response_at', { withTimezone: true }),
  staffResponseBy: uuid('staff_response_by').references(() => employees.id),
  // Timestamps
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  tenantId: uuid('tenant_id').references(() => tenants.id),
}, (table) => [
  index('idx_class_reviews_member').on(table.memberId),
  index('idx_class_reviews_class').on(table.classId),
  index('idx_class_reviews_session').on(table.sessionId),
  uniqueIndex('uq_class_review_booking').on(table.bookingId),
]);

export const classReviewsRelations = relations(classReviews, ({ one }) => ({
  member: one(members, {
    fields: [classReviews.memberId],
    references: [members.id],
  }),
  class: one(classes, {
    fields: [classReviews.classId],
    references: [classes.id],
  }),
  session: one(classSessions, {
    fields: [classReviews.sessionId],
    references: [classSessions.id],
  }),
  booking: one(bookings, {
    fields: [classReviews.bookingId],
    references: [bookings.id],
  }),
}));

// =============================================================================
// WORKOUT LOGS
// =============================================================================

export const EXERCISE_CATEGORY = ['STRENGTH', 'CARDIO', 'FLEXIBILITY', 'BALANCE', 'OTHER'] as const;

// Note: This matches the existing database schema
export const workoutLogs = pgTable('workout_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  duration: integer('duration'), // minutes
  calories: integer('calories'),
  exercises: jsonb('exercises'), // [{ name, sets, reps, weight, duration }]
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_workout_logs_member').on(table.memberId),
  index('idx_workout_logs_date').on(table.date),
]);

// =============================================================================
// MEMBER GOALS
// =============================================================================

export const GOAL_TYPE = ['WEIGHT_LOSS', 'MUSCLE_GAIN', 'BODY_SHAPE', 'HEALTH', 'OTHER'] as const;
export const GOAL_STATUS = ['IN_PROGRESS', 'ACHIEVED', 'ABANDONED'] as const;

// Note: This matches the existing database schema
export const memberGoals = pgTable('member_goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  goalType: varchar('goal_type', { length: 20 }).notNull().$type<typeof GOAL_TYPE[number]>(),
  targetValue: jsonb('target_value').notNull(), // { value, unit }
  currentValue: jsonb('current_value'), // { value, unit }
  startDate: date('start_date').notNull(),
  targetDate: date('target_date'),
  status: varchar('status', { length: 20 }).default('IN_PROGRESS').$type<typeof GOAL_STATUS[number]>(),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (table) => [
  index('idx_member_goals_member').on(table.memberId),
  index('idx_member_goals_status').on(table.status),
]);

// =============================================================================
// BODY MEASUREMENTS
// =============================================================================

export const MEASUREMENT_SOURCE = ['MANUAL', 'INBODY', 'APPLE_HEALTH'] as const;

// Note: This matches the existing database schema
export const bodyMeasurements = pgTable('body_measurements', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  weight: real('weight'), // kg
  bodyFat: real('body_fat'), // %
  muscleMass: real('muscle_mass'), // kg
  bmi: real('bmi'),
  source: varchar('source', { length: 20 }).notNull().$type<typeof MEASUREMENT_SOURCE[number]>(),
  rawData: jsonb('raw_data'), // Original data from devices
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => [
  index('idx_body_measurements_member').on(table.memberId),
  index('idx_body_measurements_date').on(table.date),
]);

// =============================================================================
// ISSUE REPORTS
// =============================================================================

export const ISSUE_TYPE = ['EQUIPMENT', 'SERVICE', 'SUGGESTION', 'COMPLAINT'] as const;
export const ISSUE_STATUS = ['SUBMITTED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

// Note: This matches the existing database schema
export const issueReports = pgTable('issue_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  memberId: uuid('member_id').notNull().references(() => members.id, { onDelete: 'cascade' }),
  branchId: uuid('branch_id').notNull().references(() => branches.id),
  type: varchar('type', { length: 20 }).notNull().$type<typeof ISSUE_TYPE[number]>(),
  title: varchar('title', { length: 100 }).notNull(),
  content: text('content').notNull(),
  attachments: jsonb('attachments'),
  status: varchar('status', { length: 20 }).default('SUBMITTED').$type<typeof ISSUE_STATUS[number]>(),
  assignedTo: uuid('assigned_to').references(() => employees.id, { onDelete: 'set null' }),
  resolution: text('resolution'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (table) => [
  index('idx_issue_reports_member').on(table.memberId),
  index('idx_issue_reports_branch').on(table.branchId),
  index('idx_issue_reports_status').on(table.status),
]);

// =============================================================================
// MEMBER CHECK-INS TABLE (alias for routes compatibility)
// =============================================================================

export const memberCheckIns = checkIns;
