/**
 * useMeasurements composable
 * Handles body measurement tracking with offline caching
 */

import type { MeasurementSource } from '../schemas/measurement.schema'
import { extractErrorMessage } from '../utils/apiHelpers'
import { deduplicateRequest } from '../utils/debounce'

// Cache settings
const CACHE_KEY_MEASUREMENTS = 'member:measurements'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// Reusable date formatter to avoid re-instantiating Intl.DateTimeFormat on each call
const measurementDateFormatter = new Intl.DateTimeFormat('zh-TW', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

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

// --- Backend payloads (backend/src/routes/member-measurements.ts, camelCase) ---

export interface ApiMeasurement {
  id: string
  date: string
  weight: number | null
  bodyFat: number | null
  muscleMass: number | null
  bmi: number | null
  source: MeasurementSource
  createdAt?: string
}

interface MeasurementsResponse {
  success: boolean
  data: {
    measurements: ApiMeasurement[]
    pagination: { total: number; page: number; limit: number; totalPages: number }
  }
}

interface MeasurementResponse {
  success: boolean
  message?: string
  data?: { measurement: ApiMeasurement | null }
}

export interface ApiMeasurementStats {
  totalRecords: number
  periodDays: number
  weight: TrendData
  bodyFat: TrendData
  muscleMass: TrendData
  bmi: TrendData
}

interface StatsResponse {
  success: boolean
  data: {
    stats: ApiMeasurementStats
    daily: Array<{ date: string; weight: number | null; bodyFat: number | null }>
  }
}

export function toMeasurement(m: ApiMeasurement, memberId: string): Measurement {
  return {
    id: m.id,
    member_id: memberId,
    date: m.date,
    weight: m.weight,
    body_fat: m.bodyFat,
    muscle_mass: m.muscleMass,
    bmi: m.bmi,
    source: m.source,
    raw_data: null,
    created_at: m.createdAt ?? '',
  }
}

export function toMeasurementStats(s: ApiMeasurementStats): MeasurementStats {
  return {
    total_records: s.totalRecords,
    period_days: s.periodDays,
    weight: s.weight,
    body_fat: s.bodyFat,
    muscle_mass: s.muscleMass,
    bmi: s.bmi,
  }
}

/** POST body: camelCase, empty values dropped (the backend accepts omitted, not null). */
export function toMeasurementBody(data: {
  date?: string
  weight?: number | null
  body_fat?: number | null
  muscle_mass?: number | null
  bmi?: number | null
  source?: MeasurementSource
  raw_data?: Record<string, unknown>
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    date: data.date || new Date().toISOString().slice(0, 10),
    weight: data.weight,
    bodyFat: data.body_fat,
    muscleMass: data.muscle_mass,
    bmi: data.bmi,
    source: data.source,
    rawData: data.raw_data,
  }
  for (const key of Object.keys(body)) {
    if (body[key] === null || body[key] === undefined) delete body[key]
  }
  return body
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
   * Fetch member's measurements with optional date filter (with request deduplication)
   */
  const fetchMeasurements = async (options?: {
    start_date?: string
    end_date?: string
    limit?: number
    offset?: number
  }) => {
    if (!member.value) return []

    const dedupKey = `measurements:${member.value.id}:${JSON.stringify(options || {})}`
    return deduplicateRequest(dedupKey, async () => {
      isLoading.value = true
      isOfflineData.value = false

      const cacheKey = `${CACHE_KEY_MEASUREMENTS}:${member.value!.id}:${JSON.stringify(options || {})}`

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

        // The backend lists newest first with page-based paging (no date filter).
        const limit = options?.limit ?? 20
        const params = new URLSearchParams()
        params.append('limit', String(limit))
        params.append('page', String(Math.floor((options?.offset ?? 0) / limit) + 1))

        const response = await $fetch<MeasurementsResponse>(`${apiUrl}/api/member/measurements?${params}`, {
          headers: getAuthHeader(),
        })

        if (!response.success) return []
        let list = response.data.measurements.map(m => toMeasurement(m, member.value!.id))
        if (options?.start_date) list = list.filter(m => m.date >= options.start_date!)
        if (options?.end_date) list = list.filter(m => m.date <= options.end_date!)
        measurements.value = list
        await setCache(cacheKey, list, CACHE_TTL)
        return list
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
    })
  }

  /**
   * Get the latest measurement (with request deduplication)
   */
  const fetchLatestMeasurement = async (): Promise<Measurement | null> => {
    if (!member.value) return null

    const dedupKey = `measurement-latest:${member.value.id}`
    return deduplicateRequest(dedupKey, async () => {
      try {
        const response = await $fetch<MeasurementResponse>(
          `${apiUrl}/api/member/measurements/latest`,
          { headers: getAuthHeader() }
        )

        if (!response.success) return null
        const latest = response.data?.measurement
        latestMeasurement.value = latest ? toMeasurement(latest, member.value!.id) : null
        return latestMeasurement.value
      } catch {
        return null
      }
    })
  }

  /**
   * Get measurement statistics (trends) (with request deduplication)
   */
  const fetchStats = async (period: string = '30'): Promise<MeasurementStats | null> => {
    if (!member.value) return null

    const dedupKey = `measurement-stats:${member.value.id}:${period}`
    return deduplicateRequest(dedupKey, async () => {
      try {
        const response = await $fetch<StatsResponse>(
          `${apiUrl}/api/member/measurements/stats?period=${period}`,
          { headers: getAuthHeader() }
        )

        if (!response.success) return null
        stats.value = toMeasurementStats(response.data.stats)
        return stats.value
      } catch {
        return null
      }
    })
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
      const response = await $fetch<MeasurementResponse>(`${apiUrl}/api/member/measurements`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: toMeasurementBody(data),
      })

      const created = response.success && response.data?.measurement
        ? toMeasurement(response.data.measurement, member.value.id)
        : undefined
      if (created) {
        measurements.value.unshift(created)
        latestMeasurement.value = created
      }

      return { success: response.success, message: response.message ?? '', data: created }
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
    if (!dateStr) return '—'
    const date = new Date(dateStr)
    return isNaN(date.getTime()) ? '—' : measurementDateFormatter.format(date)
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
