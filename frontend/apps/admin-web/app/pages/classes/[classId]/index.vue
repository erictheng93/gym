<script lang="ts">
const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'] as const
const SESSION_STATUS_LABELS: Record<string, string> = { SCHEDULED: '已排定', CANCELLED: '已取消', COMPLETED: '已完成' }
</script>

<script setup lang="ts">
/**
 * 課程詳情：基本資料、週排程（POST /api/classes/schedules）、未來 14 天場次與預約
 */
import { PAGES } from '~/constants'
import { getDifficultyBadge } from '@gym-nexus/shared'
import { getCategoryLabel, type ApiClassDetail, type ApiClassSession } from '~/composables/useClasses'
import BookSessionPanel from '~/components/classes/BookSessionPanel.vue'

definePageMeta({
  middleware: 'auth'
})

const route = useRoute()
const toast = useToast()
const { getClass, fetchSessions, createSchedule } = useClasses()

const classId = computed(() => String(route.params.classId))
const classItem = ref<ApiClassDetail | null>(null)
const sessions = ref<ApiClassSession[]>([])
const isLoading = ref(true)
const bookingSessionId = ref<string | null>(null)

const load = async () => {
  const [detail, list] = await Promise.all([getClass(classId.value), fetchSessions(classId.value)])
  classItem.value = detail
  sessions.value = list
}

onMounted(async () => {
  await load()
  isLoading.value = false
})

// --- Add weekly schedule -----------------------------------------------------
const showScheduleForm = ref(false)
const scheduleSubmitting = ref(false)
const scheduleForm = ref({ dayOfWeek: 1, startTime: '09:00', endTime: '10:00', room: '' })
const scheduleError = ref('')

const submitSchedule = async () => {
  if (!classItem.value) return
  const f = scheduleForm.value
  if (!f.startTime || !f.endTime || f.endTime <= f.startTime) {
    scheduleError.value = '結束時間需晚於開始時間'
    return
  }
  scheduleError.value = ''
  scheduleSubmitting.value = true
  try {
    const result = await createSchedule({
      classId: classItem.value.id,
      branchId: classItem.value.branchId,
      instructorId: classItem.value.instructorId,
      dayOfWeek: f.dayOfWeek,
      startTime: f.startTime,
      endTime: f.endTime,
      room: f.room.trim() || null
    })
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    toast.success('已新增排程')
    showScheduleForm.value = false
    classItem.value = await getClass(classId.value)
  } finally {
    scheduleSubmitting.value = false
  }
}

const onBooked = async () => {
  bookingSessionId.value = null
  sessions.value = await fetchSessions(classId.value)
}
</script>

<template>
  <PageContainer>
    <div v-if="isLoading" class="state-text">載入中…</div>
    <div v-else-if="!classItem" class="state-text">找不到此課程</div>
    <template v-else>
      <PageHeader
        :title="classItem.name"
        :description="classItem.description || PAGES.CLASSES.DESCRIPTION"
        action-label="編輯課程"
        :action-to="`/classes/${classItem.id}/edit`"
        action-icon="settings"
      />

      <div class="bento">
        <!-- Info -->
        <section class="card info-card">
          <h3 class="card-title">課程資訊</h3>
          <dl class="info-grid">
            <dt>類別</dt><dd>{{ getCategoryLabel(classItem.category) }}</dd>
            <dt>難度</dt><dd>{{ getDifficultyBadge(classItem.difficultyLevel).label }}</dd>
            <dt>時長</dt><dd>{{ classItem.durationMinutes }} 分鐘</dd>
            <dt>人數上限</dt><dd>{{ classItem.maxCapacity }} 人</dd>
            <dt>分店</dt><dd>{{ classItem.branch?.name || '—' }}</dd>
            <dt>教練</dt><dd>{{ classItem.instructor?.fullName || '未指定' }}</dd>
            <dt>扣堂</dt><dd>{{ classItem.requiresCount ? `每次 ${classItem.countDeduction ?? 1} 堂` : '不扣堂' }}</dd>
          </dl>
        </section>

        <!-- Weekly schedule -->
        <section class="card">
          <div class="card-head">
            <h3 class="card-title">{{ PAGES.CLASS_SCHEDULE.TITLE }}</h3>
            <button type="button" class="btn btn-secondary btn-small" @click="showScheduleForm = !showScheduleForm">
              {{ PAGES.CLASS_SCHEDULE.ADD_SCHEDULE }}
            </button>
          </div>

          <form v-if="showScheduleForm" class="schedule-form" @submit.prevent="submitSchedule">
            <label>
              {{ PAGES.CLASS_SCHEDULE.DAY_OF_WEEK }}
              <select v-model.number="scheduleForm.dayOfWeek" class="input">
                <option v-for="(label, i) in WEEKDAYS" :key="i" :value="i">{{ label }}</option>
              </select>
            </label>
            <label>
              {{ PAGES.CLASS_SCHEDULE.START_TIME }}
              <input v-model="scheduleForm.startTime" type="time" class="input" required />
            </label>
            <label>
              {{ PAGES.CLASS_SCHEDULE.END_TIME }}
              <input v-model="scheduleForm.endTime" type="time" class="input" required />
            </label>
            <label>
              {{ PAGES.CLASS_SCHEDULE.ROOM }}
              <input v-model="scheduleForm.room" type="text" class="input" placeholder="選填" />
            </label>
            <p v-if="scheduleError" class="form-error">{{ scheduleError }}</p>
            <div class="schedule-actions">
              <button type="submit" class="btn btn-primary btn-small" :disabled="scheduleSubmitting">儲存排程</button>
            </div>
          </form>

          <ul v-if="classItem.schedules.length" class="slot-list">
            <li v-for="slot in classItem.schedules" :key="slot.id" class="slot-item">
              <span class="slot-day">{{ WEEKDAYS[slot.dayOfWeek] }}</span>
              <span>{{ slot.startTime.slice(0, 5) }}–{{ slot.endTime.slice(0, 5) }}</span>
              <span v-if="slot.room" class="text-tertiary">{{ slot.room }}</span>
            </li>
          </ul>
          <p v-else class="empty-text">{{ PAGES.CLASS_SCHEDULE.NO_SCHEDULES }}</p>
          <p class="hint-text">
            <span class="not-available-badge">尚未開放</span>
            依排程自動產生場次、修改或刪除排程尚未提供
          </p>
        </section>
      </div>

      <!-- Sessions -->
      <section class="card sessions-card">
        <div class="card-head">
          <h3 class="card-title">未來 14 天場次</h3>
          <NuxtLink to="/classes/bookings" class="btn btn-ghost btn-small">{{ PAGES.CLASS_BOOKINGS.TITLE }}</NuxtLink>
        </div>
        <ul v-if="sessions.length" class="session-list">
          <li v-for="session in sessions" :key="session.id" class="session-item">
            <div class="session-row">
              <div class="session-when">
                <strong>{{ session.sessionDate }}</strong>
                <span>{{ session.startTime.slice(0, 5) }}–{{ session.endTime.slice(0, 5) }}</span>
                <span v-if="session.room" class="text-tertiary">{{ session.room }}</span>
              </div>
              <div class="session-meta">
                <span class="text-secondary">{{ session.currentCount ?? 0 }} / {{ session.maxCapacity }} 人</span>
                <span v-if="session.waitlistCount" class="text-tertiary">候補 {{ session.waitlistCount }}</span>
                <AppBadge
                  :label="SESSION_STATUS_LABELS[session.sessionStatus ?? 'SCHEDULED'] ?? session.sessionStatus ?? ''"
                  :variant="session.sessionStatus === 'CANCELLED' ? 'default' : 'success'"
                />
                <button
                  v-if="session.sessionStatus === 'SCHEDULED'"
                  type="button"
                  class="btn btn-secondary btn-small"
                  @click="bookingSessionId = bookingSessionId === session.id ? null : session.id"
                >
                  {{ PAGES.CLASS_BOOKINGS.BOOK_CLASS }}
                </button>
              </div>
            </div>
            <BookSessionPanel
              v-if="bookingSessionId === session.id"
              :session="session"
              :class-name="classItem.name"
              @booked="onBooked"
              @close="bookingSessionId = null"
            />
          </li>
        </ul>
        <p v-else class="empty-text">未來 14 天沒有場次</p>
      </section>
    </template>
  </PageContainer>
</template>

<style scoped>
.state-text {
  padding: var(--space-xl);
  color: var(--color-text-secondary);
}

.bento {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.card {
  padding: var(--space-lg);
  border-radius: var(--radius-2xl, 20px);
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}

.card-title {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.info-card .card-title {
  margin-bottom: var(--space-md);
}

.info-grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-sm) var(--space-lg);
  margin: 0;
  font-size: 14px;
}

.info-grid dt {
  color: var(--color-text-secondary);
}

.info-grid dd {
  margin: 0;
  color: var(--color-text-primary);
}

.schedule-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-sm) var(--space-md);
  margin-bottom: var(--space-md);
  padding: var(--space-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-xl);
}

.schedule-form label {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: 13px;
  color: var(--color-text-secondary);
}

.schedule-actions {
  grid-column: 1 / -1;
  display: flex;
  justify-content: flex-end;
}

.form-error {
  grid-column: 1 / -1;
  margin: 0;
  font-size: 13px;
  color: var(--color-error);
}

.slot-list,
.session-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.slot-item {
  display: flex;
  gap: var(--space-md);
  font-size: 14px;
  color: var(--color-text-primary);
}

.slot-day {
  font-weight: 600;
  min-width: 40px;
}

.session-item {
  padding: var(--space-sm) 0;
}

.session-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-md);
  flex-wrap: wrap;
}

.session-when,
.session-meta {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  font-size: 14px;
}

.empty-text {
  margin: 0;
  font-size: 14px;
  color: var(--color-text-tertiary);
}

.hint-text {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin: var(--space-md) 0 0;
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.not-available-badge {
  padding: 2px 10px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  font-size: 12px;
  font-weight: 500;
}

@media (max-width: 900px) {
  .bento {
    grid-template-columns: 1fr;
  }
}
</style>
