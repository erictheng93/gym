import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import app from '../src/app.js';
import { generateCoachTokens } from '../src/services/coach-jwt.js';
import { db, members, coachMemberAssignments, coachNotes } from '../src/db/index.js';
import {
  createCoachTestFixtures,
  cleanupCoachTestFixtures,
  getCoachToken,
  TEST_MEMBER_ID,
  TEST_MEMBER_B_ID,
  TEST_COACH_EMPLOYEE_ID,
  TEST_TENANT_ID,
  TEST_TENANT_B_ID,
  TEST_BRANCH_ID,
  TEST_BRANCH_B_ID,
  TEST_EMPLOYEE_B_ID,
} from './helpers.js';

// =============================================================================
// Coach Students & Notes API Tests
// Endpoints:
//   GET    /api/coach/students              - List assigned students
//   GET    /api/coach/students/:id          - Student details
//   GET    /api/coach/students/:id/notes    - List notes
//   POST   /api/coach/students/:id/notes    - Create note
//   PATCH  /api/coach/students/:id/notes/:noteId - Update note
//   DELETE /api/coach/students/:id/notes/:noteId - Delete note
// =============================================================================

const UNKNOWN_ID = '00000000-0000-4000-8000-ffffffffffff';
// A second coach in the SAME tenant who has no assignments
const OTHER_COACH_SAME_TENANT_ID = '00000000-0000-4000-8000-0000000000c1';

/**
 * Helper to make authenticated coach requests with X-Coach-Token and X-Tenant-Id.
 */
async function makeCoachRequest(path: string, options: RequestInit = {}) {
  const token = await getCoachToken();
  const headers = new Headers(options.headers);
  headers.set('X-Coach-Token', token);
  headers.set('X-Tenant-Id', TEST_TENANT_ID);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  return app.request(path, { ...options, headers });
}

function requestAs(
  coach: { id: string; tenantId: string; branchId: string },
  path: string,
  options: RequestInit = {}
) {
  const { accessToken } = generateCoachTokens({
    id: coach.id,
    employeeCode: 'OTHER',
    branchId: coach.branchId,
    tenantId: coach.tenantId,
    jobTitle: 'COACH',
  });
  const headers = new Headers(options.headers);
  headers.set('X-Coach-Token', accessToken);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  return app.request(path, { ...options, headers });
}

const sameTenantOtherCoach = {
  id: OTHER_COACH_SAME_TENANT_ID,
  tenantId: TEST_TENANT_ID,
  branchId: TEST_BRANCH_ID,
};
const otherTenantCoach = {
  id: TEST_EMPLOYEE_B_ID,
  tenantId: TEST_TENANT_B_ID,
  branchId: TEST_BRANCH_B_ID,
};

describe('Coach Students API', () => {
  let unassignedMemberId: string;

  beforeAll(async () => {
    await createCoachTestFixtures();

    // A member in the same tenant who WAS assigned to the coach but has been unassigned
    const [former] = await db.insert(members).values({
      fullName: 'Former Student',
      phone: '0911000111',
      memberCode: 'M-FORMER-01',
      branchId: TEST_BRANCH_ID,
      status: 'ACTIVE',
      joinDate: new Date().toISOString().split('T')[0],
      tenantId: TEST_TENANT_ID,
    }).returning();
    unassignedMemberId = former.id;
    await db.insert(coachMemberAssignments).values({
      coachId: TEST_COACH_EMPLOYEE_ID,
      memberId: former.id,
      role: 'SECONDARY',
      tenantId: TEST_TENANT_ID,
      unassignedAt: new Date(),
    });
  });

  afterAll(async () => {
    await cleanupCoachTestFixtures();
  });

  // ===========================================================================
  // GET /api/coach/students - List Assigned Students
  // ===========================================================================

  describe('GET /api/coach/students', () => {
    it('lists the assigned student with member fields and active contracts', async () => {
      const response = await makeCoachRequest('/api/coach/students');

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.meta).toEqual({ total: 1, limit: 20, offset: 0 });
      expect(data.data).toHaveLength(1);

      const student = data.data[0];
      expect(student).toMatchObject({
        id: TEST_MEMBER_ID,
        member_code: 'M000001',
        full_name: 'Test Member',
        phone: '0912345678',
        email: 'member@test.test',
        status: 'ACTIVE',
        role: 'PRIMARY',
      });
      expect(student.active_contracts).toHaveLength(1);
      expect(student.active_contracts[0].status).toBe('ACTIVE');
    });

    it('does not list unassigned members, same-tenant or cross-tenant', async () => {
      const data = await (await makeCoachRequest('/api/coach/students')).json();
      const ids = data.data.map((s: { id: string }) => s.id);

      expect(ids).not.toContain(unassignedMemberId);
      expect(ids).not.toContain(TEST_MEMBER_B_ID);
    });

    it('filters students by role', async () => {
      const primary = await (await makeCoachRequest('/api/coach/students?role=PRIMARY')).json();
      expect(primary.data.map((s: { id: string }) => s.id)).toEqual([TEST_MEMBER_ID]);

      // The only SECONDARY assignment has been unassigned
      const secondary = await (await makeCoachRequest('/api/coach/students?role=SECONDARY')).json();
      expect(secondary.data).toEqual([]);
      expect(secondary.meta.total).toBe(0);
    });

    it('filters students by search term', async () => {
      const hit = await (await makeCoachRequest('/api/coach/students?search=Test%20Member')).json();
      expect(hit.data.map((s: { id: string }) => s.id)).toEqual([TEST_MEMBER_ID]);

      const byCode = await (await makeCoachRequest('/api/coach/students?search=M000001')).json();
      expect(byCode.data.map((s: { id: string }) => s.id)).toEqual([TEST_MEMBER_ID]);

      const miss = await (await makeCoachRequest('/api/coach/students?search=NoSuchPerson')).json();
      expect(miss.data).toEqual([]);
      expect(miss.meta.total).toBe(0);
    });

    it('filters students by member status', async () => {
      const active = await (await makeCoachRequest('/api/coach/students?status=ACTIVE')).json();
      expect(active.data.map((s: { id: string }) => s.id)).toEqual([TEST_MEMBER_ID]);

      const banned = await (await makeCoachRequest('/api/coach/students?status=BANNED')).json();
      expect(banned.data).toEqual([]);
    });

    it('supports pagination with limit and offset', async () => {
      const first = await (await makeCoachRequest('/api/coach/students?limit=1&offset=0')).json();
      expect(first.data).toHaveLength(1);
      expect(first.meta).toEqual({ total: 1, limit: 1, offset: 0 });

      const beyond = await (await makeCoachRequest('/api/coach/students?limit=1&offset=1')).json();
      expect(beyond.data).toEqual([]);
      expect(beyond.meta).toEqual({ total: 1, limit: 1, offset: 1 });
    });

    it('returns an empty list for another coach in the same tenant', async () => {
      const response = await requestAs(sameTenantOtherCoach, '/api/coach/students');

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data).toEqual([]);
      expect(data.meta.total).toBe(0);
    });

    it('returns an empty list for a coach in another tenant', async () => {
      const response = await requestAs(otherTenantCoach, '/api/coach/students');

      expect(response.status).toBe(200);
      expect((await response.json()).data).toEqual([]);
    });

    it('should return 401 without token', async () => {
      const response = await app.request('/api/coach/students', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });
  });

  // ===========================================================================
  // GET /api/coach/students/:id - Student Details
  // ===========================================================================

  describe('GET /api/coach/students/:id', () => {
    it('returns student details for an assigned member', async () => {
      const response = await makeCoachRequest(`/api/coach/students/${TEST_MEMBER_ID}`);

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toMatchObject({
        id: TEST_MEMBER_ID,
        member_code: 'M000001',
        full_name: 'Test Member',
        phone: '0912345678',
        email: 'member@test.test',
        status: 'ACTIVE',
        role: 'PRIMARY',
      });
      expect(data.data.goals).toEqual([]);
      expect(data.data.measurements).toEqual([]);
      expect(data.data.notes).toEqual([]);
    });

    it('includes contract details for the assigned member', async () => {
      const data = await (await makeCoachRequest(`/api/coach/students/${TEST_MEMBER_ID}`)).json();

      expect(data.data.contracts).toHaveLength(1);
      expect(data.data.contracts[0]).toMatchObject({
        contract_no: 'C000001',
        status: 'ACTIVE',
        plan_type: 'TIME_BASED',
      });
      expect(typeof data.data.contracts[0].plan_name).toBe('string');
    });

    it('includes only class history with this coach', async () => {
      const data = await (await makeCoachRequest(`/api/coach/students/${TEST_MEMBER_ID}`)).json();

      // Fixture: one booking for the member on this coach's session
      expect(data.data.class_history).toHaveLength(1);
      expect(data.data.class_history[0].status).toBe('CONFIRMED');
      // NOTE: API returns this EXTRACT() result as a numeric string (e.g. "60.0000000000000000")
      expect(Number(data.data.class_history[0].duration_minutes)).toBe(60);
    });

    it('should return 403 for a member that does not exist / is not assigned', async () => {
      const response = await makeCoachRequest(`/api/coach/students/${UNKNOWN_ID}`);

      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.code).toBe('FORBIDDEN');
    });

    it('should return 403 for a member of another tenant', async () => {
      const response = await makeCoachRequest(`/api/coach/students/${TEST_MEMBER_B_ID}`);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.code).toBe('FORBIDDEN');
      expect(JSON.stringify(data)).not.toContain('Other Member');
    });

    it('should return 403 for a member that has been unassigned from the coach', async () => {
      const response = await makeCoachRequest(`/api/coach/students/${unassignedMemberId}`);

      expect(response.status).toBe(403);
      expect((await response.json()).code).toBe('FORBIDDEN');
    });

    it("should return 403 when another coach asks for this coach's student", async () => {
      const sameTenant = await requestAs(sameTenantOtherCoach, `/api/coach/students/${TEST_MEMBER_ID}`);
      expect(sameTenant.status).toBe(403);
      expect(JSON.stringify(await sameTenant.json())).not.toContain('Test Member');

      const otherTenant = await requestAs(otherTenantCoach, `/api/coach/students/${TEST_MEMBER_ID}`);
      expect(otherTenant.status).toBe(403);
    });

    it('should return 401 without token', async () => {
      const response = await app.request(`/api/coach/students/${TEST_MEMBER_ID}`, {
        method: 'GET',
      });

      expect(response.status).toBe(401);
    });
  });

  // ===========================================================================
  // Notes CRUD
  // ===========================================================================

  describe('Notes CRUD', () => {
    let createdNoteId: string;

    // -------------------------------------------------------------------------
    // POST /api/coach/students/:id/notes - Create Note
    // -------------------------------------------------------------------------

    describe('POST /api/coach/students/:id/notes', () => {
      it('should create a note successfully', async () => {
        const response = await makeCoachRequest(`/api/coach/students/${TEST_MEMBER_ID}/notes`, {
          method: 'POST',
          body: JSON.stringify({
            note_type: 'PROGRESS',
            content: 'Student is making great progress on upper body strength.',
            is_private: false,
          }),
        });

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.message).toBe('筆記已建立');
        expect(data.data.note_type).toBe('PROGRESS');
        expect(data.data.content).toBe('Student is making great progress on upper body strength.');
        expect(data.data.is_private).toBe(false);

        // Store note ID for subsequent tests
        createdNoteId = data.data.id;

        // Persisted against the right coach, member and tenant
        const [row] = await db.select().from(coachNotes).where(eq(coachNotes.id, createdNoteId));
        expect(row.coachId).toBe(TEST_COACH_EMPLOYEE_ID);
        expect(row.memberId).toBe(TEST_MEMBER_ID);
        expect(row.tenantId).toBe(TEST_TENANT_ID);
      });

      it('should create a private note', async () => {
        const response = await makeCoachRequest(`/api/coach/students/${TEST_MEMBER_ID}/notes`, {
          method: 'POST',
          body: JSON.stringify({
            note_type: 'INJURY',
            content: 'Left knee discomfort reported. Avoid heavy squats.',
            is_private: true,
          }),
        });

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.note_type).toBe('INJURY');
        expect(data.data.is_private).toBe(true);
      });

      it('should reject creating a note for a never-assigned member', async () => {
        const response = await makeCoachRequest(`/api/coach/students/${UNKNOWN_ID}/notes`, {
          method: 'POST',
          body: JSON.stringify({
            note_type: 'OTHER',
            content: 'This should not be allowed.',
          }),
        });

        expect(response.status).toBe(403);

        const data = await response.json();
        expect(data.success).toBe(false);
        expect(data.code).toBe('FORBIDDEN');
      });

      it('should reject creating a note for an unassigned member and for another tenant', async () => {
        for (const memberId of [unassignedMemberId, TEST_MEMBER_B_ID]) {
          const response = await makeCoachRequest(`/api/coach/students/${memberId}/notes`, {
            method: 'POST',
            body: JSON.stringify({ note_type: 'OTHER', content: 'Not allowed.' }),
          });
          expect(response.status).toBe(403);
        }

        const rows = await db.select().from(coachNotes).where(eq(coachNotes.memberId, unassignedMemberId));
        expect(rows).toEqual([]);
      });

      it("should reject another coach creating a note on this coach's student", async () => {
        const response = await requestAs(sameTenantOtherCoach, `/api/coach/students/${TEST_MEMBER_ID}/notes`, {
          method: 'POST',
          body: JSON.stringify({ note_type: 'OTHER', content: 'Intruder note.' }),
        });

        expect(response.status).toBe(403);
      });

      it('should reject creating a note with empty content', async () => {
        const response = await makeCoachRequest(`/api/coach/students/${TEST_MEMBER_ID}/notes`, {
          method: 'POST',
          body: JSON.stringify({
            note_type: 'PROGRESS',
            content: '',
          }),
        });

        expect(response.status).toBe(400);
      });

      it('should reject creating a note with invalid note_type', async () => {
        const response = await makeCoachRequest(`/api/coach/students/${TEST_MEMBER_ID}/notes`, {
          method: 'POST',
          body: JSON.stringify({
            note_type: 'INVALID_TYPE',
            content: 'Some content.',
          }),
        });

        expect(response.status).toBe(400);
      });
    });

    // -------------------------------------------------------------------------
    // GET /api/coach/students/:id/notes - List Notes
    // -------------------------------------------------------------------------

    describe('GET /api/coach/students/:id/notes', () => {
      it('lists exactly the notes created for the student', async () => {
        const response = await makeCoachRequest(`/api/coach/students/${TEST_MEMBER_ID}/notes`);

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.meta).toEqual({ total: 2, limit: 20, offset: 0 });
        expect(data.data).toHaveLength(2);

        const progress = data.data.find((n: { id: string }) => n.id === createdNoteId);
        expect(progress).toMatchObject({
          note_type: 'PROGRESS',
          content: 'Student is making great progress on upper body strength.',
          is_private: false,
        });
      });

      it('filters notes by note_type', async () => {
        const progress = await (
          await makeCoachRequest(`/api/coach/students/${TEST_MEMBER_ID}/notes?note_type=PROGRESS`)
        ).json();
        expect(progress.data).toHaveLength(1);
        expect(progress.data[0].note_type).toBe('PROGRESS');
        expect(progress.meta.total).toBe(1);

        const injury = await (
          await makeCoachRequest(`/api/coach/students/${TEST_MEMBER_ID}/notes?note_type=INJURY`)
        ).json();
        expect(injury.data).toHaveLength(1);
        expect(injury.data[0].note_type).toBe('INJURY');
        expect(injury.data[0].is_private).toBe(true);

        const none = await (
          await makeCoachRequest(`/api/coach/students/${TEST_MEMBER_ID}/notes?note_type=GOAL`)
        ).json();
        expect(none.data).toEqual([]);
      });

      it('supports pagination with limit and offset', async () => {
        const page1 = await (
          await makeCoachRequest(`/api/coach/students/${TEST_MEMBER_ID}/notes?limit=1&offset=0`)
        ).json();
        const page2 = await (
          await makeCoachRequest(`/api/coach/students/${TEST_MEMBER_ID}/notes?limit=1&offset=1`)
        ).json();

        expect(page1.data).toHaveLength(1);
        expect(page2.data).toHaveLength(1);
        expect(page1.data[0].id).not.toBe(page2.data[0].id);
        expect(page1.meta).toEqual({ total: 2, limit: 1, offset: 0 });
        expect(page2.meta).toEqual({ total: 2, limit: 1, offset: 1 });
      });

      it('should return 403 for a never-assigned, unassigned or cross-tenant member', async () => {
        for (const memberId of [UNKNOWN_ID, unassignedMemberId, TEST_MEMBER_B_ID]) {
          const response = await makeCoachRequest(`/api/coach/students/${memberId}/notes`);

          expect(response.status).toBe(403);
          const data = await response.json();
          expect(data.success).toBe(false);
          expect(data.code).toBe('FORBIDDEN');
        }
      });

      it("should not let another coach read this coach's notes", async () => {
        const sameTenant = await requestAs(sameTenantOtherCoach, `/api/coach/students/${TEST_MEMBER_ID}/notes`);
        expect(sameTenant.status).toBe(403);
        expect(JSON.stringify(await sameTenant.json())).not.toContain('upper body');

        const otherTenant = await requestAs(otherTenantCoach, `/api/coach/students/${TEST_MEMBER_ID}/notes`);
        expect(otherTenant.status).toBe(403);
      });

      it('shows the notes in the student detail view', async () => {
        const data = await (await makeCoachRequest(`/api/coach/students/${TEST_MEMBER_ID}`)).json();

        expect(data.data.notes).toHaveLength(2);
        expect(data.data.notes.map((n: { id: string }) => n.id)).toContain(createdNoteId);
      });
    });

    // -------------------------------------------------------------------------
    // PATCH /api/coach/students/:id/notes/:noteId - Update Note
    // -------------------------------------------------------------------------

    describe('PATCH /api/coach/students/:id/notes/:noteId', () => {
      it('should update note content and leave other fields unchanged', async () => {
        const response = await makeCoachRequest(
          `/api/coach/students/${TEST_MEMBER_ID}/notes/${createdNoteId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              content: 'Updated: Excellent progress on bench press.',
            }),
          }
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.id).toBe(createdNoteId);
        expect(data.data.content).toBe('Updated: Excellent progress on bench press.');
        expect(data.data.note_type).toBe('PROGRESS'); // unchanged
        expect(data.data.is_private).toBe(false); // unchanged
      });

      it('should update note_type', async () => {
        const response = await makeCoachRequest(
          `/api/coach/students/${TEST_MEMBER_ID}/notes/${createdNoteId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              note_type: 'GOAL',
            }),
          }
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.note_type).toBe('GOAL');
        expect(data.data.content).toBe('Updated: Excellent progress on bench press.');
      });

      it('should update is_private flag', async () => {
        const response = await makeCoachRequest(
          `/api/coach/students/${TEST_MEMBER_ID}/notes/${createdNoteId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              is_private: true,
            }),
          }
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.is_private).toBe(true);
      });

      it('should reject an empty content update with 400', async () => {
        const response = await makeCoachRequest(
          `/api/coach/students/${TEST_MEMBER_ID}/notes/${createdNoteId}`,
          { method: 'PATCH', body: JSON.stringify({ content: '' }) }
        );

        expect(response.status).toBe(400);
      });

      it('should return 404 for non-existent note', async () => {
        const response = await makeCoachRequest(
          `/api/coach/students/${TEST_MEMBER_ID}/notes/${UNKNOWN_ID}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              content: 'This should not work.',
            }),
          }
        );

        expect(response.status).toBe(404);

        const data = await response.json();
        expect(data.success).toBe(false);
        expect(data.code).toBe('NOT_FOUND');
      });

      it("should not let another coach edit this coach's note", async () => {
        for (const coach of [sameTenantOtherCoach, otherTenantCoach]) {
          const response = await requestAs(
            coach,
            `/api/coach/students/${TEST_MEMBER_ID}/notes/${createdNoteId}`,
            { method: 'PATCH', body: JSON.stringify({ content: 'Hijacked' }) }
          );
          expect(response.status).toBe(404);
        }

        const [row] = await db.select().from(coachNotes).where(eq(coachNotes.id, createdNoteId));
        expect(row.content).toBe('Updated: Excellent progress on bench press.');
      });

      it('should not update a note through a different member id in the path', async () => {
        const response = await makeCoachRequest(
          `/api/coach/students/${unassignedMemberId}/notes/${createdNoteId}`,
          { method: 'PATCH', body: JSON.stringify({ content: 'Wrong member' }) }
        );

        expect(response.status).toBe(404);
      });
    });

    // -------------------------------------------------------------------------
    // DELETE /api/coach/students/:id/notes/:noteId - Delete Note
    // -------------------------------------------------------------------------

    describe('DELETE /api/coach/students/:id/notes/:noteId', () => {
      it("should not let another coach delete this coach's note", async () => {
        for (const coach of [sameTenantOtherCoach, otherTenantCoach]) {
          const response = await requestAs(
            coach,
            `/api/coach/students/${TEST_MEMBER_ID}/notes/${createdNoteId}`,
            { method: 'DELETE' }
          );
          expect(response.status).toBe(404);
        }

        const rows = await db.select().from(coachNotes).where(eq(coachNotes.id, createdNoteId));
        expect(rows).toHaveLength(1);
      });

      it('should delete the note successfully', async () => {
        const response = await makeCoachRequest(
          `/api/coach/students/${TEST_MEMBER_ID}/notes/${createdNoteId}`,
          { method: 'DELETE' }
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.message).toBe('筆記已刪除');

        const list = await (await makeCoachRequest(`/api/coach/students/${TEST_MEMBER_ID}/notes`)).json();
        expect(list.data.map((n: { id: string }) => n.id)).not.toContain(createdNoteId);
        expect(list.meta.total).toBe(1);
      });

      it('should return 404 when deleting non-existent note', async () => {
        const response = await makeCoachRequest(
          `/api/coach/students/${TEST_MEMBER_ID}/notes/${UNKNOWN_ID}`,
          { method: 'DELETE' }
        );

        expect(response.status).toBe(404);

        const data = await response.json();
        expect(data.success).toBe(false);
        expect(data.code).toBe('NOT_FOUND');
      });

      it('should return 404 when deleting already-deleted note', async () => {
        const response = await makeCoachRequest(
          `/api/coach/students/${TEST_MEMBER_ID}/notes/${createdNoteId}`,
          { method: 'DELETE' }
        );

        expect(response.status).toBe(404);

        const data = await response.json();
        expect(data.success).toBe(false);
        expect(data.code).toBe('NOT_FOUND');
      });
    });
  });
});
