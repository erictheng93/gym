<script setup lang="ts">
/**
 * 課程類別管理頁面
 * 顯示所有課程類別，支援層級結構顯示
 */
import { MESSAGES, PAGES } from '~/constants'
import type { ClassCategory } from '~/types/schema'

definePageMeta({
  middleware: 'auth'
})

const { categories, isLoading, fetchCategories, deleteCategory, getCategoryStats } = useClassCategories()
const toast = useToast()

// Filter state
const showSubCategories = ref(true)
const statusFilter = ref<'all' | 'active' | 'inactive'>('all')
const searchQuery = ref('')

// Stats
const stats = ref({ total: 0, active: 0, root: 0 })

// Delete modal state
const showDeleteConfirm = ref(false)
const categoryToDelete = ref<ClassCategory | null>(null)

// Stats config
const statsConfig = computed(() => [
  { label: PAGES.CLASS_CATEGORIES.TOTAL_CATEGORIES, value: stats.value.total, icon: 'grid' as const, variant: 'default' as const },
  { label: PAGES.CLASS_CATEGORIES.ACTIVE_CATEGORIES, value: stats.value.active, icon: 'check' as const, variant: 'success' as const },
  { label: PAGES.CLASS_CATEGORIES.ROOT_CATEGORIES, value: stats.value.root, icon: 'folder' as const, variant: 'info' as const }
])

// Filtered and organized categories
const organizedCategories = computed(() => {
  let filtered = categories.value

  // Apply status filter
  if (statusFilter.value === 'active') {
    filtered = filtered.filter(c => c.is_active)
  } else if (statusFilter.value === 'inactive') {
    filtered = filtered.filter(c => !c.is_active)
  }

  // Apply search filter
  if (searchQuery.value) {
    const query = searchQuery.value.toLowerCase()
    filtered = filtered.filter(c =>
      c.name.toLowerCase().includes(query) ||
      (c.name_en && c.name_en.toLowerCase().includes(query)) ||
      c.code.toLowerCase().includes(query)
    )
  }

  if (!showSubCategories.value) {
    return filtered.filter(c => !c.parent_id)
  }

  // Build tree structure
  const rootCategories = filtered.filter(c => !c.parent_id)
  const childMap = new Map<string, ClassCategory[]>()

  filtered.filter(c => c.parent_id).forEach(c => {
    const children = childMap.get(c.parent_id!) || []
    children.push(c)
    childMap.set(c.parent_id!, children)
  })

  return rootCategories.map(root => ({
    ...root,
    children: childMap.get(root.id) || []
  }))
})

// Delete handlers
const confirmDelete = (category: ClassCategory) => {
  categoryToDelete.value = category
  showDeleteConfirm.value = true
}

const handleDelete = async () => {
  if (!categoryToDelete.value) return
  try {
    await deleteCategory(categoryToDelete.value.id)
    toast.success(MESSAGES.SUCCESS.CATEGORY_DELETED)
    await loadData()
  } catch (error) {
    console.error('Failed to delete category:', error)
    toast.error(MESSAGES.ERRORS.CATEGORY_DELETE_FAILED)
  } finally {
    showDeleteConfirm.value = false
    categoryToDelete.value = null
  }
}

// Load data
const loadData = async () => {
  try {
    await fetchCategories({})
    stats.value = await getCategoryStats()
  } catch (error) {
    toast.error(MESSAGES.ERRORS.CATEGORY_FETCH_FAILED)
  }
}

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>
const handleSearch = (value: string) => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    searchQuery.value = value
  }, 300)
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <PageContainer>
    <!-- Header -->
    <PageHeader
      :title="PAGES.CLASS_CATEGORIES.TITLE"
      :description="PAGES.CLASS_CATEGORIES.DESCRIPTION"
      :action-label="PAGES.CLASS_CATEGORIES.ADD_CATEGORY"
      action-to="/classes/categories/new"
      action-icon="plus"
    />

    <!-- Stats Grid -->
    <StatsGrid :stats="statsConfig" />

    <!-- Filters -->
    <div class="filters-bar glass-card">
      <div class="search-box">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="text"
          :placeholder="MESSAGES.FORM.SEARCH_PLACEHOLDER"
          class="search-input"
          @input="(e) => handleSearch((e.target as HTMLInputElement).value)"
        />
      </div>

      <div class="filter-group">
        <label class="filter-label">{{ PAGES.CLASS_CATEGORIES.STATUS }}</label>
        <div class="filter-chips">
          <button
            class="filter-chip"
            :class="{ active: statusFilter === 'all' }"
            @click="statusFilter = 'all'"
          >
            全部
          </button>
          <button
            class="filter-chip"
            :class="{ active: statusFilter === 'active' }"
            @click="statusFilter = 'active'"
          >
            {{ PAGES.CLASS_CATEGORIES.ENABLED }}
          </button>
          <button
            class="filter-chip"
            :class="{ active: statusFilter === 'inactive' }"
            @click="statusFilter = 'inactive'"
          >
            {{ PAGES.CLASS_CATEGORIES.DISABLED }}
          </button>
        </div>
      </div>

      <label class="toggle-label">
        <input v-model="showSubCategories" type="checkbox" class="toggle-input" />
        <span class="toggle-text">顯示子類別</span>
      </label>
    </div>

    <!-- Loading State -->
    <LoadingState v-if="isLoading" :message="MESSAGES.ACTIONS.LOADING" />

    <!-- Empty State -->
    <div v-else-if="organizedCategories.length === 0" class="card">
      <EmptyState
        :title="PAGES.CLASS_CATEGORIES.NO_CATEGORIES"
        :description="PAGES.CLASS_CATEGORIES.NO_CATEGORIES_HINT"
        icon="grid"
        :action-label="PAGES.CLASS_CATEGORIES.ADD_CATEGORY"
        action-to="/classes/categories/new"
      />
    </div>

    <!-- Categories Grid -->
    <div v-else class="categories-grid">
      <div
        v-for="category in organizedCategories"
        :key="category.id"
        class="category-card card"
        :class="{ inactive: !category.is_active }"
      >
        <div class="category-header">
          <div
            class="category-icon"
            :style="{ background: category.color + '20', color: category.color }"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <rect width="7" height="7" x="3" y="3" rx="1" />
              <rect width="7" height="7" x="14" y="3" rx="1" />
              <rect width="7" height="7" x="14" y="14" rx="1" />
              <rect width="7" height="7" x="3" y="14" rx="1" />
            </svg>
          </div>
          <AppBadge
            v-if="!category.is_active"
            :label="PAGES.CLASS_CATEGORIES.DISABLED"
            variant="default"
          />
        </div>

        <div class="category-info">
          <h3 class="category-name">{{ category.name }}</h3>
          <p v-if="category.name_en" class="category-name-en">{{ category.name_en }}</p>
          <p class="category-code">
            <span class="code-label">Code:</span>
            <code>{{ category.code }}</code>
          </p>
        </div>

        <p v-if="category.description" class="category-description">
          {{ category.description }}
        </p>

        <!-- Sub-categories -->
        <div v-if="showSubCategories && category.children && category.children.length > 0" class="sub-categories">
          <p class="sub-label">{{ PAGES.CLASS_CATEGORIES.SUB_CATEGORIES }} ({{ category.children.length }})</p>
          <div class="sub-list">
            <NuxtLink
              v-for="child in category.children"
              :key="child.id"
              :to="`/classes/categories/${child.id}/edit`"
              class="sub-item"
              :style="{ borderColor: child.color }"
            >
              <span
                class="sub-dot"
                :style="{ background: child.color }"
              />
              <span class="sub-name">{{ child.name }}</span>
              <span v-if="!child.is_active" class="sub-inactive">(停用)</span>
            </NuxtLink>
          </div>
        </div>

        <div class="category-actions">
          <NuxtLink :to="`/classes/categories/${category.id}/edit`" class="btn btn-secondary btn-small">
            {{ PAGES.CLASS_CATEGORIES.EDIT }}
          </NuxtLink>
          <button class="btn-icon btn-icon--danger" @click="confirmDelete(category)">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Delete Confirm Modal -->
    <AppModal v-model="showDeleteConfirm" max-width="sm">
      <template #header>
        <div class="modal-icon modal-icon--danger">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" />
          </svg>
        </div>
      </template>

      <div class="text-center">
        <h3 class="modal-title">{{ PAGES.CLASS_CATEGORIES.CONFIRM_DELETE }}</h3>
        <p class="modal-description">{{ PAGES.CLASS_CATEGORIES.DELETE_WARNING }}</p>
      </div>

      <template #footer>
        <button class="btn btn-ghost" @click="showDeleteConfirm = false">
          {{ MESSAGES.FORM.CANCEL }}
        </button>
        <button class="btn btn-danger" @click="handleDelete">
          {{ MESSAGES.CONFIRM.CONFIRM_DELETE }}
        </button>
      </template>
    </AppModal>
  </PageContainer>
</template>

<style scoped>
/* Filters Bar */
.filters-bar {
  display: flex;
  align-items: center;
  gap: var(--space-xl);
  padding: var(--space-md) var(--space-lg);
  margin-bottom: var(--space-xl);
  flex-wrap: wrap;
}

.search-box {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
  flex: 1;
  min-width: 200px;
  max-width: 300px;
}

.search-box svg {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.search-input {
  border: none;
  background: transparent;
  outline: none;
  font-size: 14px;
  color: var(--color-text-primary);
  width: 100%;
}

.search-input::placeholder {
  color: var(--color-text-tertiary);
}

.filter-group {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.filter-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.filter-chips {
  display: flex;
  gap: var(--space-xs);
}

.filter-chip {
  padding: 6px 14px;
  background: transparent;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-full);
  font-size: 14px;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.filter-chip:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}

.filter-chip.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}

.toggle-label {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  cursor: pointer;
  margin-left: auto;
}

.toggle-input {
  width: 18px;
  height: 18px;
  accent-color: var(--color-accent);
}

.toggle-text {
  font-size: 14px;
  color: var(--color-text-secondary);
}

/* Categories Grid */
.categories-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: var(--space-lg);
}

.category-card {
  padding: var(--space-lg);
  transition: all var(--duration-fast) var(--ease-out);
}

.category-card:hover {
  border-color: var(--color-accent);
  box-shadow: var(--shadow-lg);
}

.category-card.inactive {
  opacity: 0.6;
}

.category-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: var(--space-md);
}

.category-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
}

.category-info {
  margin-bottom: var(--space-md);
}

.category-name {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-xs) 0;
}

.category-name-en {
  font-size: 14px;
  color: var(--color-text-tertiary);
  margin: 0 0 var(--space-sm) 0;
}

.category-code {
  font-size: 13px;
  color: var(--color-text-secondary);
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.code-label {
  color: var(--color-text-tertiary);
}

.category-code code {
  background: var(--color-bg-tertiary);
  padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 12px;
}

.category-description {
  font-size: 14px;
  color: var(--color-text-tertiary);
  margin: 0 0 var(--space-md) 0;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Sub-categories */
.sub-categories {
  margin-bottom: var(--space-lg);
  padding: var(--space-md);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-md);
}

.sub-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--color-text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 var(--space-sm) 0;
}

.sub-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
}

.sub-item {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: 4px 10px;
  background: var(--color-bg-primary);
  border: 1px solid var(--color-border);
  border-left-width: 3px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--color-text-secondary);
  text-decoration: none;
  transition: all var(--duration-fast) var(--ease-out);
}

.sub-item:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.sub-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sub-name {
  white-space: nowrap;
}

.sub-inactive {
  font-size: 11px;
  color: var(--color-text-tertiary);
}

/* Category Actions */
.category-actions {
  display: flex;
  gap: var(--space-sm);
  margin-top: auto;
}

.category-actions .btn {
  flex: 1;
}

/* Icon Button */
.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  color: var(--color-text-tertiary);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-icon--danger:hover {
  background: rgba(255, 59, 48, 0.1);
  border-color: var(--color-error);
  color: var(--color-error);
}

/* Modal */
.modal-icon {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-icon--danger {
  background: rgba(255, 59, 48, 0.1);
  color: var(--color-error);
}

.modal-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: var(--space-lg) 0 var(--space-sm) 0;
}

.modal-description {
  font-size: 15px;
  color: var(--color-text-secondary);
  margin: 0;
}

.btn-danger {
  background: var(--color-error);
  border: none;
  color: white;
}

.btn-danger:hover {
  background: #e53935;
}

/* Responsive */
@media (max-width: 768px) {
  .filters-bar {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-md);
  }

  .search-box {
    max-width: none;
  }

  .filter-group {
    flex-direction: column;
    align-items: flex-start;
  }

  .toggle-label {
    margin-left: 0;
  }

  .categories-grid {
    grid-template-columns: 1fr;
  }
}
</style>
