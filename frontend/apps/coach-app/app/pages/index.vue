<template>
  <div class="p-4">
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        {{ greeting }}，{{ displayName }}
      </h1>
      <p class="text-gray-500 dark:text-gray-400">
        {{ branchName }}
      </p>
    </div>

    <!-- Stats Grid -->
    <div class="grid grid-cols-2 gap-4 mb-6">
      <div class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
        <div class="text-3xl font-bold text-blue-600">
          {{ todayClassCount }}
        </div>
        <div class="text-sm text-gray-500">今日課程</div>
      </div>
      <div class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow">
        <div class="text-3xl font-bold text-green-600">
          {{ studentCount }}
        </div>
        <div class="text-sm text-gray-500">指派學員</div>
      </div>
    </div>

    <!-- Today's Classes -->
    <div class="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
      <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <h2 class="font-semibold text-gray-900 dark:text-white">今日課程</h2>
        <NuxtLink to="/classes" class="text-sm text-blue-600 hover:text-blue-800">
          查看全部 →
        </NuxtLink>
      </div>

      <div v-if="loading" class="p-8 text-center">
        <div class="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
      </div>

      <div v-else-if="todayClasses.length === 0" class="p-8 text-center text-gray-500">
        今天沒有排定的課程
      </div>

      <div v-else class="divide-y divide-gray-200 dark:divide-gray-700">
        <div
          v-for="classItem in todayClasses"
          :key="classItem.id"
          class="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
          @click="goToClass(classItem.id)"
        >
          <div class="flex justify-between items-start">
            <div>
              <div class="font-medium text-gray-900 dark:text-white">
                {{ classItem.member.full_name }}
              </div>
              <div class="text-sm text-gray-500">
                {{ formatTime(classItem.scheduled_at) }} · {{ classItem.duration_minutes }}分鐘
              </div>
              <div class="text-sm text-gray-500">
                {{ classItem.contract.plan_name }}
                <span v-if="classItem.contract.plan_type === 'COUNT_BASED'" class="text-orange-600">
                  (剩餘 {{ classItem.contract.remaining_counts }} 堂)
                </span>
              </div>
            </div>
            <span
              class="px-2 py-1 text-xs rounded-full"
              :class="getStatusClass(classItem.status)"
            >
              {{ getStatusText(classItem.status) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Actions -->
    <div class="grid grid-cols-2 gap-4">
      <NuxtLink
        to="/students"
        class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow hover:shadow-md transition-shadow"
      >
        <svg class="w-8 h-8 text-blue-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <div class="font-medium text-gray-900 dark:text-white">學員管理</div>
        <div class="text-sm text-gray-500">查看指派學員</div>
      </NuxtLink>

      <NuxtLink
        to="/lessons"
        class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow hover:shadow-md transition-shadow"
      >
        <svg class="w-8 h-8 text-green-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <div class="font-medium text-gray-900 dark:text-white">教案管理</div>
        <div class="text-sm text-gray-500">建立與管理教案</div>
      </NuxtLink>

      <NuxtLink
        to="/schedule"
        class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow hover:shadow-md transition-shadow"
      >
        <svg class="w-8 h-8 text-purple-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div class="font-medium text-gray-900 dark:text-white">週行事曆</div>
        <div class="text-sm text-gray-500">查看本週排程</div>
      </NuxtLink>

      <NuxtLink
        to="/library"
        class="bg-white dark:bg-gray-800 rounded-lg p-4 shadow hover:shadow-md transition-shadow"
      >
        <svg class="w-8 h-8 text-orange-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
        <div class="font-medium text-gray-900 dark:text-white">教學資源庫</div>
        <div class="text-sm text-gray-500">動作與影片庫</div>
      </NuxtLink>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ClassBooking } from '~/types/coach'

definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const config = useRuntimeConfig()
const { displayName, branchName, studentCount, todayClassCount, getAuthHeader } = useCoachAuth()

const loading = ref(true)
const todayClasses = ref<ClassBooking[]>([])

// Greeting based on time
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return '早安'
  if (hour < 18) return '午安'
  return '晚安'
})

// Fetch today's classes
const fetchTodayClasses = async () => {
  loading.value = true
  try {
    const today = new Date().toISOString().split('T')[0]
    const response = await $fetch<{
      success: boolean
      data: ClassBooking[]
    }>(`${config.public.directusUrl}/gym/coach/classes`, {
      headers: getAuthHeader(),
      query: { date: today, limit: 10 },
    })

    if (response.success) {
      todayClasses.value = response.data
    }
  } catch (error) {
    console.error('Failed to fetch classes:', error)
  } finally {
    loading.value = false
  }
}

const formatTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getStatusClass = (status: string) => {
  const classes: Record<string, string> = {
    BOOKED: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-green-100 text-green-800',
    MEMBER_CANCELLED: 'bg-gray-100 text-gray-800',
    COACH_CANCELLED: 'bg-gray-100 text-gray-800',
    NO_SHOW: 'bg-red-100 text-red-800',
  }
  return classes[status] || 'bg-gray-100 text-gray-800'
}

const getStatusText = (status: string) => {
  const texts: Record<string, string> = {
    BOOKED: '已預約',
    COMPLETED: '已完成',
    MEMBER_CANCELLED: '學員取消',
    COACH_CANCELLED: '教練取消',
    NO_SHOW: '未到',
  }
  return texts[status] || status
}

const goToClass = (id: string) => {
  router.push(`/classes/${id}`)
}

onMounted(() => {
  fetchTodayClasses()
})
</script>
