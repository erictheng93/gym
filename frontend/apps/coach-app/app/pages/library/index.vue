<template>
  <div class="apple-page">
    <!-- Page Header -->
    <header class="page-header">
      <div class="header-content">
        <div class="header-text">
          <h1 class="page-title">教學資源庫</h1>
          <p class="page-subtitle">動作示範與訓練資源</p>
        </div>
        <NuxtLink to="/library/new" class="add-button">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M12 4v16m-8-8h16" />
          </svg>
        </NuxtLink>
      </div>
    </header>

    <!-- Type Segmented Control -->
    <div class="segment-section">
      <div class="segment-control four-segments">
        <button
          class="segment-button"
          :class="{ active: selectedType === '' }"
          @click="setTypeFilter('')"
        >
          全部
        </button>
        <button
          class="segment-button"
          :class="{ active: selectedType === 'EXERCISE' }"
          @click="setTypeFilter('EXERCISE')"
        >
          動作
        </button>
        <button
          class="segment-button"
          :class="{ active: selectedType === 'VIDEO' }"
          @click="setTypeFilter('VIDEO')"
        >
          影片
        </button>
        <button
          class="segment-button"
          :class="{ active: selectedType === 'DOCUMENT' }"
          @click="setTypeFilter('DOCUMENT')"
        >
          文件
        </button>
        <div
          class="segment-indicator"
          :class="getSegmentPositionClass()"
        />
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
          placeholder="搜尋動作名稱..."
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

    <!-- Filter Pills -->
    <div class="filter-section">
      <div class="filter-scroll">
        <!-- Difficulty -->
        <button
          class="filter-pill"
          :class="{ active: selectedDifficulty === 'BEGINNER' }"
          @click="toggleDifficultyFilter('BEGINNER')"
        >
          <span class="filter-dot green" />
          初階
        </button>
        <button
          class="filter-pill"
          :class="{ active: selectedDifficulty === 'INTERMEDIATE' }"
          @click="toggleDifficultyFilter('INTERMEDIATE')"
        >
          <span class="filter-dot orange" />
          中階
        </button>
        <button
          class="filter-pill"
          :class="{ active: selectedDifficulty === 'ADVANCED' }"
          @click="toggleDifficultyFilter('ADVANCED')"
        >
          <span class="filter-dot red" />
          進階
        </button>

        <span v-if="muscleGroups.length > 0" class="filter-divider" />

        <!-- Muscle Groups -->
        <button
          v-for="muscle in muscleGroups.slice(0, 5)"
          :key="muscle"
          class="filter-pill"
          :class="{ active: selectedMuscle === muscle }"
          @click="toggleMuscleFilter(muscle)"
        >
          {{ muscle }}
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading" class="loading-state">
      <div class="apple-spinner" />
      <p>載入資源中...</p>
    </div>

    <!-- Empty State -->
    <div v-else-if="materials.length === 0" class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      </div>
      <h3>沒有找到教學資源</h3>
      <p>嘗試調整篩選條件或新增資源</p>
    </div>

    <!-- Materials Grid -->
    <div v-else class="materials-grid">
      <div
        v-for="(material, index) in materials"
        :key="material.id"
        class="material-card stagger-item"
        :style="{ animationDelay: `${index * 0.03}s` }"
        @click="goToMaterial(material.id)"
      >
        <!-- Thumbnail -->
        <div class="material-thumbnail">
          <img
            v-if="material.thumbnail_url"
            :src="material.thumbnail_url"
            :alt="material.name"
          />
          <div v-else class="thumbnail-placeholder">
            <svg v-if="material.type === 'VIDEO'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <svg v-else-if="material.type === 'DOCUMENT'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>

          <!-- Type Badge -->
          <span class="type-badge" :class="getTypeBadgeClass(material.type)">
            {{ getTypeText(material.type) }}
          </span>
        </div>

        <!-- Info -->
        <div class="material-info">
          <h3 class="material-name">{{ material.name }}</h3>
          <div class="material-meta">
            <span
              v-if="material.difficulty"
              class="difficulty-badge"
              :class="getDifficultyClass(material.difficulty)"
            >
              {{ getDifficultyText(material.difficulty) }}
            </span>
            <span v-if="material.muscle_groups?.length" class="muscle-group">
              {{ material.muscle_groups[0] }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Load More -->
    <div v-if="materials.length > 0 && materials.length < total" class="load-more">
      <button class="load-more-button" @click="loadMore">
        <span>載入更多</span>
        <span class="load-more-count">{{ materials.length }} / {{ total }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const {
  materials,
  muscleGroups,
  loading,
  total,
  fetchMaterials,
  fetchCategories,
  fetchMuscleGroups,
} = useTeachingMaterials()

const searchQuery = ref('')
const selectedMuscle = ref('')
const selectedDifficulty = ref('')
const selectedType = ref('')
const offset = ref(0)
const limit = 20

let searchTimeout: ReturnType<typeof setTimeout>
const debouncedSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    offset.value = 0
    loadMaterials()
  }, 300)
}

const clearSearch = () => {
  searchQuery.value = ''
  offset.value = 0
  loadMaterials()
}

const setTypeFilter = (type: string) => {
  selectedType.value = type
  offset.value = 0
  loadMaterials()
}

const toggleDifficultyFilter = (difficulty: string) => {
  selectedDifficulty.value = selectedDifficulty.value === difficulty ? '' : difficulty
  offset.value = 0
  loadMaterials()
}

const toggleMuscleFilter = (muscle: string) => {
  selectedMuscle.value = selectedMuscle.value === muscle ? '' : muscle
  offset.value = 0
  loadMaterials()
}

const getSegmentPositionClass = () => {
  switch (selectedType.value) {
    case '': return 'pos-0'
    case 'EXERCISE': return 'pos-1'
    case 'VIDEO': return 'pos-2'
    case 'DOCUMENT': return 'pos-3'
    default: return 'pos-0'
  }
}

const loadMaterials = async () => {
  await fetchMaterials({
    search: searchQuery.value || undefined,
    muscle_groups: selectedMuscle.value || undefined,
    difficulty: selectedDifficulty.value || undefined,
    type: selectedType.value || undefined,
    limit,
    offset: offset.value,
  })
}

const loadMore = async () => {
  offset.value += limit
  await fetchMaterials({
    search: searchQuery.value || undefined,
    muscle_groups: selectedMuscle.value || undefined,
    difficulty: selectedDifficulty.value || undefined,
    type: selectedType.value || undefined,
    limit,
    offset: offset.value,
  })
}

const goToMaterial = (id: string) => {
  router.push(`/library/${id}`)
}

const getTypeBadgeClass = (type: string) => {
  const classes: Record<string, string> = {
    EXERCISE: 'badge-blue',
    VIDEO: 'badge-red',
    DOCUMENT: 'badge-gray',
  }
  return classes[type] || 'badge-gray'
}

const getTypeText = (type: string) => {
  const texts: Record<string, string> = {
    EXERCISE: '動作',
    VIDEO: '影片',
    DOCUMENT: '文件',
  }
  return texts[type] || type
}

const getDifficultyClass = (difficulty: string) => {
  const classes: Record<string, string> = {
    BEGINNER: 'difficulty-green',
    INTERMEDIATE: 'difficulty-orange',
    ADVANCED: 'difficulty-red',
  }
  return classes[difficulty] || 'difficulty-gray'
}

const getDifficultyText = (difficulty: string) => {
  const texts: Record<string, string> = {
    BEGINNER: '初階',
    INTERMEDIATE: '中階',
    ADVANCED: '進階',
  }
  return texts[difficulty] || difficulty
}

onMounted(async () => {
  await Promise.all([
    loadMaterials(),
    fetchCategories(),
    fetchMuscleGroups(),
  ])
})
</script>

<style scoped>
/* ============================================
   APPLE-STYLE LIBRARY PAGE
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
  padding: 10px 12px;
  font-size: 13px;
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
  width: calc(25% - 2px);
  height: calc(100% - 4px);
  background: var(--bg-secondary);
  border-radius: calc(var(--radius-md) - 2px);
  box-shadow: var(--shadow-sm);
  transition: transform 0.3s var(--ease-spring);
}

.segment-indicator.pos-0 {
  transform: translateX(0);
}

.segment-indicator.pos-1 {
  transform: translateX(100%);
}

.segment-indicator.pos-2 {
  transform: translateX(200%);
}

.segment-indicator.pos-3 {
  transform: translateX(300%);
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
  gap: 6px;
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

.filter-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.filter-dot.green {
  background: var(--apple-green);
}

.filter-dot.orange {
  background: var(--apple-orange);
}

.filter-dot.red {
  background: var(--apple-red);
}

.filter-pill.active .filter-dot {
  background: white;
}

.filter-divider {
  width: 1px;
  height: 24px;
  background: var(--separator);
  margin: 0 4px;
  flex-shrink: 0;
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

/* Materials Grid */
.materials-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 0 20px;
}

.material-card {
  background: var(--bg-secondary);
  border-radius: var(--radius-lg);
  border: 1px solid var(--separator);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.2s var(--ease-apple);
  box-shadow: var(--shadow-sm);
}

.material-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.material-card:active {
  transform: scale(0.98);
}

/* Thumbnail */
.material-thumbnail {
  position: relative;
  aspect-ratio: 16/9;
  background: var(--fill-tertiary);
}

.material-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.thumbnail-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.thumbnail-placeholder svg {
  width: 40px;
  height: 40px;
  color: var(--text-quaternary);
}

.type-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 3px 8px;
  border-radius: var(--radius-xs);
  font-size: 11px;
  font-weight: 600;
}

.type-badge.badge-blue {
  background: var(--apple-blue);
  color: white;
}

.type-badge.badge-red {
  background: var(--apple-red);
  color: white;
}

.type-badge.badge-gray {
  background: var(--text-secondary);
  color: white;
}

/* Material Info */
.material-info {
  padding: 12px;
}

.material-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  margin: 0 0 6px 0;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.material-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.difficulty-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: var(--radius-xs);
}

.difficulty-badge.difficulty-green {
  background: rgba(52, 199, 89, 0.12);
  color: var(--apple-green);
}

.difficulty-badge.difficulty-orange {
  background: rgba(255, 149, 0, 0.12);
  color: var(--apple-orange);
}

.difficulty-badge.difficulty-red {
  background: rgba(255, 59, 48, 0.12);
  color: var(--apple-red);
}

.muscle-group {
  font-size: 11px;
  color: var(--text-tertiary);
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
.dark .material-card {
  background: var(--bg-secondary);
}

/* Responsive */
@media (min-width: 640px) {
  .materials-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

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

  .materials-grid {
    padding: 0 24px;
    gap: 16px;
  }

  .load-more {
    padding: 24px;
  }
}

@media (min-width: 1024px) {
  .materials-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
</style>
