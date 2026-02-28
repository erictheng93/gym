/**
 * 課程排程 Composable
 * 管理課程排程和場次
 */

import type { ClassSchedule, ClassSession } from '~/types/schema'
import { useFetch } from '~/composables/core/useFetch'
import { useErrorHandler } from '~/composables/core/useErrorHandler'
import { DAY_OF_WEEK_NAMES } from '@gym-nexus/shared'

export const useClassSchedule = () => {
  const { readItems, readItem, createItem, updateItem, deleteItem } = useFetch()
  const { handleError } = useErrorHandler()
  const config = useRuntimeConfig()

  const schedules = useState<ClassSchedule[]>('class_schedules', () => [])
  const sessions = useState<ClassSession[]>('class_sessions', () => [])
  const isLoading = useState('class_schedule_loading', () => false)

  // ============================================
  // 排程管理（週循環）
  // ============================================

  /**
   * 獲取課程排程列表
   */
  const fetchSchedules = async (options?: {
    branchId?: string
    classId?: string
    dayOfWeek?: number
    isRecurring?: boolean
  }) => {
    isLoading.value = true
    const { branchId, classId, dayOfWeek, isRecurring } = options || {}

    try {
      const filter: Record<string, unknown> = {}
      if (branchId) filter.branch_id = branchId
      if (classId) filter.class_id = classId
      if (typeof dayOfWeek === 'number') filter.day_of_week = dayOfWeek
      if (typeof isRecurring === 'boolean') filter.is_recurring = isRecurring

      const { data } = await readItems<ClassSchedule>('class_schedules', {
        filter,
        sort: 'day_of_week'
      })

      schedules.value = data
    } catch (error) {
      handleError(error, {
        context: 'useClassSchedule.fetchSchedules',
        customMessage: '載入課程排程失敗'
      })
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 新增課程排程
   */
  const createSchedule = async (scheduleData: Partial<ClassSchedule>): Promise<ClassSchedule | null> => {
    try {
      const data = await createItem<ClassSchedule>('class_schedules', scheduleData)
      return data
    } catch (error) {
      handleError(error, {
        context: 'useClassSchedule.createSchedule',
        customMessage: '建立課程排程失敗'
      })
      return null
    }
  }

  /**
   * 更新課程排程
   */
  const updateSchedule = async (id: string, scheduleData: Partial<ClassSchedule>): Promise<ClassSchedule | null> => {
    try {
      const data = await updateItem<ClassSchedule>('class_schedules', id, scheduleData)
      return data
    } catch (error) {
      handleError(error, {
        context: 'useClassSchedule.updateSchedule',
        customMessage: '更新課程排程失敗'
      })
      return null
    }
  }

  /**
   * 刪除課程排程
   */
  const deleteSchedule = async (id: string): Promise<boolean> => {
    try {
      const success = await deleteItem('class_schedules', id)
      return success
    } catch (error) {
      handleError(error, {
        context: 'useClassSchedule.deleteSchedule',
        customMessage: '刪除課程排程失敗'
      })
      return false
    }
  }

  // ============================================
  // 場次管理（實際課程）
  // ============================================

  /**
   * 獲取課程場次列表
   */
  const fetchSessions = async (options?: {
    branchId?: string
    classId?: string
    startDate?: string
    endDate?: string
    sessionStatus?: string
    instructorId?: string
  }) => {
    isLoading.value = true
    const { branchId, classId, startDate, endDate, sessionStatus, instructorId } = options || {}

    try {
      const filter: Record<string, unknown> = {}
      if (branchId) filter.branch_id = branchId
      if (classId) filter.class_id = classId
      if (sessionStatus) filter.session_status = sessionStatus
      if (instructorId) filter.instructor_id = instructorId
      if (startDate) filter.start_date = startDate
      if (endDate) filter.end_date = endDate

      const { data } = await readItems<ClassSession>('class_sessions', {
        filter,
        sort: 'session_date'
      })

      sessions.value = data
    } catch (error) {
      handleError(error, {
        context: 'useClassSchedule.fetchSessions',
        customMessage: '載入課程場次失敗'
      })
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 獲取單一場次詳情（包含預約列表）
   */
  const getSession = async (id: string): Promise<ClassSession | null> => {
    try {
      const data = await readItem<ClassSession>('class_sessions', id)
      return data
    } catch (error) {
      handleError(error, {
        context: 'useClassSchedule.getSession',
        customMessage: '載入課程場次失敗'
      })
      return null
    }
  }

  /**
   * 新增臨時課程場次（非排程生成）
   */
  const createSession = async (sessionData: Partial<ClassSession>): Promise<ClassSession | null> => {
    try {
      const data = await createItem<ClassSession>('class_sessions', sessionData)
      return data
    } catch (error) {
      handleError(error, {
        context: 'useClassSchedule.createSession',
        customMessage: '建立課程場次失敗'
      })
      return null
    }
  }

  /**
   * 更新課程場次
   */
  const updateSession = async (id: string, sessionData: Partial<ClassSession>): Promise<ClassSession | null> => {
    try {
      const data = await updateItem<ClassSession>('class_sessions', id, sessionData)
      return data
    } catch (error) {
      handleError(error, {
        context: 'useClassSchedule.updateSession',
        customMessage: '更新課程場次失敗'
      })
      return null
    }
  }

  /**
   * 取消課程場次
   */
  const cancelSession = async (id: string, reason?: string): Promise<boolean> => {
    try {
      const result = await updateItem<ClassSession>('class_sessions', id, {
        session_status: 'CANCELLED',
        cancelled_reason: reason,
        cancelled_at: new Date().toISOString()
      })
      return result !== null
    } catch (error) {
      handleError(error, {
        context: 'useClassSchedule.cancelSession',
        customMessage: '取消課程場次失敗'
      })
      return false
    }
  }

  /**
   * 從排程生成課程場次（調用後端函數）
   */
  const generateSessions = async (branchId: string, startDate: string, endDate: string): Promise<number> => {
    try {
      // 調用後端 API
      const response = await $fetch<{ created: number }>('/api/admin/classes/generate-sessions', {
        method: 'POST',
        body: { branch_id: branchId, start_date: startDate, end_date: endDate },
        baseURL: config.public.apiBaseUrl
      })
      return response?.created || 0
    } catch (error) {
      handleError(error, {
        context: 'useClassSchedule.generateSessions',
        customMessage: '生成課程場次失敗'
      })
      return 0
    }
  }

  // ============================================
  // 工具函數
  // ============================================

  /**
   * 獲取指定日期的課程場次
   */
  const getSessionsByDate = async (date: string, branchId?: string): Promise<ClassSession[]> => {
    try {
      const filter: Record<string, unknown> = { session_date: date }
      if (branchId) filter.branch_id = branchId

      const { data } = await readItems<ClassSession>('class_sessions', {
        filter,
        sort: 'start_time'
      })
      return data
    } catch (error) {
      handleError(error, {
        context: 'useClassSchedule.getSessionsByDate',
        showToast: false
      })
      return []
    }
  }

  /**
   * 獲取週課表視圖數據
   */
  const getWeekScheduleView = async (startDate: string, endDate: string, branchId?: string) => {
    await fetchSessions({ branchId, startDate, endDate, sessionStatus: 'SCHEDULED' })

    // 按日期分組
    const grouped: Record<string, ClassSession[]> = {}
    sessions.value.forEach(session => {
      const date = session.session_date
      if (!grouped[date]) grouped[date] = []
      grouped[date].push(session)
    })

    return grouped
  }

  /**
   * 獲取場次統計
   */
  const getSessionStats = async (branchId?: string, startDate?: string, endDate?: string) => {
    try {
      const baseFilter: Record<string, unknown> = {}
      if (branchId) baseFilter.branch_id = branchId
      if (startDate) baseFilter.start_date = startDate
      if (endDate) baseFilter.end_date = endDate

      const [scheduled, completed, cancelled] = await Promise.all([
        readItems<ClassSession>('class_sessions', {
          filter: { ...baseFilter, session_status: 'SCHEDULED' },
          limit: 1
        }),
        readItems<ClassSession>('class_sessions', {
          filter: { ...baseFilter, session_status: 'COMPLETED' },
          limit: 1
        }),
        readItems<ClassSession>('class_sessions', {
          filter: { ...baseFilter, session_status: 'CANCELLED' },
          limit: 1
        })
      ])

      return {
        scheduled: scheduled.total,
        completed: completed.total,
        cancelled: cancelled.total
      }
    } catch (error) {
      handleError(error, {
        context: 'useClassSchedule.getSessionStats',
        showToast: false
      })
      return { scheduled: 0, completed: 0, cancelled: 0 }
    }
  }

  return {
    schedules,
    sessions,
    isLoading,
    // 排程
    fetchSchedules,
    createSchedule,
    updateSchedule,
    deleteSchedule,
    // 場次
    fetchSessions,
    getSession,
    createSession,
    updateSession,
    cancelSession,
    generateSessions,
    // 工具
    getSessionsByDate,
    getWeekScheduleView,
    getSessionStats,
    DAY_OF_WEEK_NAMES
  }
}
