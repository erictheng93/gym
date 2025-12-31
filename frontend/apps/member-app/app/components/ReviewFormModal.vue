<script setup lang="ts">
import type { Review } from '~/composables/useReviews'

const props = defineProps<{
  show: boolean
  bookingId: string
  className: string
  sessionDate: string
  existingReview?: Review | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'submitted', reviewId: string): void
  (e: 'updated'): void
  (e: 'deleted'): void
}>()

const { submitReview, updateReview, deleteReview, getRatingLabel, isLoading } = useReviews()
const { success: toastSuccess, error: toastError, warning: toastWarning } = useToast()

const rating = ref(props.existingReview?.rating || 0)
const comment = ref(props.existingReview?.comment || '')
const showDeleteConfirm = ref(false)

const isEditing = computed(() => !!props.existingReview)

// Reset form when modal opens
watch(() => props.show, (newVal) => {
  if (newVal) {
    rating.value = props.existingReview?.rating || 0
    comment.value = props.existingReview?.comment || ''
    showDeleteConfirm.value = false
  }
})

const handleSubmit = async () => {
  if (rating.value === 0) {
    toastWarning('請選擇評分')
    return
  }

  if (isEditing.value && props.existingReview) {
    const result = await updateReview(props.existingReview.id, rating.value, comment.value)
    if (result.success) {
      toastSuccess('評價已更新')
      emit('updated')
    } else {
      toastError(result.message)
    }
  } else {
    const result = await submitReview({
      booking_id: props.bookingId,
      rating: rating.value,
      comment: comment.value || undefined,
    })
    if (result.success && result.review_id) {
      toastSuccess('感謝您的評價！')
      emit('submitted', result.review_id)
    } else {
      toastError(result.message)
    }
  }
}

const handleDelete = async () => {
  if (!props.existingReview) return

  const result = await deleteReview(props.existingReview.id)
  if (result.success) {
    toastSuccess('評價已刪除')
    emit('deleted')
  } else {
    toastError(result.message)
  }
}

const setRating = (value: number) => {
  rating.value = value
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="show" class="modal-overlay" @click.self="emit('close')">
        <div class="modal-content">
          <button class="modal-close" @click="emit('close')">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          <div class="modal-header">
            <h2>{{ isEditing ? '編輯評價' : '課程評價' }}</h2>
            <p class="class-info">{{ className }} · {{ sessionDate }}</p>
          </div>

          <div v-if="!showDeleteConfirm" class="modal-body">
            <!-- Star Rating -->
            <div class="rating-section">
              <p class="rating-label">您的評分</p>
              <div class="star-rating">
                <button
                  v-for="i in 5"
                  :key="i"
                  class="star-btn"
                  :class="{ active: i <= rating }"
                  @click="setRating(i)"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" :fill="i <= rating ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </button>
              </div>
              <p v-if="rating > 0" class="rating-text">{{ getRatingLabel(rating) }}</p>
            </div>

            <!-- Comment -->
            <div class="comment-section">
              <label for="comment" class="comment-label">評論（選填）</label>
              <textarea
                id="comment"
                v-model="comment"
                class="comment-input"
                placeholder="分享您的課程體驗..."
                rows="4"
                maxlength="500"
              />
              <span class="char-count">{{ comment.length }}/500</span>
            </div>

            <!-- Actions -->
            <div class="modal-actions">
              <button
                v-if="isEditing"
                class="btn btn-danger-outline"
                @click="showDeleteConfirm = true"
              >
                刪除評價
              </button>
              <div class="flex-1" />
              <button class="btn btn-secondary" @click="emit('close')">
                取消
              </button>
              <button
                class="btn btn-primary"
                :disabled="rating === 0 || isLoading"
                @click="handleSubmit"
              >
                <span v-if="isLoading" class="btn-spinner" />
                {{ isEditing ? '更新' : '提交評價' }}
              </button>
            </div>
          </div>

          <!-- Delete Confirmation -->
          <div v-else class="modal-body delete-confirm">
            <p>確定要刪除這則評價嗎？</p>
            <div class="modal-actions">
              <button class="btn btn-secondary" @click="showDeleteConfirm = false">
                取消
              </button>
              <button
                class="btn btn-danger"
                :disabled="isLoading"
                @click="handleDelete"
              >
                <span v-if="isLoading" class="btn-spinner" />
                確認刪除
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Modal styles - following existing pattern from bookings.vue */
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-content {
  width: 100%;
  max-width: 500px;
  background-color: var(--color-background);
  border-radius: 24px 24px 0 0;
  padding: 24px;
  max-height: 80vh;
  overflow-y: auto;
  position: relative;
}

.modal-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  border: none;
  background-color: var(--color-surface-secondary);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--color-text-secondary);
}

.modal-header {
  margin-bottom: 24px;
  padding-right: 48px;
}

.modal-header h2 {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 8px 0;
}

.class-info {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
}

/* Rating Section */
.rating-section {
  margin-bottom: 24px;
  text-align: center;
}

.rating-label {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 12px;
}

.star-rating {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.star-btn {
  background: none;
  border: none;
  padding: 4px;
  cursor: pointer;
  color: var(--color-warning);
  transition: transform 0.2s ease;
}

.star-btn:active {
  transform: scale(1.2);
}

.star-btn.active svg {
  color: var(--color-warning);
}

.star-btn:not(.active) svg {
  color: var(--color-border);
}

.rating-text {
  margin-top: 8px;
  font-size: 14px;
  color: var(--color-text);
  font-weight: 500;
}

/* Comment Section */
.comment-section {
  margin-bottom: 24px;
}

.comment-label {
  display: block;
  font-size: 14px;
  color: var(--color-text-secondary);
  margin-bottom: 8px;
}

.comment-input {
  width: 100%;
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  font-size: 15px;
  resize: none;
  background-color: var(--color-surface);
  color: var(--color-text);
  font-family: inherit;
}

.comment-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.char-count {
  display: block;
  text-align: right;
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-top: 4px;
}

/* Actions */
.modal-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.flex-1 {
  flex: 1;
}

.delete-confirm {
  text-align: center;
}

.delete-confirm p {
  font-size: 16px;
  margin-bottom: 24px;
}

.delete-confirm .modal-actions {
  justify-content: center;
}

/* Button styles */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 24px;
  border: none;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary {
  background-color: var(--color-primary);
  color: white;
}

.btn-secondary {
  background-color: var(--color-surface-secondary);
  color: var(--color-text);
}

.btn-danger {
  background-color: var(--color-error);
  color: white;
}

.btn-danger-outline {
  background-color: transparent;
  border: 1px solid var(--color-error);
  color: var(--color-error);
}

.btn-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Modal Transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition: transform 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: translateY(100%);
}
</style>
