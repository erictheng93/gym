<template>
  <div class="apple-page">
    <!-- Page Header -->
    <header class="page-header">
      <div class="header-content">
        <div class="header-text">
          <h1 class="page-title">教案管理</h1>
          <p class="page-subtitle">建立與管理訓練教案</p>
        </div>
        <NuxtLink to="/lessons/new" class="add-button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 4v16m-8-8h16" />
          </svg>
        </NuxtLink>
      </div>
    </header>

    <!-- Segmented Control -->
    <div class="segment-section">
      <div class="segment-control">
        <button
          class="segment-button"
          :class="{ active: !showTemplates }"
          @click="showTemplates = false; loadPlans()"
        >
          我的教案
        </button>
        <button
          class="segment-button"
          :class="{ active: showTemplates }"
          @click="showTemplates = true; loadTemplates()"
        >
          教案範本
        </button>
        <div class="segment-indicator" :class="{ right: showTemplates }" />
      </div>
    </div>

    <!-- Search Bar -->
    <div class="search-section">
      <div class="apple-search-bar">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜尋教案標題..."
          @input="debouncedSearch"
        />
        <button v-if="searchQuery" class="search-clear" @click="clearSearch">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="12" r="10" />
            <path d="M15 9l-6 6M9 9l6 6" stroke="white" stroke-width="2" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Category Filter Pills (Templates only) -->
    <div v-if="showTemplates && categories.length > 0" class="filter-section">
      <div class="filter-scroll">
        <button
          class="filter-pill"
          :class="{ active: selectedCategory === '' }"
          @click="selectedCategory = ''; loadTemplates()"
        >
          全部
        </button>
        <button
          v-for="cat in categories"
          :key="cat"
          class="filter-pill"
          :class="{ active: selectedCategory === cat }"
          @click="selectedCategory = cat; loadTemplates()"
        >
          {{ cat }}
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <div class="apple-spinner" />
      <p>載入教案中...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="displayPlans.length === 0" class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h3>{{ showTemplates ? '沒有可用的範本' : '尚未建立教案' }}</h3>
      <p>{{ showTemplates ? '查看其他分類或稍後再試' : '點擊右上角新增教案' }}</p>
    </div>

    <!-- Plans List -->
    <div v-else class="plans-list">
      <div class="list-card">
        <div
          v-for="(plan, index) in displayPlans"
          :key="plan.id"
          class="plan-item stagger-item"
          :style="{ animationDelay: `${index * 0.05}s` }"
        >
          <div class="plan-content" @click="goToPlan(plan.id)">
            <!-- Icon -->
            <div class="plan-icon" :class="getDifficultyIconClass(plan.difficulty)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>

            <!-- Info -->
            <div class="plan-info">
              <h3 class="plan-title">{{ plan.title }}</h3>
              <div class="plan-meta">
                <span v-if="plan.difficulty" class="difficulty-badge" :class="getDifficultyClass(plan.difficulty)">
                  {{ getDifficultyText(plan.difficulty) }}
                </span>
                <span v-if="plan.duration_minutes" class="meta-item">
                  {{ plan.duration_minutes }}分鐘
                </span>
                <span v-if="plan.template_category" class="meta-item category">
                  {{ plan.template_category }}
                </span>
              </div>
              <p v-if="plan.objectives?.length" class="plan-objectives">
                {{ plan.objectives[0] }}
              </p>
            </div>
          </div>

          <!-- Actions -->
          <div class="plan-actions">
            <button
              v-if="showTemplates"
              class="action-button copy"
              title="複製此範本"
              @click.stop="handleCopy(plan.id)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
            <button
              v-else
              class="action-button delete"
              title="刪除"
              @click.stop="handleDelete(plan.id)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Load More -->
    <div v-if="displayPlans.length > 0 && displayPlans.length < total" class="load-more">
      <button class="load-more-button" @click="loadMore">
        <span>載入更多</span>
        <span class="load-more-count">{{ displayPlans.length }} / {{ total }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const { success, error: showError } = useToast()
const { plans, templates, categories, loading, total, fetchPlans, fetchTemplates, deletePlan, copyPlan } = useLessonPlans()

const showTemplates = ref(false)
const searchQuery = ref('')
const selectedCategory = ref('')
const offset = ref(0)
const limit = 20

const displayPlans = computed(() => showTemplates.value ? templates.value : plans.value)

let searchTimeout: ReturnType<typeof setTimeout>
const debouncedSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    offset.value = 0
    if (showTemplates.value) {
      loadTemplates()
    } else {
      loadPlans()
    }
  }, 300)
}

const clearSearch = () => {
  searchQuery.value = ''
  offset.value = 0
  if (showTemplates.value) {
    loadTemplates()
  } else {
    loadPlans()
  }
}

const loadPlans = async () => {
  await fetchPlans({
    is_template: false,
    search: searchQuery.value || undefined,
    limit,
    offset: offset.value,
  })
}

const loadTemplates = async () => {
  await fetchTemplates({
    category: selectedCategory.value || undefined,
    limit,
    offset: offset.value,
  })
}

const loadMore = async () => {
  offset.value += limit
  if (showTemplates.value) {
    await loadTemplates()
  } else {
    await loadPlans()
  }
}

const goToPlan = (id: string) => {
  router.push(`/lessons/${id}`)
}

const getDifficultyIconClass = (difficulty: string | undefined) => {
  const classes: Record<string, string> = {
    BEGINNER: 'icon-green',
    INTERMEDIATE: 'icon-orange',
    ADVANCED: 'icon-red',
  }
  return classes[difficulty || ''] || 'icon-blue'
}

const getDifficultyClass = (difficulty: string) => {
  const classes: Record<string, string> = {
    BEGINNER: 'badge-green',
    INTERMEDIATE: 'badge-orange',
    ADVANCED: 'badge-red',
  }
  return classes[difficulty] || 'badge-gray'
}

const getDifficultyText = (difficulty: string) => {
  const texts: Record<string, string> = {
    BEGINNER: '初階',
    INTERMEDIATE: '中階',
    ADVANCED: '進階',
  }
  return texts[difficulty] || difficulty
}

const handleCopy = async (id: string) => {
  const result = await copyPlan(id)
  if (result.success) {
    success('教案已複製')
    showTemplates.value = false
    await loadPlans()
  } else {
    showError(result.message || '複製失敗')
  }
}

const handleDelete = async (id: string) => {
  if (!confirm('確定要刪除此教案嗎？')) return

  const result = await deletePlan(id)
  if (result.success) {
    success('教案已刪除')
    await loadPlans()
  } else {
    showError(result.message || '刪除失敗')
  }
}

onMounted(() => {
  loadPlans()
})
</script>

<style scoped>
/* ============================================
   APPLE-STYLE LESSONS PAGE
   ============================================ */

.apple-page {
  min-height: 100vh;
  background: var(--bg-primary);
  animation: fadeIn 0.6s var(--ease-apple);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Page Header */
.page-header {
  padding: 20px 20px 0 20px;
}

.header-content {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.header-text {
  flex: 1;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px 0;
  letter-spacing: -0.02em;
}

.page-subtitle {
  font-size: 15px;
  color: var(--text-tertiary);
  margin: 0;
}

.add-button {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: var(--apple-blue);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s var(--ease-apple);
}

.add-button:active {
  transform: scale(0.92);
}

.add-button svg {
  width: 22px;
  height: 22px;
  color: white;
}

/* Segmented Control */
.segment-section {
  padding: 16px 20px;
}

.segment-control {
  position: relative;
  display: flex;
  background: var(--fill-tertiary);
  border-radius: var(--radius-md);
  padding: 2px;
}

.segment-button {
  flex: 1;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: calc(var(--radius-md) - 2px);
  cursor: pointer;
  z-index: 1;
  transition: color 0.2s var(--ease-apple);
}

.segment-button.active {
  color: var(--text-primary);
}

.segment-indicator {
  position: absolute;
  top: 2px;
  left: 2px;
  width: calc(50% - 2px);
  height: calc(100% - 4px);
  background: var(--bg-secondary);
  border-radius: calc(var(--radius-md) - 2px);
  box-shadow: var(--shadow-sm);
  transition: transform 0.3s var(--ease-spring);
}

.segment-indicator.right {
  transform: translateX(100%);
}

/* Search Section */
.search-section {
  padding: 0 20px 12px 20px;
}

.apple-search-bar {
  position: relative;
  display: flex;
  align-items: center;
}

.apple-search-bar input {
  width: 100%;
  height: 40px;
  padding: 0 40px;
  background: var(--fill-tertiary);
  border: none;
  border-radius: var(--radius-md);
  font-size: 16px;
  color: var(--text-primary);
  outline: none;
  transition: all 0.2s var(--ease-apple);
}

.apple-search-bar input::placeholder {
  color: var(--text-tertiary);
}

.apple-search-bar input:focus {
  background: var(--fill-secondary);
}

.search-icon {
  position: absolute;
  left: 12px;
  width: 18px;
  height: 18px;
  color: var(--text-tertiary);
  pointer-events: none;
}

.search-clear {
  position: absolute;
  right: 8px;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  cursor: pointer;
  padding: 0;
}

.search-clear svg {
  width: 18px;
  height: 18px;
  color: var(--text-tertiary);
}

/* Filter Section */
.filter-section {
  padding: 0 20px 16px 20px;
}

.filter-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  scrollbar-width: none;
}

.filter-scroll::-webkit-scrollbar {
  display: none;
}

.filter-pill {
  display: inline-flex;
  align-items: center;
  padding: 8px 14px;
  border-radius: var(--radius-pill);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  border: none;
  cursor: pointer;
  background: var(--fill-tertiary);
  color: var(--text-secondary);
  transition: all 0.2s var(--ease-apple);
}

.filter-pill:active {
  transform: scale(0.96);
}

.filter-pill.active {
  background: var(--apple-blue);
  color: white;
}

/* Loading State */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.loading-state p {
  margin-top: 16px;
  color: var(--text-tertiary);
  font-size: 15px;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 20px;
  text-align: center;
}

.empty-icon {
  width: 64px;
  height: 64px;
  margin-bottom: 16px;
  color: var(--text-quaternary);
}

.empty-state h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 8px 0;
}

.empty-state p {
  font-size: 15px;
  color: var(--text-tertiary);
  margin: 0;
}

/* Plans List */
.plans-list {
  padding: 0 20px;
}

.list-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--separator);
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.plan-item {
  display: flex;
  align-items: center;
  padding: 14px 16px;
}

.plan-item:not(:last-child) {
  border-bottom: 0.5px solid var(--separator);
}

.plan-content {
  flex: 1;
  display: flex;
  align-items: center;
  cursor: pointer;
  min-width: 0;
}

.plan-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 14px;
}

.plan-icon svg {
  width: 22px;
  height: 22px;
}

.plan-icon.icon-green {
  background: rgba(52, 199, 89, 0.15);
  color: var(--apple-green);
}

.plan-icon.icon-orange {
  background: rgba(255, 149, 0, 0.15);
  color: var(--apple-orange);
}

.plan-icon.icon-red {
  background: rgba(255, 59, 48, 0.15);
  color: var(--apple-red);
}

.plan-icon.icon-blue {
  background: rgba(0, 122, 255, 0.15);
  color: var(--apple-blue);
}

.plan-info {
  flex: 1;
  min-width: 0;
}

.plan-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 4px 0;
  line-height: 1.3;
}

.plan-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.difficulty-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
}

.difficulty-badge.badge-green {
  background: rgba(52, 199, 89, 0.12);
  color: var(--apple-green);
}

.difficulty-badge.badge-orange {
  background: rgba(255, 149, 0, 0.12);
  color: var(--apple-orange);
}

.difficulty-badge.badge-red {
  background: rgba(255, 59, 48, 0.12);
  color: var(--apple-red);
}

.meta-item {
  font-size: 12px;
  color: var(--text-tertiary);
}

.meta-item.category {
  padding: 2px 6px;
  background: var(--fill-tertiary);
  border-radius: var(--radius-xs);
}

.plan-objectives {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 6px 0 0 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Actions */
.plan-actions {
  display: flex;
  gap: 4px;
  margin-left: 12px;
}

.action-button {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s var(--ease-apple);
}

.action-button:active {
  transform: scale(0.92);
}

.action-button svg {
  width: 18px;
  height: 18px;
}

.action-button.copy {
  background: rgba(0, 122, 255, 0.1);
  color: var(--apple-blue);
}

.action-button.copy:hover {
  background: rgba(0, 122, 255, 0.2);
}

.action-button.delete {
  background: rgba(255, 59, 48, 0.1);
  color: var(--apple-red);
}

.action-button.delete:hover {
  background: rgba(255, 59, 48, 0.2);
}

/* Load More */
.load-more {
  padding: 20px;
}

.load-more-button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px;
  background: var(--fill-tertiary);
  border: none;
  border-radius: var(--radius-md);
  font-size: 15px;
  font-weight: 500;
  color: var(--apple-blue);
  cursor: pointer;
  transition: all 0.2s var(--ease-apple);
}

.load-more-button:hover {
  background: var(--fill-secondary);
}

.load-more-button:active {
  transform: scale(0.98);
}

.load-more-count {
  font-size: 13px;
  color: var(--text-tertiary);
  font-weight: 400;
}

/* Dark mode */
.dark .list-card {
  background: var(--bg-secondary);
}

/* Responsive */
@media (min-width: 768px) {
  .page-header {
    padding: 24px 24px 0 24px;
  }

  .segment-section {
    padding: 20px 24px;
  }

  .search-section {
    padding: 0 24px 16px 24px;
  }

  .filter-section {
    padding: 0 24px 20px 24px;
  }

  .plans-list {
    padding: 0 24px;
  }

  .load-more {
    padding: 24px;
  }
}
</style>
