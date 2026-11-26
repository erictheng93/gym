import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { eq, inArray } from 'drizzle-orm';
import app from '../src/app.js';
import {
  db, users, sessions, employees, attendances, shiftSchedules, employeeShifts,
} from '../src/db/index.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  getAuthToken,
  TEST_TENANT_ID,
  TEST_TENANT_B_ID,
  TEST_BRANCH_ID,
  TEST_BRANCH_B_ID,
  TEST_EMPLOYEE_ID,
  TEST_EMPLOYEE_B_ID,
  TEST_JOB_TITLE_ID,
} from './helpers.js';

// /api/attendances and /api/shift_schedules had no tenant filter; attendance
// check-out handed back (and a second click patched) another employee's row;
// /api/employee_shifts was mounted on the shift-schedule router; payroll and
// performance had no role check.

const STAFF_ID = '00000000-0000-4000-8000-0000000000f1';
const MANAGER_ID = '00000000-0000-4000-8000-0000000000f2';
const OTHER_EMPLOYEE_ID = '00000000-0000-4000-8000-0000000000f3';
const ATTENDANCE_B_ID = '00000000-0000-4000-8000-0000000000f4';
const SCHEDULE_A_ID = '00000000-0000-4000-8000-0000000000f5';
const SCHEDULE_B_ID = '00000000-0000-4000-8000-0000000000f6';
const ASSIGNMENT_B_ID = '00000000-0000-4000-8000-0000000000f7';
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

describe('HR attendance, shifts and payroll roles', () => {
  let adminToken: string;
  let staffToken: string;
  let managerToken: string;
  const userIds = [STAFF_ID, MANAGER_ID];
  const employeeIds = [TEST_EMPLOYEE_ID, OTHER_EMPLOYEE_ID, TEST_EMPLOYEE_B_ID];

  const send = (token: string, path: string, method = 'GET', body?: unknown) => authRequest(path, {
    method,
    token,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  beforeAll(async () => {
    await createTestFixtures();
    await db.delete(attendances).where(inArray(attendances.employeeId, employeeIds));
    adminToken = await getAuthToken();
    staffToken = await createUser(STAFF_ID, 'hr-staff@gym-nexus.test', 'staff');
    managerToken = await createUser(MANAGER_ID, 'hr-manager@gym-nexus.test', 'manager');

    await db.insert(employees).values({
      id: OTHER_EMPLOYEE_ID,
      fullName: 'Second Employee',
      employeeCode: 'EMPF03',
      branchId: TEST_BRANCH_ID,
      jobTitleId: TEST_JOB_TITLE_ID,
      status: 'ACTIVE',
      employmentType: 'FULL_TIME',
      hireDate: '2020-01-01',
      tenantId: TEST_TENANT_ID,
    });
    await db.insert(attendances).values({
      id: ATTENDANCE_B_ID,
      employeeId: TEST_EMPLOYEE_B_ID,
      branchId: TEST_BRANCH_B_ID,
      checkIn: new Date(Date.now() - 60 * 60 * 1000),
    });
    await db.insert(shiftSchedules).values([
      { id: SCHEDULE_A_ID, branchId: TEST_BRANCH_ID, name: 'A morning', startTime: '09:00', endTime: '18:00', tenantId: TEST_TENANT_ID },
      { id: SCHEDULE_B_ID, branchId: TEST_BRANCH_B_ID, name: 'B secret', startTime: '09:00', endTime: '18:00', tenantId: TEST_TENANT_B_ID },
    ]);
    await db.insert(employeeShifts).values({
      id: ASSIGNMENT_B_ID,
      employeeId: TEST_EMPLOYEE_B_ID,
      shiftScheduleId: SCHEDULE_B_ID,
      effectiveDate: '2020-01-01',
      tenantId: TEST_TENANT_B_ID,
    });
  });

  afterAll(async () => {
    await db.delete(employeeShifts).where(inArray(employeeShifts.employeeId, employeeIds));
    await db.delete(shiftSchedules).where(inArray(shiftSchedules.branchId, [TEST_BRANCH_ID, TEST_BRANCH_B_ID]));
    await db.delete(attendances).where(inArray(attendances.employeeId, employeeIds));
    await db.delete(sessions).where(inArray(sessions.userId, userIds));
    await db.delete(users).where(inArray(users.id, userIds));
    await cleanupTestFixtures();
  });

  describe('attendance check-out', () => {
    let mineId: string;
    let otherId: string;

    it('check-in returns the created record with its employee', async () => {
      const res = await send(staffToken, '/api/attendances', 'POST', { employee_id: TEST_EMPLOYEE_ID });
      expect(res.status).toBe(201);
      const { data } = await res.json();
      mineId = data.id;
      expect(data.employee_id).toBe(TEST_EMPLOYEE_ID);
      expect(data.employee.full_name).toBe('Test Admin');
      expect(data.branch_id).toBe(TEST_BRANCH_ID);
      expect(data.check_out).toBeNull();
    });

    it('refuses a second check-in while the record is open', async () => {
      const res = await send(staffToken, '/api/attendances', 'POST', { employee_id: TEST_EMPLOYEE_ID });
      expect(res.status).toBe(409);
    });

    it('returns the checked-out record itself, not the newest row of the table', async () => {
      // A newer check-in of another employee is the newest row (what the old ?id= lookup returned)
      const other = await send(staffToken, '/api/attendances', 'POST', { employee_id: OTHER_EMPLOYEE_ID });
      otherId = (await other.json()).data.id;

      const res = await send(staffToken, `/api/attendances/${mineId}`, 'PATCH', { check_out: new Date().toISOString() });
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.id).toBe(mineId);
      expect(data.employee_id).toBe(TEST_EMPLOYEE_ID);
      expect(data.check_out).not.toBeNull();

      const list = await (await send(staffToken, `/api/attendances?id=${mineId}`)).json();
      expect(list.data.map((r: { id: string }) => r.id)).toEqual([mineId]);
    });

    it('a second check-out click does not touch any record', async () => {
      const res = await send(staffToken, `/api/attendances/${mineId}`, 'PATCH', { check_out: new Date().toISOString() });
      expect(res.status).toBe(409);

      const [other] = await db.select().from(attendances).where(eq(attendances.id, otherId));
      expect(other.checkOut).toBeNull();
    });

    it('a manager may correct a closed record; staff may not delete', async () => {
      const fix = await send(managerToken, `/api/attendances/${mineId}`, 'PATCH', { work_hours: 8 });
      expect(fix.status).toBe(200);
      expect((await fix.json()).data.work_hours).toBe(8);

      expect((await send(staffToken, `/api/attendances/${otherId}`, 'DELETE')).status).toBe(403);
      expect((await send(managerToken, `/api/attendances/${otherId}`, 'DELETE')).status).toBe(200);
    });
  });

  describe('attendances of another tenant', () => {
    it('are not listed', async () => {
      const list = await (await send(adminToken, '/api/attendances?limit=500')).json();
      expect(list.data.map((r: { id: string }) => r.id)).not.toContain(ATTENDANCE_B_ID);
      const byId = await (await send(adminToken, `/api/attendances?id=${ATTENDANCE_B_ID}`)).json();
      expect(byId.data).toEqual([]);
      expect(byId.pagination.total).toBe(0);
    });

    it.each([
      ['GET', undefined],
      ['PATCH', { check_out: new Date().toISOString() }],
      ['DELETE', undefined],
    ])('%s /attendances/:id returns the same 404 as a random id', async (method, body) => {
      const foreign = await send(adminToken, `/api/attendances/${ATTENDANCE_B_ID}`, method, body);
      const missing = await send(adminToken, `/api/attendances/${randomUUID()}`, method, body);
      expect(missing.status).toBe(404);
      expect(foreign.status).toBe(404);
      expect(await foreign.json()).toEqual(await missing.json());

      const [row] = await db.select().from(attendances).where(eq(attendances.id, ATTENDANCE_B_ID));
      expect(row.checkOut).toBeNull();
    });

    it('cannot check in another tenant employee', async () => {
      const res = await send(adminToken, '/api/attendances', 'POST', { employee_id: TEST_EMPLOYEE_B_ID });
      expect(res.status).toBe(404);
    });
  });

  describe('shift schedules', () => {
    it('lists only this tenant schedules', async () => {
      const list = await (await send(staffToken, '/api/shift_schedules')).json();
      const ids = list.data.map((r: { id: string }) => r.id);
      expect(ids).toContain(SCHEDULE_A_ID);
      expect(ids).not.toContain(SCHEDULE_B_ID);
    });

    it.each([
      ['GET', undefined],
      ['PATCH', { name: 'Hijacked' }],
      ['DELETE', undefined],
    ])('%s /shift_schedules/:id returns the same 404 as a random id', async (method, body) => {
      const foreign = await send(adminToken, `/api/shift_schedules/${SCHEDULE_B_ID}`, method, body);
      const missing = await send(adminToken, `/api/shift_schedules/${randomUUID()}`, method, body);
      expect(missing.status).toBe(404);
      expect(foreign.status).toBe(404);
      expect(await foreign.json()).toEqual(await missing.json());
    });

    it('left the other tenant schedule untouched', async () => {
      const [row] = await db.select().from(shiftSchedules).where(eq(shiftSchedules.id, SCHEDULE_B_ID));
      expect(row.name).toBe('B secret');
      expect(row.status).toBe('published');
    });

    it('cannot create a schedule in another tenant branch', async () => {
      const res = await send(adminToken, '/api/shift_schedules', 'POST', {
        branch_id: TEST_BRANCH_B_ID, name: 'X', start_time: '09:00', end_time: '18:00',
      });
      expect(res.status).toBe(400);
    });

    it('creates with MONDAY..SUNDAY days for a manager; staff gets 403', async () => {
      const body = { branch_id: TEST_BRANCH_ID, name: 'Weekend', start_time: '10:00', end_time: '19:00', applicable_days: ['SATURDAY', 'SUNDAY'] };
      expect((await send(staffToken, '/api/shift_schedules', 'POST', body)).status).toBe(403);
      const res = await send(managerToken, '/api/shift_schedules', 'POST', body);
      expect(res.status).toBe(201);
      const { data } = await res.json();
      expect(data.applicable_days).toEqual(['SATURDAY', 'SUNDAY']);
      const [row] = await db.select().from(shiftSchedules).where(eq(shiftSchedules.id, data.id));
      expect(row.tenantId).toBe(TEST_TENANT_ID);
    });
  });

  describe('/api/employee_shifts', () => {
    let assignmentId: string;

    it('POST creates an assignment (it hit the shift-schedule create before)', async () => {
      const res = await send(managerToken, '/api/employee_shifts', 'POST', {
        employee_id: TEST_EMPLOYEE_ID, shift_schedule_id: SCHEDULE_A_ID, effective_date: '2026-01-01',
      });
      expect(res.status).toBe(201);
      const { data } = await res.json();
      assignmentId = data.id;
      expect(data).toMatchObject({ employee_id: TEST_EMPLOYEE_ID, shift_schedule_id: SCHEDULE_A_ID, effective_date: '2026-01-01', end_date: null });
    });

    it('GET lists assignments, not shift schedules', async () => {
      const list = await (await send(staffToken, `/api/employee_shifts?employee_id=${TEST_EMPLOYEE_ID}`)).json();
      expect(list.data).toHaveLength(1);
      expect(list.data[0]).toMatchObject({
        id: assignmentId,
        employee: { id: TEST_EMPLOYEE_ID, full_name: 'Test Admin' },
        shift_schedule: { id: SCHEDULE_A_ID, name: 'A morning' },
      });
      expect(list.pagination.total).toBe(1);

      const all = await (await send(adminToken, '/api/employee_shifts')).json();
      expect(all.data.map((r: { id: string }) => r.id)).not.toContain(ASSIGNMENT_B_ID);
    });

    it('PATCH ends the assignment (it patched a shift schedule before)', async () => {
      const res = await send(managerToken, `/api/employee_shifts/${assignmentId}`, 'PATCH', { end_date: '2026-06-30' });
      expect(res.status).toBe(200);
      expect((await res.json()).data.end_date).toBe('2026-06-30');
      const [schedule] = await db.select().from(shiftSchedules).where(eq(shiftSchedules.id, SCHEDULE_A_ID));
      expect(schedule.status).toBe('published');
    });

    it('rejects another tenant employee or schedule', async () => {
      const foreignEmployee = await send(adminToken, '/api/employee_shifts', 'POST', {
        employee_id: TEST_EMPLOYEE_B_ID, shift_schedule_id: SCHEDULE_A_ID, effective_date: '2026-01-01',
      });
      expect(foreignEmployee.status).toBe(404);
      const foreignSchedule = await send(adminToken, '/api/employee_shifts', 'POST', {
        employee_id: TEST_EMPLOYEE_ID, shift_schedule_id: SCHEDULE_B_ID, effective_date: '2026-01-01',
      });
      expect(foreignSchedule.status).toBe(404);
    });

    it.each([
      ['PATCH', { end_date: '2000-01-01' }],
      ['DELETE', undefined],
    ])('%s another tenant assignment returns the same 404 as a random id', async (method, body) => {
      const foreign = await send(adminToken, `/api/employee_shifts/${ASSIGNMENT_B_ID}`, method, body);
      const missing = await send(adminToken, `/api/employee_shifts/${randomUUID()}`, method, body);
      expect(missing.status).toBe(404);
      expect(foreign.status).toBe(404);
      expect(await foreign.json()).toEqual(await missing.json());
    });

    it('staff cannot assign; DELETE removes the assignment', async () => {
      const staff = await send(staffToken, `/api/employee_shifts/${assignmentId}`, 'DELETE');
      expect(staff.status).toBe(403);
      const res = await send(managerToken, `/api/employee_shifts/${assignmentId}`, 'DELETE');
      expect(res.status).toBe(200);
      const rows = await db.select().from(employeeShifts).where(eq(employeeShifts.id, assignmentId));
      expect(rows).toHaveLength(0);
    });
  });

  describe('payroll and performance roles', () => {
    it.each([
      ['GET', '/api/payroll/salary-records'],
      ['GET', '/api/payroll/export'],
      ['POST', '/api/payroll/generate'],
      ['POST', '/api/payroll/batch-approve'],
      ['GET', '/api/performance/reviews'],
      ['GET', '/api/performance/team-dashboard'],
    ])('staff gets 403 on %s %s', async (method, path) => {
      const body = method === 'POST' ? { period: '2099-02', ids: [randomUUID()] } : undefined;
      const res = await send(staffToken, path, method, body);
      expect(res.status).toBe(403);
    });

    it('a manager can read payroll and reviews', async () => {
      expect((await send(managerToken, '/api/payroll/salary-records')).status).toBe(200);
      expect((await send(managerToken, '/api/performance/reviews')).status).toBe(200);
    });

    it.each([
      ['POST', '/api/payroll/generate', { period: '2099-02' }],
      ['POST', '/api/payroll/batch-approve', { ids: [randomUUID()] }],
      ['POST', `/api/payroll/salary-records/${randomUUID()}/approve`, undefined],
      ['POST', `/api/payroll/salary-records/${randomUUID()}/pay`, undefined],
      ['PATCH', `/api/payroll/salary-records/${randomUUID()}`, { bonus: 1 }],
      ['POST', '/api/payroll/promotions', { employee_id: TEST_EMPLOYEE_ID, type: 'PROMOTION', effective_date: '2000-01-01' }],
      ['POST', `/api/performance/reviews/${randomUUID()}/approve`, {}],
      ['POST', `/api/performance/reviews/${randomUUID()}/reject`, { reason: 'x' }],
    ])('a manager gets 403 on %s %s (admin only)', async (method, path, body) => {
      const res = await send(managerToken, path, method, body);
      expect(res.status).toBe(403);
    });

    it('an admin passes the role gate (random id -> 404, not 403)', async () => {
      const res = await send(adminToken, `/api/payroll/salary-records/${randomUUID()}/approve`, 'POST');
      expect(res.status).toBe(404);
    });
  });
});
