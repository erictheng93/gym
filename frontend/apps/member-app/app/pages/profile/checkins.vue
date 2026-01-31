<script setup lang="ts">
import { useFetch } from '~/composables/core/useFetch'

definePageMeta({
  middleware: 'auth'
})

const { handleError } = useApiError()

interface Checkin {
  id: string
  check_time: string
  check_type: 'ENTRY' | 'EXIT'
  verification_method: string | null
  is_cross_branch: boolean
  branch_id: {
    id: string
    name: string
  } | null
}

const { readItems } = useFetch()
const { member } = useMemberAuth()

const checkins = ref<Checkin[]>([])
const isLoading = ref(true)
const currentPage = ref(1)
const hasMore = ref(true)
const pageSize = 20

const fetchCheckins = async (loadMore = false) => {
  if (!member.value) return

  try {
    if (!loadMore) {
      isLoading.value = true
      currentPage.value = 1
    }

    const result = await readItems<Checkin>('member_checkins', {
      filter: {
        member_id: member.value.id
      },
      page: currentPage.value,
      limit: pageSize,
      sort: 'check_time',
      sortOrder: 'desc'
    })

    if (loadMore) {
      checkins.value = [...checkins.value, ...result.data]
    } else {
      checkins.value = result.data
    }

    hasMore.value = result.data.length === pageSize
  } catch (error) {
    handleError(error, { fallbackMessage: '無法載入入場紀錄' })
  } finally {
    isLoading.value = false
  }
}

const loadMore = async () => {
  currentPage.value++
  await fetchCheckins(true)
}

onMounted(() => {
  fetchCheckins()
})

const formatDateTime = (dateStr: string) => {
  const date = new Date(dateStr)
  return {
    date: date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' }),
    time: date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }),
    weekday: date.toLocaleDateString('zh-TW', { weekday: 'short' })
  }
}

const verificationLabels: Record<string, string> = {
  BARCODE: '條碼',
  QR_CODE: 'QR Code',
  MANUAL: '人工',
  FACE_ID: '人臉辨識',
  FINGERPRINT: '指紋',
  BATCH: '批次簽到'
}

// Group checkins by date
const groupedCheckins = computed(() => {
  const groups: Record<string, Checkin[]> = {}

  checkins.value.forEach(checkin => {
    const dateKey = new Date(checkin.check_time).toLocaleDateString('zh-TW')
    if (!groups[dateKey]) {
      groups[dateKey] = []
    }
    groups[dateKey].push(checkin)
  })

  return Object.entries(groups).map(([date, items]) => ({
    date,
    items
  }))
})
</script>

<template>
  <div class="checkins-page">
    <header class="page-header">
      <NuxtLink to="/profile" class="back-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </NuxtLink>
      <h1 class="page-title">入場紀錄</h1>
    </header>

    <div v-if="isLoading && checkins.length === 0" class="loading">
      <p>載入中...</p>
    </div>

    <div v-else-if="checkins.length === 0" class="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
      <p>目前沒有入場紀錄</p>
    </div>

    <div v-else class="checkin-list">
      <div v-for="group in groupedCheckins" :key="group.date" class="date-group">
        <h3 class="date-header">{{ group.date }}</h3>

        <div class="checkin-items">
          <NuxtLink
            v-for="checkin in group.items"
            :key="checkin.id"
            :to="`/profile/checkins/${checkin.id}`"
            class="checkin-card"
          >
            <div class="checkin-icon" :class="checkin.check_type.toLowerCase()">
              <svg v-if="checkin.check_type === 'ENTRY'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </div>

            <div class="checkin-info">
              <div class="checkin-time">
                {{ formatDateTime(checkin.check_time).time }}
              </div>
              <div class="checkin-details">
                <span class="branch-name">
                  {{ checkin.branch_id?.name || '未知分店' }}
                  <span v-if="checkin.is_cross_branch" class="cross-branch-badge">跨店</span>
                </span>
                <span v-if="checkin.verification_method" class="verification">
                  {{ verificationLabels[checkin.verification_method] || checkin.verification_method }}
                </span>
              </div>
            </div>

            <div class="checkin-type">
              {{ checkin.check_type === 'ENTRY' ? '入場' : '離場' }}
            </div>

            <div class="checkin-arrow">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          </NuxtLink>
        </div>
      </div>

      <button
        v-if="hasMore"
        class="load-more-btn"
        :disabled="isLoading"
        @click="loadMore"
      >
        {{ isLoading ? '載入中...' : '載入更多' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.checkins-page {
  padding: 16px;
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  text-decoration: none;
}

.page-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
}

.loading {
  display: flex;
  justify-content: center;
  padding: 48px;
  color: var(--color-text-secondary);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 64px 24px;
  background-color: var(--color-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  text-align: center;
}

.empty-state svg {
  color: var(--color-text-secondary);
}

.empty-state p {
  color: var(--color-text-secondary);
  font-size: 14px;
}

.checkin-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.date-group {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.date-header {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-secondary);
  padding-left: 4px;
}

.checkin-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.checkin-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background-color: var(--color-surface);
  border-radius: 12px;
  border: 1px solid var(--color-border);
  text-decoration: none;
  transition: background-color 0.2s ease, border-color 0.2s ease;
}

.checkin-card:active {
  background-color: var(--color-border);
}

.checkin-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  flex-shrink: 0;
}

.checkin-icon.entry {
  background-color: rgba(16, 185, 129, 0.1);
  color: var(--color-primary);
}

.checkin-icon.exit {
  background-color: rgba(107, 114, 128, 0.1);
  color: var(--color-text-secondary);
}

.checkin-info {
  flex: 1;
  min-width: 0;
}

.checkin-time {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 4px;
}

.checkin-details {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.branch-name {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cross-branch-badge {
  font-size: 10px;
  font-weight: 500;
  padding: 2px 6px;
  background-color: rgba(251, 191, 36, 0.1);
  color: #f59e0b;
  border-radius: 4px;
}

.verification {
  color: var(--color-text-secondary);
}

.verification::before {
  content: '·';
  margin-right: 8px;
}

.checkin-type {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-secondary);
  padding: 4px 10px;
  background-color: var(--color-border);
  border-radius: 6px;
}

.checkin-arrow {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  flex-shrink: 0;
  margin-left: auto;
}

.load-more-btn {
  width: 100%;
  padding: 14px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.load-more-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.load-more-btn:not(:disabled):active {
  background-color: var(--color-border);
}
</style>
