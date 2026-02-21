import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db, users, employees } from '../src/db/index.js';
import { eq } from 'drizzle-orm';
import { hash } from '@node-rs/argon2';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  getAuthToken,
  TEST_EMPLOYEE_ID,
  TEST_BRANCH_ID,
  TEST_JOB_TITLE_ID,
  TEST_TENANT_ID,
  TEST_EMPLOYEE_B_ID,
} from './helpers.js';

describe('Employees API', () => {
  let authToken: string;
  let createdEmployeeId: string;

  beforeAll(async () => {
    await createTestFixtures();
    authToken = await getAuthToken();
  });

  afterAll(async () => {
    await cleanupTestFixtures();
  });

  describe('GET /api/employees', () => {
    it('should list employees with jobTitle and branch joins', async () => {
      const response = await authRequest('/api/employees', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(1);

      // Should have joined data
      const employee = data.data[0];
      expect(employee).toHaveProperty('jobTitle');
      expect(employee).toHaveProperty('branch');
    });

    it('should filter by branchId', async () => {
      const response = await authRequest(`/api/employees?branchId=${TEST_BRANCH_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      data.data.forEach((emp: { branchId: string }) => {
        expect(emp.branchId).toBe(TEST_BRANCH_ID);
      });
    });
  });

  describe('GET /api/employees/:id', () => {
    it('should get employee with attendances', async () => {
      const response = await authRequest(`/api/employees/${TEST_EMPLOYEE_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe(TEST_EMPLOYEE_ID);
      expect(data.data.fullName).toBe('Test Admin');
      expect(data.data).toHaveProperty('jobTitle');
      expect(data.data).toHaveProperty('branch');
      expect(data.data).toHaveProperty('recentAttendances');
    });

    it('should return 404 for non-existent employee', async () => {
      const response = await authRequest('/api/employees/00000000-0000-0000-0000-999999999999', {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/employees', () => {
    it('should create an employee with auto-generated code', async () => {
      const response = await authRequest('/api/employees', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          fullName: 'New Employee',
          phone: '0933444555',
          email: 'newemployee@test.test',
          branchId: TEST_BRANCH_ID,
          jobTitleId: TEST_JOB_TITLE_ID,
          employmentType: 'FULL_TIME',
        }),
      });

      expect(response.status).toBe(201);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.fullName).toBe('New Employee');
      expect(data.data.employeeCode).toBeTruthy(); // Auto-generated E00002 pattern
      expect(data.data.employeeCode).toMatch(/^E\d{5}$/);

      createdEmployeeId = data.data.id;
    });

    it('should validate branch belongs to tenant', async () => {
      const response = await authRequest('/api/employees', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          fullName: 'Bad Employee',
          branchId: '00000000-0000-0000-0000-999999999999',
          jobTitleId: TEST_JOB_TITLE_ID,
          employmentType: 'FULL_TIME',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should validate required fields', async () => {
      const response = await authRequest('/api/employees', {
        method: 'POST',
        token: authToken,
        body: JSON.stringify({
          // Missing fullName, branchId, jobTitleId, employmentType
        }),
      });

      expect(response.status).toBe(400);
    });
  });

  describe('PATCH /api/employees/:id', () => {
    it('should update employee', async () => {
      const response = await authRequest(`/api/employees/${createdEmployeeId}`, {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify({
          fullName: 'Updated Employee Name',
          phone: '0955666777',
        }),
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.fullName).toBe('Updated Employee Name');
      expect(data.data.phone).toBe('0955666777');
    });

    it('should validate new branchId belongs to tenant', async () => {
      const response = await authRequest(`/api/employees/${createdEmployeeId}`, {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify({
          branchId: '00000000-0000-0000-0000-999999999999',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent employee', async () => {
      const response = await authRequest('/api/employees/00000000-0000-0000-0000-999999999999', {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify({ fullName: 'Ghost' }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/employees/:id', () => {
    it('should soft-delete employee (set status=RESIGNED)', async () => {
      const response = await authRequest(`/api/employees/${createdEmployeeId}`, {
        method: 'DELETE',
        token: authToken,
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify the employee status is RESIGNED
      const getResponse = await authRequest(`/api/employees/${createdEmployeeId}`, {
        method: 'GET',
        token: authToken,
      });

      const getData = await getResponse.json();
      expect(getData.data.status).toBe('RESIGNED');
    });

    it('should deactivate linked user when deleting employee', async () => {
      // Create a user+employee pair with linked userId via DB
      const linkedUserId = '00000000-0000-0000-0000-0000000000f1';
      const linkedEmployeeId = '00000000-0000-0000-0000-0000000000f2';
      const passwordHash = await hash('TestPass123!');

      await db.insert(users).values({
        id: linkedUserId,
        email: 'linked-emp@test.test',
        passwordHash,
        role: 'staff',
        tenantId: TEST_TENANT_ID,
        isActive: true,
        emailVerified: true,
      }).onConflictDoNothing();

      await db.insert(employees).values({
        id: linkedEmployeeId,
        fullName: 'Linked Employee',
        employeeCode: 'ELINK1',
        branchId: TEST_BRANCH_ID,
        jobTitleId: TEST_JOB_TITLE_ID,
        employmentType: 'FULL_TIME',
        status: 'ACTIVE',
        userId: linkedUserId,
        tenantId: TEST_TENANT_ID,
        hireDate: new Date().toISOString().split('T')[0],
      }).onConflictDoNothing();

      await db.update(users).set({ employeeId: linkedEmployeeId }).where(eq(users.id, linkedUserId));

      // Delete the employee via API
      const response = await authRequest(`/api/employees/${linkedEmployeeId}`, {
        method: 'DELETE',
        token: authToken,
      });

      expect(response.status).toBe(200);
      expect((await response.json()).success).toBe(true);

      // Verify employee is RESIGNED
      const empRes = await authRequest(`/api/employees/${linkedEmployeeId}`, {
        method: 'GET',
        token: authToken,
      });
      expect((await empRes.json()).data.status).toBe('RESIGNED');

      // Verify the linked user is deactivated
      const [user] = await db.select().from(users).where(eq(users.id, linkedUserId)).limit(1);
      expect(user.isActive).toBe(false);
    });

    it('should return 404 for non-existent employee', async () => {
      const response = await authRequest('/api/employees/00000000-0000-0000-0000-999999999999', {
        method: 'DELETE',
        token: authToken,
      });

      expect(response.status).toBe(404);
    });
  });

  describe('Tenant Isolation', () => {
    it('should return 403 when getting an employee from another tenant', async () => {
      const response = await authRequest(`/api/employees/${TEST_EMPLOYEE_B_ID}`, {
        method: 'GET',
        token: authToken,
      });

      expect(response.status).toBe(403);
    });

    it('should return 403 when updating an employee from another tenant', async () => {
      const response = await authRequest(`/api/employees/${TEST_EMPLOYEE_B_ID}`, {
        method: 'PATCH',
        token: authToken,
        body: JSON.stringify({ fullName: 'Hijacked' }),
      });

      expect(response.status).toBe(403);
    });

    it('should return 403 when deleting an employee from another tenant', async () => {
      const response = await authRequest(`/api/employees/${TEST_EMPLOYEE_B_ID}`, {
        method: 'DELETE',
        token: authToken,
      });

      expect(response.status).toBe(403);
    });
  });
});
