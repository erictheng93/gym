<script setup lang="ts">
/**
 * Branding Settings Page
 * 品牌設定頁面 - 管理 Launch Screen 品牌配置
 */

definePageMeta({
  middleware: 'auth'
})

const config = useRuntimeConfig()
const toast = useToast()

// Loading states
const isLoading = ref(true)
const isSaving = ref(false)

// Branding form
const form = ref({
  brandName: 'GymNexus',
  appSuffix: {
    admin: '',
    member: '',
    coach: 'Coach'
  },
  colors: {
    admin: { start: '#0a84ff', end: '#5e5ce6' },
    member: { start: '#30d158', end: '#34c759' },
    coach: { start: '#007AFF', end: '#5856D6' }
  }
})

// Preview theme state
const previewTheme = ref<'light' | 'dark'>('dark')

// Fetch current branding on mount
onMounted(async () => {
  try {
    const response = await fetch(`${config.public.apiUrl}/tenant/settings/branding`, {
      credentials: 'include'
    })

    if (response.ok) {
      const data = await response.json()
      if (data.success && data.data) {
        // Merge fetched data with defaults
        form.value = {
          brandName: data.data.brandName || 'GymNexus',
          appSuffix: {
            admin: data.data.appSuffix?.admin ?? '',
            member: data.data.appSuffix?.member ?? '',
            coach: data.data.appSuffix?.coach ?? 'Coach'
          },
          colors: {
            admin: {
              start: data.data.colors?.admin?.start || '#0a84ff',
              end: data.data.colors?.admin?.end || '#5e5ce6'
            },
            member: {
              start: data.data.colors?.member?.start || '#30d158',
              end: data.data.colors?.member?.end || '#34c759'
            },
            coach: {
              start: data.data.colors?.coach?.start || '#007AFF',
              end: data.data.colors?.coach?.end || '#5856D6'
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to fetch branding:', error)
    toast.error('載入品牌設定失敗')
  } finally {
    isLoading.value = false
  }
})

// Save branding
async function handleSave() {
  isSaving.value = true

  try {
    const response = await fetch(`${config.public.apiUrl}/tenant/settings`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({
        branding: form.value
      })
    })

    const data = await response.json()

    if (data.success) {
      toast.success('品牌設定已儲存')
    } else {
      toast.error(data.error || '儲存失敗')
    }
  } catch (error) {
    console.error('Failed to save branding:', error)
    toast.error('儲存失敗，請稍後再試')
  } finally {
    isSaving.value = false
  }
}

// Reset to defaults
function handleReset() {
  form.value = {
    brandName: 'GymNexus',
    appSuffix: {
      admin: '',
      member: '',
      coach: 'Coach'
    },
    colors: {
      admin: { start: '#0a84ff', end: '#5e5ce6' },
      member: { start: '#30d158', end: '#34c759' },
      coach: { start: '#007AFF', end: '#5856D6' }
    }
  }
  toast.info('已重置為預設值')
}

// Color presets
const colorPresets = [
  '#0a84ff', // Apple Blue
  '#30d158', // Apple Green
  '#ff9500', // Apple Orange
  '#ff375f', // Apple Pink
  '#5e5ce6', // Apple Purple
  '#64d2ff', // Apple Teal
  '#007AFF', // iOS Blue
  '#5856D6', // iOS Purple
]
</script>

<template>
  <div class="branding-page">
    <!-- Header -->
    <header class="page-header">
      <div class="header-content">
        <h1>品牌設定</h1>
        <p class="header-description">自訂 Launch Screen 的品牌名稱和顏色</p>
      </div>
      <div class="header-actions">
        <button class="btn btn-secondary" :disabled="isSaving" @click="handleReset">
          重置預設
        </button>
        <button class="btn btn-primary" :disabled="isSaving || isLoading" @click="handleSave">
          <span v-if="isSaving" class="spinner-sm" />
          {{ isSaving ? '儲存中...' : '儲存變更' }}
        </button>
      </div>
    </header>

    <!-- Loading state -->
    <div v-if="isLoading" class="loading-container">
      <div class="spinner" />
      <p>載入中...</p>
    </div>

    <!-- Main content -->
    <div v-else class="branding-content">
      <!-- Settings form -->
      <div class="settings-panel">
        <!-- Brand Name -->
        <section class="settings-section">
          <div class="section-header">
            <div class="section-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <path d="M4 7V4h16v3" />
                <path d="M9 20h6" />
                <path d="M12 4v16" />
              </svg>
            </div>
            <div>
              <h2 class="section-title">品牌名稱</h2>
              <p class="section-description">顯示在 Launch Screen 的主要名稱</p>
            </div>
          </div>

          <div class="form-grid">
            <FormInput
              v-model="form.brandName"
              label="品牌名稱"
              placeholder="GymNexus"
              :maxlength="50"
              required
            />
          </div>
        </section>

        <!-- App Suffixes -->
        <section class="settings-section">
          <div class="section-header">
            <div class="section-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <rect width="7" height="7" x="3" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="3" rx="1" />
                <rect width="7" height="7" x="14" y="14" rx="1" />
                <rect width="7" height="7" x="3" y="14" rx="1" />
              </svg>
            </div>
            <div>
              <h2 class="section-title">應用程式後綴</h2>
              <p class="section-description">各應用程式的名稱後綴（可留空）</p>
            </div>
          </div>

          <div class="form-grid form-grid-3">
            <FormInput
              v-model="form.appSuffix.admin"
              label="Admin Web 後綴"
              placeholder="留空"
              :maxlength="20"
            />
            <FormInput
              v-model="form.appSuffix.member"
              label="Member App 後綴"
              placeholder="留空"
              :maxlength="20"
            />
            <FormInput
              v-model="form.appSuffix.coach"
              label="Coach App 後綴"
              placeholder="Coach"
              :maxlength="20"
            />
          </div>
        </section>

        <!-- Colors -->
        <section class="settings-section">
          <div class="section-header">
            <div class="section-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <circle cx="13.5" cy="6.5" r="0.5" fill="currentColor" />
                <circle cx="17.5" cy="10.5" r="0.5" fill="currentColor" />
                <circle cx="8.5" cy="7.5" r="0.5" fill="currentColor" />
                <circle cx="6.5" cy="12.5" r="0.5" fill="currentColor" />
                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z" />
              </svg>
            </div>
            <div>
              <h2 class="section-title">漸層顏色</h2>
              <p class="section-description">各應用程式 Logo 的漸層顏色</p>
            </div>
          </div>

          <!-- Admin Colors -->
          <div class="color-group">
            <h3 class="color-group-title">Admin Web</h3>
            <div class="form-grid form-grid-2">
              <FormColorPicker
                v-model="form.colors.admin.start"
                label="起始色"
                :presets="colorPresets"
              />
              <FormColorPicker
                v-model="form.colors.admin.end"
                label="結束色"
                :presets="colorPresets"
              />
            </div>
          </div>

          <!-- Member Colors -->
          <div class="color-group">
            <h3 class="color-group-title">Member App</h3>
            <div class="form-grid form-grid-2">
              <FormColorPicker
                v-model="form.colors.member.start"
                label="起始色"
                :presets="colorPresets"
              />
              <FormColorPicker
                v-model="form.colors.member.end"
                label="結束色"
                :presets="colorPresets"
              />
            </div>
          </div>

          <!-- Coach Colors -->
          <div class="color-group">
            <h3 class="color-group-title">Coach App</h3>
            <div class="form-grid form-grid-2">
              <FormColorPicker
                v-model="form.colors.coach.start"
                label="起始色"
                :presets="colorPresets"
              />
              <FormColorPicker
                v-model="form.colors.coach.end"
                label="結束色"
                :presets="colorPresets"
              />
            </div>
          </div>
        </section>
      </div>

      <!-- Preview panel -->
      <div class="preview-panel">
        <div class="preview-header">
          <h3>預覽</h3>
          <div class="theme-toggle">
            <button
              class="theme-btn"
              :class="{ active: previewTheme === 'light' }"
              @click="previewTheme = 'light'"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            </button>
            <button
              class="theme-btn"
              :class="{ active: previewTheme === 'dark' }"
              @click="previewTheme = 'dark'"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            </button>
          </div>
        </div>

        <div class="preview-grid">
          <LaunchScreenPreview
            :brand-name="form.brandName"
            :suffix="form.appSuffix.admin"
            :colors="form.colors.admin"
            :theme="previewTheme"
            app-label="Admin Web"
          />
          <LaunchScreenPreview
            :brand-name="form.brandName"
            :suffix="form.appSuffix.member"
            :colors="form.colors.member"
            :theme="previewTheme"
            app-label="Member App"
          />
          <LaunchScreenPreview
            :brand-name="form.brandName"
            :suffix="form.appSuffix.coach"
            :colors="form.colors.coach"
            :theme="previewTheme"
            app-label="Coach App"
          />
        </div>

        <div class="preview-note">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          <span>儲存後需重新載入頁面才能看到實際效果</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.branding-page {
  padding: var(--space-lg);
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: var(--space-xl);
}

.header-content {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.header-content h1 {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}

.header-description {
  margin: 0;
  color: var(--color-text-secondary);
}

.header-actions {
  display: flex;
  gap: var(--space-sm);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-lg);
  border: none;
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) ease;
}

.btn-primary {
  background: var(--color-accent);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  opacity: 0.9;
}

.btn-secondary {
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  border: 1px solid var(--color-border);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--color-bg-tertiary);
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.spinner-sm {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl);
  color: var(--color-text-secondary);
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: var(--space-md);
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.branding-content {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: var(--space-xl);
  align-items: start;
}

.settings-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

.settings-section {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
}

.section-header {
  display: flex;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
  padding-bottom: var(--space-md);
  border-bottom: 1px solid var(--color-border);
}

.section-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--color-accent-light);
  color: var(--color-accent);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.section-title {
  margin: 0 0 2px;
  font-size: 1rem;
  font-weight: 600;
}

.section-description {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

.form-grid {
  display: grid;
  gap: var(--space-md);
}

.form-grid-2 {
  grid-template-columns: repeat(2, 1fr);
}

.form-grid-3 {
  grid-template-columns: repeat(3, 1fr);
}

.color-group {
  margin-top: var(--space-lg);
  padding-top: var(--space-lg);
  border-top: 1px solid var(--color-border);
}

.color-group:first-of-type {
  margin-top: 0;
  padding-top: 0;
  border-top: none;
}

.color-group-title {
  margin: 0 0 var(--space-md);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-secondary);
}

.preview-panel {
  position: sticky;
  top: var(--space-lg);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-lg);
}

.preview-header h3 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.theme-toggle {
  display: flex;
  gap: var(--space-xs);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  padding: 2px;
}

.theme-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: calc(var(--radius-md) - 2px);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--duration-fast) ease;
}

.theme-btn:hover {
  color: var(--color-text-primary);
}

.theme-btn.active {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.preview-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-md);
  justify-items: center;
}

.preview-note {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  margin-top: var(--space-lg);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-md);
  font-size: 0.75rem;
  color: var(--color-text-secondary);
}

@media (max-width: 1200px) {
  .branding-content {
    grid-template-columns: 1fr;
  }

  .preview-panel {
    position: static;
  }

  .preview-grid {
    grid-template-columns: repeat(3, 1fr);
    max-width: 700px;
    margin: 0 auto;
  }
}

@media (max-width: 768px) {
  .branding-page {
    padding: var(--space-md);
  }

  .page-header {
    flex-direction: column;
    gap: var(--space-md);
  }

  .header-actions {
    width: 100%;
  }

  .header-actions .btn {
    flex: 1;
  }

  .form-grid-2,
  .form-grid-3 {
    grid-template-columns: 1fr;
  }

  .preview-grid {
    grid-template-columns: 1fr;
    max-width: 200px;
  }
}
</style>
