/**
 * 課程排程 Composable
 * 管理課程排程和場次
 */

import { readItems, readItem, createItem, updateItem, deleteItem, aggregate } from '@directus/sdk'
import type { ClassSchedule, ClassSession } from '~/types/directus'
import { useErrorHandler } from '~/composables/core/useErrorHandler'

// 星期幾的中文名稱
export const DAY_OF_WEEK_NAMES = ['週日', '週一', '週二', '週三', '週四', '週五', '週六']

export const useClassSchedule = () => {
  const directus = useDirectus()
  const { handleError } = useErrorHandler()

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
      if (branchId) filter.branch_id = { _eq: branchId }
      if (classId) filter.class_id = { _eq: classId }
      if (typeof dayOfWeek === 'number') filter.day_of_week = { _eq: dayOfWeek }
      if (typeof isRecurring === 'boolean') filter.is_recurring = { _eq: isRecurring }

      const data = await directus.request(
        readItems('class_schedules', {
          filter,
          fields: [
            '*',
            'class.id', 'class.name', 'class.duration_minutes', 'class.max_capacity',
            'class.class_category.name', 'class.class_category.color',
            'branch.id', 'branch.name',
            'instructor.id', 'instructor.full_name'
          ],
          sort: ['day_of_week', 'start_time']
        })
      )

      schedules.value = data as ClassSchedule[]
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
      const data = await directus.request(createItem('class_schedules', scheduleData))
      return data as ClassSchedule
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
      const data = await directus.request(updateItem('class_schedules', id, scheduleData))
      return data as ClassSchedule
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
      await directus.request(deleteItem('class_schedules', id))
      return true
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
      if (branchId) filter.branch_id = { _eq: branchId }
      if (classId) filter.class_id = { _eq: classId }
      if (sessionStatus) filter.session_status = { _eq: sessionStatus }
      if (instructorId) filter.instructor_id = { _eq: instructorId }

      // 日期範圍篩選
      if (startDate || endDate) {
        filter.session_date = {}
        if (startDate) (filter.session_date as Record<string, string>)._gte = startDate
        if (endDate) (filter.session_date as Record<string, string>)._lte = endDate
      }

      const data = await directus.request(
        readItems('class_sessions', {
          filter,
          fields: [
            '*',
            'class.id', 'class.name', 'class.duration_minutes',
            'class.class_category.name', 'class.class_category.color',
            'branch.id', 'branch.name',
            'instructor.id', 'instructor.full_name',
            'schedule.id'
          ],
          sort: ['session_date', 'start_time']
        })
      )

      sessions.value = data as ClassSession[]
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
      const data = await directus.request(
        readItem('class_sessions', id, {
          fields: [
            '*',
            'class.*',
            'class.class_category.*',
            'branch.*',
            'instructor.*',
            'bookings.*',
            'bookings.member.id', 'bookings.member.full_name', 'bookings.member.phone', 'bookings.member.member_code'
          ]
        })
      )
      return data as ClassSession
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
      const data = await directus.request(createItem('class_sessions', sessionData))
      return data as ClassSession
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
      const data = await directus.request(updateItem('class_sessions', id, sessionData))
      return data as ClassSession
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
      await directus.request(updateItem('class_sessions', id, {
        session_status: 'CANCELLED',
        cancelled_reason: reason,
        cancelled_at: new Date().toISOString()
      }))
      return true
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
      // 調用 Directus 自訂端點或 PostgreSQL 函數
      const response = await $fetch<{ created: number }>('/gym/classes/generate-sessions', {
        method: 'POST',
        body: { branch_id: branchId, start_date: startDate, end_date: endDate },
        baseURL: useRuntimeConfig().public.directusUrl
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
      const filter: Record<string, unknown> = { session_date: { _eq: date } }
      if (branchId) filter.branch_id = { _eq: branchId }

      const data = await directus.request(
        readItems('class_sessions', {
          filter,
          fields: [
            '*',
            'class.id', 'class.name',
            'class.class_category.name', 'class.class_category.color',
            'instructor.id', 'instructor.full_name'
          ],
          sort: ['start_time']
        })
      )
      return data as ClassSession[]
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
      const filter: Record<string, unknown> = {}
      if (branchId) filter.branch_id = { _eq: branchId }
      if (startDate || endDate) {
        filter.session_date = {}
        if (startDate) (filter.session_date as Record<string, string>)._gte = startDate
        if (endDate) (filter.session_date as Record<string, string>)._lte = endDate
      }

      const [scheduled, completed, cancelled] = await Promise.all([
        directus.request(
          aggregate('class_sessions', {
            aggregate: { count: '*' },
            query: { filter: { ...filter, session_status: { _eq: 'SCHEDULED' } } }
          })
        ),
        directus.request(
          aggregate('class_sessions', {
            aggregate: { count: '*' },
            query: { filter: { ...filter, session_status: { _eq: 'COMPLETED' } } }
          })
        ),
        directus.request(
          aggregate('class_sessions', {
            aggregate: { count: '*' },
            query: { filter: { ...filter, session_status: { _eq: 'CANCELLED' } } }
          })
        )
      ])

      return {
        scheduled: Number(scheduled[0]?.count) || 0,
        completed: Number(completed[0]?.count) || 0,
        cancelled: Number(cancelled[0]?.count) || 0
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
