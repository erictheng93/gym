import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { hash } from '@node-rs/argon2';
import { eq, inArray } from 'drizzle-orm';
import app from '../src/app.js';
import { db, users, sessions, employees, jobTitles } from '../src/db/index.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  getAuthToken,
  TEST_TENANT_ID,
  TEST_BRANCH_ID,
  TEST_JOB_TITLE_ID,
  TEST_EMPLOYEE_ID,
} from './helpers.js';

// Managers may manage employees, but must not grant permissions or raise their own pay/title.
const MANAGER_USER_ID = '00000000-0000-4000-8000-0000000000f1';
const MANAGER_EMPLOYEE_ID = '00000000-0000-4000-8000-0000000000f2';
const PASSWORD = 'EscalationPass123!';
const GRANT_ALL = { payroll: { read: true, write: true, approve: true } };

describe('Permission self-escalation', () => {
  let adminToken: string;
  let managerToken: string;

  beforeAll(async () => {
    await createTestFixtures();
    adminToken = await getAuthToken();
    await db.insert(employees).values({
      id: MANAGER_EMPLOYEE_ID,
      fullName: 'Escalation Manager',
      branchId: TEST_BRANCH_ID,
      jobTitleId: TEST_JOB_TITLE_ID,
      employeeCode: 'ESC001',
      status: 'ACTIVE',
      employmentType: 'FULL_TIME',
      hireDate: '2026-01-01',
      basicSalary: '40000',
      tenantId: TEST_TENANT_ID,
    });
    await db.insert(users).values({
      id: MANAGER_USER_ID,
      email: 'escalation-manager@gym-nexus.test',
      passwordHash: await hash(PASSWORD),
      role: 'manager',
      tenantId: TEST_TENANT_ID,
      employeeId: MANAGER_EMPLOYEE_ID,
      isActive: true,
      emailVerified: true,
    });
    const res = await app.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'escalation-manager@gym-nexus.test', password: PASSWORD }),
    });
    managerToken = (await res.json()).data.token;
  });

  afterAll(async () => {
    await db.delete(sessions).where(eq(sessions.userId, MANAGER_USER_ID));
    await db.delete(users).where(eq(users.id, MANAGER_USER_ID));
    await db.delete(employees).where(inArray(employees.id, [MANAGER_EMPLOYEE_ID]));
    await cleanupTestFixtures();
  });

  const patch = (path: string, token: string, body: object) =>
    authRequest(path, { method: 'PATCH', token, body: JSON.stringify(body) });

  it.each([
    ['customPermissions', { customPermissions: GRANT_ALL }],
    ['basicSalary', { basicSalary: 99999 }],
    ['jobTitleId', { jobTitleId: TEST_JOB_TITLE_ID }],
  ])('a manager cannot change their own %s', async (_field, body) => {
    const res = await patch(`/api/employees/${MANAGER_EMPLOYEE_ID}`, managerToken, body);
    expect(res.status).toBe(403);
    const [row] = await db.select().from(employees).where(eq(employees.id, MANAGER_EMPLOYEE_ID));
    expect(row.customPermissions).toBeNull();
    expect(row.basicSalary).toBe('40000.00');
  });

  it.each([
    ['uppercase', MANAGER_EMPLOYEE_ID.toUpperCase()],
    ['braced', `{${MANAGER_EMPLOYEE_ID}}`],
    ['unhyphenated', MANAGER_EMPLOYEE_ID.replace(/-/g, '')],
  ])('a non-canonical (%s) own id cannot bypass the self-edit lock', async (_form, id) => {
    const res = await patch(`/api/employees/${id}`, managerToken, { basicSalary: 99999 });
    expect(res.status).toBe(404);
    const [row] = await db.select().from(employees).where(eq(employees.id, MANAGER_EMPLOYEE_ID));
    expect(row.basicSalary).toBe('40000.00');
  });

  it('a manager can still edit their own non-sensitive fields', async () => {
    const res = await patch(`/api/employees/${MANAGER_EMPLOYEE_ID}`, managerToken, { phone: '0912000111' });
    expect(res.status).toBe(200);
  });

  it("a manager cannot set another employee's customPermissions", async () => {
    const res = await patch(`/api/employees/${TEST_EMPLOYEE_ID}`, managerToken, { customPermissions: GRANT_ALL });
    expect(res.status).toBe(403);
  });

  it('customPermissions sent on create are ignored (not in the create schema)', async () => {
    const res = await authRequest('/api/employees', {
      method: 'POST',
      token: managerToken,
      body: JSON.stringify({
        fullName: 'Granted',
        branchId: TEST_BRANCH_ID,
        jobTitleId: TEST_JOB_TITLE_ID,
        employmentType: 'FULL_TIME',
        customPermissions: GRANT_ALL,
      }),
    });
    expect(res.status).toBe(201);
    const { data } = await res.json();
    const [row] = await db.select().from(employees).where(eq(employees.id, data.id));
    expect(row.customPermissions).toBeNull();
    await db.delete(employees).where(eq(employees.id, data.id));
  });

  it("an admin can set another employee's customPermissions but not their own", async () => {
    const other = await patch(`/api/employees/${MANAGER_EMPLOYEE_ID}`, adminToken, { customPermissions: GRANT_ALL });
    expect(other.status).toBe(200);
    const own = await patch(`/api/employees/${TEST_EMPLOYEE_ID}`, adminToken, { basicSalary: 99999 });
    expect(own.status).toBe(403);
  });

  it("a manager cannot change a job title's permissionsConfig", async () => {
    const res = await patch(`/api/job-titles/${TEST_JOB_TITLE_ID}`, managerToken, { permissionsConfig: GRANT_ALL });
    expect(res.status).toBe(403);
    const ok = await patch(`/api/job-titles/${TEST_JOB_TITLE_ID}`, managerToken, { description: 'still editable' });
    expect(ok.status).toBe(200);
    const [row] = await db.select().from(jobTitles).where(eq(jobTitles.id, TEST_JOB_TITLE_ID));
    expect(row.permissionsConfig).not.toEqual(GRANT_ALL);
  });
});
