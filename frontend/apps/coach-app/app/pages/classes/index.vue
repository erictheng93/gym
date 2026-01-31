<template>
  <div class="p-4">
    <div class="mb-4">
      <h1 class="text-xl font-bold text-gray-900 dark:text-white">課程管理</h1>
    </div>

    <!-- Date Filter -->
    <div class="mb-4">
      <input
        v-model="selectedDate"
        type="date"
        class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
        @change="loadClasses"
      />
    </div>

    <!-- Status Filter -->
    <div class="flex gap-2 mb-4 overflow-x-auto pb-2">
      <button
        v-for="status in statusOptions"
        :key="status.value"
        class="px-3 py-1.5 text-sm rounded-full whitespace-nowrap"
        :class="selectedStatus === status.value
          ? 'bg-blue-600 text-white'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'"
        @click="selectedStatus = status.value; loadClasses()"
      >
        {{ status.label }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="py-12 text-center">
      <div class="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
    </div>

    <!-- Empty State -->
    <div v-else-if="classes.length === 0" class="py-12 text-center text-gray-500">
      <svg class="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
      <p>沒有找到符合條件的課程</p>
    </div>

    <!-- Classes List -->
    <div v-else class="space-y-3">
      <div
        v-for="classItem in classes"
        :key="classItem.id"
        class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition-shadow"
        @click="goToClass(classItem.id)"
      >
        <div class="flex justify-between items-start mb-2">
          <div>
            <p class="font-medium text-gray-900 dark:text-white">
              {{ classItem.member.full_name }}
            </p>
            <p class="text-sm text-gray-500">
              {{ formatTime(classItem.scheduled_at) }} · {{ classItem.duration_minutes }}分鐘
            </p>
          </div>
          <span
            class="px-2 py-1 text-xs rounded-full"
            :class="getStatusClass(classItem.status)"
          >
            {{ getStatusText(classItem.status) }}
          </span>
        </div>

        <div class="text-sm text-gray-500">
          <p>{{ classItem.contract.plan_name }}</p>
          <p v-if="classItem.contract.plan_type === 'COUNT_BASED'" class="text-orange-600">
            剩餘 {{ classItem.contract.remaining_counts }} 堂
          </p>
        </div>

        <!-- Quick Actions for BOOKED status -->
        <div
          v-if="classItem.status === 'BOOKED'"
          class="mt-3 flex gap-2"
          @click.stop
        >
          <button
            class="flex-1 py-2 bg-green-600 text-white text-sm rounded-lg"
            @click="handleAttendance(classItem.id, true)"
          >
            已出席
          </button>
          <button
            class="flex-1 py-2 bg-red-600 text-white text-sm rounded-lg"
            @click="handleAttendance(classItem.id, false)"
          >
            未到
          </button>
        </div>
      </div>
    </div>

    <!-- Load More -->
    <div v-if="classes.length < total" class="mt-4 text-center">
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
const { success, error: showError } = useToast()
const { classes, loading, total, fetchClasses, markAttendance } = useCoachClasses()

const selectedDate = ref('')
const selectedStatus = ref('')
const offset = ref(0)
const limit = 20

const statusOptions = [
  { value: '', label: '全部' },
  { value: 'BOOKED', label: '已預約' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'NO_SHOW', label: '未到' },
  { value: 'MEMBER_CANCELLED', label: '學員取消' },
  { value: 'COACH_CANCELLED', label: '教練取消' },
]

const loadClasses = async () => {
  offset.value = 0
  await fetchClasses({
    date: selectedDate.value || undefined,
    status: selectedStatus.value || undefined,
    limit,
    offset: offset.value,
  })
}

const loadMore = async () => {
  offset.value += limit
  await fetchClasses({
    date: selectedDate.value || undefined,
    status: selectedStatus.value || undefined,
    limit,
    offset: offset.value,
  })
}

const formatTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('zh-TW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getStatusClass = (status: string) => {
  const statusClasses: Record<string, string> = {
    BOOKED: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-green-100 text-green-800',
    MEMBER_CANCELLED: 'bg-gray-100 text-gray-600',
    COACH_CANCELLED: 'bg-gray-100 text-gray-600',
    NO_SHOW: 'bg-red-100 text-red-800',
  }
  return statusClasses[status] || 'bg-gray-100 text-gray-600'
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

const handleAttendance = async (classId: string, attended: boolean) => {
  const result = await markAttendance(classId, { attended })

  if (result.success) {
    success(attended ? '已標記出席' : '已標記未到')
    await loadClasses()
  } else {
    showError(result.message || '操作失敗')
  }
}

onMounted(() => {
  loadClasses()
})
</script>
