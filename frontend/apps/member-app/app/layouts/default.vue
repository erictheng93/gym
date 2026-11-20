<script setup lang="ts">
const { isAuthenticated, isAuthChecking } = useMemberAuth()

const navItems = [
  { path: '/', icon: 'qr', label: '入場' },
  { path: '/bookings', icon: 'calendar', label: '預約' },
  { path: '/contracts', icon: 'document', label: '合約' },
  { path: '/profile', icon: 'user', label: '我的' }
]
</script>

<template>
  <div class="app-layout safe-area-top safe-area-bottom">
    <!-- Toast Notifications (ClientOnly to prevent hydration mismatch from Teleport) -->
    <ClientOnly>
      <ToastContainer />
    </ClientOnly>

    <!-- Auth Loading Screen (prevents content flash) -->
    <div v-if="isAuthChecking" class="auth-loading">
      <div class="auth-loading-content">
        <div class="auth-loading-spinner" />
        <span class="auth-loading-text">載入中...</span>
      </div>
    </div>

    <!-- Desktop Layout with Sidebar (≥1024px) -->
    <template v-else>
      <!-- Desktop Sidebar Navigation -->
      <aside v-if="isAuthenticated" class="desktop-sidebar">
        <div class="sidebar-header">
          <h1 class="sidebar-logo">Gym Nexus</h1>
        </div>
        <nav class="sidebar-nav">
          <NuxtLink
            v-for="item in navItems"
            :key="item.path"
            :to="item.path"
            class="sidebar-item"
            :class="{ active: $route.path === item.path }"
          >
            <span class="sidebar-icon">
              <svg v-if="item.icon === 'qr'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="3" height="3" />
                <rect x="18" y="14" width="3" height="3" />
                <rect x="14" y="18" width="3" height="3" />
                <rect x="18" y="18" width="3" height="3" />
              </svg>
              <svg v-else-if="item.icon === 'calendar'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <svg v-else-if="item.icon === 'document'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <svg v-else-if="item.icon === 'user'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </span>
            <span class="sidebar-label">{{ item.label }}</span>
          </NuxtLink>
        </nav>
      </aside>

      <!-- Main Content -->
      <main class="main-content">
        <slot />
      </main>

      <!-- Offline Sync Indicator -->
      <OfflineSyncIndicator />

      <!-- Bottom Navigation - Mobile Only (只在登入後且認證檢查完成時顯示) -->
      <nav v-if="isAuthenticated" class="bottom-nav">
        <NuxtLink
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          class="nav-item"
          :class="{ active: $route.path === item.path }"
        >
          <span class="nav-icon">
            <svg v-if="item.icon === 'qr'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="3" height="3" />
              <rect x="18" y="14" width="3" height="3" />
              <rect x="14" y="18" width="3" height="3" />
              <rect x="18" y="18" width="3" height="3" />
            </svg>
            <svg v-else-if="item.icon === 'calendar'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <svg v-else-if="item.icon === 'document'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            <svg v-else-if="item.icon === 'user'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </span>
          <span class="nav-label">{{ item.label }}</span>
        </NuxtLink>
      </nav>
    </template>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  min-height: 100dvh;
}

/* Auth Loading Screen */
.auth-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 100vh;
  min-height: 100dvh;
  background-color: var(--color-background);
}

.auth-loading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.auth-loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--color-border);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.auth-loading-text {
  color: var(--color-text-secondary);
  font-size: 14px;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.main-content {
  flex: 1;
  padding-bottom: 80px; /* Space for bottom nav */
}

/* iOS 17+ Style Tab Bar with Glassmorphism */
.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-around;

  /* Frosted glass effect */
  background: rgba(249, 249, 249, 0.72);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);

  /* Hairline border */
  border-top: 0.5px solid rgba(60, 60, 67, 0.29);

  /* Subtle shadow for depth */
  box-shadow: 0 -0.5px 0 rgba(0, 0, 0, 0.04);

  padding: 6px 0;
  padding-bottom: calc(6px + var(--safe-area-bottom));
}

/* Next-Gen Floating Glass Dock */
.bottom-nav {
  position: fixed;
  bottom: calc(12px + var(--safe-area-bottom, 0px));
  left: 16px;
  right: 16px;
  max-width: 480px;
  margin: 0 auto;
  display: flex;
  justify-content: space-around;
  align-items: center;
  border-radius: 28px;
  z-index: 100;

  /* Frosted glass effect with high saturation */
  background: rgba(18, 18, 20, 0.82);
  backdrop-filter: blur(24px) saturate(200%);
  -webkit-backdrop-filter: blur(24px) saturate(200%);

  /* Specular rim highlight & elevation */
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 16px 40px -10px rgba(0, 0, 0, 0.45),
              inset 0 1px 0 rgba(255, 255, 255, 0.2);

  padding: 6px 12px;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Light mode glass effect */
:root.theme-light .bottom-nav {
  background: rgba(255, 255, 255, 0.85);
  border-color: rgba(0, 0, 0, 0.08);
  box-shadow: 0 16px 40px -10px rgba(0, 0, 0, 0.12),
              inset 0 1px 0 rgba(255, 255, 255, 0.8);
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 14px;
  border-radius: 20px;
  color: #8e8e93; /* iOS inactive gray */
  text-decoration: none;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  -webkit-tap-highlight-color: transparent;
  position: relative;
}

.nav-item:hover {
  color: var(--color-text, #ffffff);
  transform: translateY(-2px);
}

.nav-item.active {
  color: var(--color-primary, #0071e3);
  background: rgba(0, 113, 227, 0.12);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15);
}

.nav-item:active {
  transform: scale(0.92);
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.nav-item.active .nav-icon {
  transform: scale(1.1);
}

.nav-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

/* Desktop Sidebar - Hidden on mobile, visible on ≥1024px */
.desktop-sidebar {
  display: none;
}

@media (min-width: 1024px) {
  .app-layout {
    display: flex;
    flex-direction: row;
  }

  .desktop-sidebar {
    display: flex;
    flex-direction: column;
    width: 260px;
    min-height: 100vh;
    background: var(--color-surface, #161618);
    border-right: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
    box-shadow: inset -1px 0 0 rgba(255, 255, 255, 0.05);
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    z-index: 100;
  }

  .sidebar-header {
    padding: 24px 20px;
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.08));
  }

  .sidebar-logo {
    font-size: 20px;
    font-weight: 700;
    color: var(--color-primary, #0071e3);
    letter-spacing: -0.4px;
  }

  .sidebar-nav {
    flex: 1;
    padding: 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .sidebar-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 12px;
    color: var(--color-text-secondary, #8e8e93);
    text-decoration: none;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    -webkit-tap-highlight-color: transparent;
    border: 1px solid transparent;
  }

  .sidebar-item:hover {
    color: var(--color-text, #ffffff);
    background: var(--color-surface-secondary, rgba(255, 255, 255, 0.04));
    transform: translateX(2px);
  }

  .sidebar-item.active {
    background: var(--color-primary-light, rgba(0, 113, 227, 0.12));
    color: var(--color-primary, #0071e3);
    border-color: rgba(0, 113, 227, 0.25);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.15);
    font-weight: 600;
  }

  .sidebar-item.active .sidebar-icon {
    color: var(--color-primary, #0071e3);
  }

  .sidebar-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    color: var(--color-text-secondary);
  }

  .sidebar-label {
    font-size: 14px;
    font-weight: 500;
  }

  /* Hide bottom nav on desktop */
  .bottom-nav {
    display: none;
  }

  /* Adjust main content for sidebar */
  .main-content {
    margin-left: 260px;
    width: calc(100% - 260px);
    max-width: 900px;
    padding: 32px 24px 48px;
  }

  .auth-loading {
    margin-left: 260px;
    width: calc(100% - 260px);
  }
}
</style>
