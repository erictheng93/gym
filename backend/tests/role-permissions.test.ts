import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hash } from '@node-rs/argon2';
import { inArray } from 'drizzle-orm';
import app from '../src/app.js';
import { db, users, sessions } from '../src/db/index.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  TEST_TENANT_ID,
  TEST_BRANCH_ID,
  TEST_JOB_TITLE_ID,
  TEST_EMPLOYEE_ID,
} from './helpers.js';

// Role gates on branches / employees / job-titles routes (requireRole in the routes).
const STAFF_ID = '00000000-0000-4000-8000-0000000000e1';
const MANAGER_ID = '00000000-0000-4000-8000-0000000000e2';
const PASSWORD = 'RolePass123!';

async function createUser(id: string, email: string, role: 'staff' | 'manager') {
  await db.insert(users).values({
    id,
    email,
    passwordHash: await hash(PASSWORD),
    role,
    tenantId: TEST_TENANT_ID,
    isActive: true,
    emailVerified: true,
  });
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(`login failed: ${JSON.stringify(data)}`);
  return data.data.token as string;
}

describe('Role permissions', () => {
  let staffToken: string;
  let managerToken: string;
  const ids = [STAFF_ID, MANAGER_ID];

  beforeAll(async () => {
    await createTestFixtures();
    staffToken = await createUser(STAFF_ID, 'role-staff@gym-nexus.test', 'staff');
    managerToken = await createUser(MANAGER_ID, 'role-manager@gym-nexus.test', 'manager');
  });

  afterAll(async () => {
    await db.delete(sessions).where(inArray(sessions.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
    await cleanupTestFixtures();
  });

  const employeeBody = JSON.stringify({
    fullName: 'Role Test',
    branchId: TEST_BRANCH_ID,
    jobTitleId: TEST_JOB_TITLE_ID,
    employmentType: 'FULL_TIME',
  });

  it('staff can read branches, employees and job titles', async () => {
    for (const path of ['/api/branches', '/api/employees', '/api/job-titles']) {
      const res = await authRequest(path, { token: staffToken });
      expect(res.status, path).toBe(200);
    }
  });

  it.each([
    ['POST', '/api/branches', JSON.stringify({ name: 'X', type: 'BRANCH' })],
    ['PATCH', `/api/branches/${TEST_BRANCH_ID}`, JSON.stringify({ name: 'X' })],
    ['DELETE', `/api/branches/${TEST_BRANCH_ID}`, undefined],
    ['POST', '/api/employees', employeeBody],
    ['PATCH', `/api/employees/${TEST_EMPLOYEE_ID}`, JSON.stringify({ fullName: 'X' })],
    ['DELETE', `/api/employees/${TEST_EMPLOYEE_ID}`, undefined],
    ['POST', '/api/job-titles', JSON.stringify({ name: 'X', code: 'X' })],
    ['PATCH', `/api/job-titles/${TEST_JOB_TITLE_ID}`, JSON.stringify({ name: 'X' })],
    ['DELETE', `/api/job-titles/${TEST_JOB_TITLE_ID}`, undefined],
  ])('staff is rejected: %s %s', async (method, path, body) => {
    const res = await authRequest(path, { method, token: staffToken, body });
    expect(res.status).toBe(403);
  });

  it.each([
    ['POST', '/api/branches', JSON.stringify({ name: 'X', type: 'BRANCH' })],
    ['DELETE', `/api/branches/${TEST_BRANCH_ID}`, undefined],
    ['DELETE', `/api/employees/${TEST_EMPLOYEE_ID}`, undefined],
    ['DELETE', `/api/job-titles/${TEST_JOB_TITLE_ID}`, undefined],
  ])('manager is rejected on admin-only route: %s %s', async (method, path, body) => {
    const res = await authRequest(path, { method, token: managerToken, body });
    expect(res.status).toBe(403);
  });

  it('manager may update a job title', async () => {
    const res = await authRequest(`/api/job-titles/${TEST_JOB_TITLE_ID}`, {
      method: 'PATCH',
      token: managerToken,
      body: JSON.stringify({ description: 'by manager' }),
    });
    expect(res.status).toBe(200);
  });
});
