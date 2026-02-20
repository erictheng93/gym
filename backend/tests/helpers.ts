import { db, users, employees, branches, tenants, members, contracts, membershipPlans, sessions, jobTitles, checkIns, classes, classSessions, bookings, classReviews, classRecords, contractLogs, coachMemberAssignments, teachingMaterials, lessonPlans, coachNotes } from '../src/db/index.js';
import { hash } from '@node-rs/argon2';
import { eq, and } from 'drizzle-orm';
import app from '../src/app.js';
import { generateMemberTokens } from '../src/services/member-jwt.js';
import { generateCoachTokens } from '../src/services/coach-jwt.js';

// Test tenant and branch IDs
export const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
export const TEST_BRANCH_ID = '00000000-0000-0000-0000-000000000002';
export const TEST_USER_ID = '00000000-0000-0000-0000-000000000003';
export const TEST_EMPLOYEE_ID = '00000000-0000-0000-0000-000000000004';
export const TEST_MEMBER_ID = '00000000-0000-0000-0000-000000000005';
export const TEST_PLAN_ID = '00000000-0000-0000-0000-000000000006';
export const TEST_CONTRACT_ID = '00000000-0000-0000-0000-000000000007';
export const TEST_JOB_TITLE_ID = '00000000-0000-0000-0000-000000000008';

// Additional IDs for users tests
export const TEST_STAFF_USER_ID = '00000000-0000-0000-0000-000000000009';
export const TEST_STAFF_EMPLOYEE_ID = '00000000-0000-0000-0000-00000000000a';
export const TEST_UNLINKED_EMPLOYEE_ID = '00000000-0000-0000-0000-00000000000b';

// Additional plan IDs
export const TEST_COUNT_PLAN_ID = '00000000-0000-0000-0000-00000000000c';

// Class/session IDs
export const TEST_CLASS_ID = '00000000-0000-0000-0000-000000000010';
export const TEST_SCHEDULE_ID = '00000000-0000-0000-0000-000000000011';
export const TEST_SESSION_ID = '00000000-0000-0000-0000-000000000012';

// Coach-specific IDs
export const TEST_COACH_USER_ID = '00000000-0000-0000-0000-000000000020';
export const TEST_COACH_EMPLOYEE_ID = '00000000-0000-0000-0000-000000000021';
export const TEST_COACH_JOB_TITLE_ID = '00000000-0000-0000-0000-000000000022';
export const TEST_COACH_CLASS_ID = '00000000-0000-0000-0000-000000000023';
export const TEST_COACH_SESSION_ID = '00000000-0000-0000-0000-000000000024';
export const TEST_BOOKING_ID = '00000000-0000-0000-0000-000000000025';
export const TEST_ASSIGNMENT_ID = '00000000-0000-0000-0000-000000000026';
export const TEST_MATERIAL_ID = '00000000-0000-0000-0000-000000000027';
export const TEST_LESSON_PLAN_ID = '00000000-0000-0000-0000-000000000028';
export const TEST_COACH_EMAIL = 'coach@gym-nexus.test';
export const TEST_COACH_PASSWORD = 'CoachPass123!';

export const TEST_USER_EMAIL = 'test@gym-nexus.test';
export const TEST_USER_PASSWORD = 'TestPassword123!';
export const TEST_STAFF_EMAIL = 'staff@gym-nexus.test';
export const TEST_STAFF_PASSWORD = 'StaffPass123!';

/**
 * Create test fixtures in database
 */
export async function createTestFixtures() {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Create tenant
  await db.insert(tenants).values({
    id: TEST_TENANT_ID,
    name: 'Test Gym',
    slug: 'test-gym',
    email: 'admin@test-gym.test',
    status: 'active',
  }).onConflictDoNothing();

  // Create branch (with required code field)
  await db.insert(branches).values({
    id: TEST_BRANCH_ID,
    name: 'Test Branch',
    code: 'TST001',
    type: 'HEADQUARTER',
    tenantId: TEST_TENANT_ID,
    status: 'published',
  }).onConflictDoNothing();

  // Create job title (required for employees)
  await db.insert(jobTitles).values({
    id: TEST_JOB_TITLE_ID,
    name: 'Admin',
    code: 'ADMIN',
    permissionsConfig: '{}',
    tenantId: TEST_TENANT_ID,
  }).onConflictDoNothing();

  // Create test user
  const passwordHash = await hash(TEST_USER_PASSWORD);
  await db.insert(users).values({
    id: TEST_USER_ID,
    email: TEST_USER_EMAIL,
    passwordHash,
    role: 'admin',
    tenantId: TEST_TENANT_ID,
    isActive: true,
    emailVerified: true,
  }).onConflictDoNothing();

  // Create employee linked to user (with all required fields)
  // First delete any existing employee with this id or employeeCode to ensure clean state
  await db.delete(employees).where(eq(employees.id, TEST_EMPLOYEE_ID));
  await db.delete(employees).where(eq(employees.employeeCode, 'EMP001'));

  await db.insert(employees).values({
    id: TEST_EMPLOYEE_ID,
    fullName: 'Test Admin',
    email: TEST_USER_EMAIL,
    branchId: TEST_BRANCH_ID,
    jobTitleId: TEST_JOB_TITLE_ID,
    employeeCode: 'EMP001',
    userId: TEST_USER_ID,
    status: 'ACTIVE',
    employmentType: 'FULL_TIME',
    hireDate: todayStr,
    tenantId: TEST_TENANT_ID,
  });

  // Update user with employeeId
  await db.update(users).set({
    employeeId: TEST_EMPLOYEE_ID,
  }).where(eq(users.id, TEST_USER_ID));

  // Create test membership plan (with all required fields)
  await db.insert(membershipPlans).values({
    id: TEST_PLAN_ID,
    name: 'Test Monthly Plan',
    code: 'PLAN001',
    planType: 'TIME_BASED',
    durationMonths: 1,
    price: '1000',
    tenantId: TEST_TENANT_ID,
    branchId: TEST_BRANCH_ID,
    isActive: true,
    allowPause: true,
    allowTransfer: false,
  }).onConflictDoNothing();

  // Create COUNT_BASED membership plan
  await db.insert(membershipPlans).values({
    id: TEST_COUNT_PLAN_ID,
    name: 'Test Count Plan',
    code: 'PLAN002',
    planType: 'COUNT_BASED',
    classCounts: 10,
    price: '2000',
    tenantId: TEST_TENANT_ID,
    branchId: TEST_BRANCH_ID,
    isActive: true,
    allowPause: false,
    allowTransfer: false,
  }).onConflictDoNothing();

  // Create test member (with all required fields)
  await db.insert(members).values({
    id: TEST_MEMBER_ID,
    fullName: 'Test Member',
    phone: '0912345678',
    email: 'member@test.test',
    memberCode: 'M000001',
    branchId: TEST_BRANCH_ID,
    status: 'ACTIVE',
    joinDate: todayStr,
    tenantId: TEST_TENANT_ID,
  }).onConflictDoNothing();

  // Create test contract (with all required fields)
  const endDate = new Date(today);
  endDate.setMonth(endDate.getMonth() + 1);
  const endDateStr = endDate.toISOString().split('T')[0];

  await db.insert(contracts).values({
    id: TEST_CONTRACT_ID,
    contractNo: 'C000001',
    memberId: TEST_MEMBER_ID,
    planId: TEST_PLAN_ID,
    startDate: todayStr,
    originalEndDate: endDateStr,
    endDate: endDateStr,
    status: 'ACTIVE',
    totalAmount: '1000',
    paidAmount: '1000',
    paymentStatus: 'PAID',
    termsAccepted: true,
    branchId: TEST_BRANCH_ID,
    tenantId: TEST_TENANT_ID,
  }).onConflictDoNothing();

  // Create test class
  await db.insert(classes).values({
    id: TEST_CLASS_ID,
    name: 'Test Yoga',
    category: 'YOGA',
    difficultyLevel: 'BEGINNER',
    durationMinutes: 60,
    maxCapacity: 20,
    instructorId: TEST_EMPLOYEE_ID,
    branchId: TEST_BRANCH_ID,
    requiresCount: true,
    countDeduction: 1,
  }).onConflictDoNothing();

  // Create test session (tomorrow)
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  await db.insert(classSessions).values({
    id: TEST_SESSION_ID,
    classId: TEST_CLASS_ID,
    branchId: TEST_BRANCH_ID,
    instructorId: TEST_EMPLOYEE_ID,
    sessionDate: tomorrowStr,
    startTime: '10:00',
    endTime: '11:00',
    maxCapacity: 20,
    currentCount: 0,
    waitlistCount: 0,
    sessionStatus: 'SCHEDULED',
  }).onConflictDoNothing();
}

/**
 * Clean up test fixtures
 */
export async function cleanupTestFixtures() {
  // First unlink all employees from users to avoid FK constraint issues
  await db.update(employees).set({ userId: null }).where(eq(employees.branchId, TEST_BRANCH_ID));

  // Delete sessions first
  await db.delete(sessions).where(eq(sessions.userId, TEST_USER_ID));
  // Delete reviews for test tenant
  await db.delete(classReviews).where(eq(classReviews.tenantId, TEST_TENANT_ID));
  // Delete coach-specific data (may exist from coach test runs or leftover data)
  await db.delete(coachNotes).where(eq(coachNotes.tenantId, TEST_TENANT_ID));
  await db.delete(lessonPlans).where(eq(lessonPlans.tenantId, TEST_TENANT_ID));
  await db.delete(teachingMaterials).where(eq(teachingMaterials.tenantId, TEST_TENANT_ID));
  await db.delete(coachMemberAssignments).where(eq(coachMemberAssignments.tenantId, TEST_TENANT_ID));
  // Delete contract logs for test tenant
  await db.delete(contractLogs).where(eq(contractLogs.tenantId, TEST_TENANT_ID));
  // Delete all check-ins for the test branch (including ones created during tests)
  await db.delete(checkIns).where(eq(checkIns.branchId, TEST_BRANCH_ID));
  // Delete bookings, class records, sessions, schedules, classes (cascades handle most)
  await db.delete(classes).where(eq(classes.branchId, TEST_BRANCH_ID));
  // Delete all contracts for the test tenant (including ones created during tests)
  await db.delete(contracts).where(eq(contracts.tenantId, TEST_TENANT_ID));
  // Delete all members for the test tenant
  await db.delete(members).where(eq(members.tenantId, TEST_TENANT_ID));
  // Delete all membership plans for the test tenant
  await db.delete(membershipPlans).where(eq(membershipPlans.tenantId, TEST_TENANT_ID));
  // Clear user-employee links before deleting employees
  await db.update(users).set({ employeeId: null }).where(eq(users.tenantId, TEST_TENANT_ID));
  // Delete all employees for the test tenant
  await db.delete(employees).where(eq(employees.tenantId, TEST_TENANT_ID));
  // Delete all users for the test tenant
  await db.delete(users).where(eq(users.tenantId, TEST_TENANT_ID));
  // Delete all job titles for the test tenant
  await db.delete(jobTitles).where(eq(jobTitles.tenantId, TEST_TENANT_ID));
  // Delete all branches for the test tenant
  await db.delete(branches).where(eq(branches.tenantId, TEST_TENANT_ID));
  await db.delete(tenants).where(eq(tenants.id, TEST_TENANT_ID));
}

/**
 * Login and get auth token
 */
export async function getAuthToken(): Promise<string> {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: TEST_USER_EMAIL,
      password: TEST_USER_PASSWORD,
    }),
  });

  const data = await response.json();

  if (!data.success || !data.data?.token) {
    throw new Error(`Login failed: ${JSON.stringify(data)}`);
  }

  return data.data.token;
}

/**
 * Make authenticated request
 */
export async function authRequest(
  path: string,
  options: RequestInit & { token?: string } = {}
) {
  const token = options.token || await getAuthToken();

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('X-Tenant-Id', TEST_TENANT_ID);

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  return app.request(path, {
    ...options,
    headers,
  });
}

/**
 * Create a request helper for a specific token
 */
export function createAuthClient(token: string) {
  return {
    get: (path: string) => authRequest(path, { method: 'GET', token }),
    post: (path: string, body: unknown) => authRequest(path, {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    }),
    patch: (path: string, body: unknown) => authRequest(path, {
      method: 'PATCH',
      token,
      body: JSON.stringify(body),
    }),
    delete: (path: string) => authRequest(path, { method: 'DELETE', token }),
  };
}

/**
 * Get a member JWT access token for test member
 */
export function getMemberAuthToken(): string {
  const { accessToken } = generateMemberTokens({
    id: TEST_MEMBER_ID,
    memberCode: 'M000001',
    branchId: TEST_BRANCH_ID,
    tenantId: TEST_TENANT_ID,
  });
  return accessToken;
}

/**
 * Get a coach JWT access token for test employee (coach)
 */
export function getCoachAuthToken(): string {
  const { accessToken } = generateCoachTokens({
    id: TEST_EMPLOYEE_ID,
    employeeCode: 'EMP001',
    branchId: TEST_BRANCH_ID,
    tenantId: TEST_TENANT_ID,
    jobTitle: 'Admin',
  });
  return accessToken;
}

/**
 * Make member-authenticated request (X-Member-Token)
 */
export async function memberAuthRequest(
  path: string,
  options: RequestInit & { token?: string } = {}
) {
  const token = options.token || getMemberAuthToken();

  const headers = new Headers(options.headers);
  headers.set('X-Member-Token', token);

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  return app.request(path, {
    ...options,
    headers,
  });
}

/**
 * Make coach-authenticated request (X-Coach-Token)
 */
export async function coachAuthRequest(
  path: string,
  options: RequestInit & { token?: string } = {}
) {
  const token = options.token || getCoachAuthToken();

  const headers = new Headers(options.headers);
  headers.set('X-Coach-Token', token);

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  return app.request(path, {
    ...options,
    headers,
  });
}

// =============================================================================
// COACH-SPECIFIC TEST FIXTURES
// =============================================================================

/**
 * Create coach-specific test fixtures in database.
 * Calls createTestFixtures() first since coach fixtures depend on
 * tenant, branch, member, and contract data.
 */
export async function createCoachTestFixtures() {
  // Create base fixtures first (tenant, branch, member, contract, etc.)
  await createTestFixtures();

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  // Create COACH job title
  await db.insert(jobTitles).values({
    id: TEST_COACH_JOB_TITLE_ID,
    name: '教練',
    code: 'COACH',
    permissionsConfig: '{}',
    tenantId: TEST_TENANT_ID,
  }).onConflictDoNothing();

  // Create coach user
  const passwordHash = await hash(TEST_COACH_PASSWORD);
  await db.insert(users).values({
    id: TEST_COACH_USER_ID,
    email: TEST_COACH_EMAIL,
    passwordHash,
    role: 'staff',
    tenantId: TEST_TENANT_ID,
    isActive: true,
    emailVerified: true,
  }).onConflictDoNothing();

  // Create coach employee
  await db.insert(employees).values({
    id: TEST_COACH_EMPLOYEE_ID,
    fullName: 'Test Coach',
    email: TEST_COACH_EMAIL,
    employeeCode: 'COACH001',
    userId: TEST_COACH_USER_ID,
    jobTitleId: TEST_COACH_JOB_TITLE_ID,
    branchId: TEST_BRANCH_ID,
    tenantId: TEST_TENANT_ID,
    status: 'ACTIVE',
    employmentType: 'FULL_TIME',
    hireDate: todayStr,
  }).onConflictDoNothing();

  // Update coach user with employeeId
  await db.update(users).set({
    employeeId: TEST_COACH_EMPLOYEE_ID,
  }).where(eq(users.id, TEST_COACH_USER_ID));

  // Create a personal training class
  await db.insert(classes).values({
    id: TEST_COACH_CLASS_ID,
    name: '私人教練課',
    durationMinutes: 60,
    maxCapacity: 1,
    branchId: TEST_BRANCH_ID,
    instructorId: TEST_COACH_EMPLOYEE_ID,
    category: 'PERSONAL',
  }).onConflictDoNothing();

  // Create a class session for today
  await db.insert(classSessions).values({
    id: TEST_COACH_SESSION_ID,
    classId: TEST_COACH_CLASS_ID,
    branchId: TEST_BRANCH_ID,
    instructorId: TEST_COACH_EMPLOYEE_ID,
    sessionDate: todayStr,
    startTime: '10:00',
    endTime: '11:00',
    maxCapacity: 1,
    currentCount: 0,
    waitlistCount: 0,
    sessionStatus: 'SCHEDULED',
  }).onConflictDoNothing();

  // Create a booking for the test member
  await db.insert(bookings).values({
    id: TEST_BOOKING_ID,
    sessionId: TEST_COACH_SESSION_ID,
    memberId: TEST_MEMBER_ID,
    contractId: TEST_CONTRACT_ID,
    bookingStatus: 'CONFIRMED',
  }).onConflictDoNothing();

  // Create coach-member assignment
  await db.insert(coachMemberAssignments).values({
    id: TEST_ASSIGNMENT_ID,
    coachId: TEST_COACH_EMPLOYEE_ID,
    memberId: TEST_MEMBER_ID,
    role: 'PRIMARY',
    tenantId: TEST_TENANT_ID,
  }).onConflictDoNothing();

  // Create a teaching material
  await db.insert(teachingMaterials).values({
    id: TEST_MATERIAL_ID,
    type: 'EXERCISE',
    category: '力量訓練',
    name: '啞鈴肩推',
    tenantId: TEST_TENANT_ID,
    createdBy: TEST_COACH_EMPLOYEE_ID,
    muscleGroups: ['shoulders'],
    equipment: ['dumbbell'],
    difficulty: 'INTERMEDIATE',
    instructions: ['坐姿挺胸'],
    tips: ['保持穩定'],
    commonMistakes: ['聳肩'],
  }).onConflictDoNothing();

  // Create a lesson plan
  await db.insert(lessonPlans).values({
    id: TEST_LESSON_PLAN_ID,
    coachId: TEST_COACH_EMPLOYEE_ID,
    title: '上肢力量訓練',
    objectives: ['增強肩部力量'],
    isTemplate: false,
    difficulty: 'INTERMEDIATE',
    durationMinutes: 60,
    tenantId: TEST_TENANT_ID,
  }).onConflictDoNothing();
}

/**
 * Clean up coach-specific test fixtures, then base fixtures.
 * Deletes in reverse dependency order.
 */
export async function cleanupCoachTestFixtures() {
  // Delete coach-specific data first (reverse dependency order)
  await db.delete(coachNotes).where(eq(coachNotes.coachId, TEST_COACH_EMPLOYEE_ID));
  await db.delete(lessonPlans).where(eq(lessonPlans.coachId, TEST_COACH_EMPLOYEE_ID));
  await db.delete(teachingMaterials).where(
    and(
      eq(teachingMaterials.tenantId, TEST_TENANT_ID),
      eq(teachingMaterials.createdBy, TEST_COACH_EMPLOYEE_ID),
    )
  );
  await db.delete(coachMemberAssignments).where(eq(coachMemberAssignments.coachId, TEST_COACH_EMPLOYEE_ID));
  await db.delete(bookings).where(eq(bookings.sessionId, TEST_COACH_SESSION_ID));
  await db.delete(classSessions).where(eq(classSessions.classId, TEST_COACH_CLASS_ID));
  await db.delete(classes).where(eq(classes.id, TEST_COACH_CLASS_ID));

  // Delete coach employee, user, and job title
  await db.update(users).set({ employeeId: null }).where(eq(users.id, TEST_COACH_USER_ID));
  await db.delete(employees).where(eq(employees.id, TEST_COACH_EMPLOYEE_ID));
  await db.delete(users).where(eq(users.id, TEST_COACH_USER_ID));
  await db.delete(jobTitles).where(eq(jobTitles.id, TEST_COACH_JOB_TITLE_ID));

  // Clean up base fixtures (tenant, branch, member, contract, etc.)
  await cleanupTestFixtures();
}

/**
 * Login as the test coach via the coach auth endpoint and return the access token.
 */
export async function getCoachToken(): Promise<string> {
  const response = await app.request('/api/coach/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: TEST_COACH_EMAIL,
      password: TEST_COACH_PASSWORD,
    }),
  });

  const data = await response.json() as Record<string, unknown>;

  if (!data.success || !data.access_token) {
    throw new Error(`Coach login failed: ${JSON.stringify(data)}`);
  }

  return data.access_token as string;
}

/**
 * Make a coach-authenticated request using X-Coach-Token and X-Tenant-Id headers.
 * If no token is provided, logs in as the test coach to obtain one.
 */
export async function coachRequest(
  path: string,
  options: RequestInit & { token?: string } = {}
) {
  const token = options.token || await getCoachToken();

  const headers = new Headers(options.headers);
  headers.set('X-Coach-Token', token);
  headers.set('X-Tenant-Id', TEST_TENANT_ID);

  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }

  return app.request(path, {
    ...options,
    headers,
  });
}
