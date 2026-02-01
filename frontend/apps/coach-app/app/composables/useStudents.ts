/**
 * useStudents - Student Management Composable
 *
 * Handles fetching and managing assigned students.
 */

import type { Student, StudentNote } from '../types/coach'

interface StudentsResponse {
  success: boolean
  data: Student[]
  meta: {
    total: number
    limit: number
    offset: number
  }
}

interface StudentDetailResponse {
  success: boolean
  data: Student & {
    contracts: Array<{
      id: string
      contract_no: string
      status: string
      start_date: string
      end_date: string
      remaining_counts?: number
      plan_name: string
      plan_type: string
    }>
    goals: Array<{
      id: string
      goal_type: string
      target_value: Record<string, unknown>
      current_value?: Record<string, unknown>
      start_date: string
      target_date?: string
      status: string
    }>
    measurements: Array<{
      id: string
      date: string
      weight?: number
      body_fat?: number
      muscle_mass?: number
      bmi?: number
      source: string
    }>
    class_history: Array<{
      id: string
      scheduled_at: string
      status: string
      duration_minutes: number
      main_content?: Record<string, unknown>
      coach_notes?: string
      next_plan?: string
    }>
    notes: StudentNote[]
  }
}

interface NotesResponse {
  success: boolean
  data: StudentNote[]
  meta: {
    total: number
    limit: number
    offset: number
  }
}

export const useStudents = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl
  const { getAuthHeader } = useCoachAuth()

  const students = ref<Student[]>([])
  const loading = ref(false)
  const total = ref(0)

  /**
   * Fetch assigned students
   */
  const fetchStudents = async (params?: {
    role?: 'PRIMARY' | 'SECONDARY'
    search?: string
    status?: string
    limit?: number
    offset?: number
  }): Promise<void> => {
    loading.value = true
    try {
      const response = await $fetch<StudentsResponse>(`${apiUrl}/api/coach/students`, {
        headers: getAuthHeader(),
        query: params,
      })

      if (response.success) {
        students.value = response.data
        total.value = response.meta.total
      }
    } catch (error) {
      console.error('Failed to fetch students:', error)
      students.value = []
      total.value = 0
    } finally {
      loading.value = false
    }
  }

  /**
   * Get student details
   */
  const getStudent = async (id: string): Promise<StudentDetailResponse['data'] | null> => {
    try {
      const response = await $fetch<StudentDetailResponse>(
        `${apiUrl}/api/coach/students/${id}`,
        {
          headers: getAuthHeader(),
        }
      )

      return response.success ? response.data : null
    } catch (error) {
      console.error('Failed to fetch student:', error)
      return null
    }
  }

  /**
   * Get student notes
   */
  const getStudentNotes = async (
    studentId: string,
    params?: {
      note_type?: string
      limit?: number
      offset?: number
    }
  ): Promise<NotesResponse['data']> => {
    try {
      const response = await $fetch<NotesResponse>(
        `${apiUrl}/api/coach/students/${studentId}/notes`,
        {
          headers: getAuthHeader(),
          query: params,
        }
      )

      return response.success ? response.data : []
    } catch (error) {
      console.error('Failed to fetch notes:', error)
      return []
    }
  }

  /**
   * Create student note
   */
  const createNote = async (
    studentId: string,
    data: {
      note_type: string
      content: string
      is_private?: boolean
    }
  ): Promise<{ success: boolean; message?: string; data?: StudentNote }> => {
    try {
      const response = await $fetch<{
        success: boolean
        message: string
        data: StudentNote
      }>(`${apiUrl}/api/coach/students/${studentId}/notes`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: data,
      })

      return response
    } catch (error: unknown) {
      const message = (error as { data?: { message?: string } })?.data?.message || '新增筆記失敗'
      return { success: false, message }
    }
  }

  /**
   * Update student note
   */
  const updateNote = async (
    studentId: string,
    noteId: string,
    data: {
      note_type?: string
      content?: string
      is_private?: boolean
    }
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await $fetch<{
        success: boolean
        message: string
      }>(`${apiUrl}/api/coach/students/${studentId}/notes/${noteId}`, {
        method: 'PUT',
        headers: getAuthHeader(),
        body: data,
      })

      return response
    } catch (error: unknown) {
      const message = (error as { data?: { message?: string } })?.data?.message || '更新筆記失敗'
      return { success: false, message }
    }
  }

  /**
   * Delete student note
   */
  const deleteNote = async (
    studentId: string,
    noteId: string
  ): Promise<{ success: boolean; message?: string }> => {
    try {
      const response = await $fetch<{
        success: boolean
        message: string
      }>(`${apiUrl}/api/coach/students/${studentId}/notes/${noteId}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      })

      return response
    } catch (error: unknown) {
      const message = (error as { data?: { message?: string } })?.data?.message || '刪除筆記失敗'
      return { success: false, message }
    }
  }

  return {
    // State
    students,
    loading,
    total,

    // Actions
    fetchStudents,
    getStudent,
    getStudentNotes,
    createNote,
    updateNote,
    deleteNote,
  }
}
