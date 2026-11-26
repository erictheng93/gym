<script lang="ts">
import { PAGES, MESSAGES } from '~/constants'
import { CLASS_CATEGORIES, CLASS_CATEGORY_LABELS } from '~/composables/useClasses'

const categoryOptions = [
  { value: '', label: '全部類別' },
  ...CLASS_CATEGORIES.map(code => ({ value: code, label: CLASS_CATEGORY_LABELS[code] }))
]

const difficultyOptions = [
  { value: '', label: '全部難度' },
  { value: 'BEGINNER', label: PAGES.CLASSES.DIFFICULTY_BEGINNER },
  { value: 'INTERMEDIATE', label: PAGES.CLASSES.DIFFICULTY_INTERMEDIATE },
  { value: 'ADVANCED', label: PAGES.CLASSES.DIFFICULTY_ADVANCED }
]

// Table columns configuration
const columns = [
  { key: 'name', label: PAGES.CLASSES.NAME, slot: 'class' },
  { key: 'category', label: PAGES.CLASSES.CATEGORY, slot: 'category', hideOnMobile: true },
  { key: 'durationMinutes', label: PAGES.CLASSES.DURATION, slot: 'duration' },
  { key: 'maxCapacity', label: PAGES.CLASSES.MAX_CAPACITY, slot: 'capacity', hideOnMobile: true },
  { key: 'difficultyLevel', label: PAGES.CLASSES.DIFFICULTY, slot: 'difficulty', hideOnMobile: true },
  { key: 'branch.name', label: PAGES.CLASSES.BRANCH, hideOnMobile: true }
]

</script>

<script setup lang="ts">
/**
 * 課程管理頁面
 *
 * 課程定義列表。GET /api/classes 回傳完整清單（無分頁、無搜尋），
 * 搜尋、類別與難度篩選在前端進行。
 */
import { PAGINATION } from '~/constants'
import { getDifficultyBadge } from '@gym-nexus/shared'
import { useClasses, filterClasses, getCategoryLabel, type ApiClass, type ClassCategoryCode, type DifficultyLevel } from '~/composables/useClasses'

definePageMeta({
  middleware: 'auth'
})

const { allClasses, isLoading, fetchClasses } = useClasses()
const { branches, fetchBranches } = useBranches()

// Filter state
const search = ref('')
const selectedBranch = ref('')
const selectedCategory = ref<ClassCategoryCode | ''>('')
const selectedDifficulty = ref<DifficultyLevel | ''>('')
const currentPage = ref(1)
const pageSize = PAGINATION.DEFAULT_PAGE_SIZE

const filtered = computed(() => filterClasses(allClasses.value, {
  search: search.value,
  category: selectedCategory.value,
  difficulty: selectedDifficulty.value
}))
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const pageRows = computed(() => filtered.value.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize))

watch([search, selectedCategory, selectedDifficulty], () => {
  currentPage.value = 1
})

watch(selectedBranch, () => {
  currentPage.value = 1
  fetchClasses(selectedBranch.value || undefined)
})

onMounted(async () => {
  await Promise.all([
    fetchClasses(),
    fetchBranches()
  ])
})

const handleRowClick = (classItem: ApiClass) => {
  navigateTo(`/classes/${classItem.id}`)
}
</script>

<template>
  <PageContainer>
    <!-- Header -->
    <PageHeader
      :title="PAGES.CLASSES.TITLE"
      :description="PAGES.CLASSES.DESCRIPTION"
      :action-label="PAGES.CLASSES.ADD_CLASS"
      action-to="/classes/new"
      action-icon="plus"
    />

    <!-- Quick Links -->
    <div class="quick-links">
      <NuxtLink to="/classes/bookings" class="quick-link">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        {{ PAGES.CLASS_BOOKINGS.TITLE }}
      </NuxtLink>
    </div>

    <!-- Filters -->
    <FilterBar>
      <template #search>
        <input
          v-model="search"
          type="text"
          class="input input-search"
          :placeholder="PAGES.CLASSES.SEARCH_PLACEHOLDER"
        />
      </template>
      <template #filters>
        <select v-model="selectedBranch" class="input filter-select">
          <option value="">{{ MESSAGES.COMMON.ALL_BRANCHES }}</option>
          <option v-for="branch in branches" :key="branch.id" :value="branch.id">
            {{ branch.name }}
          </option>
        </select>
        <select v-model="selectedCategory" class="input filter-select">
          <option v-for="opt in categoryOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
        <select v-model="selectedDifficulty" class="input filter-select">
          <option v-for="opt in difficultyOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </template>
    </FilterBar>

    <!-- Stats -->
    <StatsBar :count="filtered.length" :label="MESSAGES.COMMON.MATCHES" />

    <!-- Data Table -->
    <DataTable
      :data="pageRows"
      :columns="columns"
      :loading="isLoading"
      :loading-message="MESSAGES.ACTIONS.LOADING"
      :empty-title="PAGES.CLASSES.NO_CLASSES"
      :empty-description="PAGES.CLASSES.NO_CLASSES_HINT"
      empty-icon="bookmark"
      :empty-action-label="PAGES.CLASSES.ADD_CLASS"
      empty-action-to="/classes/new"
      row-clickable
      show-actions
      @row-click="handleRowClick"
    >
      <!-- Class Cell -->
      <template #class="{ row }">
        <div class="class-info">
          <span class="class-name">{{ row.name }}</span>
          <span v-if="row.instructor?.fullName" class="class-instructor text-caption text-tertiary">
            {{ row.instructor.fullName }}
          </span>
        </div>
      </template>

      <!-- Category Cell -->
      <template #category="{ row }">
        <span v-if="row.category" class="category-badge">{{ getCategoryLabel(row.category) }}</span>
        <span v-else class="text-tertiary">—</span>
      </template>

      <!-- Duration Cell -->
      <template #duration="{ row }">
        <span class="duration-text">{{ row.durationMinutes }} {{ PAGES.CLASSES.DURATION_MINUTES }}</span>
      </template>

      <!-- Capacity Cell -->
      <template #capacity="{ row }">
        <span class="duration-text">{{ row.maxCapacity }} 人</span>
      </template>

      <!-- Difficulty Cell -->
      <template #difficulty="{ row }">
        <AppBadge
          :label="getDifficultyBadge(row.difficultyLevel).label"
          :variant="getDifficultyBadge(row.difficultyLevel).variant"
        />
      </template>

      <!-- Actions Cell -->
      <template #actions="{ row }">
        <div class="actions-row">
          <NuxtLink :to="`/classes/${row.id}`" class="action-btn" title="查看詳情" @click.stop>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </NuxtLink>
          <NuxtLink :to="`/classes/${row.id}/edit`" class="action-btn" title="編輯" @click.stop>
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
          </NuxtLink>
        </div>
      </template>

      <!-- Pagination -->
      <template #footer>
        <DataPagination
          v-model="currentPage"
          :total-pages="totalPages"
          :prev-label="MESSAGES.ACTIONS.PREV_PAGE"
          :next-label="MESSAGES.ACTIONS.NEXT_PAGE"
        />
      </template>
    </DataTable>
  </PageContainer>
</template>

<style scoped>
.filter-select {
  min-width: 140px;
}

/* Quick Links */
.quick-links {
  display: flex;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
  flex-wrap: wrap;
}

.quick-link {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-bg-primary);
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-sm);
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: all var(--duration-fast) var(--ease-out);
}

.quick-link:hover {
  background: var(--color-accent-light);
  color: var(--color-accent);
}

.class-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.class-name {
  font-weight: 500;
  color: var(--color-text-primary);
}

.class-instructor {
  font-size: 12px;
}

.category-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 500;
  border-radius: var(--radius-full);
  background: var(--color-accent-light);
  color: var(--color-accent);
}

.duration-text {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.actions-row {
  display: flex;
  gap: var(--space-xs);
}

.action-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  background: transparent;
  border: none;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.action-btn:hover {
  background: var(--color-accent-light);
  color: var(--color-accent);
}
</style>
