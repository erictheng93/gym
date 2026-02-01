/**
 * useReviews composable
 * Handles class review CRUD operations
 */

import { extractErrorMessage } from '../utils/apiHelpers'

export interface Review {
  id: string
  booking_id: string
  rating: number
  comment?: string | null
  session_date: string
  reviewed_at: string
  member_name?: string
  member_display_name?: string
  instructor_name?: string
  class_name?: string
  class_category?: string
}

export interface ReviewSummary {
  total_reviews: number
  avg_rating: number
  rating_distribution: {
    5: number
    4: number
    3: number
    2: number
    1: number
  }
}

export interface ReviewEligibility {
  can_review: boolean
  reason: string
  days_since_session?: number
  existing_review?: Review | null
}

interface SubmitReviewPayload {
  booking_id: string
  rating: number
  comment?: string
}

interface ReviewResult {
  success: boolean
  message: string
  review_id?: string
}

interface ClassReviewsResponse {
  success: boolean
  data: {
    reviews: Review[]
    summary: ReviewSummary
  }
}

export const useReviews = () => {
  const config = useRuntimeConfig()
  const apiUrl = config.public.apiBaseUrl
  const { getAuthHeader } = useMemberAuth()

  const myReviews = useState<Review[]>('my_reviews', () => [])
  const isLoading = useState('reviews_loading', () => false)

  /**
   * Check if member can review a specific booking
   */
  const checkEligibility = async (bookingId: string): Promise<ReviewEligibility> => {
    try {
      const response = await $fetch<{ success: boolean; data: ReviewEligibility }>(
        `${apiUrl}/api/member/reviews/eligibility/${bookingId}`,
        { headers: getAuthHeader() }
      )
      return response.data
    } catch {
      return {
        can_review: false,
        reason: '無法確認評價資格',
        existing_review: null,
      }
    }
  }

  /**
   * Submit a new review
   */
  const submitReview = async (payload: SubmitReviewPayload): Promise<ReviewResult> => {
    isLoading.value = true
    try {
      const response = await $fetch<ReviewResult>(`${apiUrl}/api/member/reviews`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: payload,
      })
      return response
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '評價提交失敗'),
      }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Update an existing review
   */
  const updateReview = async (
    reviewId: string,
    rating: number,
    comment?: string
  ): Promise<ReviewResult> => {
    isLoading.value = true
    try {
      const response = await $fetch<ReviewResult>(`${apiUrl}/api/member/reviews/${reviewId}`, {
        method: 'PUT',
        headers: getAuthHeader(),
        body: { rating, comment },
      })
      return response
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '更新評價失敗'),
      }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Delete a review
   */
  const deleteReview = async (reviewId: string): Promise<ReviewResult> => {
    isLoading.value = true
    try {
      const response = await $fetch<ReviewResult>(`${apiUrl}/api/member/reviews/${reviewId}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      })

      if (response.success) {
        // Remove from local state
        myReviews.value = myReviews.value.filter(r => r.id !== reviewId)
      }

      return response
    } catch (error: unknown) {
      return {
        success: false,
        message: extractErrorMessage(error, '刪除評價失敗'),
      }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Get reviews for a specific class (public)
   */
  const getClassReviews = async (
    classId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ reviews: Review[]; summary: ReviewSummary } | null> => {
    try {
      const params = new URLSearchParams()
      if (options?.limit) params.append('limit', String(options.limit))
      if (options?.offset) params.append('offset', String(options.offset))

      const queryString = params.toString()
      const url = `${apiUrl}/api/member/reviews/class/${classId}${queryString ? '?' + queryString : ''}`

      const response = await $fetch<ClassReviewsResponse>(url)

      return response.success ? response.data : null
    } catch {
      return null
    }
  }

  /**
   * Get member's own reviews
   */
  const fetchMyReviews = async (options?: { limit?: number; offset?: number }) => {
    isLoading.value = true
    try {
      const params = new URLSearchParams()
      if (options?.limit) params.append('limit', String(options.limit))
      if (options?.offset) params.append('offset', String(options.offset))

      const queryString = params.toString()
      const url = `${apiUrl}/api/member/reviews/my${queryString ? '?' + queryString : ''}`

      const response = await $fetch<{ success: boolean; data: Review[] }>(
        url,
        { headers: getAuthHeader() }
      )

      if (response.success) {
        myReviews.value = response.data
      }
      return response.data
    } catch {
      return []
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Format rating display (returns star icons)
   */
  const formatRatingStars = (rating: number): string => {
    return '★'.repeat(rating) + '☆'.repeat(5 - rating)
  }

  /**
   * Get rating label
   */
  const getRatingLabel = (rating: number): string => {
    const labels: Record<number, string> = {
      5: '非常滿意',
      4: '滿意',
      3: '普通',
      2: '不滿意',
      1: '非常不滿意',
    }
    return labels[rating] || ''
  }

  /**
   * Format review date
   */
  const formatReviewDate = (dateStr: string): string => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return '今天'
    if (diffDays === 1) return '昨天'
    if (diffDays < 7) return `${diffDays} 天前`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} 週前`
    return date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })
  }

  return {
    myReviews,
    isLoading,
    checkEligibility,
    submitReview,
    updateReview,
    deleteReview,
    getClassReviews,
    fetchMyReviews,
    formatRatingStars,
    getRatingLabel,
    formatReviewDate,
  }
}
