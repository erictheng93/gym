<template>
  <div class="app-layout">
    <!-- Auth Loading Screen -->
    <div v-if="isAuthChecking" class="auth-loading">
      <div class="loading-content">
        <div class="apple-spinner" />
        <span class="loading-text">載入中...</span>
      </div>
    </div>

    <!-- App Content -->
    <template v-else>
      <!-- Glassmorphic Header -->
      <header v-if="isAuthenticated" class="glass-header">
        <div class="header-content">
          <div class="header-left">
            <NuxtLink to="/" class="brand-link">
              <span class="brand-text">GymNexus</span>
            </NuxtLink>
            <span v-if="branchName" class="branch-badge">
              {{ branchName }}
            </span>
          </div>

          <div class="header-right">
            <button class="menu-button" @click="toggleMenu">
              <svg class="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <!-- Sheet-Style Side Menu -->
      <Transition name="overlay">
        <div
          v-if="menuOpen && isAuthenticated"
          class="menu-overlay"
          @click="menuOpen = false"
        />
      </Transition>

      <Transition name="sheet">
        <div v-if="menuOpen && isAuthenticated" class="menu-sheet" @click.stop>
          <!-- Menu Header -->
          <div class="menu-header">
            <div class="menu-avatar">
              <span>{{ getInitials(displayName) }}</span>
            </div>
            <div class="menu-user-info">
              <div class="menu-user-name">{{ displayName }}</div>
              <div class="menu-user-code">{{ coach?.employee_code }}</div>
            </div>
            <button class="menu-close" @click="menuOpen = false">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Menu Navigation -->
          <nav class="menu-nav">
            <NuxtLink
              v-for="item in menuItems"
              :key="item.path"
              :to="item.path"
              class="menu-item"
              :class="{ active: isActiveRoute(item.path) }"
              @click="menuOpen = false"
            >
              <div class="menu-item-icon" v-html="item.icon" />
              <span class="menu-item-label">{{ item.label }}</span>
              <svg class="menu-item-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </NuxtLink>
          </nav>

          <!-- Menu Footer -->
          <div class="menu-footer">
            <button class="logout-button" @click="handleLogout">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>登出</span>
            </button>
          </div>
        </div>
      </Transition>

      <!-- Main Content -->
      <main class="main-content" :class="{ 'has-nav': isAuthenticated }">
        <slot />
      </main>

      <!-- Offline Sync Status -->
      <OfflineSyncIndicator v-if="isAuthenticated" />

      <!-- iOS-Style Bottom Tab Bar -->
      <nav v-if="isAuthenticated" class="tab-bar">
        <NuxtLink
          v-for="tab in tabItems"
          :key="tab.path"
          :to="tab.path"
          class="tab-item"
          :class="{ active: isActiveRoute(tab.path) }"
        >
          <div class="tab-icon" v-html="tab.icon" />
          <span class="tab-label">{{ tab.label }}</span>
          <span v-if="isActiveRoute(tab.path)" class="tab-indicator" />
        </NuxtLink>
      </nav>
    </template>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const { coach, isAuthenticated, isAuthChecking, displayName, branchName, logout } = useCoachAuth()

const menuOpen = ref(false)

const toggleMenu = () => {
  menuOpen.value = !menuOpen.value
}

const isActiveRoute = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

const getInitials = (name: string) => {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  if (parts.length === 1) return (parts[0] ?? '').charAt(0).toUpperCase()
  return ((parts[0] ?? '').charAt(0) + (parts[parts.length - 1] ?? '').charAt(0)).toUpperCase()
}

const handleLogout = () => {
  menuOpen.value = false
  logout()
  router.push('/login')
}

// Menu items
const menuItems = [
  {
    path: '/',
    label: '首頁',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>',
  },
  {
    path: '/students',
    label: '學員管理',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/></svg>',
  },
  {
    path: '/classes',
    label: '課程管理',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>',
  },
  {
    path: '/schedule',
    label: '週行事曆',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
  },
  {
    path: '/lessons',
    label: '教案管理',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
  },
  {
    path: '/library',
    label: '教學資源庫',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>',
  },
]

// Tab bar items (bottom nav)
const tabItems = [
  {
    path: '/',
    label: '首頁',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>',
  },
  {
    path: '/students',
    label: '學員',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>',
  },
  {
    path: '/classes',
    label: '課程',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>',
  },
  {
    path: '/lessons',
    label: '教案',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>',
  },
  {
    path: '/library',
    label: '資源',
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>',
  },
]
</script>

<style scoped>
/* ============================================
   APPLE-STYLE LAYOUT
   ============================================ */

.app-layout {
  min-height: 100vh;
  background: var(--bg-primary);
  font-family: var(--font-body);
}

/* Auth Loading */
.auth-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg-primary);
}

.loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.loading-text {
  color: var(--text-tertiary);
  font-size: 14px;
}

/* Glassmorphic Header */
.glass-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border-bottom: 0.5px solid var(--glass-border);
  padding-top: env(safe-area-inset-top);
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
  padding: 0 16px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.brand-link {
  text-decoration: none;
}

.brand-text {
  font-size: 20px;
  font-weight: 700;
  color: var(--apple-blue);
  letter-spacing: -0.02em;
}

.branch-badge {
  font-size: 12px;
  color: var(--text-tertiary);
  background: var(--fill-tertiary);
  padding: 4px 8px;
  border-radius: var(--radius-pill);
}

.header-right {
  display: flex;
  align-items: center;
}

.menu-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s var(--ease-apple);
}

.menu-button:hover {
  background: var(--fill-tertiary);
}

.menu-button:active {
  background: var(--fill-secondary);
}

.menu-icon {
  width: 24px;
  height: 24px;
  color: var(--text-primary);
}

/* Menu Overlay */
.menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.overlay-enter-active,
.overlay-leave-active {
  transition: opacity 0.3s var(--ease-apple);
}

.overlay-enter-from,
.overlay-leave-to {
  opacity: 0;
}

/* Menu Sheet */
.menu-sheet {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 201;
  width: 300px;
  max-width: 85vw;
  background: var(--glass-bg-thick);
  backdrop-filter: blur(40px);
  -webkit-backdrop-filter: blur(40px);
  border-left: 0.5px solid var(--glass-border);
  display: flex;
  flex-direction: column;
  box-shadow: var(--shadow-xl);
}

.sheet-enter-active {
  transition: transform 0.4s var(--ease-spring);
}

.sheet-leave-active {
  transition: transform 0.3s var(--ease-apple);
}

.sheet-enter-from,
.sheet-leave-to {
  transform: translateX(100%);
}

.menu-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px;
  padding-top: calc(20px + env(safe-area-inset-top));
  border-bottom: 0.5px solid var(--separator);
}

.menu-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--apple-blue) 0%, var(--apple-teal) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  color: white;
  flex-shrink: 0;
}

.menu-user-info {
  flex: 1;
  min-width: 0;
}

.menu-user-name {
  font-size: 17px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.menu-user-code {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-top: 2px;
}

.menu-close {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--fill-tertiary);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background-color 0.2s var(--ease-apple);
}

.menu-close:hover {
  background: var(--fill-secondary);
}

.menu-close svg {
  width: 16px;
  height: 16px;
  color: var(--text-secondary);
}

/* Menu Navigation */
.menu-nav {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  text-decoration: none;
  color: var(--text-primary);
  transition: all 0.2s var(--ease-apple);
}

.menu-item:hover {
  background: var(--fill-quaternary);
}

.menu-item:active {
  background: var(--fill-tertiary);
  transform: scale(0.98);
}

.menu-item.active {
  background: rgba(0, 122, 255, 0.12);
}

.menu-item.active .menu-item-icon {
  color: var(--apple-blue);
}

.menu-item.active .menu-item-label {
  color: var(--apple-blue);
  font-weight: 600;
}

.menu-item-icon {
  width: 22px;
  height: 22px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.menu-item-icon :deep(svg) {
  width: 100%;
  height: 100%;
}

.menu-item-label {
  flex: 1;
  font-size: 16px;
  font-weight: 500;
}

.menu-item-chevron {
  width: 16px;
  height: 16px;
  color: var(--text-quaternary);
  flex-shrink: 0;
}

/* Menu Footer */
.menu-footer {
  padding: 16px;
  padding-bottom: calc(16px + env(safe-area-inset-bottom));
  border-top: 0.5px solid var(--separator);
}

.logout-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 14px;
  background: rgba(255, 59, 48, 0.12);
  border: none;
  border-radius: var(--radius-md);
  color: var(--apple-red);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s var(--ease-apple);
}

.logout-button:hover {
  background: rgba(255, 59, 48, 0.2);
}

.logout-button:active {
  transform: scale(0.98);
}

.logout-button svg {
  width: 20px;
  height: 20px;
}

/* Main Content */
.main-content {
  min-height: 100vh;
}

.main-content.has-nav {
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

/* iOS-Style Tab Bar */
.tab-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  justify-content: space-around;
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border-top: 0.5px solid var(--glass-border);
  padding-bottom: env(safe-area-inset-bottom);
}

.tab-item {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  text-decoration: none;
  transition: all 0.2s var(--ease-apple);
}

.tab-item:active {
  transform: scale(0.92);
}

.tab-icon {
  width: 24px;
  height: 24px;
  color: var(--text-tertiary);
  transition: color 0.2s var(--ease-apple);
}

.tab-icon :deep(svg) {
  width: 100%;
  height: 100%;
}

.tab-item.active .tab-icon {
  color: var(--apple-blue);
}

.tab-label {
  font-size: 10px;
  font-weight: 500;
  color: var(--text-tertiary);
  margin-top: 4px;
  transition: color 0.2s var(--ease-apple);
}

.tab-item.active .tab-label {
  color: var(--apple-blue);
  font-weight: 600;
}

.tab-indicator {
  position: absolute;
  top: 2px;
  width: 4px;
  height: 4px;
  background: var(--apple-blue);
  border-radius: 50%;
}

/* Responsive */
@media (min-width: 768px) {
  .menu-sheet {
    width: 340px;
  }
}

/* Dark mode adjustments */
.dark .glass-header {
  background: var(--glass-bg);
}

.dark .menu-sheet {
  background: var(--glass-bg-thick);
}

.dark .tab-bar {
  background: var(--glass-bg);
}
</style>
