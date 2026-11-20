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
    label: '即時戰情室',
    to: '/dashboard/war-room',
    isLive: true,
    icon: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="4"/></svg>'
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
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/></svg>`,
    submenu: [
      {
        label: '考勤打卡',
        to: '/hr/attendance'
      },
      {
        label: '休假管理',
        to: '/hr/leaves'
      },
      {
        label: '補打卡申請',
        to: '/hr/makeup'
      },
      {
        label: '班表管理',
        to: '/hr/schedules'
      },
      {
        label: '考勤報表',
        to: '/hr/reports'
      },
      {
        label: '員工管理',
        to: '/hr/employees'
      },
      {
        label: '職位管理',
        to: '/hr/job-titles'
      }
    ]
  },
  {
    label: MESSAGES.NAV.REPORTS,
    to: '/reports',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>`
  },
  {
    label: '系統管理',
    to: '/admin',
    icon: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
    submenu: [
      {
        label: '使用者管理',
        to: '/admin/users'
      },
      {
        label: '角色權限',
        to: '/admin/roles'
      },
      {
        label: '品牌設定',
        to: '/admin/branding'
      },
      {
        label: '系統設定',
        to: '/admin/settings'
      },
      {
        label: '系統分析',
        to: '/admin/analytics'
      },
      {
        label: '租戶管理',
        to: '/admin/tenants'
      }
    ]
  },
]

// Submenu expansion state
const expandedMenus = ref<Set<string>>(new Set())

// Check if menu has submenu expanded based on current route
const initExpandedMenus = () => {
  menuItems.forEach(item => {
    if (item.submenu) {
      const hasActiveSubmenu = item.submenu.some(sub => route.path.startsWith(sub.to))
      if (hasActiveSubmenu || route.path.startsWith(item.to)) {
        expandedMenus.value.add(item.label)
      }
    }
  })
}

// Initialize on mount
onMounted(() => {
  initExpandedMenus()
})

// Watch route changes to auto-expand parent menu
watch(() => route.path, () => {
  initExpandedMenus()
})

const toggleSubmenu = (label: string) => {
  if (expandedMenus.value.has(label)) {
    expandedMenus.value.delete(label)
  } else {
    expandedMenus.value.add(label)
  }
}

const isMenuExpanded = (label: string) => {
  return expandedMenus.value.has(label)
}

const isActive = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}

const isSubmenuActive = (item: typeof menuItems[0]) => {
  if (!item.submenu) return isActive(item.to)
  return item.submenu.some(sub => route.path.startsWith(sub.to)) || route.path.startsWith(item.to)
}

// Track if component is mounted (for SSR hydration safety)
const isMounted = ref(false)
onMounted(() => {
  isMounted.value = true
})

const userInitial = computed(() => {
  if (!isMounted.value) return '' // Return empty during SSR
  if (user.value?.first_name) return user.value.first_name[0]?.toUpperCase() ?? '?'
  if (user.value?.email) return user.value.email[0]?.toUpperCase() ?? '?'
  return '?'
})

const userName = computed(() => {
  if (!isMounted.value) return '' // Return empty during SSR
  if (user.value?.first_name || user.value?.last_name) {
    return `${user.value.first_name || ''} ${user.value.last_name || ''}`.trim()
  }
  return user.value?.email?.split('@')[0] || MESSAGES.USER.DEFAULT_NAME
})

const userEmail = computed(() => {
  if (!isMounted.value) return '' // Return empty during SSR
  return user?.value?.email || ''
})

// Command Palette state (Raycast / Linear grade)
const isCommandPaletteOpen = ref(false)
const commandSearchQuery = ref('')
const selectedCommandIndex = ref(0)
const commandInputRef = ref<HTMLInputElement | null>(null)

interface CommandItem {
  id: string
  title: string
  subtitle?: string
  category: '導航' | '捷徑' | '系統'
  icon: string
  action: () => void
}

const commands = computed<CommandItem[]>(() => [
  {
    id: 'nav-warroom',
    title: '營運戰情室',
    subtitle: '即時數據遙測 HUD 與全場館監控',
    category: '導航',
    icon: '📊',
    action: () => navigateTo('/dashboard/war-room')
  },
  {
    id: 'nav-checkin',
    title: '入場櫃檯 Kiosk',
    subtitle: '會員入場核銷、QR Code 與出勤打卡',
    category: '導航',
    icon: '⚡',
    action: () => navigateTo('/checkin')
  },
  {
    id: 'nav-dashboard',
    title: '總覽儀表板',
    subtitle: '核心數據 Bento Grid 與租戶配額',
    category: '導航',
    icon: '🏠',
    action: () => navigateTo('/')
  },
  {
    id: 'nav-members',
    title: '會員管理',
    subtitle: '檢視會員名單、會籍與健康分析',
    category: '導航',
    icon: '👥',
    action: () => navigateTo('/members')
  },
  {
    id: 'nav-contracts',
    title: '合約管理',
    subtitle: '檢視合約簽署、繳費與到期警示',
    category: '導航',
    icon: '📜',
    action: () => navigateTo('/contracts')
  },
  {
    id: 'nav-plans',
    title: '會籍方案',
    subtitle: '方案設定、票券管理與定價模型',
    category: '導航',
    icon: '💳',
    action: () => navigateTo('/plans')
  },
  {
    id: 'nav-payments',
    title: '款項紀錄',
    subtitle: '發票、對帳單與付款稽核',
    category: '導航',
    icon: '💰',
    action: () => navigateTo('/payments')
  },
  {
    id: 'action-theme',
    title: isDark.value ? '切換為明亮模式' : '切換為深色 Obsidian 模式',
    subtitle: '切換全域視覺主題風格',
    category: '系統',
    icon: isDark.value ? '☀️' : '🌙',
    action: () => toggleTheme()
  },
  {
    id: 'action-logout',
    title: '登出系統',
    subtitle: '安全退出當前帳號會話',
    category: '系統',
    icon: '🚪',
    action: () => logout()
  }
])

const filteredCommands = computed(() => {
  if (!commandSearchQuery.value.trim()) return commands.value
  const q = commandSearchQuery.value.toLowerCase()
  return commands.value.filter(c => 
    c.title.toLowerCase().includes(q) || 
    c.subtitle?.toLowerCase().includes(q) || 
    c.category.toLowerCase().includes(q)
  )
})

const openCommandPalette = () => {
  isCommandPaletteOpen.value = true
  commandSearchQuery.value = ''
  selectedCommandIndex.value = 0
  nextTick(() => {
    commandInputRef.value?.focus()
  })
}

const closeCommandPalette = () => {
  isCommandPaletteOpen.value = false
}

const executeSelectedCommand = () => {
  const item = filteredCommands.value[selectedCommandIndex.value]
  if (item) {
    closeCommandPalette()
    item.action()
  }
}

const handleKeyDown = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault()
    if (isCommandPaletteOpen.value) {
      closeCommandPalette()
    } else {
      openCommandPalette()
    }
  } else if (isCommandPaletteOpen.value) {
    if (e.key === 'Escape') {
      e.preventDefault()
      closeCommandPalette()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (filteredCommands.value.length > 0) {
        selectedCommandIndex.value = (selectedCommandIndex.value + 1) % filteredCommands.value.length
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (filteredCommands.value.length > 0) {
        selectedCommandIndex.value = (selectedCommandIndex.value - 1 + filteredCommands.value.length) % filteredCommands.value.length
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      executeSelectedCommand()
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

</script>

<template>
  <div class="app-layout">
    <!-- Sidebar -->
    <aside class="sidebar">
      <div class="sidebar-inner">
        <!-- Logo -->
        <div class="sidebar-header">
          <NuxtLink to="/" class="logo">
            <div class="logo-glow" />
            <svg width="32" height="32" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="48" height="48" rx="12" fill="url(#logo-gradient-sidebar)" />
              <path d="M14 24h6v-8h8v8h6v4h-6v8h-8v-8h-6v-4z" fill="white" />
              <defs>
                <linearGradient id="logo-gradient-sidebar" x1="0" y1="0" x2="48" y2="48">
                  <stop stop-color="#0071e3" />
                  <stop offset="1" stop-color="#00c7be" />
                </linearGradient>
              </defs>
            </svg>
            <span class="logo-text">{{ APP_NAME }}</span>
          </NuxtLink>
        </div>

        <!-- Navigation -->
        <nav class="sidebar-nav custom-scrollbar">
          <ul class="nav-list">
            <li v-for="item in menuItems" :key="item.to" class="nav-item">
              <!-- Menu with submenu -->
              <template v-if="item.submenu">
                <button
                  class="nav-link nav-link-parent"
                  :class="{ active: isSubmenuActive(item), expanded: isMenuExpanded(item.label) }"
                  @click="toggleSubmenu(item.label)"
                >
                  <span class="nav-icon" v-html="item.icon" />
                  <span class="nav-label">{{ item.label }}</span>
                  <svg class="nav-chevron" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                </button>
                <ul class="submenu" :class="{ expanded: isMenuExpanded(item.label) }">
                  <li v-for="subitem in item.submenu" :key="subitem.to" class="submenu-item">
                    <NuxtLink :to="subitem.to" class="submenu-link" :class="{ active: isActive(subitem.to) }">
                      {{ subitem.label }}
                    </NuxtLink>
                  </li>
                </ul>
              </template>
              <!-- Regular menu item -->
              <NuxtLink v-else :to="item.to" class="nav-link" :class="{ active: isActive(item.to) }">
                <span class="nav-icon" v-html="item.icon" />
                <span class="nav-label">{{ item.label }}</span>
                <span v-if="(item as any).isLive" class="sidebar-live-pill">LIVE</span>
              </NuxtLink>
            </li>
          </ul>
        </nav>

        <!-- Footer -->
        <div class="sidebar-footer">
          <!-- User Info -->
          <div class="user-info">
            <div class="user-avatar">{{ userInitial }}</div>
            <div class="user-details">
              <p class="user-name">{{ userName }}</p>
              <p class="user-email">{{ userEmail }}</p>
            </div>
          </div>

          <div class="sidebar-footer-actions">
            <!-- Theme Toggle -->
            <button class="theme-btn" @click="toggleTheme" :title="isDark ? '切換明亮模式' : '切換深色模式'">
              <svg v-if="isDark" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="4" /><path d="M12 2v2" /><path d="M12 20v2" /><path d="m4.93 4.93 1.41 1.41" /><path d="m17.66 17.66 1.41 1.41" /><path d="M2 12h2" /><path d="M20 12h2" /><path d="m6.34 17.66-1.41 1.41" /><path d="m19.07 4.93-1.41 1.41" />
              </svg>
              <svg v-else xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            </button>

            <!-- Logout Button -->
            <button class="logout-btn" @click="logout" title="登出系統">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </aside>

    <!-- Main Content Area -->
    <div class="main-wrapper">
      <!-- Topbar -->
      <header class="app-topbar">
        <div class="topbar-left">
          <!-- Command Palette Trigger -->
          <button class="command-trigger" @click="openCommandPalette">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <span class="command-trigger-text">搜尋頁面、捷徑與指令...</span>
            <kbd class="command-shortcut">⌘K</kbd>
          </button>
        </div>

        <div class="topbar-right">
          <NuxtLink to="/dashboard/war-room" class="war-room-badge-link">
            <span class="beacon-dot" />
            <span class="beacon-text uppercase-label">戰情室 LIVE</span>
          </NuxtLink>
        </div>
      </header>

      <!-- Main Content -->
      <main class="main-content">
        <slot />
      </main>
    </div>

    <!-- Command Palette Modal -->
    <Teleport to="body">
      <Transition name="command-modal">
        <div v-if="isCommandPaletteOpen" class="command-backdrop" @click="closeCommandPalette">
          <div class="command-container" @click.stop>
            <div class="command-search-row">
              <svg class="command-search-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
              <input
                ref="commandInputRef"
                v-model="commandSearchQuery"
                class="command-input"
                placeholder="輸入指令或頁面名稱（如：戰情室、會員、合約）..."
                type="text"
              />
              <kbd class="command-esc-hint" @click="closeCommandPalette">ESC</kbd>
            </div>

            <div class="command-results custom-scrollbar">
              <div v-if="filteredCommands.length === 0" class="command-empty">
                <span>查無相符的指令或頁面</span>
              </div>
              <ul v-else class="command-list">
                <li
                  v-for="(cmd, index) in filteredCommands"
                  :key="cmd.id"
                  :class="['command-item', { active: index === selectedCommandIndex }]"
                  @click="executeSelectedCommand"
                  @mouseenter="selectedCommandIndex = index"
                >
                  <span class="command-item-icon">{{ cmd.icon }}</span>
                  <div class="command-item-info">
                    <span class="command-item-title">{{ cmd.title }}</span>
                    <span v-if="cmd.subtitle" class="command-item-sub">{{ cmd.subtitle }}</span>
                  </div>
                  <span class="command-item-badge">{{ cmd.category }}</span>
                </li>
              </ul>
            </div>

            <div class="command-footer">
              <div class="command-footer-hints">
                <span><kbd>↑</kbd> <kbd>↓</kbd> 選擇</span>
                <span><kbd>↵</kbd> 執行</span>
                <span><kbd>ESC</kbd> 關閉</span>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  min-height: 100vh;
  background: var(--color-bg-primary);
}

.main-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* App Topbar */
.app-topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  height: 56px;
  background: rgba(var(--color-bg-primary-rgb, 12, 12, 14), 0.75);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-2xl);
}

.topbar-left {
  display: flex;
  align-items: center;
}

.command-trigger {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  box-shadow: inset 0 1px 0 var(--color-border-specular);
  border-radius: var(--radius-full);
  padding: 6px 14px;
  color: var(--color-text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-spring);
}

.command-trigger:hover {
  border-color: var(--color-border-focus);
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
  transform: translateY(-1px);
}

.command-shortcut {
  font-size: 10.5px;
  font-family: inherit;
  font-weight: 700;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 1px 5px;
  color: var(--color-text-tertiary);
}

.war-room-badge-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: var(--radius-full);
  background: rgba(52, 199, 89, 0.1);
  border: 1px solid rgba(52, 199, 89, 0.25);
  color: var(--color-success);
  text-decoration: none;
  transition: all var(--duration-fast) var(--ease-spring);
}

.war-room-badge-link:hover {
  background: rgba(52, 199, 89, 0.18);
  box-shadow: 0 0 16px -2px rgba(52, 199, 89, 0.4);
  transform: translateY(-1px);
}

.beacon-dot {
  width: 6px;
  height: 6px;
  background: var(--color-success);
  border-radius: 50%;
  box-shadow: 0 0 8px var(--color-success);
  animation: beaconPulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes beaconPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(1.3); }
}

.beacon-text {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
}

/* Sidebar */
.sidebar {
  width: 260px;
  flex-shrink: 0;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  box-shadow: inset -1px 0 0 var(--color-border-specular);
  position: sticky;
  top: 0;
  height: 100vh;
  z-index: 50;
}

.sidebar-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.sidebar-header {
  padding: var(--space-xl);
  border-bottom: 1px solid var(--color-border-subtle);
}

.logo {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  text-decoration: none;
  color: inherit;
  position: relative;
}

.logo-glow {
  position: absolute;
  width: 32px;
  height: 32px;
  border-radius: 12px;
  background: #0071e3;
  filter: blur(14px);
  opacity: 0.4;
}

.logo-text {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.025em;
  color: var(--color-text-primary);
}

.sidebar-nav {
  flex: 1;
  padding: var(--space-md) var(--space-md);
  overflow-y: auto;
}

.nav-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 10px 14px;
  border-radius: var(--radius-lg);
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  border: 1px solid transparent;
  transition: all var(--duration-fast) var(--ease-spring);
  width: 100%;
  background: transparent;
  cursor: pointer;
  text-align: left;
}

.nav-link:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
  transform: translateX(2px);
}

.nav-link.active {
  color: var(--color-accent);
  background: var(--color-accent-light);
  border-color: rgba(0, 113, 227, 0.2);
  box-shadow: inset 0 1px 0 var(--color-border-specular);
  font-weight: 600;
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.nav-label {
  flex: 1;
}

.sidebar-live-pill {
  font-size: 9px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: var(--radius-full);
  background: rgba(52, 199, 89, 0.15);
  color: var(--color-success);
  border: 1px solid rgba(52, 199, 89, 0.3);
}

.nav-chevron {
  transition: transform var(--duration-fast) var(--ease-spring);
  opacity: 0.6;
}

.nav-link-parent.expanded .nav-chevron {
  transform: rotate(90deg);
}

.submenu {
  list-style: none;
  margin: 2px 0 6px 0;
  padding: 0 0 0 var(--space-xl);
  display: none;
  flex-direction: column;
  gap: 2px;
}

.submenu.expanded {
  display: flex;
}

.submenu-link {
  display: block;
  padding: 7px 12px;
  border-radius: var(--radius-md);
  color: var(--color-text-secondary);
  text-decoration: none;
  font-size: 13px;
  transition: all var(--duration-fast) var(--ease-spring);
}

.submenu-link:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
  transform: translateX(2px);
}

.submenu-link.active {
  color: var(--color-accent);
  background: var(--color-accent-light);
  font-weight: 600;
}

/* Sidebar Footer */
.sidebar-footer {
  padding: var(--space-md) var(--space-md);
  border-top: 1px solid var(--color-border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-sm);
}

.user-info {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  min-width: 0;
  flex: 1;
}

.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--color-accent), #5856d6);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.4);
}

.user-details {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-email {
  font-size: 11px;
  color: var(--color-text-tertiary);
  margin: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-footer-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.theme-btn,
.logout-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
  background: transparent;
  border: 1px solid transparent;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-spring);
}

.theme-btn:hover,
.logout-btn:hover {
  background: var(--color-bg-tertiary);
  border-color: var(--color-border);
  color: var(--color-text-primary);
}

/* Main Content */
.main-content {
  flex: 1;
  padding: var(--space-2xl);
  max-width: 1600px;
  width: 100%;
  margin: 0 auto;
}

/* Command Palette Modal (Raycast style) */
.command-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 14vh;
  z-index: 9999;
}

.command-container {
  width: 100%;
  max-width: 620px;
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  box-shadow: 0 24px 64px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 var(--color-border-specular);
  border-radius: var(--radius-2xl);
  overflow: hidden;
}

.command-search-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 16px 20px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.command-search-icon {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

.command-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 16px;
  color: var(--color-text-primary);
  outline: none;
}

.command-input::placeholder {
  color: var(--color-text-tertiary);
}

.command-esc-hint {
  font-size: 11px;
  font-family: inherit;
  font-weight: 700;
  background: var(--color-bg-tertiary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 2px 6px;
  color: var(--color-text-tertiary);
  cursor: pointer;
}

.command-results {
  max-height: 380px;
  overflow-y: auto;
  padding: 8px;
}

.command-empty {
  padding: var(--space-2xl);
  text-align: center;
  color: var(--color-text-tertiary);
  font-size: 14px;
}

.command-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.command-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 10px 14px;
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-spring);
  border: 1px solid transparent;
}

.command-item.active {
  background: var(--color-accent-light);
  border-color: rgba(0, 113, 227, 0.25);
  box-shadow: inset 0 1px 0 var(--color-border-specular);
}

.command-item-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.command-item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.command-item-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.command-item-sub {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.command-item-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}

.command-footer {
  padding: 10px 20px;
  background: var(--color-bg-tertiary);
  border-top: 1px solid var(--color-border-subtle);
  display: flex;
  justify-content: flex-end;
}

.command-footer-hints {
  display: flex;
  gap: var(--space-md);
  font-size: 11.5px;
  color: var(--color-text-tertiary);
}

.command-footer-hints kbd {
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  padding: 1px 4px;
  border-radius: 3px;
  font-family: inherit;
}

/* Modal Transition */
.command-modal-enter-active,
.command-modal-leave-active {
  transition: opacity 0.2s ease, transform 0.2s var(--ease-spring);
}

.command-modal-enter-from,
.command-modal-leave-to {
  opacity: 0;
}

.command-modal-enter-from .command-container {
  transform: scale(0.96) translateY(-8px);
}

.command-modal-leave-to .command-container {
  transform: scale(0.96) translateY(-8px);
}

/* Responsive */
@media (max-width: 900px) {
  .sidebar {
    width: 220px;
  }
}

@media (max-width: 768px) {
  .app-layout {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    height: auto;
    position: static;
  }

  .app-topbar {
    padding: 0 var(--space-md);
  }

  .command-trigger-text {
    display: none;
  }
}
</style>
