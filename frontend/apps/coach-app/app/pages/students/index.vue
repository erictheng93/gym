<template>
  <div class="p-4">
    <div class="mb-4">
      <h1 class="text-xl font-bold text-gray-900 dark:text-white">學員管理</h1>
      <p class="text-sm text-gray-500">共 {{ total }} 位指派學員</p>
    </div>

    <!-- Search and Filter -->
    <div class="mb-4 space-y-3">
      <div class="relative">
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜尋學員姓名、電話或會員編號"
          class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
          @input="debouncedSearch"
        />
        <svg class="absolute left-3 top-2.5 w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>

      <div class="flex gap-2">
        <select
          v-model="roleFilter"
          class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
          @change="handleFilterChange"
        >
          <option value="">所有角色</option>
          <option value="PRIMARY">主教練</option>
          <option value="SECONDARY">副教練</option>
        </select>
        <select
          v-model="statusFilter"
          class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
          @change="handleFilterChange"
        >
          <option value="">所有狀態</option>
          <option value="ACTIVE">有效</option>
          <option value="EXPIRED">已過期</option>
          <option value="SUSPENDED">暫停</option>
        </select>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="py-12 text-center">
      <div class="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
    </div>

    <!-- Empty State -->
    <div v-else-if="students.length === 0" class="py-12 text-center text-gray-500">
      <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
      <p>尚未有指派的學員</p>
    </div>

    <!-- Student List -->
    <div v-else class="space-y-3">
      <div
        v-for="student in students"
        :key="student.id"
        class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
        @click="goToStudent(student.id)"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <div class="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-lg font-medium text-gray-600 dark:text-gray-300">
              {{ student.full_name.charAt(0) }}
            </div>
            <div>
              <div class="font-medium text-gray-900 dark:text-white">
                {{ student.full_name }}
                <span
                  class="ml-2 text-xs px-2 py-0.5 rounded-full"
                  :class="student.coach_role === 'PRIMARY' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'"
                >
                  {{ student.coach_role === 'PRIMARY' ? '主教練' : '副教練' }}
                </span>
              </div>
              <div class="text-sm text-gray-500">
                {{ student.member_code }} · {{ student.phone }}
              </div>
            </div>
          </div>
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
        </div>

        <div class="mt-3 flex items-center gap-4 text-sm text-gray-500">
          <span class="flex items-center">
            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {{ student.completed_classes }} 堂已完成
          </span>
          <span class="flex items-center">
            <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {{ student.active_contracts }} 個有效合約
          </span>
        </div>

        <div v-if="student.current_goal" class="mt-2">
          <span class="text-xs px-2 py-1 rounded-full bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100">
            目標：{{ getGoalText(student.current_goal) }}
          </span>
        </div>
      </div>
    </div>

    <!-- Load More -->
    <div v-if="students.length < total" class="mt-4 text-center">
      <button
        class="px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg"
        @click="loadMore"
      >
        載入更多
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const { students, loading, total, fetchStudents } = useStudents()

const searchQuery = ref('')
const roleFilter = ref('')
const statusFilter = ref('')
const offset = ref(0)
const limit = 20

// Debounced search
let searchTimeout: ReturnType<typeof setTimeout>
const debouncedSearch = () => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    offset.value = 0
    loadStudents()
  }, 300)
}

const handleFilterChange = () => {
  offset.value = 0
  loadStudents()
}

const loadStudents = async () => {
  await fetchStudents({
    search: searchQuery.value || undefined,
    role: roleFilter.value as 'PRIMARY' | 'SECONDARY' || undefined,
    status: statusFilter.value || undefined,
    limit,
    offset: offset.value,
  })
}

const loadMore = async () => {
  offset.value += limit
  await fetchStudents({
    search: searchQuery.value || undefined,
    role: roleFilter.value as 'PRIMARY' | 'SECONDARY' || undefined,
    status: statusFilter.value || undefined,
    limit,
    offset: offset.value,
  })
}

const goToStudent = (id: string) => {
  router.push(`/students/${id}`)
}

const getGoalText = (goalType: string) => {
  const goals: Record<string, string> = {
    WEIGHT_LOSS: '減重',
    MUSCLE_GAIN: '增肌',
    BODY_SHAPE: '體態雕塑',
    HEALTH: '健康維持',
    OTHER: '其他',
  }
  return goals[goalType] || goalType
}

onMounted(() => {
  loadStudents()
})
</script>
