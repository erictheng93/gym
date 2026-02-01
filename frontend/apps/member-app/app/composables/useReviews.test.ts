/**
 * Tests for useReviews composable
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock ../utils/apiHelpers module
vi.mock('../utils/apiHelpers', () => ({
  extractErrorMessage: (error: unknown, fallback: string) => {
    if (!error) return fallback
    if (error instanceof Error) {
      return error.message || fallback
    }
    if (typeof error === 'object' && error !== null) {
      const err = error as Record<string, unknown>
      if ('data' in err && typeof err.data === 'object' && err.data !== null) {
        const data = err.data as Record<string, unknown>
        if ('message' in data) return String(data.message)
      }
      if ('message' in err) return String(err.message)
    }
    return fallback
  },
}))

// Create mock state storage
const stateStore = new Map<string, { value: unknown }>()

// Mock Nuxt composables
vi.stubGlobal('useState', (key: string, init?: () => unknown) => {
  if (!stateStore.has(key)) {
    stateStore.set(key, { value: init ? init() : undefined })
  }
  return stateStore.get(key)!
})

vi.stubGlobal('computed', (getter: () => unknown) => ({
  get value() {
    return getter()
  },
}))

vi.stubGlobal('useRuntimeConfig', () => ({
  public: {
    apiBaseUrl: 'http://localhost:8056',
  },
}))

// Mock $fetch
const mockFetch = vi.fn()
vi.stubGlobal('$fetch', mockFetch)

// Mock useMemberAuth
vi.stubGlobal('useMemberAuth', () => ({
  getAuthHeader: () => ({ 'X-Member-Token': 'mock-token' }),
}))

// Import after mocks
import { useReviews, type Review, type ReviewSummary } from './useReviews'

describe('useReviews', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    stateStore.clear()
  })

  describe('checkEligibility', () => {
    it('should return eligibility data on success', async () => {
      const { checkEligibility } = useReviews()

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: {
          can_review: true,
          reason: '可以評價',
          days_since_session: 2,
          existing_review: null,
        },
      })

      const result = await checkEligibility('booking-123')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/reviews/eligibility/booking-123',
        { headers: { 'X-Member-Token': 'mock-token' } }
      )
      expect(result.can_review).toBe(true)
      expect(result.reason).toBe('可以評價')
    })

    it('should return default eligibility on error', async () => {
      const { checkEligibility } = useReviews()

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await checkEligibility('booking-123')

      expect(result.can_review).toBe(false)
      expect(result.reason).toBe('無法確認評價資格')
    })
  })

  describe('submitReview', () => {
    it('should submit review successfully', async () => {
      const { submitReview } = useReviews()

      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '評價已提交',
        review_id: 'review-123',
      })

      const result = await submitReview({
        booking_id: 'booking-123',
        rating: 5,
        comment: 'Great class!',
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/reviews',
        {
          method: 'POST',
          headers: { 'X-Member-Token': 'mock-token' },
          body: {
            booking_id: 'booking-123',
            rating: 5,
            comment: 'Great class!',
          },
        }
      )
      expect(result.success).toBe(true)
      expect(result.review_id).toBe('review-123')
    })

    it('should handle submit error', async () => {
      const { submitReview } = useReviews()

      mockFetch.mockRejectedValueOnce({
        data: { message: '已經評價過了' },
      })

      const result = await submitReview({
        booking_id: 'booking-123',
        rating: 5,
      })

      expect(result.success).toBe(false)
      expect(result.message).toBe('已經評價過了')
    })
  })

  describe('updateReview', () => {
    it('should update review successfully', async () => {
      const { updateReview } = useReviews()

      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '評價已更新',
      })

      const result = await updateReview('review-123', 4, 'Updated comment')

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/reviews/review-123',
        {
          method: 'PUT',
          headers: { 'X-Member-Token': 'mock-token' },
          body: { rating: 4, comment: 'Updated comment' },
        }
      )
      expect(result.success).toBe(true)
    })

    it('should handle update error', async () => {
      const { updateReview } = useReviews()

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await updateReview('review-123', 4)

      expect(result.success).toBe(false)
      // extractErrorMessage returns the Error message when available
      expect(result.message).toBe('Network error')
    })
  })

  describe('deleteReview', () => {
    it('should delete review and update local state', async () => {
      const { deleteReview, myReviews } = useReviews()

      // Set up initial state
      myReviews.value = [
        { id: 'review-123', rating: 5 } as Review,
        { id: 'review-456', rating: 4 } as Review,
      ]

      mockFetch.mockResolvedValueOnce({
        success: true,
        message: '評價已刪除',
      })

      const result = await deleteReview('review-123')

      expect(result.success).toBe(true)
      expect(myReviews.value).toHaveLength(1)
      expect(myReviews.value[0].id).toBe('review-456')
    })

    it('should not update local state on failed delete', async () => {
      const { deleteReview, myReviews } = useReviews()

      myReviews.value = [{ id: 'review-123', rating: 5 } as Review]

      mockFetch.mockResolvedValueOnce({
        success: false,
        message: '無法刪除',
      })

      const result = await deleteReview('review-123')

      expect(result.success).toBe(false)
      expect(myReviews.value).toHaveLength(1)
    })
  })

  describe('getClassReviews', () => {
    it('should fetch class reviews', async () => {
      const mockReviews: Review[] = [
        {
          id: 'r1',
          booking_id: 'b1',
          rating: 5,
          session_date: '2024-01-15',
          reviewed_at: '2024-01-16',
          class_name: 'Yoga',
        },
      ]
      const mockSummary: ReviewSummary = {
        total_reviews: 1,
        avg_rating: 5,
        rating_distribution: { 5: 1, 4: 0, 3: 0, 2: 0, 1: 0 },
      }

      const { getClassReviews } = useReviews()

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: { reviews: mockReviews, summary: mockSummary },
      })

      const result = await getClassReviews('class-123', { limit: 10 })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/reviews/class/class-123?limit=10'
      )
      expect(result?.reviews).toHaveLength(1)
      expect(result?.summary.avg_rating).toBe(5)
    })

    it('should return null on error', async () => {
      const { getClassReviews } = useReviews()

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await getClassReviews('class-123')

      expect(result).toBeNull()
    })
  })

  describe('fetchMyReviews', () => {
    it('should fetch and store member reviews', async () => {
      const mockReviews: Review[] = [
        {
          id: 'r1',
          booking_id: 'b1',
          rating: 5,
          session_date: '2024-01-15',
          reviewed_at: '2024-01-16',
        },
        {
          id: 'r2',
          booking_id: 'b2',
          rating: 4,
          session_date: '2024-01-14',
          reviewed_at: '2024-01-15',
        },
      ]

      const { fetchMyReviews, myReviews } = useReviews()

      mockFetch.mockResolvedValueOnce({
        success: true,
        data: mockReviews,
      })

      const result = await fetchMyReviews({ limit: 10 })

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8056/api/member/reviews/my?limit=10',
        { headers: { 'X-Member-Token': 'mock-token' } }
      )
      expect(result).toHaveLength(2)
      expect(myReviews.value).toHaveLength(2)
    })

    it('should return empty array on error', async () => {
      const { fetchMyReviews } = useReviews()

      mockFetch.mockRejectedValueOnce(new Error('Network error'))

      const result = await fetchMyReviews()

      expect(result).toEqual([])
    })
  })

  describe('formatRatingStars', () => {
    it('should format 5 stars correctly', () => {
      const { formatRatingStars } = useReviews()
      expect(formatRatingStars(5)).toBe('★★★★★')
    })

    it('should format 3 stars correctly', () => {
      const { formatRatingStars } = useReviews()
      expect(formatRatingStars(3)).toBe('★★★☆☆')
    })

    it('should format 1 star correctly', () => {
      const { formatRatingStars } = useReviews()
      expect(formatRatingStars(1)).toBe('★☆☆☆☆')
    })

    it('should format 0 stars correctly', () => {
      const { formatRatingStars } = useReviews()
      expect(formatRatingStars(0)).toBe('☆☆☆☆☆')
    })
  })

  describe('getRatingLabel', () => {
    it('should return correct label for rating 5', () => {
      const { getRatingLabel } = useReviews()
      expect(getRatingLabel(5)).toBe('非常滿意')
    })

    it('should return correct label for rating 4', () => {
      const { getRatingLabel } = useReviews()
      expect(getRatingLabel(4)).toBe('滿意')
    })

    it('should return correct label for rating 3', () => {
      const { getRatingLabel } = useReviews()
      expect(getRatingLabel(3)).toBe('普通')
    })

    it('should return correct label for rating 2', () => {
      const { getRatingLabel } = useReviews()
      expect(getRatingLabel(2)).toBe('不滿意')
    })

    it('should return correct label for rating 1', () => {
      const { getRatingLabel } = useReviews()
      expect(getRatingLabel(1)).toBe('非常不滿意')
    })

    it('should return empty string for invalid rating', () => {
      const { getRatingLabel } = useReviews()
      expect(getRatingLabel(0)).toBe('')
      expect(getRatingLabel(6)).toBe('')
    })
  })

  describe('formatReviewDate', () => {
    it('should return "今天" for today', () => {
      const { formatReviewDate } = useReviews()
      const today = new Date().toISOString()
      expect(formatReviewDate(today)).toBe('今天')
    })

    it('should return "昨天" for yesterday', () => {
      const { formatReviewDate } = useReviews()
      const yesterday = new Date()
      yesterday.setDate(yesterday.getDate() - 1)
      expect(formatReviewDate(yesterday.toISOString())).toBe('昨天')
    })

    it('should return "X 天前" for 2-6 days ago', () => {
      const { formatReviewDate } = useReviews()
      const threeDaysAgo = new Date()
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3)
      expect(formatReviewDate(threeDaysAgo.toISOString())).toBe('3 天前')
    })

    it('should return "X 週前" for 7-29 days ago', () => {
      const { formatReviewDate } = useReviews()
      const twoWeeksAgo = new Date()
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14)
      expect(formatReviewDate(twoWeeksAgo.toISOString())).toBe('2 週前')
    })

    it('should return formatted date for 30+ days ago', () => {
      const { formatReviewDate } = useReviews()
      const oldDate = new Date('2023-06-15')
      const result = formatReviewDate(oldDate.toISOString())
      expect(result).toMatch(/\d+/)
    })
  })
})
