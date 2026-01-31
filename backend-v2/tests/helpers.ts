import { db, users, employees, branches, tenants, members, contracts, membershipPlans, sessions, jobTitles, checkIns } from '../src/db/index.js';
import { hash } from '@node-rs/argon2';
import { eq } from 'drizzle-orm';
import app from '../src/app.js';

// Test tenant and branch IDs
export const TEST_TENANT_ID = '00000000-0000-0000-0000-000000000001';
export const TEST_BRANCH_ID = '00000000-0000-0000-0000-000000000002';
export const TEST_USER_ID = '00000000-0000-0000-0000-000000000003';
export const TEST_EMPLOYEE_ID = '00000000-0000-0000-0000-000000000004';
export const TEST_MEMBER_ID = '00000000-0000-0000-0000-000000000005';
export const TEST_PLAN_ID = '00000000-0000-0000-0000-000000000006';
export const TEST_CONTRACT_ID = '00000000-0000-0000-0000-000000000007';
export const TEST_JOB_TITLE_ID = '00000000-0000-0000-0000-000000000008';

export const TEST_USER_EMAIL = 'test@gym-nexus.test';
export const TEST_USER_PASSWORD = 'TestPassword123!';

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
  }).onConflictDoNothing();

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
}

/**
 * Clean up test fixtures
 */
export async function cleanupTestFixtures() {
  // Delete in reverse order of dependencies
  await db.delete(sessions).where(eq(sessions.userId, TEST_USER_ID));
  // Delete all check-ins for the test branch (including ones created during tests)
  await db.delete(checkIns).where(eq(checkIns.branchId, TEST_BRANCH_ID));
  // Delete all contracts for the test branch (including ones created during tests)
  await db.delete(contracts).where(eq(contracts.branchId, TEST_BRANCH_ID));
  // Delete all members for the test branch (including ones created during tests)
  await db.delete(members).where(eq(members.branchId, TEST_BRANCH_ID));
  // Delete all membership plans for the test branch (including ones created during tests)
  await db.delete(membershipPlans).where(eq(membershipPlans.branchId, TEST_BRANCH_ID));
  await db.delete(employees).where(eq(employees.id, TEST_EMPLOYEE_ID));
  await db.delete(users).where(eq(users.id, TEST_USER_ID));
  await db.delete(jobTitles).where(eq(jobTitles.id, TEST_JOB_TITLE_ID));
  await db.delete(branches).where(eq(branches.id, TEST_BRANCH_ID));
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
