<script setup lang="ts">
/**
 * 新增職位頁面
 *
 * 建立新職位並設定權限
 */
import { MESSAGES } from '~/constants'
import { PERMISSION_MODULES, createEmptyPermissions, createFullPermissions } from '~/constants/permissions'

definePageMeta({
  middleware: 'auth'
})

const router = useRouter()
const { createJobTitle } = useJobTitles()

// Form state
const isSubmitting = ref(false)
const form = reactive({
  name: '',
  permissions_config: createEmptyPermissions()
})

// Form validation
const { errors, validate, clearErrors } = useFormValidation<typeof form>()

// Permission helpers
const toggleModuleAll = (moduleKey: string, value: boolean) => {
  const module = PERMISSION_MODULES.find(m => m.key === moduleKey)
  const modulePerms = form.permissions_config[moduleKey]
  if (!module || !modulePerms) return

  module.actions.forEach(action => {
    modulePerms[action.key] = value
  })
}

const isModuleFullyEnabled = (moduleKey: string) => {
  const module = PERMISSION_MODULES.find(m => m.key === moduleKey)
  const modulePerms = form.permissions_config[moduleKey]
  if (!module || !modulePerms) return false

  return module.actions.every(action =>
    modulePerms[action.key] === true
  )
}

const isModulePartiallyEnabled = (moduleKey: string) => {
  const module = PERMISSION_MODULES.find(m => m.key === moduleKey)
  const modulePerms = form.permissions_config[moduleKey]
  if (!module || !modulePerms) return false

  const enabledCount = module.actions.filter(action =>
    modulePerms[action.key] === true
  ).length

  return enabledCount > 0 && enabledCount < module.actions.length
}

// Quick permission presets
const applyFullAccess = () => {
  form.permissions_config = createFullPermissions()
}

const applyReadOnly = () => {
  form.permissions_config = createEmptyPermissions()
  PERMISSION_MODULES.forEach(module => {
    const readAction = module.actions.find(a => a.key === 'read')
    const modulePerms = form.permissions_config[module.key]
    if (readAction && modulePerms) {
      modulePerms.read = true
    }
  })
}

const clearAllPermissions = () => {
  form.permissions_config = createEmptyPermissions()
}

// Form submission
const handleSubmit = async () => {
  clearErrors()

  const isValid = validate(form, {
    name: [required('請輸入職位名稱')]
  })

  if (!isValid) return

  isSubmitting.value = true
  try {
    await createJobTitle({
      name: form.name,
      permissions_config: form.permissions_config
    })
    useToast().success(MESSAGES.SUCCESS.JOB_TITLE_CREATED)
    router.push('/hr/job-titles')
  } catch (error) {
    console.error('Failed to create job title:', error)
    useToast().error(MESSAGES.ERRORS.JOB_TITLE_CREATE_FAILED)
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div class="form-page">
    <!-- Header -->
    <header class="form-page-header">
      <button class="back-btn" @click="router.back()">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        返回
      </button>
    </header>

    <!-- Hero -->
    <div class="form-hero">
      <div class="hero-icon hero-icon--purple">
        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      </div>
      <h1 class="text-headline">新增職位</h1>
      <p class="text-body text-secondary">建立職位並設定權限</p>
    </div>

    <!-- Form -->
    <form class="form-container" @submit.prevent="handleSubmit">
      <!-- Basic Info Section -->
      <section class="form-section glass-card">
        <h2 class="section-title">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="20" height="14" x="2" y="7" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
          基本資訊
        </h2>

        <FormInput
          v-model="form.name"
          label="職位名稱"
          placeholder="例：店長、教練、櫃檯人員"
          :required="true"
          :error="errors.name"
        />
      </section>

      <!-- Permissions Section -->
      <section class="form-section glass-card">
        <div class="section-header">
          <h2 class="section-title">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            權限設定
          </h2>

          <!-- Quick Presets -->
          <div class="permission-presets">
            <button type="button" class="preset-btn" @click="applyFullAccess">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v20M2 12h20" />
              </svg>
              全部權限
            </button>
            <button type="button" class="preset-btn" @click="applyReadOnly">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
              </svg>
              僅檢視
            </button>
            <button type="button" class="preset-btn" @click="clearAllPermissions">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              </svg>
              清除全部
            </button>
          </div>
        </div>

        <!-- Permission Modules -->
        <div class="permissions-grid">
          <div
            v-for="module in PERMISSION_MODULES"
            :key="module.key"
            class="permission-module"
          >
            <div class="module-header">
              <div class="module-info">
                <label class="checkbox-label">
                  <input
                    type="checkbox"
                    :checked="isModuleFullyEnabled(module.key)"
                    :indeterminate="isModulePartiallyEnabled(module.key)"
                    @change="toggleModuleAll(module.key, ($event.target as HTMLInputElement).checked)"
                  >
                  <span class="module-name">{{ module.label }}</span>
                </label>
                <p class="module-description">{{ module.description }}</p>
              </div>
            </div>

            <div class="module-actions">
              <label
                v-for="action in module.actions"
                :key="action.key"
                class="action-checkbox"
              >
                <input
                  v-model="(form.permissions_config[module.key] as Record<string, boolean>)[action.key]"
                  type="checkbox"
                >
                <span>{{ action.label }}</span>
              </label>
            </div>
          </div>
        </div>
      </section>

      <!-- Actions -->
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" @click="router.back()">
          取消
        </button>
        <button type="submit" class="btn btn-primary btn-large" :disabled="isSubmitting">
          <svg v-if="isSubmitting" class="btn-spinner" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
          {{ isSubmitting ? '建立中...' : '建立職位' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.form-page {
  max-width: 900px;
  margin: 0 auto;
}

/* Header */
.form-page-header {
  margin-bottom: var(--space-xl);
  animation: fadeDown 0.5s var(--ease-out);
}

@keyframes fadeDown {
  from { opacity: 0; transform: translateY(-10px); }
}

.back-btn {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  border: none;
  background: transparent;
  color: var(--color-accent);
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background var(--duration-fast) var(--ease-out);
}

.back-btn:hover {
  background: var(--color-accent-light);
}

/* Hero */
.form-hero {
  text-align: center;
  padding: var(--space-2xl) 0;
  animation: fadeUp 0.6s var(--ease-out) 0.1s backwards;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
}

.hero-icon {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-2xl);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-lg);
}

.hero-icon--purple {
  background: linear-gradient(135deg, #8b5cf6, #a78bfa);
}

/* Form Sections */
.form-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.form-section {
  padding: var(--space-xl);
  animation: fadeUp 0.6s var(--ease-out) backwards;
}

.form-section:nth-child(1) { animation-delay: 0.15s; }
.form-section:nth-child(2) { animation-delay: 0.2s; }

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-xl);
  flex-wrap: wrap;
  gap: var(--space-md);
}

.section-title {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 17px;
  font-weight: 600;
  margin: 0;
}

.section-title svg {
  color: var(--color-accent);
}

/* Permission Presets */
.permission-presets {
  display: flex;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.preset-btn {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all var(--duration-fast) var(--ease-out);
}

.preset-btn:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
  background: var(--color-accent-light);
}

/* Permissions Grid */
.permissions-grid {
  display: grid;
  gap: var(--space-lg);
}

.permission-module {
  padding: var(--space-lg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  transition: all var(--duration-fast) var(--ease-out);
}

.permission-module:hover {
  border-color: var(--color-accent-light);
  background: var(--color-surface-hover);
}

.module-header {
  margin-bottom: var(--space-md);
}

.module-info {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  cursor: pointer;
  user-select: none;
}

.module-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text);
}

.module-description {
  margin: 0;
  padding-left: 28px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.module-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--space-md);
  padding-top: var(--space-md);
  border-top: 1px solid var(--color-border);
}

.action-checkbox {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  font-size: 14px;
  color: var(--color-text-secondary);
  cursor: pointer;
  user-select: none;
}

.action-checkbox input:checked + span {
  color: var(--color-accent);
  font-weight: 500;
}

/* Form Actions */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
  padding-top: var(--space-lg);
  animation: fadeUp 0.6s var(--ease-out) 0.3s backwards;
}

/* Responsive */
@media (max-width: 768px) {
  .section-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .permission-presets {
    width: 100%;
  }

  .preset-btn {
    flex: 1;
  }

  .module-actions {
    grid-template-columns: 1fr;
  }

  .form-actions {
    flex-direction: column-reverse;
  }

  .form-actions .btn {
    width: 100%;
  }
}
</style>
