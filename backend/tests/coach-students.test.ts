import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import app from '../src/app.js';
import {
  createCoachTestFixtures,
  cleanupCoachTestFixtures,
  getCoachToken,
  TEST_MEMBER_ID,
  TEST_TENANT_ID,
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

describe('Coach Students API', () => {
  beforeAll(async () => {
    await createCoachTestFixtures();
  });

  afterAll(async () => {
    await cleanupCoachTestFixtures();
  });

  // ===========================================================================
  // GET /api/coach/students - List Assigned Students
  // ===========================================================================

  describe('GET /api/coach/students', () => {
    it('should return 200 and list assigned students', async () => {
      const response = await makeCoachRequest('/api/coach/students', {
        method: 'GET',
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(Array.isArray(data.data)).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(1);
      expect(data).toHaveProperty('meta');
      expect(data.meta).toHaveProperty('total');
      expect(data.meta).toHaveProperty('limit');
      expect(data.meta).toHaveProperty('offset');
    });

    it('should include the test member in results', async () => {
      const response = await makeCoachRequest('/api/coach/students', {
        method: 'GET',
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      const testStudent = data.data.find(
        (s: { id: string }) => s.id === TEST_MEMBER_ID
      );

      expect(testStudent).toBeDefined();
      expect(testStudent.id).toBe(TEST_MEMBER_ID);
      expect(testStudent).toHaveProperty('member_code');
      expect(testStudent).toHaveProperty('full_name');
      expect(testStudent).toHaveProperty('phone');
      expect(testStudent).toHaveProperty('email');
      expect(testStudent).toHaveProperty('role');
      expect(testStudent).toHaveProperty('active_contracts');
    });

    it('should filter students by role', async () => {
      const response = await makeCoachRequest('/api/coach/students?role=PRIMARY', {
        method: 'GET',
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      // All returned students should have PRIMARY role
      for (const student of data.data) {
        expect(student.role).toBe('PRIMARY');
      }
    });

    it('should filter students by search term', async () => {
      const response = await makeCoachRequest('/api/coach/students?search=Test%20Member', {
        method: 'GET',
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter students by status', async () => {
      const response = await makeCoachRequest('/api/coach/students?status=ACTIVE', {
        method: 'GET',
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      for (const student of data.data) {
        expect(student.status).toBe('ACTIVE');
      }
    });

    it('should support pagination with limit and offset', async () => {
      const response = await makeCoachRequest('/api/coach/students?limit=1&offset=0', {
        method: 'GET',
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.length).toBeLessThanOrEqual(1);
      expect(data.meta.limit).toBe(1);
      expect(data.meta.offset).toBe(0);
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
    it('should return 200 and student details for an assigned member', async () => {
      const response = await makeCoachRequest(`/api/coach/students/${TEST_MEMBER_ID}`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toBeDefined();
      expect(data.data.id).toBe(TEST_MEMBER_ID);
      expect(data.data).toHaveProperty('member_code');
      expect(data.data).toHaveProperty('full_name');
      expect(data.data).toHaveProperty('phone');
      expect(data.data).toHaveProperty('email');
      expect(data.data).toHaveProperty('status');
      expect(data.data).toHaveProperty('role');
      expect(data.data).toHaveProperty('contracts');
      expect(data.data).toHaveProperty('goals');
      expect(data.data).toHaveProperty('measurements');
      expect(data.data).toHaveProperty('class_history');
      expect(data.data).toHaveProperty('notes');
      expect(Array.isArray(data.data.contracts)).toBe(true);
      expect(Array.isArray(data.data.goals)).toBe(true);
      expect(Array.isArray(data.data.measurements)).toBe(true);
      expect(Array.isArray(data.data.class_history)).toBe(true);
      expect(Array.isArray(data.data.notes)).toBe(true);
    });

    it('should include contract details for the assigned member', async () => {
      const response = await makeCoachRequest(`/api/coach/students/${TEST_MEMBER_ID}`, {
        method: 'GET',
      });

      expect(response.status).toBe(200);

      const data = await response.json();
      // The test member has an active contract created in fixtures
      expect(data.data.contracts.length).toBeGreaterThanOrEqual(1);
      const contract = data.data.contracts[0];
      expect(contract).toHaveProperty('id');
      expect(contract).toHaveProperty('contract_no');
      expect(contract).toHaveProperty('status');
      expect(contract).toHaveProperty('plan_name');
      expect(contract).toHaveProperty('plan_type');
    });

    it('should return 403 for unassigned member', async () => {
      // Use a UUID that is not assigned to the test coach
      const unassignedId = '00000000-0000-0000-0000-ffffffffffff';
      const response = await makeCoachRequest(`/api/coach/students/${unassignedId}`, {
        method: 'GET',
      });

      expect(response.status).toBe(403);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.code).toBe('FORBIDDEN');
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

        const status = response.status;
        expect(status === 200 || status === 201).toBe(true);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data).toHaveProperty('message');
        expect(data.data).toBeDefined();
        expect(data.data).toHaveProperty('id');
        expect(data.data.note_type).toBe('PROGRESS');
        expect(data.data.content).toBe('Student is making great progress on upper body strength.');

        // Store note ID for subsequent tests
        createdNoteId = data.data.id;
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

        const status = response.status;
        expect(status === 200 || status === 201).toBe(true);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.note_type).toBe('INJURY');
        expect(data.data.is_private).toBe(true);
      });

      it('should reject creating a note for unassigned member', async () => {
        const unassignedId = '00000000-0000-0000-0000-ffffffffffff';
        const response = await makeCoachRequest(`/api/coach/students/${unassignedId}/notes`, {
          method: 'POST',
          body: JSON.stringify({
            note_type: 'OTHER',
            content: 'This should not be allowed.',
          }),
        });

        expect(response.status).toBe(403);

        const data = await response.json();
        expect(data.success).toBe(false);
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
      it('should return 200 and list notes for the student', async () => {
        const response = await makeCoachRequest(`/api/coach/students/${TEST_MEMBER_ID}/notes`, {
          method: 'GET',
        });

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(Array.isArray(data.data)).toBe(true);
        expect(data.data.length).toBeGreaterThanOrEqual(1);
        expect(data).toHaveProperty('meta');
        expect(data.meta).toHaveProperty('total');
        expect(data.meta).toHaveProperty('limit');
        expect(data.meta).toHaveProperty('offset');

        // Each note should have expected properties
        const note = data.data[0];
        expect(note).toHaveProperty('id');
        expect(note).toHaveProperty('note_type');
        expect(note).toHaveProperty('content');
        expect(note).toHaveProperty('is_private');
      });

      it('should include the previously created note', async () => {
        const response = await makeCoachRequest(`/api/coach/students/${TEST_MEMBER_ID}/notes`, {
          method: 'GET',
        });

        expect(response.status).toBe(200);

        const data = await response.json();
        const foundNote = data.data.find(
          (n: { id: string }) => n.id === createdNoteId
        );
        expect(foundNote).toBeDefined();
        expect(foundNote.note_type).toBe('PROGRESS');
        expect(foundNote.content).toBe('Student is making great progress on upper body strength.');
      });

      it('should filter notes by note_type', async () => {
        const response = await makeCoachRequest(
          `/api/coach/students/${TEST_MEMBER_ID}/notes?note_type=PROGRESS`,
          { method: 'GET' }
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        for (const note of data.data) {
          expect(note.note_type).toBe('PROGRESS');
        }
      });

      it('should filter notes by INJURY type', async () => {
        const response = await makeCoachRequest(
          `/api/coach/students/${TEST_MEMBER_ID}/notes?note_type=INJURY`,
          { method: 'GET' }
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        for (const note of data.data) {
          expect(note.note_type).toBe('INJURY');
        }
      });

      it('should support pagination with limit and offset', async () => {
        const response = await makeCoachRequest(
          `/api/coach/students/${TEST_MEMBER_ID}/notes?limit=1&offset=0`,
          { method: 'GET' }
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data.data.length).toBeLessThanOrEqual(1);
        expect(data.meta.limit).toBe(1);
        expect(data.meta.offset).toBe(0);
      });

      it('should return 403 for unassigned member notes', async () => {
        const unassignedId = '00000000-0000-0000-0000-ffffffffffff';
        const response = await makeCoachRequest(
          `/api/coach/students/${unassignedId}/notes`,
          { method: 'GET' }
        );

        expect(response.status).toBe(403);

        const data = await response.json();
        expect(data.success).toBe(false);
      });
    });

    // -------------------------------------------------------------------------
    // PATCH /api/coach/students/:id/notes/:noteId - Update Note
    // -------------------------------------------------------------------------

    describe('PATCH /api/coach/students/:id/notes/:noteId', () => {
      it('should update note content', async () => {
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
        expect(data).toHaveProperty('message');
        expect(data.data.id).toBe(createdNoteId);
        expect(data.data.content).toBe('Updated: Excellent progress on bench press.');
        expect(data.data.note_type).toBe('PROGRESS'); // unchanged
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

      it('should return 404 for non-existent note', async () => {
        const nonExistentNoteId = '00000000-0000-0000-0000-ffffffffffff';
        const response = await makeCoachRequest(
          `/api/coach/students/${TEST_MEMBER_ID}/notes/${nonExistentNoteId}`,
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
    });

    // -------------------------------------------------------------------------
    // DELETE /api/coach/students/:id/notes/:noteId - Delete Note
    // -------------------------------------------------------------------------

    describe('DELETE /api/coach/students/:id/notes/:noteId', () => {
      it('should delete the note successfully', async () => {
        const response = await makeCoachRequest(
          `/api/coach/students/${TEST_MEMBER_ID}/notes/${createdNoteId}`,
          { method: 'DELETE' }
        );

        expect(response.status).toBe(200);

        const data = await response.json();
        expect(data.success).toBe(true);
        expect(data).toHaveProperty('message');
      });

      it('should return 404 when deleting non-existent note', async () => {
        const nonExistentNoteId = '00000000-0000-0000-0000-ffffffffffff';
        const response = await makeCoachRequest(
          `/api/coach/students/${TEST_MEMBER_ID}/notes/${nonExistentNoteId}`,
          { method: 'DELETE' }
        );

        expect(response.status).toBe(404);

        const data = await response.json();
        expect(data.success).toBe(false);
        expect(data.code).toBe('NOT_FOUND');
      });

      it('should return 404 when deleting already-deleted note', async () => {
        // Try to delete the same note again (already deleted above)
        const response = await makeCoachRequest(
          `/api/coach/students/${TEST_MEMBER_ID}/notes/${createdNoteId}`,
          { method: 'DELETE' }
        );

        expect(response.status).toBe(404);

        const data = await response.json();
        expect(data.success).toBe(false);
      });
    });
  });
});
