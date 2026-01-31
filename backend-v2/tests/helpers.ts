import { db, users, employees, branches, tenants, members, contracts, membershipPlans, sessions } from '../src/db/index.js';
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

export const TEST_USER_EMAIL = 'test@gym-nexus.test';
export const TEST_USER_PASSWORD = 'TestPassword123!';

/**
 * Create test fixtures in database
 */
export async function createTestFixtures() {
  // Create tenant
  await db.insert(tenants).values({
    id: TEST_TENANT_ID,
    name: 'Test Gym',
    slug: 'test-gym',
    email: 'admin@test-gym.test',
    status: 'active',
  }).onConflictDoNothing();

  // Create branch
  await db.insert(branches).values({
    id: TEST_BRANCH_ID,
    name: 'Test Branch',
    type: 'HEADQUARTER',
    tenantId: TEST_TENANT_ID,
    status: 'active',
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

  // Create employee linked to user
  await db.insert(employees).values({
    id: TEST_EMPLOYEE_ID,
    fullName: 'Test Admin',
    email: TEST_USER_EMAIL,
    branchId: TEST_BRANCH_ID,
    userId: TEST_USER_ID,
    employmentStatus: 'ACTIVE',
    tenantId: TEST_TENANT_ID,
  }).onConflictDoNothing();

  // Update user with employeeId
  await db.update(users).set({
    employeeId: TEST_EMPLOYEE_ID,
  }).where(eq(users.id, TEST_USER_ID));

  // Create test membership plan
  await db.insert(membershipPlans).values({
    id: TEST_PLAN_ID,
    name: 'Test Monthly Plan',
    planType: 'TIME_BASED',
    durationMonths: 1,
    price: '1000',
    tenantId: TEST_TENANT_ID,
    branchId: TEST_BRANCH_ID,
    isActive: true,
  }).onConflictDoNothing();

  // Create test member
  await db.insert(members).values({
    id: TEST_MEMBER_ID,
    fullName: 'Test Member',
    phone: '0912345678',
    email: 'member@test.test',
    memberCode: 'M000001',
    branchId: TEST_BRANCH_ID,
    memberStatus: 'ACTIVE',
    tenantId: TEST_TENANT_ID,
  }).onConflictDoNothing();

  // Create test contract
  const today = new Date();
  const endDate = new Date(today);
  endDate.setMonth(endDate.getMonth() + 1);

  await db.insert(contracts).values({
    id: TEST_CONTRACT_ID,
    contractNo: 'C000001',
    memberId: TEST_MEMBER_ID,
    planId: TEST_PLAN_ID,
    startDate: today.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
    contractStatus: 'ACTIVE',
    totalAmount: '1000',
    paymentStatus: 'PAID',
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
  await db.delete(contracts).where(eq(contracts.id, TEST_CONTRACT_ID));
  await db.delete(members).where(eq(members.id, TEST_MEMBER_ID));
  await db.delete(membershipPlans).where(eq(membershipPlans.id, TEST_PLAN_ID));
  await db.delete(employees).where(eq(employees.id, TEST_EMPLOYEE_ID));
  await db.delete(users).where(eq(users.id, TEST_USER_ID));
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
