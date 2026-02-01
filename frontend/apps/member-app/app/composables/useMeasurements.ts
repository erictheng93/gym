/**
 * useMeasurements composable
 * Handles body measurement tracking with offline caching
 */

import type { MeasurementSource } from '../schemas/measurement.schema'
import { extractErrorMessage } from '../utils/apiHelpers'

// Cache settings
const CACHE_KEY_MEASUREMENTS = 'member:measurements'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export interface Measurement {
  id: string
  member_id: string
  date: string
  weight: number | null
  body_fat: number | null
  muscle_mass: number | null
  bmi: number | null
  source: MeasurementSource
  raw_data: Record<string, unknown> | null
  created_at: string
}

export interface MeasurementStats {
  total_records: number
  period_days: number
  weight: TrendData
  body_fat: TrendData
  muscle_mass: TrendData
  bmi: TrendData
}

interface TrendData {
  first: number | null
  last: number | null
  change: number | null
  trend: 'up' | 'down' | 'stable' | null
}

interface MeasurementResult {
  success: boolean
  message: string
  data?: Measurement
}

interface MeasurementsResponse {
  success: boolean
  data: Measurement[]
}

interface StatsResponse {
  success: boolean
  data: {
    stats: MeasurementStats
    daily: Array<{ date: string; weight?: number; body_fat?: number }>
  }
}

export const useMeasurements = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl
  const { getAuthHeader, member } = useMemberAuth()
  const { isOnline, getCache, setCache } = useOfflineSync()

  const measurements = useState<Measurement[]>('member_measurements', () => [])
  const latestMeasurement = useState<Measurement | null>('member_latest_measurement', () => null)
  const stats = useState<MeasurementStats | null>('member_measurement_stats', () => null)
  const isLoading = useState('measurements_loading', () => false)
  const isOfflineData = useState('measurements_is_offline', () => false)

  /**
   * Fetch member's measurements with optional date filter
   */
  const fetchMeasurements = async (options?: {
    start_date?: string
    end_date?: string
    limit?: number
    offset?: number
  }) => {
    if (!member.value) return []

    isLoading.value = true
    isOfflineData.value = false

    const cacheKey = `${CACHE_KEY_MEASUREMENTS}:${member.value.id}:${JSON.stringify(options || {})}`

    try {
      // If offline, try cached data
      if (!isOnline.value) {
        const cached = await getCache<Measurement[]>(cacheKey)
        if (cached) {
          measurements.value = cached
          isOfflineData.value = true
          return cached
        }
        return []
      }

      const params = new URLSearchParams()
      if (options?.start_date) params.append('start_date', options.start_date)
      if (options?.end_date) params.append('end_date', options.end_date)
      if (options?.limit) params.append('limit', String(options.limit))
      if (options?.offset) params.append('offset', String(options.offset))

      const response = await $fetch<MeasurementsResponse>(`${apiUrl}/api/member/measurements?${params}`, {
        headers: getAuthHeader(),
      })

      if (response.success) {
        measurements.value = response.data
        await setCache(cacheKey, response.data, CACHE_TTL)
      }
      return response.data
    } catch {
      // Try cached data on network error
      const cached = await getCache<Measurement[]>(cacheKey)
      if (cached) {
        measurements.value = cached
        isOfflineData.value = true
        return cached
      }
      return []
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get the latest measurement
   */
  const fetchLatestMeasurement = async (): Promise<Measurement | null> => {
    if (!member.value) return null

    try {
      const response = await $fetch<{ success: boolean; data: Measurement | null }>(
        `${apiUrl}/api/member/measurements/latest`,
        { headers: getAuthHeader() }
      )

      if (response.success) {
        latestMeasurement.value = response.data
      }
      return response.data
    } catch {
      return null
    }
  }

  /**
   * Get measurement statistics (trends)
   */
  const fetchStats = async (period: string = '30'): Promise<MeasurementStats | null> => {
    if (!member.value) return null

    try {
      const response = await $fetch<StatsResponse>(
        `${apiUrl}/api/member/measurements/stats?period=${period}`,
        { headers: getAuthHeader() }
      )

      if (response.success) {
        stats.value = response.data.stats
      }
      return response.data.stats
    } catch {
      return null
    }
  }

  /**
   * Add a new measurement
   */
  const createMeasurement = async (data: {
    date?: string
    weight?: number | null
    body_fat?: number | null
    muscle_mass?: number | null
    bmi?: number | null
    source?: MeasurementSource
    raw_data?: Record<string, unknown>
  }): Promise<MeasurementResult> => {
    if (!member.value) {
      return { success: false, message: '請先登入' }
    }

    try {
      const response = await $fetch<MeasurementResult>(`${apiUrl}/api/member/measurements`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: data,
      })

      if (response.success && response.data) {
        measurements.value.unshift(response.data)
        latestMeasurement.value = response.data
      }

      return response
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '記錄數據失敗'),
      }
    }
  }

  /**
   * Delete a measurement
   */
  const deleteMeasurement = async (id: string): Promise<MeasurementResult> => {
    if (!member.value) {
      return { success: false, message: '請先登入' }
    }

    try {
      const response = await $fetch<MeasurementResult>(`${apiUrl}/api/member/measurements/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      })

      if (response.success) {
        measurements.value = measurements.value.filter(m => m.id !== id)
        // Update latest if needed
        if (latestMeasurement.value?.id === id) {
          latestMeasurement.value = measurements.value[0] || null
        }
      }

      return response
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '刪除記錄失敗'),
      }
    }
  }

  /**
   * Format measurement date for display
   */
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('zh-TW', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  /**
   * Get trend icon name
   */
  const getTrendIcon = (trend: TrendData['trend']): string => {
    switch (trend) {
      case 'up': return 'arrow-up'
      case 'down': return 'arrow-down'
      default: return 'minus'
    }
  }

  /**
   * Get trend color class
   */
  const getTrendColor = (trend: TrendData['trend'], metric: string): string => {
    // For body fat, down is good; for muscle mass, up is good
    const isGoodTrend = (
      (metric === 'body_fat' && trend === 'down') ||
      (metric === 'muscle_mass' && trend === 'up') ||
      (metric === 'weight' && trend === 'down') // Depends on goal, default to weight loss
    )

    if (trend === 'stable') return 'text-muted'
    return isGoodTrend ? 'text-success' : 'text-warning'
  }

  return {
    measurements,
    latestMeasurement,
    stats,
    isLoading,
    isOfflineData,
    isOnline,
    fetchMeasurements,
    fetchLatestMeasurement,
    fetchStats,
    createMeasurement,
    deleteMeasurement,
    formatDate,
    getTrendIcon,
    getTrendColor,
  }
}
