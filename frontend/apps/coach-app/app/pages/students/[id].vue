<template>
  <div class="student-detail-page">
    <!-- Header with Back -->
    <div class="detail-header">
      <button class="back-button" @click="router.back()">
        <svg class="back-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
        <span>返回</span>
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="loading-container">
      <div class="apple-spinner" />
    </div>

    <!-- Not Found -->
    <div v-else-if="!student" class="empty-state">
      <div class="empty-icon">👤</div>
      <p>找不到學員資料</p>
    </div>

    <!-- Student Detail -->
    <div v-else class="detail-content">
      <!-- Hero Card -->
      <div class="hero-card">
        <div class="avatar-section">
          <div class="avatar-ring">
            <div class="avatar-circle">
              {{ student.full_name.charAt(0) }}
            </div>
          </div>
          <div class="avatar-info">
            <h1 class="student-name">{{ student.full_name }}</h1>
            <p class="student-code">{{ student.member_code }}</p>
            <div class="role-badge" :class="student.coach_role === 'PRIMARY' ? 'primary' : 'secondary'">
              {{ student.coach_role === 'PRIMARY' ? '主教練' : '副教練' }}
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="quick-actions">
          <a v-if="student.phone" :href="`tel:${student.phone}`" class="action-button call">
            <svg class="action-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <span>電話</span>
          </a>
          <a v-if="student.email" :href="`mailto:${student.email}`" class="action-button email">
            <svg class="action-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span>郵件</span>
          </a>
          <button class="action-button note" @click="showNoteForm = true">
            <svg class="action-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <span>筆記</span>
          </button>
        </div>

        <!-- Info Grid -->
        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">電話</span>
            <span class="info-value">{{ student.phone || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Email</span>
            <span class="info-value">{{ student.email || '-' }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">入會日期</span>
            <span class="info-value">{{ formatDate(student.join_date) }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">指派日期</span>
            <span class="info-value">{{ formatDate(student.assigned_at) }}</span>
          </div>
        </div>
      </div>

      <!-- Segmented Control -->
      <div class="segmented-control">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="segment"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
        <div class="segment-indicator" :style="segmentIndicatorStyle" />
      </div>

      <!-- Tab Content: Contracts -->
      <div v-if="activeTab === 'contracts'" class="tab-content">
        <div
          v-for="(contract, index) in student.contracts"
          :key="contract.id"
          class="glass-card stagger-item"
          :style="{ animationDelay: `${index * 0.05}s` }"
        >
          <div class="card-header">
            <div class="card-title-group">
              <p class="card-title">{{ contract.plan_name }}</p>
              <p class="card-subtitle">{{ contract.contract_no }}</p>
            </div>
            <span class="status-badge" :class="getContractStatusClass(contract.status)">
              {{ getContractStatusText(contract.status) }}
            </span>
          </div>
          <div class="card-body">
            <p class="date-range">{{ formatDate(contract.start_date) }} ~ {{ formatDate(contract.end_date) }}</p>
            <p v-if="contract.plan_type === 'COUNT_BASED'" class="remaining-count">
              剩餘 {{ contract.remaining_counts }} 堂
            </p>
          </div>
        </div>
        <div v-if="student.contracts.length === 0" class="empty-tab">
          <div class="empty-tab-icon">📋</div>
          <p>沒有有效合約</p>
        </div>
      </div>

      <!-- Tab Content: Goals -->
      <div v-if="activeTab === 'goals'" class="tab-content">
        <div
          v-for="(goal, index) in student.goals"
          :key="goal.id"
          class="glass-card stagger-item"
          :style="{ animationDelay: `${index * 0.05}s` }"
        >
          <div class="card-header">
            <p class="card-title">{{ getGoalText(goal.goal_type) }}</p>
            <span class="status-badge" :class="goal.status === 'IN_PROGRESS' ? 'blue' : 'green'">
              {{ goal.status === 'IN_PROGRESS' ? '進行中' : '已達成' }}
            </span>
          </div>
          <div class="card-body">
            <p class="date-info">開始：{{ formatDate(goal.start_date) }}</p>
            <p v-if="goal.target_date" class="date-info">目標：{{ formatDate(goal.target_date) }}</p>
          </div>
        </div>
        <div v-if="student.goals.length === 0" class="empty-tab">
          <div class="empty-tab-icon">🎯</div>
          <p>尚未設定目標</p>
        </div>
      </div>

      <!-- Tab Content: Measurements -->
      <div v-if="activeTab === 'measurements'" class="tab-content">
        <div
          v-for="(m, index) in student.measurements"
          :key="m.id"
          class="glass-card stagger-item"
          :style="{ animationDelay: `${index * 0.05}s` }"
        >
          <div class="card-header">
            <p class="card-title">{{ formatDate(m.date) }}</p>
            <span class="source-tag">{{ m.source }}</span>
          </div>
          <div class="measurement-grid">
            <div class="measurement-item">
              <span class="measurement-label">體重</span>
              <span class="measurement-value">{{ m.weight ? `${m.weight}kg` : '-' }}</span>
            </div>
            <div class="measurement-item">
              <span class="measurement-label">體脂</span>
              <span class="measurement-value">{{ m.body_fat ? `${m.body_fat}%` : '-' }}</span>
            </div>
            <div class="measurement-item">
              <span class="measurement-label">肌肉量</span>
              <span class="measurement-value">{{ m.muscle_mass ? `${m.muscle_mass}kg` : '-' }}</span>
            </div>
            <div class="measurement-item">
              <span class="measurement-label">BMI</span>
              <span class="measurement-value">{{ m.bmi || '-' }}</span>
            </div>
          </div>
        </div>
        <div v-if="student.measurements.length === 0" class="empty-tab">
          <div class="empty-tab-icon">📊</div>
          <p>尚無身體數據記錄</p>
        </div>
      </div>

      <!-- Tab Content: Notes -->
      <div v-if="activeTab === 'notes'" class="tab-content">
        <button class="add-note-button" @click="showNoteForm = true">
          <svg class="add-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新增筆記
        </button>

        <div class="notes-timeline">
          <div
            v-for="(note, index) in student.notes"
            :key="note.id"
            class="note-item stagger-item"
            :style="{ animationDelay: `${index * 0.05}s` }"
          >
            <div class="note-dot" :class="getNoteTypeColor(note.note_type)" />
            <div class="note-content">
              <div class="note-header">
                <span class="note-type" :class="getNoteTypeColor(note.note_type)">
                  {{ getNoteTypeText(note.note_type) }}
                </span>
                <span class="note-date">{{ formatDate(note.created_at) }}</span>
              </div>
              <p class="note-text">{{ note.content }}</p>
            </div>
          </div>
        </div>
        <div v-if="student.notes.length === 0" class="empty-tab">
          <div class="empty-tab-icon">📝</div>
          <p>尚無筆記</p>
        </div>
      </div>

      <!-- Tab Content: History -->
      <div v-if="activeTab === 'history'" class="tab-content">
        <div
          v-for="(cls, index) in student.class_history"
          :key="cls.id"
          class="glass-card stagger-item"
          :style="{ animationDelay: `${index * 0.05}s` }"
        >
          <div class="card-header">
            <div class="card-title-group">
              <p class="card-title">{{ formatDateTime(cls.scheduled_at) }}</p>
              <p class="card-subtitle">{{ cls.duration_minutes }} 分鐘</p>
            </div>
            <span class="status-badge" :class="getClassStatusClass(cls.status)">
              {{ getClassStatusText(cls.status) }}
            </span>
          </div>
          <div v-if="cls.coach_notes" class="card-body">
            <p class="coach-notes">{{ cls.coach_notes }}</p>
          </div>
        </div>
        <div v-if="student.class_history.length === 0" class="empty-tab">
          <div class="empty-tab-icon">📅</div>
          <p>尚無課程記錄</p>
        </div>
      </div>
    </div>

    <!-- Note Form Sheet -->
    <Transition name="sheet">
      <div v-if="showNoteForm" class="sheet-overlay" @click="showNoteForm = false">
        <div class="sheet-container" @click.stop>
          <div class="sheet-handle" />
          <h3 class="sheet-title">新增學員筆記</h3>
          <form @submit.prevent="handleCreateNote">
            <div class="form-group">
              <label class="form-label">筆記類型</label>
              <div class="type-selector">
                <button
                  v-for="type in noteTypes"
                  :key="type.value"
                  type="button"
                  class="type-option"
                  :class="{ active: noteForm.note_type === type.value, [type.color]: true }"
                  @click="noteForm.note_type = type.value"
                >
                  {{ type.label }}
                </button>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label">內容</label>
              <textarea
                v-model="noteForm.content"
                class="form-textarea"
                rows="4"
                placeholder="輸入筆記內容..."
                required
              />
            </div>
            <div class="sheet-actions">
              <button type="button" class="btn-cancel" @click="showNoteForm = false">
                取消
              </button>
              <button type="submit" class="btn-submit" :disabled="noteSubmitting">
                {{ noteSubmitting ? '儲存中...' : '儲存' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const router = useRouter()
const { success, error: showError } = useToast()
const { getStudent, createNote } = useStudents()

const loading = ref(true)
const student = ref<Awaited<ReturnType<typeof getStudent>>>(null)

const tabs = [
  { key: 'contracts', label: '合約' },
  { key: 'goals', label: '目標' },
  { key: 'measurements', label: '數據' },
  { key: 'notes', label: '筆記' },
  { key: 'history', label: '歷史' },
]
const activeTab = ref('contracts')

const segmentIndicatorStyle = computed(() => {
  const index = tabs.findIndex(t => t.key === activeTab.value)
  return {
    transform: `translateX(${index * 100}%)`,
    width: `${100 / tabs.length}%`,
  }
})

const noteTypes = [
  { value: 'PROGRESS', label: '進度', color: 'blue' },
  { value: 'GOAL', label: '目標', color: 'green' },
  { value: 'INJURY', label: '傷病', color: 'red' },
  { value: 'FEEDBACK', label: '回饋', color: 'purple' },
  { value: 'GENERAL', label: '一般', color: 'gray' },
]

const showNoteForm = ref(false)
const noteSubmitting = ref(false)
const noteForm = ref({
  note_type: 'PROGRESS',
  content: '',
})

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-TW')
}

const formatDateTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('zh-TW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getGoalText = (goalType: string) => {
  const goals: Record<string, string> = {
    WEIGHT_LOSS: '減重',
    MUSCLE_GAIN: '增肌',
    BODY_SHAPE: '體態雕塑',
    HEALTH: '健康維持',
    OTHER: '其他',
  }
  return goals[goalType] || goalType
}

const getContractStatusClass = (status: string) => {
  const classes: Record<string, string> = {
    ACTIVE: 'green',
    PAUSED: 'yellow',
    EXPIRED: 'gray',
  }
  return classes[status] || 'gray'
}

const getContractStatusText = (status: string) => {
  const texts: Record<string, string> = {
    ACTIVE: '有效',
    PAUSED: '暫停',
    EXPIRED: '已過期',
    TERMINATED: '已終止',
  }
  return texts[status] || status
}

const getClassStatusClass = (status: string) => {
  const classes: Record<string, string> = {
    BOOKED: 'blue',
    COMPLETED: 'green',
    MEMBER_CANCELLED: 'gray',
    COACH_CANCELLED: 'gray',
    NO_SHOW: 'red',
  }
  return classes[status] || 'gray'
}

const getClassStatusText = (status: string) => {
  const texts: Record<string, string> = {
    BOOKED: '已預約',
    COMPLETED: '已完成',
    MEMBER_CANCELLED: '學員取消',
    COACH_CANCELLED: '教練取消',
    NO_SHOW: '未到',
  }
  return texts[status] || status
}

const getNoteTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    PROGRESS: 'blue',
    GOAL: 'green',
    INJURY: 'red',
    FEEDBACK: 'purple',
    GENERAL: 'gray',
  }
  return colors[type] || 'gray'
}

const getNoteTypeText = (type: string) => {
  const texts: Record<string, string> = {
    PROGRESS: '進度',
    GOAL: '目標',
    INJURY: '傷病',
    FEEDBACK: '回饋',
    GENERAL: '一般',
  }
  return texts[type] || type
}

const handleCreateNote = async () => {
  noteSubmitting.value = true
  const result = await createNote(route.params.id as string, noteForm.value)

  if (result.success) {
    success('筆記已新增')
    showNoteForm.value = false
    noteForm.value = { note_type: 'PROGRESS', content: '' }
    student.value = await getStudent(route.params.id as string)
  } else {
    showError(result.message || '新增筆記失敗')
  }
  noteSubmitting.value = false
}

onMounted(async () => {
  loading.value = true
  student.value = await getStudent(route.params.id as string)
  loading.value = false
})
</script>

<style scoped>
.student-detail-page {
  min-height: 100vh;
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

/* Header */
.detail-header {
  position: sticky;
  top: 0;
  z-index: 10;
  padding: 12px 16px;
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
}

.back-button {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 12px;
  font-size: 15px;
  font-weight: 500;
  color: var(--apple-blue);
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
}

.back-button:active {
  background: rgba(0, 122, 255, 0.1);
}

.back-icon {
  width: 20px;
  height: 20px;
}

/* Loading */
.loading-container {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 200px;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: var(--text-secondary);
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
}

/* Detail Content */
.detail-content {
  padding: 0 16px 24px;
}

/* Hero Card */
.hero-card {
  background: var(--card-bg);
  border-radius: 20px;
  padding: 24px;
  box-shadow: var(--shadow-md);
  margin-bottom: 20px;
}

.avatar-section {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.avatar-ring {
  padding: 3px;
  background: linear-gradient(135deg, var(--apple-blue), var(--apple-purple));
  border-radius: 50%;
}

.avatar-circle {
  width: 72px;
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--card-bg);
  border-radius: 50%;
  font-size: 28px;
  font-weight: 600;
  color: var(--apple-blue);
}

.avatar-info {
  flex: 1;
}

.student-name {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.student-code {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.role-badge {
  display: inline-block;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 12px;
}

.role-badge.primary {
  background: rgba(0, 122, 255, 0.12);
  color: var(--apple-blue);
}

.role-badge.secondary {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

/* Quick Actions */
.quick-actions {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border-color);
}

.action-button {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 8px;
  background: var(--bg-secondary);
  border: none;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  text-decoration: none;
  transition: all 0.2s var(--ease-apple);
}

.action-button:active {
  transform: scale(0.95);
}

.action-button.call {
  color: var(--apple-green);
}

.action-button.email {
  color: var(--apple-blue);
}

.action-button.note {
  color: var(--apple-orange);
}

.action-icon {
  width: 24px;
  height: 24px;
}

/* Info Grid */
.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 12px;
  color: var(--text-tertiary);
}

.info-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

/* Segmented Control */
.segmented-control {
  position: relative;
  display: flex;
  background: var(--bg-secondary);
  border-radius: 10px;
  padding: 3px;
  margin-bottom: 16px;
}

.segment {
  flex: 1;
  padding: 8px 4px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  position: relative;
  z-index: 1;
  transition: color 0.2s;
  text-align: center;
}

.segment.active {
  color: var(--text-primary);
}

.segment-indicator {
  position: absolute;
  top: 3px;
  left: 3px;
  height: calc(100% - 6px);
  background: var(--card-bg);
  border-radius: 8px;
  box-shadow: var(--shadow-sm);
  transition: transform 0.3s var(--ease-apple);
  z-index: 0;
}

/* Tab Content */
.tab-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* Glass Card */
.glass-card {
  background: var(--card-bg);
  border-radius: 16px;
  padding: 16px;
  box-shadow: var(--shadow-sm);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
}

.card-title-group {
  flex: 1;
  min-width: 0;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.card-subtitle {
  font-size: 13px;
  color: var(--text-tertiary);
}

.card-body {
  padding-top: 8px;
}

.date-range {
  font-size: 13px;
  color: var(--text-secondary);
}

.remaining-count {
  font-size: 14px;
  font-weight: 600;
  color: var(--apple-orange);
  margin-top: 4px;
}

.date-info {
  font-size: 13px;
  color: var(--text-secondary);
}

.coach-notes {
  font-size: 14px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* Status Badge */
.status-badge {
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 12px;
  white-space: nowrap;
}

.status-badge.green {
  background: rgba(52, 199, 89, 0.12);
  color: var(--apple-green);
}

.status-badge.yellow {
  background: rgba(255, 149, 0, 0.12);
  color: var(--apple-orange);
}

.status-badge.blue {
  background: rgba(0, 122, 255, 0.12);
  color: var(--apple-blue);
}

.status-badge.red {
  background: rgba(255, 59, 48, 0.12);
  color: var(--apple-red);
}

.status-badge.purple {
  background: rgba(175, 82, 222, 0.12);
  color: var(--apple-purple);
}

.status-badge.gray {
  background: var(--bg-tertiary);
  color: var(--text-secondary);
}

/* Source Tag */
.source-tag {
  font-size: 11px;
  color: var(--text-tertiary);
  background: var(--bg-tertiary);
  padding: 2px 8px;
  border-radius: 6px;
}

/* Measurement Grid */
.measurement-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  text-align: center;
}

.measurement-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.measurement-label {
  font-size: 11px;
  color: var(--text-tertiary);
}

.measurement-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

/* Add Note Button */
.add-note-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px;
  background: transparent;
  border: 2px dashed var(--border-color);
  border-radius: 14px;
  font-size: 15px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.add-note-button:hover {
  border-color: var(--apple-blue);
  color: var(--apple-blue);
}

.add-icon {
  width: 20px;
  height: 20px;
}

/* Notes Timeline */
.notes-timeline {
  position: relative;
  padding-left: 24px;
}

.notes-timeline::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: var(--border-color);
  border-radius: 1px;
}

.note-item {
  position: relative;
  padding: 12px 0;
}

.note-dot {
  position: absolute;
  left: -24px;
  top: 16px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 3px solid var(--card-bg);
  box-shadow: 0 0 0 2px var(--border-color);
}

.note-dot.blue { background: var(--apple-blue); box-shadow: 0 0 0 2px var(--apple-blue); }
.note-dot.green { background: var(--apple-green); box-shadow: 0 0 0 2px var(--apple-green); }
.note-dot.red { background: var(--apple-red); box-shadow: 0 0 0 2px var(--apple-red); }
.note-dot.purple { background: var(--apple-purple); box-shadow: 0 0 0 2px var(--apple-purple); }
.note-dot.gray { background: var(--text-tertiary); box-shadow: 0 0 0 2px var(--text-tertiary); }

.note-content {
  background: var(--card-bg);
  border-radius: 12px;
  padding: 12px;
  box-shadow: var(--shadow-sm);
}

.note-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.note-type {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 8px;
}

.note-type.blue { background: rgba(0, 122, 255, 0.12); color: var(--apple-blue); }
.note-type.green { background: rgba(52, 199, 89, 0.12); color: var(--apple-green); }
.note-type.red { background: rgba(255, 59, 48, 0.12); color: var(--apple-red); }
.note-type.purple { background: rgba(175, 82, 222, 0.12); color: var(--apple-purple); }
.note-type.gray { background: var(--bg-tertiary); color: var(--text-secondary); }

.note-date {
  font-size: 12px;
  color: var(--text-tertiary);
}

.note-text {
  font-size: 14px;
  color: var(--text-primary);
  line-height: 1.5;
  white-space: pre-wrap;
}

/* Empty Tab */
.empty-tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  color: var(--text-tertiary);
}

.empty-tab-icon {
  font-size: 36px;
  margin-bottom: 12px;
}

/* Sheet Modal */
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: flex-end;
}

.sheet-container {
  width: 100%;
  max-height: 85vh;
  background: var(--card-bg);
  border-radius: 20px 20px 0 0;
  padding: 12px 20px 24px;
  overflow-y: auto;
}

.sheet-handle {
  width: 36px;
  height: 5px;
  background: var(--border-color);
  border-radius: 3px;
  margin: 0 auto 16px;
}

.sheet-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  text-align: center;
  margin-bottom: 20px;
}

.form-group {
  margin-bottom: 20px;
}

.form-label {
  display: block;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.type-selector {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.type-option {
  padding: 8px 14px;
  font-size: 14px;
  font-weight: 500;
  background: var(--bg-secondary);
  border: 2px solid transparent;
  border-radius: 10px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.type-option.active.blue {
  background: rgba(0, 122, 255, 0.12);
  border-color: var(--apple-blue);
  color: var(--apple-blue);
}

.type-option.active.green {
  background: rgba(52, 199, 89, 0.12);
  border-color: var(--apple-green);
  color: var(--apple-green);
}

.type-option.active.red {
  background: rgba(255, 59, 48, 0.12);
  border-color: var(--apple-red);
  color: var(--apple-red);
}

.type-option.active.purple {
  background: rgba(175, 82, 222, 0.12);
  border-color: var(--apple-purple);
  color: var(--apple-purple);
}

.type-option.active.gray {
  background: var(--bg-tertiary);
  border-color: var(--text-tertiary);
  color: var(--text-primary);
}

.form-textarea {
  width: 100%;
  padding: 14px;
  font-size: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  color: var(--text-primary);
  resize: none;
  transition: border-color 0.2s;
}

.form-textarea:focus {
  outline: none;
  border-color: var(--apple-blue);
}

.sheet-actions {
  display: flex;
  gap: 12px;
}

.btn-cancel {
  flex: 1;
  padding: 14px;
  font-size: 16px;
  font-weight: 600;
  background: var(--bg-secondary);
  border: none;
  border-radius: 12px;
  color: var(--text-primary);
  cursor: pointer;
}

.btn-submit {
  flex: 1;
  padding: 14px;
  font-size: 16px;
  font-weight: 600;
  background: var(--apple-blue);
  border: none;
  border-radius: 12px;
  color: white;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Sheet Transition */
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.3s;
}

.sheet-enter-active .sheet-container,
.sheet-leave-active .sheet-container {
  transition: transform 0.3s var(--ease-spring);
}

.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}

.sheet-enter-from .sheet-container,
.sheet-leave-to .sheet-container {
  transform: translateY(100%);
}

/* Stagger Animation */
.stagger-item {
  animation: fadeInUp 0.5s var(--ease-apple) both;
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Dark Mode */
:root.dark .hero-card,
:root.dark .glass-card,
:root.dark .sheet-container,
:root.dark .note-content {
  background: var(--card-bg);
}

/* Responsive */
@media (min-width: 768px) {
  .detail-content {
    max-width: 600px;
    margin: 0 auto;
  }

  .info-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
