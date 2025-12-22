<script setup lang="ts">
import { APP_NAME, MESSAGES } from '~/constants'

const { user, logout } = useAuth()
const { isDark, toggleTheme } = useTheme()
const route = useRoute()

const menuItems = [
  {
    label: MESSAGES.NAV.DASHBOARD,
    to: '/',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>`
  },
  {
    label: MESSAGES.NAV.MEMBERS,
    to: '/members',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
  },
  {
    label: MESSAGES.NAV.CONTRACTS,
    to: '/contracts',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`
  },
  {
    label: MESSAGES.NAV.PAYMENTS,
    to: '/payments',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`
  },
  {
    label: MESSAGES.NAV.PLANS,
    to: '/plans',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><path d="M2 10h20"/></svg>`
  },
  {
    label: MESSAGES.NAV.EMPLOYEES,
    to: '/employees',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`
  },
  {
    label: MESSAGES.NAV.BRANCHES,
    to: '/branches',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`
  },
  {
    label: MESSAGES.NAV.CHECKIN,
    to: '/checkin',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
  },
  {
    label: MESSAGES.NAV.HR,
    to: '/hr',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/></svg>`
  },
  {
    label: MESSAGES.NAV.REPORTS,
    to: '/reports',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>`
  },
]

const isActive = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

const userInitial = computed(() => {
  if (user.value?.first_name) return user.value.first_name[0].toUpperCase()
  if (user.value?.email) return user.value.email[0].toUpperCase()
  return '?'
})

const userName = computed(() => {
  if (user.value?.first_name || user.value?.last_name) {
    return `${user.value.first_name || ''} ${user.value.last_name || ''}`.trim()
  }
  return user.value?.email?.split('@')[0] || MESSAGES.USER.DEFAULT_NAME
})
</script>

<template>
  <div class="app-layout">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-inner">
        <!-- Logo -->
        <div class="sidebar-header">
          <div class="logo">
            <svg width="32" height="32" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="48" height="48" rx="12" fill="url(#logo-gradient-sidebar)"/>
              <path d="M14 24h6v-8h8v8h6v4h-6v8h-8v-8h-6v-4z" fill="white"/>
              <defs>
                <linearGradient id="logo-gradient-sidebar" x1="0" y1="0" x2="48" y2="48">
                  <stop stop-color="#0071e3"/>
                  <stop offset="1" stop-color="#00c7be"/>
                </linearGradient>
              </defs>
            </svg>
            <span class="logo-text">{{ APP_NAME }}</span>
          </div>
        </div>

        <!-- Navigation -->
        <nav class="sidebar-nav">
          <ul class="nav-list">
            <li v-for="item in menuItems" :key="item.to" class="nav-item">
              <NuxtLink :to="item.to" class="nav-link" :class="{ active: isActive(item.to) }">
                <span class="nav-icon" v-html="item.icon" />
                <span class="nav-label">{{ item.label }}</span>
              </NuxtLink>
            </li>
          </ul>
        </nav>

        <!-- Footer -->
        <div class="sidebar-footer">
          <!-- Theme Toggle -->
          <button class="theme-btn" @click="toggleTheme">
            <svg v-if="isDark" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>
            </svg>
            <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
            </svg>
          </button>

          <!-- User Info -->
          <div class="user-info">
            <div class="user-avatar">{{ userInitial }}</div>
            <div class="user-details">
              <p class="user-name">{{ userName }}</p>
              <p class="user-email">{{ user?.email }}</p>
            </div>
          </div>

          <!-- Logout Button -->
          <button class="logout-btn" @click="logout">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>
            </svg>
            <span>{{ MESSAGES.AUTH.LOGOUT }}</span>
          </button>
        </div>
      </div>
    </aside>

    <!-- Main Content -->
    <main class="main-content">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  background: var(--color-bg-secondary);
}

/* Sidebar */
.sidebar {
  width: 260px;
  flex-shrink: 0;
  position: fixed;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 50;
}

.sidebar-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--space-lg);
  background: var(--color-bg-glass);
  backdrop-filter: blur(var(--blur-heavy));
  -webkit-backdrop-filter: blur(var(--blur-heavy));
  border-right: 0.5px solid var(--color-border);
}

/* Logo */
.sidebar-header {
  padding-bottom: var(--space-lg);
  margin-bottom: var(--space-md);
  border-bottom: 0.5px solid var(--color-divider);
}

.logo {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.logo-text {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--color-text-primary);
}

/* Navigation */
.sidebar-nav {
  flex: 1;
  overflow-y: auto;
}

.nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.nav-link {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 12px 14px;
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: 15px;
  font-weight: 500;
  transition: all var(--duration-fast) var(--ease-out);
}

.nav-link:hover {
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
}

.nav-link.active {
  background: linear-gradient(180deg, #0077ed 0%, #0071e3 100%);
  color: #ffffff;
  box-shadow:
    0 1px 3px rgba(0, 113, 227, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.nav-link.active .nav-icon {
  opacity: 1;
}

.nav-link:active:not(.active) {
  transform: scale(0.98);
  background: var(--color-bg-secondary);
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
  transition: opacity var(--duration-fast) var(--ease-out);
}

.nav-link:hover .nav-icon,
.nav-link.active .nav-icon {
  opacity: 1;
}

/* Footer */
.sidebar-footer {
  padding-top: var(--space-lg);
  border-top: 0.5px solid var(--color-divider);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.theme-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  border: none;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.theme-btn:hover {
  background: var(--color-accent-light);
  color: var(--color-accent);
}

.theme-btn:active {
  transform: scale(0.92);
}

.user-info {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm);
  border-radius: var(--radius-md);
  background: var(--color-bg-tertiary);
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, #0071e3, #00c7be);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.user-details {
  flex: 1;
  min-width: 0;
}

.user-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-email {
  font-size: 12px;
  color: var(--color-text-tertiary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.logout-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  width: 100%;
  padding: 10px 14px;
  border-radius: var(--radius-md);
  border: none;
  background: transparent;
  color: var(--color-text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.logout-btn:hover {
  background: rgba(255, 59, 48, 0.1);
  color: var(--color-error);
}

.logout-btn:active {
  transform: scale(0.98);
  background: rgba(255, 59, 48, 0.15);
}

/* Main Content */
.main-content {
  flex: 1;
  margin-left: 260px;
  padding: var(--space-2xl);
  min-height: 100vh;
}

/* Responsive */
@media (max-width: 1024px) {
  .sidebar {
    width: 80px;
  }

  .sidebar-inner {
    padding: var(--space-md);
    align-items: center;
  }

  .logo-text,
  .nav-label,
  .user-details,
  .logout-btn span {
    display: none;
  }

  .nav-link {
    justify-content: center;
    padding: 12px;
  }

  .user-info {
    padding: var(--space-sm);
    justify-content: center;
  }

  .logout-btn {
    padding: 10px;
  }

  .main-content {
    margin-left: 80px;
  }
}
</style>
