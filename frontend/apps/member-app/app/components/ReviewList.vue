<script setup lang="ts">
import type { Review, ReviewSummary } from '~/composables/useReviews'

const props = defineProps<{
  reviews: Review[]
  summary?: ReviewSummary
  showSummary?: boolean
}>()

const { formatReviewDate } = useReviews()

const displayedReviews = computed(() => props.reviews.slice(0, 10))
const hasMore = computed(() => props.reviews.length > 10)
</script>

<template>
  <div class="review-list">
    <!-- Summary Section -->
    <div v-if="showSummary && summary" class="review-summary">
      <div class="summary-score">
        <span class="score-value">{{ summary.avg_rating.toFixed(1) }}</span>
        <div class="score-stars">
          <span
            v-for="i in 5"
            :key="i"
            class="star"
            :class="{ filled: i <= Math.round(summary.avg_rating) }"
          >&#9733;</span>
        </div>
        <span class="score-count">{{ summary.total_reviews }} 則評價</span>
      </div>

      <div class="rating-bars">
        <div v-for="i in [5, 4, 3, 2, 1]" :key="i" class="rating-bar">
          <span class="bar-label">{{ i }}</span>
          <div class="bar-track">
            <div
              class="bar-fill"
              :style="{
                width: summary.total_reviews > 0
                  ? `${(summary.rating_distribution[i as keyof typeof summary.rating_distribution] / summary.total_reviews) * 100}%`
                  : '0%'
              }"
            />
          </div>
          <span class="bar-count">{{ summary.rating_distribution[i as keyof typeof summary.rating_distribution] }}</span>
        </div>
      </div>
    </div>

    <!-- Reviews -->
    <div v-if="displayedReviews.length > 0" class="reviews">
      <div v-for="review in displayedReviews" :key="review.id" class="review-item">
        <div class="review-header">
          <span class="reviewer-name">{{ review.member_display_name || '會員' }}</span>
          <span class="review-date">{{ formatReviewDate(review.reviewed_at) }}</span>
        </div>
        <div class="review-rating">
          <span
            v-for="i in 5"
            :key="i"
            class="star"
            :class="{ filled: i <= review.rating }"
          >&#9733;</span>
        </div>
        <p v-if="review.comment" class="review-comment">{{ review.comment }}</p>
      </div>

      <p v-if="hasMore" class="more-hint">
        還有 {{ reviews.length - 10 }} 則評價...
      </p>
    </div>

    <!-- Empty State -->
    <div v-else class="empty-reviews">
      <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <p>尚無評價</p>
    </div>
  </div>
</template>

<style scoped>
.review-list {
  padding: 16px;
}

/* Summary */
.review-summary {
  display: flex;
  gap: 24px;
  padding: 16px;
  background-color: var(--color-surface);
  border-radius: 16px;
  margin-bottom: 24px;
}

.summary-score {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 80px;
}

.score-value {
  font-size: 36px;
  font-weight: 700;
  color: var(--color-text);
  line-height: 1;
}

.score-stars {
  margin: 8px 0;
}

.score-count {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.star {
  color: var(--color-border);
  font-size: 16px;
}

.star.filled {
  color: var(--color-warning);
}

.rating-bars {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rating-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bar-label {
  font-size: 12px;
  color: var(--color-text-secondary);
  width: 12px;
}

.bar-track {
  flex: 1;
  height: 8px;
  background-color: var(--color-surface-secondary);
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  background-color: var(--color-warning);
  border-radius: 4px;
  transition: width 0.3s ease;
}

.bar-count {
  font-size: 12px;
  color: var(--color-text-tertiary);
  width: 24px;
  text-align: right;
}

/* Reviews */
.reviews {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.review-item {
  padding: 16px;
  background-color: var(--color-surface);
  border-radius: 12px;
}

.review-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.reviewer-name {
  font-weight: 600;
  color: var(--color-text);
}

.review-date {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.review-rating {
  margin-bottom: 8px;
}

.review-rating .star {
  font-size: 14px;
}

.review-comment {
  font-size: 14px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0;
}

.more-hint {
  text-align: center;
  font-size: 13px;
  color: var(--color-text-tertiary);
  padding: 8px;
}

/* Empty State */
.empty-reviews {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  text-align: center;
}

.empty-reviews svg {
  color: var(--color-text-tertiary);
  margin-bottom: 16px;
}

.empty-reviews p {
  color: var(--color-text-secondary);
  font-size: 14px;
}
</style>
