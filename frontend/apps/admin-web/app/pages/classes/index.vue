<script setup lang="ts">
/**
 * 課程管理頁面
 *
 * 課程定義列表與管理
 */
import { PAGES, MESSAGES, PAGINATION, TIMING } from '~/constants'
import { getDifficultyBadge, formatDate } from '@gym-nexus/shared'

definePageMeta({
  middleware: 'auth'
})

// Data fetching
const { classes, totalCount, isLoading, fetchClasses, toggleClassActive, deleteClass } = useClasses()
const { branches, fetchBranches } = useBranches()
const { categories, fetchCategories } = useClassCategories()
const toast = useToast()
const { confirm } = useConfirm()

// Filter state
const search = ref('')
const selectedBranch = ref('')
const selectedCategory = ref('')
const selectedStatus = ref('')
const currentPage = ref(1)
const pageSize = PAGINATION.DEFAULT_PAGE_SIZE

const totalPages = computed(() => Math.ceil(totalCount.value / pageSize))

// Status options
const statusOptions = [
  { value: '', label: MESSAGES.COMMON.ALL_STATUS },
  { value: 'true', label: PAGES.CLASSES.ENABLED },
  { value: 'false', label: PAGES.CLASSES.DISABLED }
]

// Difficulty options
const difficultyOptions = [
  { value: 'BEGINNER', label: PAGES.CLASSES.DIFFICULTY_BEGINNER },
  { value: 'INTERMEDIATE', label: PAGES.CLASSES.DIFFICULTY_INTERMEDIATE },
  { value: 'ADVANCED', label: PAGES.CLASSES.DIFFICULTY_ADVANCED }
]

// Table columns configuration
const columns = [
  { key: 'name', label: PAGES.CLASSES.NAME, slot: 'class' },
  { key: 'class_category', label: PAGES.CLASSES.CATEGORY, slot: 'category', hideOnMobile: true },
  { key: 'duration_minutes', label: PAGES.CLASSES.DURATION, slot: 'duration' },
  { key: 'difficulty_level', label: PAGES.CLASSES.DIFFICULTY, slot: 'difficulty', hideOnMobile: true },
  { key: 'branch.name', label: PAGES.CLASSES.BRANCH, hideOnMobile: true },
  { key: 'is_active', label: PAGES.CLASSES.STATUS, slot: 'status' }
]

// Load classes with current filters
const loadClasses = async () => {
  await fetchClasses({
    page: currentPage.value,
    limit: pageSize,
    search: search.value || undefined,
    branchId: selectedBranch.value || undefined,
    categoryId: selectedCategory.value || undefined,
    isActive: selectedStatus.value ? selectedStatus.value === 'true' : undefined
  })
}

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>
const handleSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    currentPage.value = 1
    loadClasses()
  }, TIMING.DEBOUNCE)
}

// Watch filters
watch([selectedBranch, selectedCategory, selectedStatus], () => {
  currentPage.value = 1
  loadClasses()
})

watch(currentPage, () => {
  loadClasses()
})

// Initial load
onMounted(async () => {
  await Promise.all([
    loadClasses(),
    fetchBranches(),
    fetchCategories({ isActive: true })
  ])
})

// Row click handler
const handleRowClick = (classItem: typeof classes.value[0]) => {
  navigateTo(`/classes/${classItem.id}`)
}

// Toggle active status
const handleToggleActive = async (classItem: typeof classes.value[0]) => {
  const newStatus = !classItem.is_active
  const confirmed = await confirm({
    title: newStatus ? '啟用課程' : '停用課程',
    message: `確定要${newStatus ? '啟用' : '停用'}「${classItem.name}」嗎？`,
    confirmText: '確定',
    confirmVariant: newStatus ? 'primary' : 'warning'
  })

  if (!confirmed) return

  const success = await toggleClassActive(classItem.id, newStatus)
  if (success) {
    toast.success(newStatus ? '課程已啟用' : '課程已停用')
    await loadClasses()
  }
}

// Delete class
const handleDelete = async (classItem: typeof classes.value[0]) => {
  const confirmed = await confirm({
    title: MESSAGES.CONFIRM.DELETE_TITLE,
    message: `確定要刪除「${classItem.name}」嗎？${MESSAGES.CONFIRM.DELETE_WARNING}`,
    confirmText: MESSAGES.CONFIRM.CONFIRM_DELETE,
    confirmVariant: 'danger'
  })

  if (!confirmed) return

  const success = await deleteClass(classItem.id)
  if (success) {
    toast.success(MESSAGES.SUCCESS.DELETED)
    await loadClasses()
  }
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
      <NuxtLink to="/classes/schedule" class="quick-link">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
          <line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" />
          <line x1="3" x2="21" y1="10" y2="10" />
        </svg>
        {{ PAGES.CLASS_SCHEDULE.TITLE }}
      </NuxtLink>
      <NuxtLink to="/classes/bookings" class="quick-link">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        {{ PAGES.CLASS_BOOKINGS.TITLE }}
      </NuxtLink>
      <NuxtLink to="/classes/categories" class="quick-link">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2H2v10h10V2z" /><path d="M22 12H12v10h10V12z" />
          <path d="M12 7h10" /><path d="M7 12v10" />
        </svg>
        {{ PAGES.CLASS_CATEGORIES.TITLE }}
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
          @input="handleSearch"
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
          <option value="">全部類別</option>
          <option v-for="cat in categories" :key="cat.id" :value="cat.id">
            {{ cat.name }}
          </option>
        </select>
        <select v-model="selectedStatus" class="input filter-select">
          <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
        </select>
      </template>
    </FilterBar>

    <!-- Stats -->
    <StatsBar :count="totalCount" :label="MESSAGES.COMMON.MATCHES" />

    <!-- Data Table -->
    <DataTable
      :data="classes"
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
        <div class="class-cell">
          <div
            v-if="row.class_category?.color"
            class="class-color"
            :style="{ backgroundColor: row.class_category.color }"
          />
          <div class="class-info">
            <span class="class-name">{{ row.name }}</span>
            <span v-if="row.instructor" class="class-instructor text-caption text-tertiary">
              {{ row.instructor.full_name }}
            </span>
          </div>
        </div>
      </template>

      <!-- Category Cell -->
      <template #category="{ row }">
        <span v-if="row.class_category" class="category-badge" :style="{ '--cat-color': row.class_category.color || 'var(--color-text-secondary)' }">
          {{ row.class_category.name }}
        </span>
        <span v-else class="text-tertiary">—</span>
      </template>

      <!-- Duration Cell -->
      <template #duration="{ row }">
        <span class="duration-text">{{ row.duration_minutes }} {{ PAGES.CLASSES.DURATION_MINUTES }}</span>
      </template>

      <!-- Difficulty Cell -->
      <template #difficulty="{ row }">
        <AppBadge
          :label="getDifficultyBadge(row.difficulty_level).label"
          :variant="getDifficultyBadge(row.difficulty_level).variant"
        />
      </template>

      <!-- Status Cell -->
      <template #status="{ row }">
        <AppBadge
          :label="row.is_active ? PAGES.CLASSES.ENABLED : PAGES.CLASSES.DISABLED"
          :variant="row.is_active ? 'success' : 'default'"
        />
      </template>

      <!-- Actions Cell -->
      <template #actions="{ row }">
        <div class="actions-row">
          <NuxtLink :to="`/classes/${row.id}`" class="action-btn" title="查看詳情">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </NuxtLink>
          <NuxtLink :to="`/classes/${row.id}/edit`" class="action-btn" title="編輯">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
              <path d="m15 5 4 4" />
            </svg>
          </NuxtLink>
          <button
            type="button"
            class="action-btn"
            :title="row.is_active ? '停用' : '啟用'"
            @click.stop="handleToggleActive(row)"
          >
            <svg v-if="row.is_active" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
          </button>
          <button
            type="button"
            class="action-btn action-btn-danger"
            title="刪除"
            @click.stop="handleDelete(row)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
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
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
  transition: all var(--duration-fast) var(--ease-out);
}

.quick-link:hover {
  background: var(--color-accent-light);
  border-color: var(--color-accent);
  color: var(--color-accent);
}

/* Class Cell */
.class-cell {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.class-color {
  width: 4px;
  height: 32px;
  border-radius: 2px;
  flex-shrink: 0;
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

/* Category Badge */
.category-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 500;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--cat-color) 15%, transparent);
  color: var(--cat-color);
}

/* Duration */
.duration-text {
  font-size: 14px;
  color: var(--color-text-secondary);
}

/* Actions */
.actions-row {
  display: flex;
  gap: var(--space-xs);
}

.action-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
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

.action-btn-danger:hover {
  background: var(--color-error-light, #ffebee);
  color: var(--color-error);
}
</style>
