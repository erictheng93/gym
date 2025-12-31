/**
 * useReviews composable
 * Handles class review CRUD operations
 */

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
  const apiUrl = config.public.directusUrl
  const { getAuthHeader } = useMemberAuth()

  const myReviews = useState<Review[]>('my_reviews', () => [])
  const isLoading = useState('reviews_loading', () => false)

  /**
   * Check if member can review a specific booking
   */
  const checkEligibility = async (bookingId: string): Promise<ReviewEligibility> => {
    try {
      const response = await $fetch<{ success: boolean; data: ReviewEligibility }>(
        `${apiUrl}/gym/reviews/eligibility/${bookingId}`,
        { headers: getAuthHeader() }
      )
      return response.data
    } catch (error) {
      console.error('Failed to check review eligibility:', error)
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
      const response = await $fetch<ReviewResult>(`${apiUrl}/gym/reviews`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: payload,
      })
      return response
    } catch (error: unknown) {
      console.error('Failed to submit review:', error)
      if (typeof error === 'object' && error !== null && 'data' in error) {
        const fetchError = error as { data?: { message?: string } }
        return {
          success: false,
          message: fetchError.data?.message || '評價提交失敗',
        }
      }
      return { success: false, message: '評價提交失敗' }
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
      const response = await $fetch<ReviewResult>(`${apiUrl}/gym/reviews/${reviewId}`, {
        method: 'PUT',
        headers: getAuthHeader(),
        body: { rating, comment },
      })
      return response
    } catch (error: unknown) {
      console.error('Failed to update review:', error)
      if (typeof error === 'object' && error !== null && 'data' in error) {
        const fetchError = error as { data?: { message?: string } }
        return {
          success: false,
          message: fetchError.data?.message || '更新評價失敗',
        }
      }
      return { success: false, message: '更新評價失敗' }
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
      const response = await $fetch<ReviewResult>(`${apiUrl}/gym/reviews/${reviewId}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      })

      if (response.success) {
        // Remove from local state
        myReviews.value = myReviews.value.filter(r => r.id !== reviewId)
      }

      return response
    } catch (error: unknown) {
      console.error('Failed to delete review:', error)
      if (typeof error === 'object' && error !== null && 'data' in error) {
        const fetchError = error as { data?: { message?: string } }
        return {
          success: false,
          message: fetchError.data?.message || '刪除評價失敗',
        }
      }
      return { success: false, message: '刪除評價失敗' }
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
      const url = `${apiUrl}/gym/reviews/class/${classId}${queryString ? '?' + queryString : ''}`

      const response = await $fetch<ClassReviewsResponse>(url)

      return response.success ? response.data : null
    } catch (error) {
      console.error('Failed to fetch class reviews:', error)
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
      const url = `${apiUrl}/gym/reviews/my${queryString ? '?' + queryString : ''}`

      const response = await $fetch<{ success: boolean; data: Review[] }>(
        url,
        { headers: getAuthHeader() }
      )

      if (response.success) {
        myReviews.value = response.data
      }
      return response.data
    } catch (error) {
      console.error('Failed to fetch my reviews:', error)
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
