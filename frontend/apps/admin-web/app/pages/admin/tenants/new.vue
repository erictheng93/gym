<script setup lang="ts">
/**
 * Create Tenant Page
 * 创建租户页面
 */

definePageMeta({
  middleware: 'auth'
})

const router = useRouter()
const config = useRuntimeConfig()
const apiBaseUrl = config.public?.apiBaseUrl || 'http://localhost:8056'

const isLoading = ref(false)
const form = ref({
  name: '',
  slug: '',
  email: '',
  phone: '',
  plan_type: 'starter' as 'starter' | 'professional' | 'enterprise' | 'custom',
  billing_cycle: 'monthly' as 'monthly' | 'yearly',
  max_members: 100,
  max_employees: 10,
  max_branches: 1,
  trial_days: 14
})

const errors = ref<Record<string, string>>({})

// Plan configurations
const planConfigs = {
  starter: {
    label: '入门版',
    max_members: 100,
    max_employees: 10,
    max_branches: 1,
    features: ['基础会员管理', '课程预约', '考勤打卡', '简单报表']
  },
  professional: {
    label: '专业版',
    max_members: 500,
    max_employees: 30,
    max_branches: 3,
    features: ['高级会员管理', '课程预约', '考勤打卡', '详细报表', '电子合约', '自动提醒']
  },
  enterprise: {
    label: '企业版',
    max_members: 2000,
    max_employees: 100,
    max_branches: 10,
    features: ['企业级管理', '多分店管理', 'API 访问', '自定义报表', '高级权限控制', '优先支持']
  },
  custom: {
    label: '自订版',
    max_members: 0,
    max_employees: 0,
    max_branches: 0,
    features: ['自定义配额', '定制化功能', '专属支持']
  }
}

// Auto-generate slug from name
watch(() => form.value.name, (newName) => {
  if (!form.value.slug || form.value.slug === '') {
    form.value.slug = newName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
  }
})

// Update quotas when plan changes
watch(() => form.value.plan_type, (newPlan) => {
  if (newPlan !== 'custom') {
    const config = planConfigs[newPlan]
    form.value.max_members = config.max_members
    form.value.max_employees = config.max_employees
    form.value.max_branches = config.max_branches
  }
})

// Validate form
const validateForm = () => {
  errors.value = {}

  if (!form.value.name.trim()) {
    errors.value.name = '请输入租户名称'
  }

  if (!form.value.slug.trim()) {
    errors.value.slug = '请输入租户标识符'
  } else if (!/^[a-z0-9-]+$/.test(form.value.slug)) {
    errors.value.slug = '标识符只能包含小写字母、数字和连字符'
  }

  if (!form.value.email.trim()) {
    errors.value.email = '请输入电子邮件'
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.value.email)) {
    errors.value.email = '请输入有效的电子邮件地址'
  }

  if (form.value.max_members <= 0) {
    errors.value.max_members = '会员配额必须大于 0'
  }

  if (form.value.max_employees <= 0) {
    errors.value.max_employees = '员工配额必须大于 0'
  }

  if (form.value.max_branches <= 0) {
    errors.value.max_branches = '分店配额必须大于 0'
  }

  return Object.keys(errors.value).length === 0
}

// Submit form
const handleSubmit = async () => {
  if (!validateForm()) {
    useToast().error('请修正表单错误')
    return
  }

  isLoading.value = true
  try {
    const response = await fetch(`${apiBaseUrl}/api/admin/tenants`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(form.value),
    })

    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.message || `HTTP ${response.status}`)
    }

    const result = await response.json()

    if (result.success) {
      useToast().success('租户创建成功')
      router.push('/admin/tenants')
    } else {
      useToast().error(result.message || '创建租户失败')
    }
  } catch (error: any) {
    console.error('Failed to create tenant:', error)
    useToast().error(error.message || '创建租户时发生错误')
  } finally {
    isLoading.value = false
  }
}

// Cancel and go back
const handleCancel = () => {
  router.back()
}
</script>

<template>
  <div class="create-tenant">
    <!-- Header -->
    <header class="page-header">
      <button class="back-btn" @click="handleCancel">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m15 18-6-6 6-6" />
        </svg>
        返回列表
      </button>
      <div class="header-content">
        <h1 class="text-headline">创建新租户</h1>
        <p class="text-body text-secondary">设置新租户的基本信息和配额限制</p>
      </div>
    </header>

    <!-- Form -->
    <form class="form-container" @submit.prevent="handleSubmit">
      <!-- Basic Information -->
      <section class="form-section">
        <h2 class="section-title">基本信息</h2>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label required">租户名称</label>
            <input
              v-model="form.name"
              type="text"
              class="form-input"
              :class="{ error: errors.name }"
              placeholder="例如：健身中心"
            />
            <span v-if="errors.name" class="form-error">{{ errors.name }}</span>
          </div>

          <div class="form-group">
            <label class="form-label required">租户标识符（Slug）</label>
            <input
              v-model="form.slug"
              type="text"
              class="form-input"
              :class="{ error: errors.slug }"
              placeholder="例如：gym-center"
            />
            <span v-if="errors.slug" class="form-error">{{ errors.slug }}</span>
            <span class="form-hint">用于生成租户专属域名</span>
          </div>

          <div class="form-group">
            <label class="form-label required">电子邮件</label>
            <input
              v-model="form.email"
              type="email"
              class="form-input"
              :class="{ error: errors.email }"
              placeholder="admin@example.com"
            />
            <span v-if="errors.email" class="form-error">{{ errors.email }}</span>
          </div>

          <div class="form-group">
            <label class="form-label">电话</label>
            <input
              v-model="form.phone"
              type="tel"
              class="form-input"
              placeholder="02-1234-5678"
            />
          </div>
        </div>
      </section>

      <!-- Plan Selection -->
      <section class="form-section">
        <h2 class="section-title">套餐选择</h2>
        <div class="plan-grid">
          <div
            v-for="(config, key) in planConfigs"
            :key="key"
            class="plan-card"
            :class="{ selected: form.plan_type === key }"
            @click="form.plan_type = key as any"
          >
            <div class="plan-header">
              <div class="plan-radio">
                <input
                  :id="`plan-${key}`"
                  type="radio"
                  :value="key"
                  :checked="form.plan_type === key"
                  name="plan_type"
                />
              </div>
              <h3 class="plan-name">{{ config.label }}</h3>
            </div>
            <div v-if="key !== 'custom'" class="plan-limits">
              <div class="plan-limit">
                <span class="limit-label">会员数：</span>
                <span class="limit-value">{{ config.max_members }}</span>
              </div>
              <div class="plan-limit">
                <span class="limit-label">员工数：</span>
                <span class="limit-value">{{ config.max_employees }}</span>
              </div>
              <div class="plan-limit">
                <span class="limit-label">分店数：</span>
                <span class="limit-value">{{ config.max_branches }}</span>
              </div>
            </div>
            <ul class="plan-features">
              <li v-for="feature in config.features" :key="feature">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {{ feature }}
              </li>
            </ul>
          </div>
        </div>
      </section>

      <!-- Quota Configuration -->
      <section v-if="form.plan_type === 'custom'" class="form-section">
        <h2 class="section-title">自定义配额</h2>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label required">最大会员数</label>
            <input
              v-model.number="form.max_members"
              type="number"
              class="form-input"
              :class="{ error: errors.max_members }"
              min="1"
            />
            <span v-if="errors.max_members" class="form-error">{{ errors.max_members }}</span>
          </div>

          <div class="form-group">
            <label class="form-label required">最大员工数</label>
            <input
              v-model.number="form.max_employees"
              type="number"
              class="form-input"
              :class="{ error: errors.max_employees }"
              min="1"
            />
            <span v-if="errors.max_employees" class="form-error">{{ errors.max_employees }}</span>
          </div>

          <div class="form-group">
            <label class="form-label required">最大分店数</label>
            <input
              v-model.number="form.max_branches"
              type="number"
              class="form-input"
              :class="{ error: errors.max_branches }"
              min="1"
            />
            <span v-if="errors.max_branches" class="form-error">{{ errors.max_branches }}</span>
          </div>
        </div>
      </section>

      <!-- Billing & Trial -->
      <section class="form-section">
        <h2 class="section-title">计费设置</h2>
        <div class="form-grid">
          <div class="form-group">
            <label class="form-label">计费周期</label>
            <select v-model="form.billing_cycle" class="form-select">
              <option value="monthly">月付</option>
              <option value="yearly">年付</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label">试用期（天数）</label>
            <input
              v-model.number="form.trial_days"
              type="number"
              class="form-input"
              min="0"
              max="90"
            />
            <span class="form-hint">设置为 0 则不启用试用期</span>
          </div>
        </div>
      </section>

      <!-- Actions -->
      <div class="form-actions">
        <button type="button" class="btn-secondary" :disabled="isLoading" @click="handleCancel">
          取消
        </button>
        <button type="submit" class="btn-primary" :disabled="isLoading">
          <div v-if="isLoading" class="spinner-sm" />
          {{ isLoading ? '创建中...' : '创建租户' }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.create-tenant {
  max-width: 1000px;
  margin: 0 auto;
}

/* Header */
.page-header {
  margin-bottom: var(--space-2xl);
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
  margin-bottom: var(--space-md);
}

.back-btn:hover {
  background: var(--color-accent-light);
}

.header-content h1 {
  margin: 0 0 var(--space-xs);
}

.header-content p {
  margin: 0;
}

/* Form */
.form-container {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xl);
}

.form-section {
  background: var(--color-bg-glass);
  backdrop-filter: blur(var(--blur-heavy));
  border: 0.5px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-xl);
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 var(--space-lg);
  color: var(--color-text-primary);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: var(--space-lg);
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.form-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-secondary);
}

.form-label.required::after {
  content: ' *';
  color: #ff3b30;
}

.form-input,
.form-select {
  padding: 12px 16px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  font-size: 15px;
  transition: all var(--duration-fast) var(--ease-out);
}

.form-input:focus,
.form-select:focus {
  outline: none;
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
}

.form-input.error {
  border-color: #ff3b30;
}

.form-error {
  font-size: 13px;
  color: #ff3b30;
  margin-top: 4px;
}

.form-hint {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin-top: 4px;
}

/* Plan Cards */
.plan-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-lg);
}

.plan-card {
  border: 2px solid var(--color-border);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.plan-card:hover {
  border-color: var(--color-accent);
  background: var(--color-bg-tertiary);
}

.plan-card.selected {
  border-color: var(--color-accent);
  background: rgba(0, 122, 255, 0.05);
}

.plan-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  margin-bottom: var(--space-md);
}

.plan-radio input {
  cursor: pointer;
}

.plan-name {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  color: var(--color-text-primary);
}

.plan-limits {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-bottom: var(--space-md);
  padding: var(--space-sm);
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-sm);
}

.plan-limit {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}

.limit-label {
  color: var(--color-text-secondary);
}

.limit-value {
  font-weight: 600;
  color: var(--color-text-primary);
}

.plan-features {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.plan-features li {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  font-size: 13px;
  color: var(--color-text-secondary);
}

.plan-features li svg {
  color: #34c759;
  flex-shrink: 0;
}

/* Actions */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-md);
  padding-top: var(--space-xl);
}

.btn-primary,
.btn-secondary {
  padding: 12px 24px;
  border-radius: var(--radius-md);
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  border: none;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.btn-primary {
  background: linear-gradient(180deg, #0077ed 0%, #0071e3 100%);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 113, 227, 0.3);
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-secondary {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.btn-secondary:hover:not(:disabled) {
  background: var(--color-border);
}

.spinner-sm {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
