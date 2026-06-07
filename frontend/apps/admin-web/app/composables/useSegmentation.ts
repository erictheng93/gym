/**
 * useSegmentation - RFM 會員分群 composable
 * 會員分群分析功能
 */

import { useErrorHandler } from '~/composables/core/useErrorHandler'

export interface RFMScore {
  id: string
  member_id: string
  branch_id: string
  recency_score: number
  frequency_score: number
  monetary_score: number
  rfm_segment: RFMSegment
  last_payment_date: string | null
  last_checkin_date: string | null
  total_payments_12m: number
  total_checkins_12m: number
  calculated_at: string
  // Joined fields
  member_name?: string
  member_code?: string
  member_phone?: string
  member_email?: string
  branch_name?: string
}

export type RFMSegment =
  | 'CHAMPIONS'
  | 'LOYAL'
  | 'POTENTIAL_LOYAL'
  | 'NEW_CUSTOMERS'
  | 'PROMISING'
  | 'NEED_ATTENTION'
  | 'ABOUT_TO_SLEEP'
  | 'AT_RISK'
  | 'HIBERNATING'
  | 'LOST'

export interface SegmentInfo {
  segment: RFMSegment
  label: string
  description: string
  criteria: {
    recency: [number, number]
    frequency: [number, number]
    monetary: [number, number]
  }
  member_count: number
}

export const useSegmentation = () => {
  const config = useRuntimeConfig()
  const { handleError } = useErrorHandler()

  // State
  const rfmScores = useState<RFMScore[]>('rfm_scores', () => [])
  const segments = useState<SegmentInfo[]>('rfm_segments', () => [])
  const isLoading = useState('segmentation_loading', () => false)
  const totalCount = useState('segmentation_total', () => 0)

  const apiUrl = config.public.apiUrl

  /**
   * Fetch RFM scores
   */
  const fetchRFMScores = async (options?: {
    branchId?: string
    segment?: RFMSegment
    page?: number
    limit?: number
  }) => {
    isLoading.value = true
    const { branchId, segment, page = 1, limit = 50 } = options || {}

    try {
      const params = new URLSearchParams()
      if (branchId) params.append('branch_id', branchId)
      if (segment) params.append('segment', segment)
      params.append('limit', limit.toString())
      params.append('offset', ((page - 1) * limit).toString())

      const response = await $fetch<{
        success: boolean
        data: RFMScore[]
        meta: { total: number }
      }>(`${apiUrl}/segmentation/rfm?${params}`)

      if (response.success) {
        rfmScores.value = response.data
        totalCount.value = response.meta.total
      }
    } catch (error) {
      handleError(error, {
        context: 'useSegmentation.fetchRFMScores',
        customMessage: '取得 RFM 分數失敗'
      })
      rfmScores.value = []
      totalCount.value = 0
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get single member RFM score
   */
  const getMemberRFM = async (memberId: string): Promise<RFMScore | null> => {
    try {
      const response = await $fetch<{ success: boolean; data: RFMScore }>(
        `${apiUrl}/segmentation/rfm/${memberId}`
      )
      return response.success ? response.data : null
    } catch (error) {
      handleError(error, {
        context: 'useSegmentation.getMemberRFM',
        customMessage: '取得會員 RFM 分數失敗',
        showToast: false
      })
      return null
    }
  }

  /**
   * Trigger RFM calculation
   */
  const calculateRFM = async (branchId?: string): Promise<{ calculated: number } | null> => {
    try {
      const response = await $fetch<{
        success: boolean
        data: { calculated: number; calculated_at: string }
      }>(`${apiUrl}/segmentation/calculate`, {
        method: 'POST',
        body: { branch_id: branchId }
      })
      return response.success ? response.data : null
    } catch (error) {
      handleError(error, {
        context: 'useSegmentation.calculateRFM',
        customMessage: 'RFM 計算失敗'
      })
      return null
    }
  }

  /**
   * Fetch segment definitions with counts
   */
  const fetchSegments = async (branchId?: string) => {
    try {
      const params = branchId ? `?branch_id=${branchId}` : ''
      const response = await $fetch<{
        success: boolean
        data: { segments: SegmentInfo[]; total_members: number }
      }>(`${apiUrl}/segmentation/segments${params}`)

      if (response.success) {
        segments.value = response.data.segments
      }
    } catch (error) {
      handleError(error, {
        context: 'useSegmentation.fetchSegments',
        customMessage: '取得分群資料失敗'
      })
      segments.value = []
    }
  }

  /**
   * Fetch members in a segment
   */
  const fetchSegmentMembers = async (
    segment: RFMSegment,
    options?: {
      branchId?: string
      page?: number
      limit?: number
    }
  ) => {
    isLoading.value = true
    const { branchId, page = 1, limit = 50 } = options || {}

    try {
      const params = new URLSearchParams()
      if (branchId) params.append('branch_id', branchId)
      params.append('limit', limit.toString())
      params.append('offset', ((page - 1) * limit).toString())

      const response = await $fetch<{
        success: boolean
        data: {
          segment: RFMSegment
          segment_label: string
          segment_description: string
          members: RFMScore[]
        }
        meta: { total: number }
      }>(`${apiUrl}/segmentation/segments/${segment}/members?${params}`)

      if (response.success) {
        rfmScores.value = response.data.members
        totalCount.value = response.meta.total
        return response.data
      }
      return null
    } catch (error) {
      handleError(error, {
        context: 'useSegmentation.fetchSegmentMembers',
        customMessage: '取得分群會員失敗'
      })
      rfmScores.value = []
      totalCount.value = 0
      return null
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Auto-apply tags based on segments
   */
  const autoApplyTags = async (options?: {
    branchId?: string
    segment?: RFMSegment
  }): Promise<{ updated: number } | null> => {
    try {
      const response = await $fetch<{ success: boolean; data: { updated: number } }>(
        `${apiUrl}/segmentation/auto-tag`,
        {
          method: 'POST',
          body: {
            branch_id: options?.branchId,
            segment: options?.segment
          }
        }
      )
      return response.success ? response.data : null
    } catch (error) {
      handleError(error, {
        context: 'useSegmentation.autoApplyTags',
        customMessage: '套用標籤失敗'
      })
      return null
    }
  }

  /**
   * Export segment to CSV
   */
  const exportSegment = (segment: RFMSegment | 'ALL', branchId?: string) => {
    const params = branchId ? `?branch_id=${branchId}` : ''
    window.open(`${apiUrl}/segmentation/export/${segment}${params}`, '_blank')
  }

  // Segment helpers
  const getSegmentLabel = (segment: RFMSegment): string => {
    const labels: Record<RFMSegment, string> = {
      CHAMPIONS: '冠軍客戶',
      LOYAL: '忠誠客戶',
      POTENTIAL_LOYAL: '潛力客戶',
      NEW_CUSTOMERS: '新客戶',
      PROMISING: '有前景',
      NEED_ATTENTION: '需要關注',
      ABOUT_TO_SLEEP: '即將沉睡',
      AT_RISK: '有風險',
      HIBERNATING: '休眠中',
      LOST: '已流失'
    }
    return labels[segment] || segment
  }

  const getSegmentColor = (segment: RFMSegment): string => {
    const colors: Record<RFMSegment, string> = {
      CHAMPIONS: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      LOYAL: 'bg-green-100 text-green-800 border-green-300',
      POTENTIAL_LOYAL: 'bg-teal-100 text-teal-800 border-teal-300',
      NEW_CUSTOMERS: 'bg-blue-100 text-blue-800 border-blue-300',
      PROMISING: 'bg-cyan-100 text-cyan-800 border-cyan-300',
      NEED_ATTENTION: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      ABOUT_TO_SLEEP: 'bg-orange-100 text-orange-800 border-orange-300',
      AT_RISK: 'bg-red-100 text-red-800 border-red-300',
      HIBERNATING: 'bg-gray-100 text-gray-800 border-gray-300',
      LOST: 'bg-slate-100 text-slate-800 border-slate-300'
    }
    return colors[segment] || 'bg-gray-100 text-gray-800'
  }

  const getSegmentIcon = (segment: RFMSegment): string => {
    const icons: Record<RFMSegment, string> = {
      CHAMPIONS: '🏆',
      LOYAL: '💎',
      POTENTIAL_LOYAL: '⭐',
      NEW_CUSTOMERS: '🌱',
      PROMISING: '📈',
      NEED_ATTENTION: '👀',
      ABOUT_TO_SLEEP: '😴',
      AT_RISK: '⚠️',
      HIBERNATING: '❄️',
      LOST: '💨'
    }
    return icons[segment] || '👤'
  }

  const getScoreColor = (score: number): string => {
    if (score >= 4) return 'text-emerald-600'
    if (score >= 3) return 'text-yellow-600'
    if (score >= 2) return 'text-orange-600'
    return 'text-red-600'
  }

  const getSegmentDescription = (segment: RFMSegment): string => {
    const descriptions: Record<RFMSegment, string> = {
      CHAMPIONS: '高頻率消費、高金額、最近有消費的最佳客戶',
      LOYAL: '穩定消費、忠誠度高的重要客戶',
      POTENTIAL_LOYAL: '近期有消費、有發展潛力的客戶',
      NEW_CUSTOMERS: '最近加入、尚待培養的新客戶',
      PROMISING: '有消費紀錄、具有發展前景的客戶',
      NEED_ATTENTION: '消費頻率下降、需要關注的客戶',
      ABOUT_TO_SLEEP: '消費間隔拉長、即將流失的客戶',
      AT_RISK: '曾經活躍、目前有流失風險的客戶',
      HIBERNATING: '長時間未消費的休眠客戶',
      LOST: '已經流失、很久未消費的客戶'
    }
    return descriptions[segment] || ''
  }

  // Aliases for backward compatibility
  const segmentMembers = rfmScores
  const segmentMemberCount = totalCount
  const autoTagSegment = autoApplyTags

  return {
    // State
    rfmScores,
    segments,
    isLoading,
    totalCount,
    // Aliases
    segmentMembers,
    segmentMemberCount,
    // Actions
    fetchRFMScores,
    getMemberRFM,
    calculateRFM,
    fetchSegments,
    fetchSegmentMembers,
    autoApplyTags,
    autoTagSegment,
    exportSegment,
    // Helpers
    getSegmentLabel,
    getSegmentColor,
    getSegmentIcon,
    getScoreColor,
    getSegmentDescription
  }
}

export default useSegmentation
