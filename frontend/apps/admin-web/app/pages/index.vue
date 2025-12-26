<script setup lang="ts">
import { aggregate, readItems } from '@directus/sdk'
import { MESSAGES, PAGES, STATUS } from '~/constants'

definePageMeta({
  middleware: 'auth'
})

const directus = useDirectus()
const { user } = useAuth()

// Stats
const stats = ref({
  members: { total: 0, active: 0, new: 0 },
  contracts: { active: 0, expiring: 0, draft: 0 },
  revenue: { today: 0, month: 0 }
})

const recentMembers = ref<any[]>([])
const recentContracts = ref<any[]>([])
const isLoading = ref(true)

// Greeting based on time
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return MESSAGES.GREETING.MORNING
  if (hour < 18) return MESSAGES.GREETING.AFTERNOON
  return MESSAGES.GREETING.EVENING
})

const userName = computed(() => {
  if (user.value?.first_name) return user.value.first_name
  return user.value?.email?.split('@')[0] || ''
})

// Fetch dashboard data
const fetchDashboardData = async () => {
  isLoading.value = true
  try {
    const [
      totalMembers,
      activeMembers,
      newMembers,
      activeContracts,
      draftContracts,
      members,
      contracts
    ] = await Promise.all([
      directus.request(aggregate('members', { aggregate: { count: '*' } })),
      directus.request(aggregate('members', { aggregate: { count: '*' }, query: { filter: { member_status: { _eq: 'ACTIVE' } } } })),
      directus.request(aggregate('members', { aggregate: { count: '*' }, query: { filter: { date_created: { _gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() } } } })),
      directus.request(aggregate('contracts', { aggregate: { count: '*' }, query: { filter: { contract_status: { _eq: 'ACTIVE' } } } })),
      directus.request(aggregate('contracts', { aggregate: { count: '*' }, query: { filter: { contract_status: { _eq: 'DRAFT' } } } })),
      directus.request(readItems('members', { limit: 5, sort: ['-date_created'], fields: ['id', 'full_name', 'member_code', 'member_status', 'date_created'] })),
      directus.request(readItems('contracts', { limit: 5, sort: ['-date_created'], fields: ['id', 'contract_no', 'contract_status', 'total_amount', 'date_created', 'member.full_name'] }))
    ])

    stats.value = {
      members: {
        total: Number(totalMembers[0]?.count) || 0,
        active: Number(activeMembers[0]?.count) || 0,
        new: Number(newMembers[0]?.count) || 0
      },
      contracts: {
        active: Number(activeContracts[0]?.count) || 0,
        draft: Number(draftContracts[0]?.count) || 0,
        expiring: 0
      },
      revenue: { today: 0, month: 0 }
    }

    recentMembers.value = members as any[]
    recentContracts.value = contracts as any[]
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error)
    useToast().error(MESSAGES.ERRORS.DASHBOARD_LOAD_FAILED)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchDashboardData()
})

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString('zh-TW', {
    month: 'short',
    day: 'numeric'
  })
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0
  }).format(amount)
}

const getStatusBadge = (status: string) => {
  const map: Record<string, { label: string; class: string }> = {
    ACTIVE: { label: STATUS.CONTRACT.ACTIVE, class: 'badge-success' },
    EXPIRED: { label: STATUS.CONTRACT.EXPIRED, class: 'badge-error' },
    SUSPENDED: { label: STATUS.CONTRACT.PAUSED, class: 'badge-warning' },
    DRAFT: { label: STATUS.CONTRACT.DRAFT, class: '' },
    PAUSED: { label: STATUS.CONTRACT.PAUSED, class: 'badge-warning' }
  }
  return map[status] || { label: status, class: '' }
}
</script>

<template>
  <div class="dashboard">
    <!-- Header -->
    <header class="dashboard-header">
      <div class="header-content">
        <h1 class="text-display">{{ greeting }}，{{ userName }}</h1>
        <p class="text-title-3 text-secondary">{{ PAGES.DASHBOARD.WELCOME }}</p>
      </div>
      <div class="header-date">
        <p class="text-callout text-tertiary">{{ new Date().toLocaleDateString('zh-TW', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) }}</p>
      </div>
    </header>

    <!-- Stats Grid -->
    <section class="stats-section">
      <div class="stats-grid">
        <!-- Members Card -->
        <div class="stat-card card">
          <div class="stat-header">
            <div class="stat-icon members">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <span class="stat-label text-subhead text-secondary">{{ PAGES.DASHBOARD.TOTAL_MEMBERS }}</span>
          </div>
          <div class="stat-value text-display">{{ stats.members.total }}</div>
          <div class="stat-footer">
            <span class="stat-change positive">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="m5 12 7-7 7 7"/>
                <path d="M12 19V5"/>
              </svg>
              +{{ stats.members.new }}
            </span>
            <span class="text-caption text-tertiary">{{ PAGES.DASHBOARD.NEW_THIS_WEEK }}</span>
          </div>
        </div>

        <!-- Active Members Card -->
        <div class="stat-card card">
          <div class="stat-header">
            <div class="stat-icon active">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <path d="m9 11 3 3L22 4"/>
              </svg>
            </div>
            <span class="stat-label text-subhead text-secondary">{{ PAGES.DASHBOARD.ACTIVE_MEMBERS }}</span>
          </div>
          <div class="stat-value text-display">{{ stats.members.active }}</div>
          <div class="stat-footer">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: stats.members.total ? `${(stats.members.active / stats.members.total * 100)}%` : '0%' }" />
            </div>
            <span class="text-caption text-tertiary">{{ stats.members.total ? Math.round(stats.members.active / stats.members.total * 100) : 0 }}{{ PAGES.DASHBOARD.ACTIVE_RATE }}</span>
          </div>
        </div>

        <!-- Contracts Card -->
        <div class="stat-card card">
          <div class="stat-header">
            <div class="stat-icon contracts">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
                <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
              </svg>
            </div>
            <span class="stat-label text-subhead text-secondary">{{ PAGES.DASHBOARD.ACTIVE_CONTRACTS }}</span>
          </div>
          <div class="stat-value text-display">{{ stats.contracts.active }}</div>
          <div class="stat-footer">
            <span class="badge">{{ stats.contracts.draft }} {{ PAGES.DASHBOARD.PENDING_SIGN }}</span>
          </div>
        </div>

        <!-- Revenue Card -->
        <div class="stat-card card">
          <div class="stat-header">
            <div class="stat-icon revenue">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
            </div>
            <span class="stat-label text-subhead text-secondary">{{ PAGES.DASHBOARD.MONTHLY_REVENUE }}</span>
          </div>
          <div class="stat-value text-display">{{ formatCurrency(stats.revenue.month) }}</div>
          <div class="stat-footer">
            <span class="text-caption text-tertiary">{{ MESSAGES.TIME.TODAY }}：{{ formatCurrency(stats.revenue.today) }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Content Grid -->
    <section class="content-section">
      <div class="content-grid">
        <!-- Recent Members -->
        <div class="content-card card">
          <div class="card-header">
            <h2 class="text-title-3">{{ PAGES.DASHBOARD.RECENT_MEMBERS }}</h2>
            <NuxtLink to="/members" class="btn btn-ghost btn-small">{{ MESSAGES.ACTIONS.VIEW_ALL }}</NuxtLink>
          </div>
          <div class="card-body">
            <div v-if="isLoading" class="loading-state">
              <div class="loading-spinner-large" />
            </div>
            <div v-else-if="recentMembers.length === 0" class="empty-state">
              <p class="text-secondary">{{ PAGES.MEMBERS.NO_MEMBERS }}</p>
            </div>
            <ul v-else class="member-list">
              <li v-for="(member, index) in recentMembers" :key="member.id" class="member-item stagger-item" :style="{ animationDelay: `${index * 0.1}s` }">
                <div class="member-avatar">{{ member.full_name[0] }}</div>
                <div class="member-info">
                  <p class="member-name">{{ member.full_name }}</p>
                  <p class="member-code text-caption text-tertiary">{{ member.member_code }}</p>
                </div>
                <div class="member-meta">
                  <span :class="['badge', getStatusBadge(member.member_status).class]">
                    {{ getStatusBadge(member.member_status).label }}
                  </span>
                  <span class="text-caption text-tertiary">{{ formatDate(member.date_created) }}</span>
                </div>
              </li>
            </ul>
          </div>
        </div>

        <!-- Recent Contracts -->
        <div class="content-card card">
          <div class="card-header">
            <h2 class="text-title-3">{{ PAGES.DASHBOARD.RECENT_CONTRACTS }}</h2>
            <NuxtLink to="/contracts" class="btn btn-ghost btn-small">{{ MESSAGES.ACTIONS.VIEW_ALL }}</NuxtLink>
          </div>
          <div class="card-body">
            <div v-if="isLoading" class="loading-state">
              <div class="loading-spinner-large" />
            </div>
            <div v-else-if="recentContracts.length === 0" class="empty-state">
              <p class="text-secondary">{{ PAGES.CONTRACTS.NO_CONTRACTS }}</p>
            </div>
            <ul v-else class="contract-list">
              <li v-for="(contract, index) in recentContracts" :key="contract.id" class="contract-item stagger-item" :style="{ animationDelay: `${index * 0.1}s` }">
                <div class="contract-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/>
                    <path d="M14 2v4a2 2 0 0 0 2 2h4"/>
                  </svg>
                </div>
                <div class="contract-info">
                  <p class="contract-no">{{ contract.contract_no }}</p>
                  <p class="contract-member text-caption text-tertiary">{{ contract.member?.full_name || '—' }}</p>
                </div>
                <div class="contract-meta">
                  <span :class="['badge', getStatusBadge(contract.contract_status).class]">
                    {{ getStatusBadge(contract.contract_status).label }}
                  </span>
                  <span class="contract-amount text-body-emphasis">{{ formatCurrency(contract.total_amount) }}</span>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- Quick Actions -->
    <section class="actions-section">
      <h2 class="text-title-3 mb-lg">{{ PAGES.DASHBOARD.QUICK_ACTIONS }}</h2>
      <div class="actions-grid">
        <NuxtLink to="/members/new" class="action-card card card-interactive">
          <div class="action-icon add-member">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <line x1="19" x2="19" y1="8" y2="14"/>
              <line x1="22" x2="16" y1="11" y2="11"/>
            </svg>
          </div>
          <span class="action-label">{{ PAGES.DASHBOARD.ADD_MEMBER }}</span>
        </NuxtLink>

        <NuxtLink to="/contracts/new" class="action-card card card-interactive">
          <div class="action-icon add-contract">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <path d="M14 2v6h6"/>
              <line x1="12" y1="18" x2="12" y2="12"/>
              <line x1="9" y1="15" x2="15" y2="15"/>
            </svg>
          </div>
          <span class="action-label">{{ PAGES.DASHBOARD.ADD_CONTRACT }}</span>
        </NuxtLink>

        <NuxtLink to="/checkin" class="action-card card card-interactive">
          <div class="action-icon checkin">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <path d="m9 11 3 3L22 4"/>
            </svg>
          </div>
          <span class="action-label">{{ MESSAGES.NAV.CHECKIN }}</span>
        </NuxtLink>

        <NuxtLink to="/reports" class="action-card card card-interactive">
          <div class="action-icon reports">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 3v16a2 2 0 0 0 2 2h16"/>
              <path d="m19 9-5 5-4-4-3 3"/>
            </svg>
          </div>
          <span class="action-label">{{ MESSAGES.NAV.REPORTS }}</span>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.dashboard {
  max-width: 1400px;
  margin: 0 auto;
}

/* Header */
.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: var(--space-2xl);
  animation: headerAppear 0.8s var(--ease-out) backwards;
}

@keyframes headerAppear {
  from {
    opacity: 0;
    transform: translateY(-20px);
  }
}

.header-content h1 {
  margin-bottom: var(--space-sm);
}

/* Stats Section */
.stats-section {
  margin-bottom: var(--space-2xl);
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-lg);
}

.stat-card {
  padding: var(--space-xl);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  animation: statAppear 0.6s var(--ease-out) backwards;
}

.stat-card:nth-child(1) { animation-delay: 0.1s; }
.stat-card:nth-child(2) { animation-delay: 0.2s; }
.stat-card:nth-child(3) { animation-delay: 0.3s; }
.stat-card:nth-child(4) { animation-delay: 0.4s; }

@keyframes statAppear {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.95);
  }
}

.stat-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
}

.stat-icon.members {
  background: rgba(0, 113, 227, 0.1);
  color: #0071e3;
}

.stat-icon.active {
  background: rgba(52, 199, 89, 0.1);
  color: #34c759;
}

.stat-icon.contracts {
  background: rgba(88, 86, 214, 0.1);
  color: #5856d6;
}

.stat-icon.revenue {
  background: rgba(255, 159, 10, 0.1);
  color: #ff9f0a;
}

.stat-value {
  font-size: 48px;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1;
}

.stat-footer {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.stat-change {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 500;
}

.stat-change.positive {
  color: var(--color-success);
}

.stat-change.negative {
  color: var(--color-error);
}

.progress-bar {
  flex: 1;
  height: 4px;
  background: var(--color-bg-tertiary);
  border-radius: var(--radius-full);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-success);
  border-radius: var(--radius-full);
  transition: width 1s var(--ease-out);
}

/* Content Section */
.content-section {
  margin-bottom: var(--space-2xl);
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-lg);
}

.content-card {
  animation: contentAppear 0.6s var(--ease-out) backwards;
  animation-delay: 0.5s;
}

.content-card:nth-child(2) {
  animation-delay: 0.6s;
}

@keyframes contentAppear {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-lg) var(--space-xl);
  border-bottom: 1px solid var(--color-divider);
}

.card-body {
  padding: var(--space-md);
}

.loading-state,
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-2xl);
}

.loading-spinner-large {
  width: 32px;
  height: 32px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* Member List */
.member-list,
.contract-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.member-item,
.contract-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  border-radius: var(--radius-md);
  transition: background var(--duration-fast) var(--ease-out);
}

.member-item:hover,
.contract-item:hover {
  background: var(--color-bg-tertiary);
}

.member-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, #0071e3, #5856d6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: 600;
  flex-shrink: 0;
}

.contract-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.member-info,
.contract-info {
  flex: 1;
  min-width: 0;
}

.member-name,
.contract-no {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-primary);
  margin: 0;
}

.member-code,
.contract-member {
  margin: 0;
}

.member-meta,
.contract-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-xs);
}

.contract-amount {
  color: var(--color-text-primary);
}

/* Actions Section */
.actions-section {
  animation: actionsAppear 0.6s var(--ease-out) backwards;
  animation-delay: 0.7s;
}

@keyframes actionsAppear {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-lg);
}

.action-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-xl);
  text-decoration: none;
  color: var(--color-text-primary);
}

.action-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--duration-normal) var(--ease-spring);
}

.action-card:hover .action-icon {
  transform: scale(1.1);
}

.action-icon.add-member {
  background: linear-gradient(135deg, #0071e3, #00c7be);
  color: white;
}

.action-icon.add-contract {
  background: linear-gradient(135deg, #5856d6, #af52de);
  color: white;
}

.action-icon.checkin {
  background: linear-gradient(135deg, #34c759, #30d158);
  color: white;
}

.action-icon.reports {
  background: linear-gradient(135deg, #ff9f0a, #ff375f);
  color: white;
}

.action-label {
  font-size: 15px;
  font-weight: 500;
}

/* Responsive */
@media (max-width: 1200px) {
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .content-grid {
    grid-template-columns: 1fr;
  }

  .actions-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .dashboard-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-md);
  }

  .stats-grid {
    grid-template-columns: 1fr;
  }

  .stat-value {
    font-size: 36px;
  }

  .actions-grid {
    grid-template-columns: 1fr;
  }
}
</style>