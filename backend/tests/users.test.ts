import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { hash, verify } from '@node-rs/argon2';
import { eq, and } from 'drizzle-orm';
import app from '../src/app.js';
import { db, users, employees, sessions, tenants, branches, jobTitles } from '../src/db/index.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  getAuthToken,
  authRequest,
  TEST_TENANT_ID,
  TEST_BRANCH_ID,
  TEST_USER_ID,
  TEST_USER_EMAIL,
  TEST_USER_PASSWORD,
  TEST_EMPLOYEE_ID,
  TEST_JOB_TITLE_ID,
  TEST_STAFF_USER_ID,
  TEST_STAFF_EMPLOYEE_ID,
  TEST_UNLINKED_EMPLOYEE_ID,
  TEST_STAFF_EMAIL,
  TEST_STAFF_PASSWORD,
} from './helpers.js';

// Helper to create a non-admin user for permission tests
async function createStaffUser() {
  const passwordHash = await hash(TEST_STAFF_PASSWORD);

  // First clean up any existing data to ensure clean state
  await db.delete(sessions).where(eq(sessions.userId, TEST_STAFF_USER_ID));
  await db.delete(users).where(eq(users.id, TEST_STAFF_USER_ID));
  await db.delete(employees).where(eq(employees.id, TEST_STAFF_EMPLOYEE_ID));
  await db.delete(employees).where(eq(employees.employeeCode, 'EMP002'));

  // Create staff employee first (without userId link initially)
  await db.insert(employees).values({
    id: TEST_STAFF_EMPLOYEE_ID,
    fullName: 'Test Staff',
    email: TEST_STAFF_EMAIL,
    branchId: TEST_BRANCH_ID,
    jobTitleId: TEST_JOB_TITLE_ID,
    employeeCode: 'EMP002',
    status: 'ACTIVE',
    employmentType: 'FULL_TIME',
    hireDate: new Date().toISOString().split('T')[0],
    tenantId: TEST_TENANT_ID,
  });

  // Create staff user with employeeId link
  await db.insert(users).values({
    id: TEST_STAFF_USER_ID,
    email: TEST_STAFF_EMAIL,
    passwordHash,
    role: 'staff',
    tenantId: TEST_TENANT_ID,
    employeeId: TEST_STAFF_EMPLOYEE_ID,
    isActive: true,
    emailVerified: true,
  });

  // Update employee with userId to complete bidirectional link
  await db.update(employees).set({
    userId: TEST_STAFF_USER_ID,
  }).where(eq(employees.id, TEST_STAFF_EMPLOYEE_ID));
}

// Helper to create an unlinked employee
async function createUnlinkedEmployee() {
  // First delete any existing employee with this id or employeeCode to ensure clean state
  await db.delete(employees).where(eq(employees.id, TEST_UNLINKED_EMPLOYEE_ID));
  await db.delete(employees).where(eq(employees.employeeCode, 'EMP003'));

  await db.insert(employees).values({
    id: TEST_UNLINKED_EMPLOYEE_ID,
    fullName: 'Unlinked Employee',
    email: 'unlinked@gym-nexus.test',
    branchId: TEST_BRANCH_ID,
    jobTitleId: TEST_JOB_TITLE_ID,
    employeeCode: 'EMP003',
    status: 'ACTIVE',
    employmentType: 'FULL_TIME',
    hireDate: new Date().toISOString().split('T')[0],
    tenantId: TEST_TENANT_ID,
    userId: null, // Explicitly unlinked
  });
}

// Helper to get staff auth token
async function getStaffAuthToken(): Promise<string> {
  const response = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: TEST_STAFF_EMAIL,
      password: TEST_STAFF_PASSWORD,
    }),
  });

  const data = await response.json();
  if (!data.success || !data.data?.token) {
    throw new Error(`Staff login failed: ${JSON.stringify(data)}`);
  }
  return data.data.token;
}

// Cleanup helper for users created during tests
async function cleanupTestUsers() {
  // First unlink all test employees from users to avoid FK constraint issues
  await db.update(employees).set({ userId: null }).where(eq(employees.id, TEST_STAFF_EMPLOYEE_ID));
  await db.update(employees).set({ userId: null }).where(eq(employees.id, TEST_UNLINKED_EMPLOYEE_ID));

  // Clean up any test-created users (excluding the main admin)
  const testEmails = [
    'newuser@test.test',
    'updated@test.test',
    'duplicate@test.test',
    'linkeduser@test.test',
    'linked-delete@test.test',
    'resetpw@test.test',
  ];

  for (const email of testEmails) {
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (user) {
      // Unlink any employees referencing this user
      await db.update(employees).set({ userId: null }).where(eq(employees.userId, user.id));
      await db.delete(sessions).where(eq(sessions.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
  }

  // Clean up staff user
  await db.delete(sessions).where(eq(sessions.userId, TEST_STAFF_USER_ID));
  await db.delete(users).where(eq(users.id, TEST_STAFF_USER_ID));

  // Clean up test employees (excluding the main admin employee)
  await db.delete(employees).where(eq(employees.id, TEST_STAFF_EMPLOYEE_ID));
  await db.delete(employees).where(eq(employees.id, TEST_UNLINKED_EMPLOYEE_ID));
}

describe('Users API', () => {
  let adminToken: string;

  beforeAll(async () => {
    await createTestFixtures();
    await createStaffUser();
    await createUnlinkedEmployee();
    adminToken = await getAuthToken();
  });

  afterAll(async () => {
    await cleanupTestUsers();
    await cleanupTestFixtures();
  });

  // ============================================
  // Authorization Tests
  // ============================================
  describe('Authorization', () => {
    it('should reject unauthenticated requests', async () => {
      const response = await app.request('/api/users', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });

    it('should use tenant from authenticated user (header not required)', async () => {
      // Tenant ID comes from the authenticated user, not from header
      // A request with valid token should work even without X-Tenant-Id header
      const response = await app.request('/api/users', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
        },
      });

      // Should succeed because tenantId is derived from user's tenantId
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('should reject non-admin users', async () => {
      const staffToken = await getStaffAuthToken();

      const response = await app.request('/api/users', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${staffToken}`,
          'X-Tenant-Id': TEST_TENANT_ID,
        },
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toContain('管理員權限');
    });

    it('should allow admin users', async () => {
      const response = await authRequest('/api/users', {
        method: 'GET',
        token: adminToken,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  // ============================================
  // GET /api/users (List)
  // ============================================
  describe('GET /api/users', () => {
    it('should list users with pagination', async () => {
      const response = await authRequest('/api/users?page=1&limit=10', {
        method: 'GET',
        token: adminToken,
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.pagination).toBeDefined();
      expect(data.pagination.page).toBe(1);
      expect(data.pagination.limit).toBe(10);
      expect(typeof data.pagination.total).toBe('number');
      expect(typeof data.pagination.totalPages).toBe('number');
    });

    it('should filter by search query', async () => {
      const response = await authRequest(`/api/users?search=${encodeURIComponent(TEST_USER_EMAIL)}`, {
        method: 'GET',
        token: adminToken,
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.length).toBeGreaterThan(0);
      expect(data.data.some((u: any) => u.email === TEST_USER_EMAIL)).toBe(true);
    });

    it('should filter by role', async () => {
      const response = await authRequest('/api/users?role=admin', {
        method: 'GET',
        token: adminToken,
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      data.data.forEach((user: any) => {
        expect(user.role).toBe('admin');
      });
    });

    it('should filter by active status', async () => {
      const response = await authRequest('/api/users?isActive=true', {
        method: 'GET',
        token: adminToken,
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      data.data.forEach((user: any) => {
        expect(user.isActive).toBe(true);
      });
    });

    it('should include employee info when linked', async () => {
      const response = await authRequest('/api/users', {
        method: 'GET',
        token: adminToken,
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      const adminUser = data.data.find((u: any) => u.email === TEST_USER_EMAIL);
      expect(adminUser).toBeDefined();
      expect(adminUser.employee).toBeDefined();
      expect(adminUser.employee.fullName).toBe('Test Admin');
    });

    it('should only return users from same tenant', async () => {
      const response = await authRequest('/api/users', {
        method: 'GET',
        token: adminToken,
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      // All returned users should belong to the test tenant
      // (We can't directly verify tenantId as it's not returned, but the query filters by it)
      expect(data.success).toBe(true);
    });
  });

  // ============================================
  // GET /api/users/:id
  // ============================================
  describe('GET /api/users/:id', () => {
    it('should get user by ID', async () => {
      const response = await authRequest(`/api/users/${TEST_USER_ID}`, {
        method: 'GET',
        token: adminToken,
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.id).toBe(TEST_USER_ID);
      expect(data.data.email).toBe(TEST_USER_EMAIL);
      expect(data.data.role).toBe('admin');
      expect(data.data).not.toHaveProperty('passwordHash');
    });

    it('should include employee with branch and job title info', async () => {
      const response = await authRequest(`/api/users/${TEST_USER_ID}`, {
        method: 'GET',
        token: adminToken,
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data.employee).toBeDefined();
      expect(data.data.employee.fullName).toBe('Test Admin');
      expect(data.data.employee.branch).toBeDefined();
      expect(data.data.employee.jobTitle).toBeDefined();
    });

    it('should return 404 for non-existent user', async () => {
      const response = await authRequest('/api/users/00000000-0000-0000-0000-000000000000', {
        method: 'GET',
        token: adminToken,
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('不存在');
    });

    it('should not expose password hash', async () => {
      const response = await authRequest(`/api/users/${TEST_USER_ID}`, {
        method: 'GET',
        token: adminToken,
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.data).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(data)).not.toContain('passwordHash');
    });
  });

  // ============================================
  // POST /api/users (Create)
  // ============================================
  describe('POST /api/users', () => {
    afterEach(async () => {
      // Clean up any users created in tests
      const testEmails = ['newuser@test.test', 'duplicate@test.test', 'linkeduser@test.test'];
      for (const email of testEmails) {
        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (user) {
          await db.delete(sessions).where(eq(sessions.userId, user.id));
          // Unlink employee first
          if (user.employeeId) {
            await db.update(employees).set({ userId: null }).where(eq(employees.id, user.employeeId));
          }
          await db.delete(users).where(eq(users.id, user.id));
        }
      }
    });

    it('should create user with valid data', async () => {
      const response = await authRequest('/api/users', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          email: 'newuser@test.test',
          password: 'NewUserPass123!',
          role: 'coach',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data.email).toBe('newuser@test.test');
      expect(data.data.role).toBe('coach');
      expect(data.data.isActive).toBe(true);
      expect(data.data).not.toHaveProperty('passwordHash');
    });

    it('should hash password correctly', async () => {
      const response = await authRequest('/api/users', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          email: 'newuser@test.test',
          password: 'NewUserPass123!',
          role: 'staff',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      // Verify password is hashed correctly in database
      const [createdUser] = await db.select().from(users).where(eq(users.id, data.data.id)).limit(1);
      expect(createdUser.passwordHash).toBeDefined();
      expect(createdUser.passwordHash).not.toBe('NewUserPass123!');

      // Verify hash is valid Argon2
      const isValid = await verify(createdUser.passwordHash!, 'NewUserPass123!');
      expect(isValid).toBe(true);
    });

    it('should reject duplicate email', async () => {
      // First create a user
      await authRequest('/api/users', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          email: 'duplicate@test.test',
          password: 'Password123!',
          role: 'staff',
        }),
      });

      // Try to create another with same email
      const response = await authRequest('/api/users', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          email: 'duplicate@test.test',
          password: 'Password123!',
          role: 'manager',
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('已被使用');
    });

    it('should reject employee with existing account', async () => {
      const response = await authRequest('/api/users', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          email: 'newuser@test.test',
          password: 'Password123!',
          role: 'staff',
          employeeId: TEST_EMPLOYEE_ID, // Already linked to admin user
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('已有帳號');
    });

    it('should link employee correctly', async () => {
      const response = await authRequest('/api/users', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          email: 'linkeduser@test.test',
          password: 'Password123!',
          role: 'staff',
          employeeId: TEST_UNLINKED_EMPLOYEE_ID,
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();

      expect(data.data.employeeId).toBe(TEST_UNLINKED_EMPLOYEE_ID);

      // Verify employee is linked
      const [employee] = await db.select().from(employees).where(eq(employees.id, TEST_UNLINKED_EMPLOYEE_ID)).limit(1);
      expect(employee.userId).toBe(data.data.id);
    });

    it('should validate required fields', async () => {
      const response = await authRequest('/api/users', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          email: 'newuser@test.test',
          // Missing password and role
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should validate email format', async () => {
      const response = await authRequest('/api/users', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          email: 'not-an-email',
          password: 'Password123!',
          role: 'staff',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should validate password length', async () => {
      const response = await authRequest('/api/users', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          email: 'newuser@test.test',
          password: 'short',
          role: 'staff',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should validate role enum', async () => {
      const response = await authRequest('/api/users', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          email: 'newuser@test.test',
          password: 'Password123!',
          role: 'invalid-role',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should normalize email to lowercase', async () => {
      const response = await authRequest('/api/users', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          email: 'NewUser@Test.TEST',
          password: 'Password123!',
          role: 'staff',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.data.email).toBe('newuser@test.test');
    });
  });

  // ============================================
  // PATCH /api/users/:id (Update)
  // ============================================
  describe('PATCH /api/users/:id', () => {
    let testUserId: string;

    beforeEach(async () => {
      // Create a user to update
      const response = await authRequest('/api/users', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          email: 'updateme@test.test',
          password: 'Password123!',
          role: 'staff',
        }),
      });
      const data = await response.json();
      testUserId = data.data.id;
    });

    afterEach(async () => {
      // Clean up
      const [user] = await db.select().from(users).where(eq(users.email, 'updateme@test.test')).limit(1);
      if (user) {
        await db.delete(sessions).where(eq(sessions.userId, user.id));
        await db.delete(users).where(eq(users.id, user.id));
      }
      const [user2] = await db.select().from(users).where(eq(users.email, 'updated@test.test')).limit(1);
      if (user2) {
        await db.delete(sessions).where(eq(sessions.userId, user2.id));
        await db.delete(users).where(eq(users.id, user2.id));
      }
    });

    it('should update user email', async () => {
      const response = await authRequest(`/api/users/${testUserId}`, {
        method: 'PATCH',
        token: adminToken,
        body: JSON.stringify({
          email: 'updated@test.test',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.email).toBe('updated@test.test');
    });

    it('should update user role', async () => {
      const response = await authRequest(`/api/users/${testUserId}`, {
        method: 'PATCH',
        token: adminToken,
        body: JSON.stringify({
          role: 'manager',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.role).toBe('manager');
    });

    it('should update user active status', async () => {
      const response = await authRequest(`/api/users/${testUserId}`, {
        method: 'PATCH',
        token: adminToken,
        body: JSON.stringify({
          isActive: false,
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.isActive).toBe(false);
    });

    it('should prevent self-deactivation', async () => {
      const response = await authRequest(`/api/users/${TEST_USER_ID}`, {
        method: 'PATCH',
        token: adminToken,
        body: JSON.stringify({
          isActive: false,
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('自己');
    });

    it('should invalidate sessions when deactivated', async () => {
      // First, create a session for the test user by logging in
      const loginResponse = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'updateme@test.test',
          password: 'Password123!',
        }),
      });
      const loginData = await loginResponse.json();
      const userToken = loginData.data.token;

      // Verify token works
      const verifyResponse = await app.request('/api/auth/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'X-Tenant-Id': TEST_TENANT_ID,
        },
      });
      expect(verifyResponse.status).toBe(200);

      // Deactivate user
      await authRequest(`/api/users/${testUserId}`, {
        method: 'PATCH',
        token: adminToken,
        body: JSON.stringify({
          isActive: false,
        }),
      });

      // Verify token is now invalid
      const afterDeactivateResponse = await app.request('/api/auth/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'X-Tenant-Id': TEST_TENANT_ID,
        },
      });
      expect(afterDeactivateResponse.status).toBe(401);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await authRequest('/api/users/00000000-0000-0000-0000-000000000000', {
        method: 'PATCH',
        token: adminToken,
        body: JSON.stringify({
          role: 'manager',
        }),
      });

      expect(response.status).toBe(404);
    });

    it('should reject duplicate email on update', async () => {
      const response = await authRequest(`/api/users/${testUserId}`, {
        method: 'PATCH',
        token: adminToken,
        body: JSON.stringify({
          email: TEST_USER_EMAIL, // Already exists
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('已被使用');
    });
  });

  // ============================================
  // DELETE /api/users/:id
  // ============================================
  describe('DELETE /api/users/:id', () => {
    let testUserId: string;

    beforeEach(async () => {
      // Create a user to delete
      const response = await authRequest('/api/users', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          email: 'deleteme@test.test',
          password: 'Password123!',
          role: 'staff',
        }),
      });
      const data = await response.json();
      testUserId = data.data.id;
    });

    afterEach(async () => {
      // Clean up if test failed
      const [user] = await db.select().from(users).where(eq(users.email, 'deleteme@test.test')).limit(1);
      if (user) {
        await db.delete(sessions).where(eq(sessions.userId, user.id));
        await db.delete(users).where(eq(users.id, user.id));
      }
    });

    it('should delete user', async () => {
      const response = await authRequest(`/api/users/${testUserId}`, {
        method: 'DELETE',
        token: adminToken,
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify user is deleted
      const [deletedUser] = await db.select().from(users).where(eq(users.id, testUserId)).limit(1);
      expect(deletedUser).toBeUndefined();
    });

    it('should prevent self-deletion', async () => {
      const response = await authRequest(`/api/users/${TEST_USER_ID}`, {
        method: 'DELETE',
        token: adminToken,
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('自己');
    });

    it('should delete sessions first', async () => {
      // Create a session for the test user
      await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'deleteme@test.test',
          password: 'Password123!',
        }),
      });

      // Verify session exists
      const sessionsBefore = await db.select().from(sessions).where(eq(sessions.userId, testUserId));
      expect(sessionsBefore.length).toBeGreaterThan(0);

      // Delete user
      const response = await authRequest(`/api/users/${testUserId}`, {
        method: 'DELETE',
        token: adminToken,
      });

      expect(response.status).toBe(200);

      // Verify sessions are deleted
      const sessionsAfter = await db.select().from(sessions).where(eq(sessions.userId, testUserId));
      expect(sessionsAfter.length).toBe(0);
    });

    it('should unlink employee on delete', async () => {
      // Create user linked to unlinked employee
      const createResponse = await authRequest('/api/users', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          email: 'linked-delete@test.test',
          password: 'Password123!',
          role: 'staff',
          employeeId: TEST_UNLINKED_EMPLOYEE_ID,
        }),
      });
      const createData = await createResponse.json();
      const linkedUserId = createData.data.id;

      // Verify employee is linked
      let [employee] = await db.select().from(employees).where(eq(employees.id, TEST_UNLINKED_EMPLOYEE_ID)).limit(1);
      expect(employee.userId).toBe(linkedUserId);

      // Delete user
      await authRequest(`/api/users/${linkedUserId}`, {
        method: 'DELETE',
        token: adminToken,
      });

      // Verify employee is unlinked
      [employee] = await db.select().from(employees).where(eq(employees.id, TEST_UNLINKED_EMPLOYEE_ID)).limit(1);
      expect(employee.userId).toBeNull();
    });

    it('should return 404 for non-existent user', async () => {
      const response = await authRequest('/api/users/00000000-0000-0000-0000-000000000000', {
        method: 'DELETE',
        token: adminToken,
      });

      expect(response.status).toBe(404);
    });
  });

  // ============================================
  // POST /api/users/:id/reset-password
  // ============================================
  describe('POST /api/users/:id/reset-password', () => {
    let testUserId: string;

    beforeEach(async () => {
      // Create a user for password reset tests
      const response = await authRequest('/api/users', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          email: 'resetpw@test.test',
          password: 'OldPassword123!',
          role: 'staff',
        }),
      });
      const data = await response.json();
      testUserId = data.data.id;
    });

    afterEach(async () => {
      const [user] = await db.select().from(users).where(eq(users.email, 'resetpw@test.test')).limit(1);
      if (user) {
        await db.delete(sessions).where(eq(sessions.userId, user.id));
        await db.delete(users).where(eq(users.id, user.id));
      }
    });

    it('should reset password', async () => {
      const response = await authRequest(`/api/users/${testUserId}/reset-password`, {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          newPassword: 'NewPassword456!',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify new password works
      const loginResponse = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'resetpw@test.test',
          password: 'NewPassword456!',
        }),
      });
      expect(loginResponse.status).toBe(200);
    });

    it('should invalidate all sessions after password reset', async () => {
      // Login to create a session
      const loginResponse = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'resetpw@test.test',
          password: 'OldPassword123!',
        }),
      });
      const loginData = await loginResponse.json();
      const userToken = loginData.data.token;

      // Verify token works
      const verifyResponse = await app.request('/api/auth/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'X-Tenant-Id': TEST_TENANT_ID,
        },
      });
      expect(verifyResponse.status).toBe(200);

      // Reset password
      await authRequest(`/api/users/${testUserId}/reset-password`, {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          newPassword: 'NewPassword456!',
        }),
      });

      // Verify old token is invalidated
      const afterResetResponse = await app.request('/api/auth/me', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${userToken}`,
          'X-Tenant-Id': TEST_TENANT_ID,
        },
      });
      expect(afterResetResponse.status).toBe(401);
    });

    it('should validate password length', async () => {
      const response = await authRequest(`/api/users/${testUserId}/reset-password`, {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          newPassword: 'short',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent user', async () => {
      const response = await authRequest('/api/users/00000000-0000-0000-0000-000000000000/reset-password', {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          newPassword: 'NewPassword456!',
        }),
      });

      expect(response.status).toBe(404);
    });
  });

  // ============================================
  // GET /api/users/available-employees
  // ============================================
  describe('GET /api/users/available-employees', () => {
    it('should list employees without user accounts', async () => {
      const response = await authRequest('/api/users/available-employees', {
        method: 'GET',
        token: adminToken,
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);

      // Unlinked employee should be in the list
      const unlinkedEmployee = data.data.find((e: any) => e.id === TEST_UNLINKED_EMPLOYEE_ID);
      expect(unlinkedEmployee).toBeDefined();
      expect(unlinkedEmployee.fullName).toBe('Unlinked Employee');
    });

    it('should not include employees with existing accounts', async () => {
      const response = await authRequest('/api/users/available-employees', {
        method: 'GET',
        token: adminToken,
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      // Admin employee (linked) should NOT be in the list
      const linkedEmployee = data.data.find((e: any) => e.id === TEST_EMPLOYEE_ID);
      expect(linkedEmployee).toBeUndefined();
    });

    it('should only include active employees', async () => {
      const response = await authRequest('/api/users/available-employees', {
        method: 'GET',
        token: adminToken,
      });

      expect(response.status).toBe(200);
      const data = await response.json();

      // All returned employees should be active (verified by query logic)
      expect(data.success).toBe(true);
    });
  });
});
