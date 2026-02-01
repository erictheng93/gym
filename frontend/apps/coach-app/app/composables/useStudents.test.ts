/**
 * Tests for useStudents composable
 *
 * Tests student management functionality including:
 * - Fetching students list
 * - Getting student details
 * - Managing student notes
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock state
const stateStore = new Map<string, { value: unknown }>()

// Mock data
const mockStudents = [
  {
    id: 'student-1',
    member_code: 'M001',
    full_name: 'Student One',
    phone: '0912345678',
    status: 'ACTIVE',
    coach_role: 'PRIMARY' as const,
    assigned_at: '2024-01-01T00:00:00Z',
    branch_name: 'Main Branch',
    completed_classes: 10,
    active_contracts: 1,
  },
  {
    id: 'student-2',
    member_code: 'M002',
    full_name: 'Student Two',
    phone: '0923456789',
    status: 'ACTIVE',
    coach_role: 'SECONDARY' as const,
    assigned_at: '2024-01-15T00:00:00Z',
    branch_name: 'Main Branch',
    completed_classes: 5,
    active_contracts: 1,
  },
]

const mockStudentDetail = {
  ...mockStudents[0],
  contracts: [
    {
      id: 'contract-1',
      contract_no: 'C2024-001',
      plan_name: '私人教練課程',
      remaining_counts: 8,
    },
  ],
  goals: ['增肌減脂', '提升體能'],
  measurements: [
    { date: '2024-01-15', weight: 75, body_fat: 20 },
  ],
}

const mockNote = {
  id: 'note-1',
  note_type: 'PROGRESS' as const,
  content: 'Today training was great',
  is_private: true,
  created_at: '2024-01-20T10:00:00Z',
}

// Mock Nuxt composables
vi.stubGlobal('useRuntimeConfig', () => ({
  public: {
    apiBaseUrl: 'http://localhost:8056',
  },
}))

vi.stubGlobal('ref', (initial: unknown) => ({ value: initial }))

// Mock $fetch
const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

// Mock useCoachAuth
vi.stubGlobal('useCoachAuth', () => ({
  getAuthHeader: () => ({ 'X-Coach-Token': 'test-token' }),
}))

// Import after mocks
import { useStudents } from './useStudents'

describe('useStudents', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
    mockFetch.mockReset()
  })

  describe('fetchStudents', () => {
    it('should fetch students list successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockStudents,
        meta: { total: 2, limit: 20, offset: 0 },
      })

      const { students, total, fetchStudents } = useStudents()
      await fetchStudents()

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/students',
        expect.objectContaining({
          headers: { 'X-Coach-Token': 'test-token' },
        })
      )
      expect(students.value).toEqual(mockStudents)
      expect(total.value).toBe(2)
    })

    it('should support filtering by role', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [mockStudents[0]],
        meta: { total: 1, limit: 20, offset: 0 },
      })

      const { fetchStudents } = useStudents()
      await fetchStudents({ role: 'PRIMARY' })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/students',
        expect.objectContaining({
          query: { role: 'PRIMARY' },
        })
      )
    })

    it('should support search query', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockStudents,
        meta: { total: 2, limit: 20, offset: 0 },
      })

      const { fetchStudents } = useStudents()
      await fetchStudents({ search: 'Student' })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/students',
        expect.objectContaining({
          query: { search: 'Student' },
        })
      )
    })

    it('should handle fetch error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const { students, total, fetchStudents } = useStudents()
      await fetchStudents()

      expect(students.value).toEqual([])
      expect(total.value).toBe(0)
    })
  })

  describe('getStudent', () => {
    it('should fetch student details successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockStudentDetail,
      })

      const { getStudent } = useStudents()
      const result = await getStudent('student-1')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/students/student-1',
        expect.objectContaining({
          headers: { 'X-Coach-Token': 'test-token' },
        })
      )
      expect(result).toEqual(mockStudentDetail)
    })

    it('should return null on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Not found'))

      const { getStudent } = useStudents()
      const result = await getStudent('nonexistent')

      expect(result).toBeNull()
    })
  })

  describe('getStudentNotes', () => {
    it('should fetch student notes successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [mockNote],
      })

      const { getStudentNotes } = useStudents()
      const result = await getStudentNotes('student-1')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/students/student-1/notes',
        expect.objectContaining({
          headers: { 'X-Coach-Token': 'test-token' },
        })
      )
      expect(result).toEqual([mockNote])
    })

    it('should support filtering by note type', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        data: [mockNote],
      })

      const { getStudentNotes } = useStudents()
      await getStudentNotes('student-1', { note_type: 'PROGRESS' })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/students/student-1/notes',
        expect.objectContaining({
          query: { note_type: 'PROGRESS' },
        })
      )
    })
  })

  describe('createNote', () => {
    it('should create a note successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '筆記已建立',
        data: { id: 'note-2' },
      })

      const { createNote } = useStudents()
      const result = await createNote('student-1', {
        note_type: 'PROGRESS',
        content: 'New note content',
        is_private: true,
      })

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/students/student-1/notes',
        expect.objectContaining({
          method: 'POST',
          body: {
            note_type: 'PROGRESS',
            content: 'New note content',
            is_private: true,
          },
        })
      )
    })

    it('should handle create error', async () => {
      mockFetch.mockRejectedValueOnce({
        data: { message: '建立筆記失敗' },
      })

      const { createNote } = useStudents()
      const result = await createNote('student-1', {
        note_type: 'PROGRESS',
        content: 'New note',
      })

      expect(result.success).toBe(false)
      expect(result.message).toBe('建立筆記失敗')
    })
  })

  describe('updateNote', () => {
    it('should update a note successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '筆記已更新',
      })

      const { updateNote } = useStudents()
      const result = await updateNote('student-1', 'note-1', {
        content: 'Updated content',
      })

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/students/student-1/notes/note-1',
        expect.objectContaining({
          method: 'PUT',
          body: { content: 'Updated content' },
        })
      )
    })
  })

  describe('deleteNote', () => {
    it('should delete a note successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '筆記已刪除',
      })

      const { deleteNote } = useStudents()
      const result = await deleteNote('student-1', 'note-1')

      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/coach/students/student-1/notes/note-1',
        expect.objectContaining({
          method: 'DELETE',
        })
      )
    })
  })
})
