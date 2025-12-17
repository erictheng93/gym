<script setup lang="ts">
import { MESSAGES, PAGES, STATUS } from '~/constants'

const { members, fetchMembers } = useMembers()
const searchQuery = ref('')
const selectedMember = ref<any>(null)
const isCheckinSuccess = ref(false)
const recentCheckins = ref<any[]>([])

onMounted(() => {
  fetchMembers()
})

const filteredMembers = computed(() => {
  if (!searchQuery.value) return []
  const query = searchQuery.value.toLowerCase()
  return members.value.filter(m =>
    m.full_name?.toLowerCase().includes(query) ||
    m.member_code?.toLowerCase().includes(query) ||
    m.phone?.includes(query)
  ).slice(0, 5)
})

const selectMember = (member: any) => {
  selectedMember.value = member
  searchQuery.value = ''
}

const performCheckin = async () => {
  if (!selectedMember.value) return

  // Simulate checkin (in real app, would call API)
  const checkin = {
    member: selectedMember.value,
    time: new Date().toISOString(),
    id: Date.now()
  }

  recentCheckins.value.unshift(checkin)
  if (recentCheckins.value.length > 10) {
    recentCheckins.value.pop()
  }

  isCheckinSuccess.value = true
  setTimeout(() => {
    isCheckinSuccess.value = false
    selectedMember.value = null
  }, 2000)
}

const formatTime = (iso: string) => {
  return new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
}

const getMemberStatusClass = (status: string) => {
  const map: Record<string, string> = {
    'ACTIVE': 'active',
    'active': 'active',
    'EXPIRED': 'expired',
    'SUSPENDED': 'suspended',
    'PAUSED': 'paused'
  }
  return map[status] || 'default'
}

const getMemberStatusLabel = (status: string) => {
  const map: Record<string, string> = {
    'ACTIVE': STATUS.MEMBER.ACTIVE,
    'active': STATUS.MEMBER.ACTIVE,
    'EXPIRED': STATUS.MEMBER.EXPIRED,
    'SUSPENDED': STATUS.MEMBER.SUSPENDED,
    'PAUSED': STATUS.MEMBER.PAUSED
  }
  return map[status] || status
}
</script>

<template>
  <div class="checkin-page">
    <!-- Header -->
    <div class="page-header">
      <div class="header-content">
        <h1>{{ MESSAGES.NAV.CHECKIN }}</h1>
        <p>{{ PAGES.CHECKIN.DESCRIPTION }}</p>
      </div>
    </div>

    <div class="checkin-layout">
      <!-- Main Checkin Area -->
      <div class="checkin-main">
        <!-- Success Animation -->
        <div v-if="isCheckinSuccess" class="success-overlay">
          <div class="success-content">
            <div class="success-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h2>{{ MESSAGES.SUCCESS.CHECKIN }}</h2>
            <p>{{ selectedMember?.full_name }}</p>
          </div>
        </div>

        <!-- Search Area -->
        <div v-else class="search-area">
          <div class="search-box">
            <div class="search-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
            </div>
            <input
              v-model="searchQuery"
              type="text"
              :placeholder="PAGES.CHECKIN.SEARCH_PLACEHOLDER"
              class="search-input"
              autofocus
            />
          </div>

          <!-- Search Results -->
          <div v-if="filteredMembers.length > 0" class="search-results">
            <button
              v-for="member in filteredMembers"
              :key="member.id"
              class="member-result"
              @click="selectMember(member)"
            >
              <div class="member-avatar">{{ member.full_name?.[0] }}</div>
              <div class="member-info">
                <span class="member-name">{{ member.full_name }}</span>
                <span class="member-code">{{ member.member_code }}</span>
              </div>
              <span class="member-status" :class="getMemberStatusClass(member.member_status)">
                {{ getMemberStatusLabel(member.member_status) }}
              </span>
            </button>
          </div>

          <!-- Selected Member Preview -->
          <div v-if="selectedMember" class="selected-member">
            <div class="selected-header">
              <div class="selected-avatar">{{ selectedMember.full_name?.[0] }}</div>
              <div class="selected-info">
                <h3>{{ selectedMember.full_name }}</h3>
                <p>{{ selectedMember.member_code }}</p>
              </div>
              <span class="member-status large" :class="getMemberStatusClass(selectedMember.member_status)">
                {{ getMemberStatusLabel(selectedMember.member_status) }}
              </span>
            </div>

            <div class="selected-details">
              <div class="detail-item">
                <span class="label">{{ MESSAGES.FORM.PHONE }}</span>
                <span class="value">{{ selectedMember.phone || '—' }}</span>
              </div>
              <div class="detail-item">
                <span class="label">{{ MESSAGES.FORM.EMAIL }}</span>
                <span class="value">{{ selectedMember.email || '—' }}</span>
              </div>
            </div>

            <div class="checkin-actions">
              <button class="btn-cancel" @click="selectedMember = null">{{ MESSAGES.FORM.CANCEL }}</button>
              <button
                class="btn-checkin"
                @click="performCheckin"
                :disabled="selectedMember.member_status !== 'ACTIVE' && selectedMember.member_status !== 'active'"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                {{ PAGES.CHECKIN.CONFIRM_CHECKIN }}
              </button>
            </div>
          </div>

          <!-- Empty State -->
          <div v-if="!selectedMember && !searchQuery" class="empty-state">
            <div class="scan-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
                <rect width="10" height="10" x="7" y="7" rx="1"/>
              </svg>
            </div>
            <h3>{{ PAGES.CHECKIN.SCAN_OR_SEARCH }}</h3>
            <p>{{ PAGES.CHECKIN.SCAN_HINT }}</p>
          </div>
        </div>
      </div>

      <!-- Recent Checkins Sidebar -->
      <div class="recent-checkins">
        <h3>{{ PAGES.CHECKIN.TODAY_RECORDS }}</h3>
        <div v-if="recentCheckins.length === 0" class="no-checkins">
          <p>{{ PAGES.CHECKIN.NO_RECORDS }}</p>
        </div>
        <div v-else class="checkins-list">
          <div v-for="checkin in recentCheckins" :key="checkin.id" class="checkin-item">
            <div class="checkin-avatar">{{ checkin.member.full_name?.[0] }}</div>
            <div class="checkin-info">
              <span class="checkin-name">{{ checkin.member.full_name }}</span>
              <span class="checkin-code">{{ checkin.member.member_code }}</span>
            </div>
            <span class="checkin-time">{{ formatTime(checkin.time) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.checkin-page {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: var(--space-xl);
}

.header-content h1 {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-xs) 0;
}

.header-content p {
  color: var(--color-text-secondary);
  margin: 0;
}

.checkin-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: var(--space-xl);
}

.checkin-main {
  background: var(--color-bg-primary);
  border-radius: var(--radius-2xl);
  border: 1px solid var(--color-border);
  min-height: 500px;
  position: relative;
  overflow: hidden;
}

.success-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(52, 199, 89, 0.95), rgba(48, 209, 88, 0.95));
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.success-content {
  text-align: center;
  color: white;
}

.success-icon {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-lg);
  animation: scaleIn 0.4s ease-out;
}

@keyframes scaleIn {
  from { transform: scale(0); }
  to { transform: scale(1); }
}

.success-content h2 {
  font-size: 32px;
  margin: 0 0 var(--space-sm) 0;
}

.success-content p {
  font-size: 18px;
  opacity: 0.9;
  margin: 0;
}

.search-area {
  padding: var(--space-2xl);
}

.search-box {
  position: relative;
  margin-bottom: var(--space-lg);
}

.search-icon {
  position: absolute;
  left: var(--space-lg);
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-tertiary);
}

.search-input {
  width: 100%;
  padding: var(--space-lg) var(--space-lg) var(--space-lg) 56px;
  font-size: 18px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  outline: none;
  transition: all var(--duration-fast) var(--ease-out);
}

.search-input:focus {
  border-color: var(--color-accent);
  background: var(--color-bg-primary);
}

.search-results {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}

.member-result {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.member-result:hover {
  border-color: var(--color-accent);
  background: var(--color-bg-tertiary);
}

.member-avatar,
.selected-avatar,
.checkin-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, #0071e3, #00c7be);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  flex-shrink: 0;
}

.member-info,
.checkin-info {
  flex: 1;
  min-width: 0;
}

.member-name,
.checkin-name {
  display: block;
  font-weight: 500;
  color: var(--color-text-primary);
}

.member-code,
.checkin-code {
  display: block;
  font-size: 13px;
  color: var(--color-text-tertiary);
}

.member-status {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
}

.member-status.large {
  padding: var(--space-sm) var(--space-md);
  font-size: 14px;
}

.member-status.active {
  background: rgba(52, 199, 89, 0.1);
  color: var(--color-success);
}

.member-status.expired {
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
}

.member-status.suspended,
.member-status.paused {
  background: rgba(255, 59, 48, 0.1);
  color: var(--color-error);
}

.selected-member {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
}

.selected-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.selected-avatar {
  width: 56px;
  height: 56px;
  font-size: 20px;
}

.selected-info {
  flex: 1;
}

.selected-info h3 {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.selected-info p {
  font-size: 14px;
  color: var(--color-text-tertiary);
  margin: var(--space-xs) 0 0 0;
}

.selected-details {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.detail-item .label {
  font-size: 13px;
  color: var(--color-text-tertiary);
}

.detail-item .value {
  font-size: 15px;
  color: var(--color-text-primary);
}

.checkin-actions {
  display: flex;
  gap: var(--space-md);
}

.btn-cancel {
  flex: 1;
  padding: var(--space-md) var(--space-lg);
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  border: none;
  border-radius: var(--radius-lg);
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-cancel:hover {
  background: var(--color-bg-quaternary);
}

.btn-checkin {
  flex: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  background: var(--color-success);
  color: white;
  border: none;
  border-radius: var(--radius-lg);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-checkin:hover:not(:disabled) {
  background: #2ecc71;
  transform: scale(1.02);
}

.btn-checkin:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl);
  text-align: center;
}

.scan-icon {
  width: 120px;
  height: 120px;
  border-radius: var(--radius-2xl);
  background: var(--color-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-quaternary);
  margin-bottom: var(--space-lg);
}

.empty-state h3 {
  font-size: 20px;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-sm) 0;
}

.empty-state p {
  color: var(--color-text-tertiary);
  margin: 0;
}

/* Recent Checkins Sidebar */
.recent-checkins {
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
  padding: var(--space-lg);
}

.recent-checkins h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-lg) 0;
}

.no-checkins {
  text-align: center;
  padding: var(--space-xl);
  color: var(--color-text-tertiary);
}

.checkins-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.checkin-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
}

.checkin-avatar {
  width: 32px;
  height: 32px;
  font-size: 12px;
}

.checkin-time {
  font-size: 13px;
  color: var(--color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

@media (max-width: 1024px) {
  .checkin-layout {
    grid-template-columns: 1fr;
  }

  .recent-checkins {
    order: -1;
  }
}
</style>
