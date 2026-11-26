import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  db, branches, employees, members, contracts, classes, classSessions, bookings, payments,
} from '../src/db/index.js';
import {
  createTestFixtures,
  cleanupTestFixtures,
  authRequest,
  getAuthToken,
  TEST_MEMBER_ID,
  TEST_BRANCH_B_ID,
  TEST_EMPLOYEE_B_ID,
  TEST_MEMBER_B_ID,
  TEST_CONTRACT_B_ID,
  TEST_TENANT_B_ID,
} from './helpers.js';

// A staff user of tenant A must not be able to tell "this id belongs to another
// tenant" from "this id does not exist": same status AND same body.

const CLASS_B_ID = '00000000-0000-4000-8000-0000000000c1';
const SESSION_B_ID = '00000000-0000-4000-8000-0000000000c2';
const BOOKING_B_ID = '00000000-0000-4000-8000-0000000000c3';
const PAYMENT_B_ID = '00000000-0000-4000-8000-0000000000c4';

interface Probe {
  name: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  // Builds the path for a given id (tenant-B id or a random one)
  path: (id: string) => string;
  body?: (id: string) => unknown;
  // Which fixture id to aim at
  target: string;
}

const probes: Probe[] = [
  { name: 'GET /api/branches/:id', method: 'GET', path: (id) => `/api/branches/${id}`, target: TEST_BRANCH_B_ID },
  { name: 'PATCH /api/branches/:id', method: 'PATCH', path: (id) => `/api/branches/${id}`, body: () => ({ name: 'Hijacked' }), target: TEST_BRANCH_B_ID },
  { name: 'DELETE /api/branches/:id', method: 'DELETE', path: (id) => `/api/branches/${id}`, target: TEST_BRANCH_B_ID },

  { name: 'GET /api/employees/:id', method: 'GET', path: (id) => `/api/employees/${id}`, target: TEST_EMPLOYEE_B_ID },
  { name: 'PATCH /api/employees/:id', method: 'PATCH', path: (id) => `/api/employees/${id}`, body: () => ({ fullName: 'Hijacked' }), target: TEST_EMPLOYEE_B_ID },
  { name: 'DELETE /api/employees/:id', method: 'DELETE', path: (id) => `/api/employees/${id}`, target: TEST_EMPLOYEE_B_ID },

  { name: 'GET /api/members/:id', method: 'GET', path: (id) => `/api/members/${id}`, target: TEST_MEMBER_B_ID },
  { name: 'PATCH /api/members/:id', method: 'PATCH', path: (id) => `/api/members/${id}`, body: () => ({ fullName: 'Hijacked' }), target: TEST_MEMBER_B_ID },
  { name: 'DELETE /api/members/:id', method: 'DELETE', path: (id) => `/api/members/${id}`, target: TEST_MEMBER_B_ID },
  { name: 'GET /api/members/:id/contracts', method: 'GET', path: (id) => `/api/members/${id}/contracts`, target: TEST_MEMBER_B_ID },

  { name: 'GET /api/contracts/:id', method: 'GET', path: (id) => `/api/contracts/${id}`, target: TEST_CONTRACT_B_ID },
  { name: 'PATCH /api/contracts/:id', method: 'PATCH', path: (id) => `/api/contracts/${id}`, body: () => ({ notes: 'Hijacked' }), target: TEST_CONTRACT_B_ID },
  { name: 'POST /api/contracts/:id/activate', method: 'POST', path: (id) => `/api/contracts/${id}/activate`, target: TEST_CONTRACT_B_ID },
  { name: 'POST /api/contracts/:id/pause', method: 'POST', path: (id) => `/api/contracts/${id}/pause`, body: () => ({ startDate: '2026-12-01', endDate: '2026-12-08' }), target: TEST_CONTRACT_B_ID },
  { name: 'POST /api/contracts/:id/resume', method: 'POST', path: (id) => `/api/contracts/${id}/resume`, target: TEST_CONTRACT_B_ID },

  { name: 'GET /api/classes/:id', method: 'GET', path: (id) => `/api/classes/${id}`, target: CLASS_B_ID },
  { name: 'PATCH /api/classes/:id', method: 'PATCH', path: (id) => `/api/classes/${id}`, body: () => ({ name: 'Hijacked' }), target: CLASS_B_ID },
  { name: 'GET /api/classes/:id/sessions', method: 'GET', path: (id) => `/api/classes/${id}/sessions`, target: CLASS_B_ID },

  { name: 'GET /api/bookings/:id', method: 'GET', path: (id) => `/api/bookings/${id}`, target: BOOKING_B_ID },
  { name: 'POST /api/bookings/:id/cancel', method: 'POST', path: (id) => `/api/bookings/${id}/cancel`, body: () => ({}), target: BOOKING_B_ID },
  { name: 'POST /api/bookings/:id/attend', method: 'POST', path: (id) => `/api/bookings/${id}/attend`, target: BOOKING_B_ID },
  { name: 'POST /api/bookings (session of another tenant)', method: 'POST', path: () => '/api/bookings', body: (id) => ({ sessionId: id, memberId: TEST_MEMBER_ID }), target: SESSION_B_ID },

  { name: 'GET /api/payments/:id', method: 'GET', path: (id) => `/api/payments/${id}`, target: PAYMENT_B_ID },
];

describe('Cross-tenant access is indistinguishable from a missing id', () => {
  let authToken: string;

  beforeAll(async () => {
    await createTestFixtures();
    authToken = await getAuthToken();

    await db.insert(classes).values({
      id: CLASS_B_ID,
      name: 'B Yoga',
      category: 'YOGA',
      difficultyLevel: 'BEGINNER',
      durationMinutes: 60,
      maxCapacity: 20,
      instructorId: TEST_EMPLOYEE_B_ID,
      branchId: TEST_BRANCH_B_ID,
    }).onConflictDoNothing();
    await db.insert(classSessions).values({
      id: SESSION_B_ID,
      classId: CLASS_B_ID,
      branchId: TEST_BRANCH_B_ID,
      instructorId: TEST_EMPLOYEE_B_ID,
      sessionDate: '2030-01-01',
      startTime: '10:00',
      endTime: '11:00',
      maxCapacity: 20,
      currentCount: 0,
      waitlistCount: 0,
      sessionStatus: 'SCHEDULED',
    }).onConflictDoNothing();
    await db.insert(bookings).values({
      id: BOOKING_B_ID,
      sessionId: SESSION_B_ID,
      memberId: TEST_MEMBER_B_ID,
      contractId: TEST_CONTRACT_B_ID,
      bookingStatus: 'CONFIRMED',
    }).onConflictDoNothing();
    await db.insert(payments).values({
      id: PAYMENT_B_ID,
      contractId: TEST_CONTRACT_B_ID,
      memberId: TEST_MEMBER_B_ID,
      branchId: TEST_BRANCH_B_ID,
      amount: '100',
      paymentMethod: 'CASH',
      tenantId: TEST_TENANT_B_ID,
    }).onConflictDoNothing();
  });

  afterAll(async () => {
    await db.delete(payments).where(eq(payments.id, PAYMENT_B_ID));
    await db.delete(bookings).where(eq(bookings.id, BOOKING_B_ID));
    await cleanupTestFixtures();
  });

  it.each(probes)('$name returns the same 404 as a random id', async (probe) => {
    const send = (id: string) => authRequest(probe.path(id), {
      method: probe.method,
      token: authToken,
      body: probe.body ? JSON.stringify(probe.body(id)) : undefined,
    });

    const foreign = await send(probe.target);
    const missing = await send(randomUUID());

    expect(missing.status).toBe(404);
    expect(foreign.status).toBe(404);
    expect(await foreign.json()).toEqual(await missing.json());
  });

  it('leaves the other tenant rows untouched after the write attempts', async () => {
    const [branch] = await db.select().from(branches).where(eq(branches.id, TEST_BRANCH_B_ID));
    expect(branch.name).not.toBe('Hijacked');
    expect(branch.status).not.toBe('archived');

    const [employee] = await db.select().from(employees).where(eq(employees.id, TEST_EMPLOYEE_B_ID));
    expect(employee.fullName).not.toBe('Hijacked');
    expect(employee.status).not.toBe('RESIGNED');

    const [member] = await db.select().from(members).where(eq(members.id, TEST_MEMBER_B_ID));
    expect(member.fullName).not.toBe('Hijacked');
    expect(member.status).not.toBe('SUSPENDED');

    const [contract] = await db.select().from(contracts).where(eq(contracts.id, TEST_CONTRACT_B_ID));
    expect(contract.notes).not.toBe('Hijacked');
    expect(contract.status).toBe('ACTIVE'); // fixture starts ACTIVE; never paused

    const [klass] = await db.select().from(classes).where(eq(classes.id, CLASS_B_ID));
    expect(klass.name).toBe('B Yoga');

    const [booking] = await db.select().from(bookings).where(eq(bookings.id, BOOKING_B_ID));
    expect(booking.bookingStatus).toBe('CONFIRMED');
    expect(booking.attendedAt).toBeNull();

    const [session] = await db.select().from(classSessions).where(eq(classSessions.id, SESSION_B_ID));
    expect(session.currentCount).toBe(0);
  });
});
