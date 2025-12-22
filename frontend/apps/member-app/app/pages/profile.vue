<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const { member, logout } = useMemberAuth()

const handleLogout = async () => {
  if (confirm('確定要登出嗎？')) {
    await logout()
  }
}

const menuItems = [
  { icon: 'history', label: '入場紀錄', path: '/profile/checkins' },
  { icon: 'payment', label: '付款紀錄', path: '/profile/payments' },
  { icon: 'bell', label: '通知設定', path: '/profile/notifications' },
  { icon: 'help', label: '聯絡客服', path: '/profile/support' }
]
</script>

<template>
  <div class="profile-page">
    <!-- Profile Card -->
    <div class="profile-card">
      <div class="avatar">
        {{ member?.full_name?.charAt(0) || 'M' }}
      </div>
      <div class="profile-info">
        <h1 class="profile-name">{{ member?.full_name }}</h1>
        <p class="profile-code">會員編號：{{ member?.member_code }}</p>
        <p class="profile-branch">{{ member?.branch_name }}</p>
      </div>
    </div>

    <!-- Profile Details -->
    <section class="section">
      <h2 class="section-title">個人資料</h2>
      <div class="info-card">
        <div class="info-row">
          <span class="info-label">手機</span>
          <span class="info-value">{{ member?.phone || '-' }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Email</span>
          <span class="info-value">{{ member?.email || '-' }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">會籍狀態</span>
          <span
            class="info-value"
            :class="{
              'status-active': member?.member_status === 'ACTIVE',
              'status-expired': member?.member_status === 'EXPIRED'
            }"
          >
            {{ member?.member_status === 'ACTIVE' ? '有效' : '已到期' }}
          </span>
        </div>
      </div>
    </section>

    <!-- Menu -->
    <section class="section">
      <h2 class="section-title">更多功能</h2>
      <div class="menu-list">
        <NuxtLink
          v-for="item in menuItems"
          :key="item.path"
          :to="item.path"
          class="menu-item"
        >
          <span class="menu-icon">
            <svg v-if="item.icon === 'history'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <svg v-else-if="item.icon === 'payment'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="1" y="4" width="22" height="16" rx="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            <svg v-else-if="item.icon === 'bell'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <svg v-else-if="item.icon === 'help'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
          <span class="menu-label">{{ item.label }}</span>
          <svg class="menu-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </NuxtLink>
      </div>
    </section>

    <!-- Logout -->
    <button class="logout-btn" @click="handleLogout">
      登出
    </button>

    <!-- App Info -->
    <p class="app-version">Gym Nexus v1.0.0</p>
  </div>
</template>

<style scoped>
.profile-page {
  padding: 24px 16px;
}

.profile-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 24px;
  background: linear-gradient(135deg, var(--color-primary) 0%, #059669 100%);
  border-radius: 20px;
  margin-bottom: 24px;
}

.avatar {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.2);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  font-weight: 700;
}

.profile-info {
  flex: 1;
}

.profile-name {
  font-size: 22px;
  font-weight: 700;
  color: white;
  margin-bottom: 4px;
}

.profile-code {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 2px;
}

.profile-branch {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}

.section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 12px;
}

.info-card {
  background-color: var(--color-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
}

.info-row:not(:last-child) {
  border-bottom: 1px solid var(--color-border);
}

.info-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.info-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.status-active {
  color: var(--color-success);
}

.status-expired {
  color: var(--color-error);
}

.menu-list {
  background-color: var(--color-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  text-decoration: none;
  color: var(--color-text);
  transition: background-color 0.2s ease;
}

.menu-item:not(:last-child) {
  border-bottom: 1px solid var(--color-border);
}

.menu-item:active {
  background-color: var(--color-border);
}

.menu-icon {
  display: flex;
  align-items: center;
  color: var(--color-text-secondary);
}

.menu-label {
  flex: 1;
  font-size: 15px;
}

.menu-arrow {
  color: var(--color-text-secondary);
}

.logout-btn {
  width: 100%;
  padding: 16px;
  background-color: transparent;
  border: 1px solid var(--color-error);
  border-radius: 12px;
  font-size: 16px;
  font-weight: 500;
  color: var(--color-error);
  cursor: pointer;
  transition: background-color 0.2s ease;
  margin-bottom: 24px;
}

.logout-btn:active {
  background-color: rgba(239, 68, 68, 0.1);
}

.app-version {
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
