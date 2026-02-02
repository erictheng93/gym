<script setup lang="ts">
/**
 * 績效考核詳情頁面
 */
import { MESSAGES } from '~/constants'
import { usePerformance } from '~/composables/hr'

definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const toast = useToast()
const { confirm } = useConfirm()
const { currentEmployee } = useAuth()

const reviewId = computed(() => route.params.reviewId as string)

const {
  currentReview,
  isLoading,
  fetchReview,
  updateReview,
  submitReview,
  approveReview,
  rejectReview,
  getStatusLabel,
  getStatusVariant,
  getReviewTypeLabel
} = usePerformance()

const isEditing = ref(false)
const editForm = ref({
  score: null as number | null,
  comments: '',
  improvement_plan: ''
})

// Load data
onMounted(async () => {
  await fetchReview(reviewId.value)
  if (currentReview.value) {
    editForm.value = {
      score: currentReview.value.score,
      comments: currentReview.value.comments || '',
      improvement_plan: currentReview.value.improvement_plan || ''
    }
  }
})

// Format date
const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

// Check if current user is reviewer
const isReviewer = computed(() => {
  return currentReview.value?.reviewer_id === currentEmployee.value?.id
})

// Check if can edit
const canEdit = computed(() => {
  return currentReview.value?.status === 'DRAFT' && isReviewer.value
})

// Check if can approve
const canApprove = computed(() => {
  return currentReview.value?.status === 'SUBMITTED' && isReviewer.value
})

// Save edits
const saveEdits = async () => {
  try {
    await updateReview(reviewId.value, editForm.value)
    toast.success('考核更新成功')
    isEditing.value = false
    await fetchReview(reviewId.value)
  } catch (error) {
    console.error('Failed to update review:', error)
    toast.error('更新失敗')
  }
}

// Submit for approval
const handleSubmit = async () => {
  const confirmed = await confirm({
    title: '提交審核',
    message: '確定要提交此考核嗎？提交後無法再修改。',
    confirmText: '確定提交',
    confirmVariant: 'primary'
  })

  if (!confirmed) return

  try {
    await submitReview(reviewId.value)
    toast.success('考核已提交')
    await fetchReview(reviewId.value)
  } catch (error) {
    console.error('Failed to submit review:', error)
    toast.error('提交失敗')
  }
}

// Approve review
const handleApprove = async () => {
  const confirmed = await confirm({
    title: '核准考核',
    message: '確定要核准此考核嗎？',
    confirmText: '確定核准',
    confirmVariant: 'primary'
  })

  if (!confirmed) return

  try {
    await approveReview(reviewId.value)
    toast.success('考核已核准')
    await fetchReview(reviewId.value)
  } catch (error) {
    console.error('Failed to approve review:', error)
    toast.error('核准失敗')
  }
}

// Reject review
const rejectReason = ref('')
const showRejectModal = ref(false)

const handleReject = async () => {
  if (!rejectReason.value.trim()) {
    toast.warning('請填寫退回原因')
    return
  }

  try {
    await rejectReview(reviewId.value, rejectReason.value)
    toast.success('考核已退回')
    showRejectModal.value = false
    rejectReason.value = ''
    await fetchReview(reviewId.value)
  } catch (error) {
    console.error('Failed to reject review:', error)
    toast.error('退回失敗')
  }
}

// Get score class
const getScoreClass = (score: number | null) => {
  if (score === null) return ''
  if (score >= 80) return 'good'
  if (score >= 60) return 'warning'
  return 'poor'
}
</script>

<template>
  <PageContainer>
    <PageHeader
      :title="currentReview?.employee?.full_name ? `${currentReview.employee.full_name} 的考核` : '載入中...'"
      description="績效考核詳情"
      back-to="/hr/performance"
    >
      <template #actions>
        <template v-if="currentReview?.status === 'DRAFT' && isReviewer">
          <button class="btn btn-secondary" @click="isEditing = !isEditing">
            {{ isEditing ? '取消編輯' : '編輯' }}
          </button>
          <button class="btn btn-primary" @click="handleSubmit">
            提交審核
          </button>
        </template>
        <template v-if="canApprove">
          <button class="btn btn-danger" @click="showRejectModal = true">
            退回
          </button>
          <button class="btn btn-primary" @click="handleApprove">
            核准
          </button>
        </template>
      </template>
    </PageHeader>

    <LoadingState v-if="isLoading" />

    <template v-else-if="currentReview">
      <div class="review-grid">
        <!-- Employee Info -->
        <div class="info-card">
          <h3 class="card-title">員工資訊</h3>
          <div class="employee-header">
            <AppAvatar :name="currentReview.employee?.full_name || '?'" size="lg" variant="blue" />
            <div class="employee-details">
              <span class="employee-name">{{ currentReview.employee?.full_name }}</span>
              <span class="employee-code">{{ currentReview.employee?.employee_code }}</span>
            </div>
          </div>
          <div class="info-list">
            <div class="info-row">
              <span class="info-label">考核期間</span>
              <span class="info-value">{{ currentReview.review_period }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">考核類型</span>
              <span class="type-badge" :class="`type-${currentReview.review_type?.toLowerCase()}`">
                {{ getReviewTypeLabel(currentReview.review_type) }}
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">狀態</span>
              <AppBadge
                :label="getStatusLabel(currentReview.status)"
                :variant="getStatusVariant(currentReview.status)"
              />
            </div>
            <div class="info-row">
              <span class="info-label">建立日期</span>
              <span class="info-value">{{ formatDate(currentReview.date_created) }}</span>
            </div>
          </div>
        </div>

        <!-- Score Card -->
        <div class="score-card">
          <h3 class="card-title">考核分數</h3>
          <div class="score-display">
            <template v-if="isEditing">
              <FormInput
                v-model="editForm.score"
                type="number"
                :min="0"
                :max="100"
                placeholder="0-100"
                class="score-input"
              />
              <span class="score-max">/ 100</span>
            </template>
            <template v-else>
              <span
                v-if="currentReview.score != null"
                class="score-value"
                :class="getScoreClass(currentReview.score)"
              >
                {{ currentReview.score }}
              </span>
              <span v-else class="score-value text-tertiary">—</span>
              <span class="score-max">/ 100</span>
            </template>
          </div>
          <div v-if="!isEditing && currentReview.score != null" class="score-rating">
            <span v-if="currentReview.score >= 80" class="rating good">優秀</span>
            <span v-else-if="currentReview.score >= 60" class="rating warning">合格</span>
            <span v-else class="rating poor">待改進</span>
          </div>
        </div>

        <!-- Comments -->
        <div class="content-card">
          <h3 class="card-title">考核評語</h3>
          <template v-if="isEditing">
            <FormTextarea
              v-model="editForm.comments"
              :rows="4"
              placeholder="輸入考核評語..."
            />
          </template>
          <template v-else>
            <p v-if="currentReview.comments" class="content-text">
              {{ currentReview.comments }}
            </p>
            <p v-else class="content-empty">尚無評語</p>
          </template>
        </div>

        <!-- Improvement Plan -->
        <div class="content-card">
          <h3 class="card-title">改善計劃</h3>
          <template v-if="isEditing">
            <FormTextarea
              v-model="editForm.improvement_plan"
              :rows="4"
              placeholder="輸入改善計劃..."
            />
          </template>
          <template v-else>
            <p v-if="currentReview.improvement_plan" class="content-text">
              {{ currentReview.improvement_plan }}
            </p>
            <p v-else class="content-empty">尚無改善計劃</p>
          </template>
        </div>

        <!-- Edit Actions -->
        <div v-if="isEditing" class="edit-actions">
          <button class="btn btn-secondary" @click="isEditing = false">取消</button>
          <button class="btn btn-primary" @click="saveEdits">儲存變更</button>
        </div>
      </div>
    </template>

    <EmptyState
      v-else
      title="找不到考核"
      description="此考核不存在或已被刪除"
      icon="clipboard"
      action-label="返回列表"
      action-to="/hr/performance"
    />

    <!-- Reject Modal -->
    <AppModal
      v-if="showRejectModal"
      title="退回考核"
      @close="showRejectModal = false"
    >
      <FormTextarea
        v-model="rejectReason"
        label="退回原因"
        :rows="3"
        placeholder="請說明退回原因..."
        required
      />
      <template #footer>
        <button class="btn btn-secondary" @click="showRejectModal = false">取消</button>
        <button class="btn btn-danger" @click="handleReject">確定退回</button>
      </template>
    </AppModal>
  </PageContainer>
</template>

<style scoped>
.review-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-xl);
}

/* Cards */
.info-card,
.score-card,
.content-card {
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-lg) 0;
}

/* Employee Header */
.employee-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
  padding-bottom: var(--space-lg);
  border-bottom: 1px solid var(--color-border-light);
}

.employee-details {
  display: flex;
  flex-direction: column;
}

.employee-name {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.employee-code {
  font-size: 13px;
  color: var(--color-text-tertiary);
}

/* Info List */
.info-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-sm) 0;
}

.info-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.info-value {
  font-size: 14px;
  color: var(--color-text-primary);
  font-weight: 500;
}

/* Type Badge */
.type-badge {
  display: inline-flex;
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  font-size: 12px;
  font-weight: 500;
}

.type-monthly { background: rgba(0, 122, 255, 0.1); color: #007aff; }
.type-quarterly { background: rgba(175, 82, 222, 0.1); color: #af52de; }
.type-annual { background: rgba(255, 149, 0, 0.1); color: #ff9500; }

/* Score Card */
.score-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.score-display {
  display: flex;
  align-items: baseline;
  gap: var(--space-sm);
}

.score-value {
  font-size: 72px;
  font-weight: 700;
  line-height: 1;
}

.score-value.good { color: #34c759; }
.score-value.warning { color: #ff9500; }
.score-value.poor { color: #ff3b30; }

.score-max {
  font-size: 24px;
  color: var(--color-text-tertiary);
}

.score-input {
  width: 100px;
  font-size: 36px;
  text-align: center;
}

.score-rating {
  margin-top: var(--space-lg);
}

.rating {
  padding: var(--space-sm) var(--space-lg);
  border-radius: var(--radius-full);
  font-size: 14px;
  font-weight: 600;
}

.rating.good { background: rgba(52, 199, 89, 0.1); color: #34c759; }
.rating.warning { background: rgba(255, 149, 0, 0.1); color: #ff9500; }
.rating.poor { background: rgba(255, 59, 48, 0.1); color: #ff3b30; }

/* Content Card */
.content-card {
  grid-column: span 2;
}

.content-text {
  font-size: 14px;
  color: var(--color-text-primary);
  line-height: 1.6;
  white-space: pre-wrap;
}

.content-empty {
  font-size: 14px;
  color: var(--color-text-tertiary);
  font-style: italic;
}

/* Edit Actions */
.edit-actions {
  grid-column: span 2;
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
}

/* Responsive */
@media (max-width: 768px) {
  .review-grid {
    grid-template-columns: 1fr;
  }

  .content-card,
  .edit-actions {
    grid-column: span 1;
  }

  .score-value {
    font-size: 48px;
  }
}
</style>
