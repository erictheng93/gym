/**
 * 課程管理 Composable
 *
 * Mirrors the staff classes API (backend/src/routes/classes.ts), camelCase:
 * - GET    /api/classes?branchId=      full list (no paging/search), instructor + branch joined
 * - GET    /api/classes/:id            class + weekly `schedules`
 * - POST   /api/classes                create
 * - PATCH  /api/classes/:id            partial update (no defaults are re-applied)
 * - GET    /api/classes/:id/sessions   sessions in [startDate, endDate]
 * - POST   /api/classes/schedules      add a weekly time slot
 *
 * There is no DELETE and no active/inactive toggle on the backend, so neither is offered.
 */

import { useFetch } from '~/composables/core/useFetch'
import { useErrorHandler } from '~/composables/core/useErrorHandler'

export const CLASS_CATEGORIES = ['YOGA', 'CARDIO', 'STRENGTH', 'DANCE', 'SPINNING', 'PILATES', 'BOXING', 'SWIMMING', 'OTHER'] as const
export type ClassCategoryCode = typeof CLASS_CATEGORIES[number]
export type DifficultyLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED'
export type SessionStatus = 'SCHEDULED' | 'CANCELLED' | 'COMPLETED'

export const CLASS_CATEGORY_LABELS: Record<ClassCategoryCode, string> = {
  YOGA: '瑜珈',
  CARDIO: '有氧',
  STRENGTH: '重訓',
  DANCE: '舞蹈',
  SPINNING: '飛輪',
  PILATES: '皮拉提斯',
  BOXING: '拳擊',
  SWIMMING: '游泳',
  OTHER: '其他'
}

export const getCategoryLabel = (category: string | null | undefined) =>
  category ? (CLASS_CATEGORY_LABELS[category as ClassCategoryCode] ?? category) : '—'

/** A class as GET /api/classes returns it */
export interface ApiClass {
  id: string
  status: string | null
  createdAt: string | null
  updatedAt: string | null
  name: string
  description: string | null
  durationMinutes: number
  maxCapacity: number
  instructorId: string | null
  branchId: string
  category: ClassCategoryCode | null
  difficultyLevel: DifficultyLevel | null
  imageUrl: string | null
  isActive: boolean | null
  requiresCount: boolean | null
  countDeduction: number | null
  /** Left-joined: every field is null when the class has no instructor */
  instructor: { id: string | null; fullName: string | null } | null
  branch: { id: string | null; name: string | null } | null
}

/** A weekly time slot (GET /api/classes/:id → schedules[]) */
export interface ClassScheduleSlot {
  id: string
  /** 0 = Sunday … 6 = Saturday */
  dayOfWeek: number
  /** HH:MM:SS */
  startTime: string
  endTime: string
  room: string | null
  maxCapacity: number | null
  isRecurring: boolean | null
  status: string | null
}

export interface ApiClassDetail extends ApiClass {
  schedules: ClassScheduleSlot[]
}

/** GET /api/classes/:id/sessions item */
export interface ApiClassSession {
  id: string
  classId: string
  branchId: string
  scheduleId: string | null
  instructorId: string | null
  sessionDate: string
  startTime: string
  endTime: string
  room: string | null
  maxCapacity: number
  currentCount: number | null
  waitlistCount: number | null
  sessionStatus: SessionStatus | null
  cancelledReason: string | null
  instructor: { id: string | null; fullName: string | null } | null
}

/** Body of POST /api/classes / PATCH /api/classes/:id; names match the backend zod schema */
export interface ClassInput {
  name: string
  branchId: string
  description?: string | null
  durationMinutes: number
  maxCapacity: number
  instructorId?: string | null
  category?: ClassCategoryCode
  difficultyLevel: DifficultyLevel
  imageUrl?: string | null
  requiresCount: boolean
  countDeduction: number
}

/** Body of POST /api/classes/schedules */
export interface ClassScheduleInput {
  classId: string
  branchId: string
  instructorId?: string | null
  dayOfWeek: number
  /** HH:MM */
  startTime: string
  endTime: string
  room?: string | null
  maxCapacity?: number | null
  validFrom?: string | null
  validUntil?: string | null
}

export interface ClassListFilters {
  branchId?: string
  /** Client-side: the backend list has no search */
  search?: string
  category?: ClassCategoryCode | ''
  difficulty?: DifficultyLevel | ''
}

/** Backend error text when it is a readable message, otherwise the fallback */
const errorMessage = (error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : ''
  return message && !message.startsWith('[object') && !message.startsWith('HTTP ') ? message : fallback
}

/** Apply the filters the backend list does not support */
export const filterClasses = (rows: ApiClass[], filters: ClassListFilters = {}) => {
  const term = filters.search?.trim().toLowerCase()
  return rows.filter(row =>
    (!filters.category || row.category === filters.category) &&
    (!filters.difficulty || row.difficultyLevel === filters.difficulty) &&
    (!term || row.name.toLowerCase().includes(term) || (row.description ?? '').toLowerCase().includes(term))
  )
}

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string }

export const useClasses = () => {
  const { apiFetch } = useFetch()
  const { handleError } = useErrorHandler()

  const allClasses = useState<ApiClass[]>('classes_all', () => [])
  const isLoading = useState('classes_loading', () => false)

  /** Load the tenant's classes (optionally one branch) */
  const fetchClasses = async (branchId?: string) => {
    isLoading.value = true
    try {
      const response = await apiFetch<ApiClass[]>('/classes', { params: { branchId } })
      allClasses.value = response.data ?? []
    } catch (error) {
      handleError(error, { context: 'useClasses.fetchClasses', customMessage: '載入課程資料失敗' })
    } finally {
      isLoading.value = false
    }
  }

  /** Class with its weekly schedule; null (after showing an error) when it cannot be loaded */
  const getClass = async (id: string): Promise<ApiClassDetail | null> => {
    try {
      const response = await apiFetch<ApiClassDetail>(`/classes/${id}`)
      return response.data ?? null
    } catch (error) {
      handleError(error, { context: 'useClasses.getClass', customMessage: '載入課程資料失敗' })
      return null
    }
  }

  const createClass = async (input: ClassInput): Promise<ActionResult<ApiClass>> => {
    try {
      const response = await apiFetch<ApiClass>('/classes', { method: 'POST', body: input })
      if (!response.data) return { ok: false, error: '建立課程失敗' }
      return { ok: true, data: response.data }
    } catch (error) {
      return { ok: false, error: errorMessage(error, '建立課程失敗') }
    }
  }

  const updateClass = async (id: string, input: Partial<ClassInput>): Promise<ActionResult<ApiClass>> => {
    try {
      const response = await apiFetch<ApiClass>(`/classes/${id}`, { method: 'PATCH', body: input })
      if (!response.data) return { ok: false, error: '更新課程失敗' }
      return { ok: true, data: response.data }
    } catch (error) {
      return { ok: false, error: errorMessage(error, '更新課程失敗') }
    }
  }

  /** Sessions of one class between two YYYY-MM-DD dates (backend default: today + 14 days) */
  const fetchSessions = async (classId: string, startDate?: string, endDate?: string): Promise<ApiClassSession[]> => {
    try {
      const response = await apiFetch<ApiClassSession[]>(`/classes/${classId}/sessions`, { params: { startDate, endDate } })
      return response.data ?? []
    } catch (error) {
      handleError(error, { context: 'useClasses.fetchSessions', customMessage: '載入課程場次失敗' })
      return []
    }
  }

  const createSchedule = async (input: ClassScheduleInput): Promise<ActionResult> => {
    try {
      await apiFetch('/classes/schedules', { method: 'POST', body: input })
      return { ok: true, data: undefined }
    } catch (error) {
      return { ok: false, error: errorMessage(error, '新增排程失敗') }
    }
  }

  return {
    allClasses,
    isLoading,
    fetchClasses,
    getClass,
    createClass,
    updateClass,
    fetchSessions,
    createSchedule
  }
}
