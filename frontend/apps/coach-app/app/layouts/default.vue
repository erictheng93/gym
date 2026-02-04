<template>
  <div class="flex flex-col min-h-screen safe-area-top safe-area-bottom">
    <!-- Auth Loading Screen (prevents content flash) -->
    <div v-if="isAuthChecking" class="flex items-center justify-center flex-1 min-h-screen bg-gray-50 dark:bg-gray-900">
      <div class="flex flex-col items-center gap-4">
        <div class="w-10 h-10 border-3 border-gray-200 dark:border-gray-700 border-t-blue-600 rounded-full animate-spin" />
        <span class="text-gray-500 dark:text-gray-400 text-sm">載入中...</span>
      </div>
    </div>

    <!-- App Content (only render when auth check is complete) -->
    <template v-else>
      <!-- Top Navigation Bar -->
      <header
        v-if="isAuthenticated"
        class="sticky top-0 z-40 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700"
      >
        <div class="flex items-center justify-between px-4 h-14">
          <div class="flex items-center space-x-3">
            <NuxtLink to="/" class="text-xl font-bold text-blue-600">
              GymNexus
            </NuxtLink>
            <span v-if="branchName" class="text-sm text-gray-500">
              {{ branchName }}
            </span>
          </div>

          <div class="flex items-center space-x-2">
            <button
              class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
              @click="toggleMenu"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <!-- Mobile Menu -->
      <div
        v-if="menuOpen && isAuthenticated"
        class="fixed inset-0 z-50 bg-black/50"
        @click="menuOpen = false"
      >
        <div
          class="absolute right-0 top-0 h-full w-64 bg-white dark:bg-gray-800 shadow-xl"
          @click.stop
        >
          <div class="p-4 border-b border-gray-200 dark:border-gray-700">
            <div class="font-medium">{{ displayName }}</div>
            <div class="text-sm text-gray-500">{{ coach?.employee_code }}</div>
          </div>

          <nav class="p-2">
            <NuxtLink
              to="/"
              class="flex items-center px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              @click="menuOpen = false"
            >
              <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              首頁
            </NuxtLink>

            <NuxtLink
              to="/students"
              class="flex items-center px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              @click="menuOpen = false"
            >
              <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              學員管理
            </NuxtLink>

            <NuxtLink
              to="/classes"
              class="flex items-center px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              @click="menuOpen = false"
            >
              <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              課程管理
            </NuxtLink>

            <NuxtLink
              to="/schedule"
              class="flex items-center px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              @click="menuOpen = false"
            >
              <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              週行事曆
            </NuxtLink>

            <NuxtLink
              to="/lessons"
              class="flex items-center px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              @click="menuOpen = false"
            >
              <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              教案管理
            </NuxtLink>

            <NuxtLink
              to="/library"
              class="flex items-center px-4 py-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              @click="menuOpen = false"
            >
              <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              教學資源庫
            </NuxtLink>

            <div class="my-2 border-t border-gray-200 dark:border-gray-700" />

            <button
              class="flex items-center w-full px-4 py-3 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
              @click="handleLogout"
            >
              <svg class="w-5 h-5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              登出
            </button>
          </nav>
        </div>
      </div>

      <!-- Main Content -->
      <main class="flex-1">
        <slot />
      </main>

      <!-- Bottom Navigation (Mobile) -->
      <nav
        v-if="isAuthenticated"
        class="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 safe-area-bottom"
      >
        <div class="flex justify-around py-2">
          <NuxtLink
            to="/"
            class="flex flex-col items-center px-3 py-1"
            :class="isActiveRoute('/') ? 'text-blue-600' : 'text-gray-500'"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span class="text-xs mt-1">首頁</span>
          </NuxtLink>

          <NuxtLink
            to="/students"
            class="flex flex-col items-center px-3 py-1"
            :class="isActiveRoute('/students') ? 'text-blue-600' : 'text-gray-500'"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span class="text-xs mt-1">學員</span>
          </NuxtLink>

          <NuxtLink
            to="/classes"
            class="flex flex-col items-center px-3 py-1"
            :class="isActiveRoute('/classes') ? 'text-blue-600' : 'text-gray-500'"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span class="text-xs mt-1">課程</span>
          </NuxtLink>

          <NuxtLink
            to="/lessons"
            class="flex flex-col items-center px-3 py-1"
            :class="isActiveRoute('/lessons') ? 'text-blue-600' : 'text-gray-500'"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span class="text-xs mt-1">教案</span>
          </NuxtLink>

          <NuxtLink
            to="/library"
            class="flex flex-col items-center px-3 py-1"
            :class="isActiveRoute('/library') ? 'text-blue-600' : 'text-gray-500'"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span class="text-xs mt-1">資源</span>
          </NuxtLink>
        </div>
      </nav>

      <!-- Bottom padding for fixed nav -->
      <div v-if="isAuthenticated" class="h-16" />
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

const handleLogout = () => {
  menuOpen.value = false
  logout()
  router.push('/login')
}
</script>
