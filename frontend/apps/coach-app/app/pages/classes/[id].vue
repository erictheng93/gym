<template>
  <div class="p-4">
    <!-- Back Button -->
    <button
      class="flex items-center text-gray-600 dark:text-gray-400 mb-4"
      @click="router.back()"
    >
      <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      返回
    </button>

    <!-- Loading -->
    <div v-if="loading" class="py-12 text-center">
      <div class="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
    </div>

    <!-- Not Found -->
    <div v-else-if="!classData" class="py-12 text-center text-gray-500">
      找不到課程資料
    </div>

    <!-- Class Detail -->
    <div v-else>
      <!-- Status Badge -->
      <div class="mb-4">
        <span
          class="px-3 py-1 text-sm rounded-full"
          :class="getStatusClass(classData.status)"
        >
          {{ getStatusText(classData.status) }}
        </span>
      </div>

      <!-- Class Info -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
        <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-2">
          課程資訊
        </h2>
        <div class="space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-gray-500">時間</span>
            <span class="font-medium">{{ formatDateTime(classData.scheduled_at) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">時長</span>
            <span class="font-medium">{{ classData.duration_minutes }} 分鐘</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">場館</span>
            <span class="font-medium">{{ classData.branch_name }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">預約方式</span>
            <span class="font-medium">{{ getBookedByText(classData.booked_by) }}</span>
          </div>
        </div>
      </div>

      <!-- Member Info -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
        <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-2">
          學員資訊
        </h2>
        <div class="flex items-center space-x-3">
          <div class="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-lg font-medium">
            {{ classData.member.full_name.charAt(0) }}
          </div>
          <div>
            <p class="font-medium text-gray-900 dark:text-white">{{ classData.member.full_name }}</p>
            <p class="text-sm text-gray-500">{{ classData.member.member_code }}</p>
          </div>
        </div>
        <div class="mt-3 space-y-1 text-sm">
          <p class="text-gray-500">
            電話：<a :href="`tel:${classData.member.phone}`" class="text-blue-600">{{ classData.member.phone }}</a>
          </p>
          <p v-if="classData.member.email" class="text-gray-500">
            Email：{{ classData.member.email }}
          </p>
        </div>
      </div>

      <!-- Contract Info -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
        <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-2">
          合約資訊
        </h2>
        <div class="space-y-2 text-sm">
          <p class="font-medium">{{ classData.contract.plan_name }}</p>
          <p class="text-gray-500">{{ classData.contract.contract_no }}</p>
          <p v-if="classData.contract.plan_type === 'COUNT_BASED'" class="text-orange-600 font-medium">
            剩餘堂數：{{ classData.contract.remaining_counts }} 堂
          </p>
        </div>
      </div>

      <!-- Notes -->
      <div v-if="classData.notes" class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
        <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-2">
          備註
        </h2>
        <p class="text-gray-600 dark:text-gray-400 whitespace-pre-wrap">{{ classData.notes }}</p>
      </div>

      <!-- Lesson Plan -->
      <div v-if="classData.lesson_plan" class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
        <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-2">
          教案
        </h2>
        <p class="font-medium">{{ classData.lesson_plan.title }}</p>
        <div v-if="classData.lesson_plan.objectives?.length" class="mt-2">
          <p class="text-sm text-gray-500 mb-1">目標：</p>
          <ul class="list-disc list-inside text-sm text-gray-600 dark:text-gray-400">
            <li v-for="(obj, idx) in classData.lesson_plan.objectives" :key="idx">{{ obj }}</li>
          </ul>
        </div>
      </div>

      <!-- Class Record (if completed) -->
      <div v-if="classData.record" class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
        <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-2">
          課程記錄
        </h2>
        <div v-if="classData.record.coach_notes" class="mb-2">
          <p class="text-sm text-gray-500">教練筆記：</p>
          <p class="text-gray-600 dark:text-gray-400">{{ classData.record.coach_notes }}</p>
        </div>
        <div v-if="classData.record.next_plan" class="mb-2">
          <p class="text-sm text-gray-500">下次計畫：</p>
          <p class="text-gray-600 dark:text-gray-400">{{ classData.record.next_plan }}</p>
        </div>
      </div>

      <!-- Actions for BOOKED status -->
      <div v-if="classData.status === 'BOOKED'" class="fixed bottom-20 left-0 right-0 p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
        <div class="flex gap-2 max-w-lg mx-auto">
          <button
            class="flex-1 py-3 bg-green-600 text-white font-medium rounded-lg"
            @click="showAttendanceModal = true; attendanceType = 'attended'"
          >
            已出席
          </button>
          <button
            class="flex-1 py-3 bg-red-600 text-white font-medium rounded-lg"
            @click="showAttendanceModal = true; attendanceType = 'no_show'"
          >
            未到
          </button>
          <button
            class="py-3 px-4 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg"
            @click="showCancelModal = true"
          >
            取消
          </button>
        </div>
      </div>
    </div>

    <!-- Attendance Modal -->
    <div
      v-if="showAttendanceModal"
      class="fixed inset-0 z-50 bg-black/50 flex items-end"
      @click="showAttendanceModal = false"
    >
      <div
        class="w-full bg-white dark:bg-gray-800 rounded-t-xl p-4 max-h-[80vh] overflow-auto"
        @click.stop
      >
        <h3 class="text-lg font-medium mb-4">
          {{ attendanceType === 'attended' ? '確認出席' : '確認未到' }}
        </h3>
        <form @submit.prevent="handleAttendance">
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              備註（選填）
            </label>
            <textarea
              v-model="attendanceNotes"
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
              placeholder="課程記錄或備註..."
            />
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              class="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg"
              @click="showAttendanceModal = false"
            >
              取消
            </button>
            <button
              type="submit"
              class="flex-1 py-2 text-white rounded-lg"
              :class="attendanceType === 'attended' ? 'bg-green-600' : 'bg-red-600'"
              :disabled="submitting"
            >
              {{ submitting ? '處理中...' : '確認' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Cancel Modal -->
    <div
      v-if="showCancelModal"
      class="fixed inset-0 z-50 bg-black/50 flex items-end"
      @click="showCancelModal = false"
    >
      <div
        class="w-full bg-white dark:bg-gray-800 rounded-t-xl p-4"
        @click.stop
      >
        <h3 class="text-lg font-medium mb-4">取消課程</h3>
        <form @submit.prevent="handleCancel">
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              取消原因
            </label>
            <textarea
              v-model="cancelReason"
              rows="3"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
              required
            />
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              class="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg"
              @click="showCancelModal = false"
            >
              返回
            </button>
            <button
              type="submit"
              class="flex-1 py-2 bg-red-600 text-white rounded-lg"
              :disabled="submitting"
            >
              {{ submitting ? '處理中...' : '確認取消' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const router = useRouter()
const { success, error: showError } = useToast()
const { getClass, markAttendance, cancelClass } = useCoachClasses()

const loading = ref(true)
const classData = ref<Awaited<ReturnType<typeof getClass>>>(null)
const submitting = ref(false)

const showAttendanceModal = ref(false)
const attendanceType = ref<'attended' | 'no_show'>('attended')
const attendanceNotes = ref('')

const showCancelModal = ref(false)
const cancelReason = ref('')

const formatDateTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('zh-TW', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getStatusClass = (status: string) => {
  const classes: Record<string, string> = {
    BOOKED: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-green-100 text-green-800',
    MEMBER_CANCELLED: 'bg-gray-100 text-gray-600',
    COACH_CANCELLED: 'bg-gray-100 text-gray-600',
    NO_SHOW: 'bg-red-100 text-red-800',
  }
  return classes[status] || 'bg-gray-100 text-gray-600'
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

const getBookedByText = (bookedBy: string) => {
  const texts: Record<string, string> = {
    MEMBER: '學員預約',
    COACH: '教練預約',
    RECEPTION: '櫃台預約',
  }
  return texts[bookedBy] || bookedBy
}

const handleAttendance = async () => {
  submitting.value = true
  const result = await markAttendance(route.params.id as string, {
    attended: attendanceType.value === 'attended',
    notes: attendanceNotes.value || undefined,
  })

  if (result.success) {
    success(attendanceType.value === 'attended' ? '已標記出席' : '已標記未到')
    showAttendanceModal.value = false
    // Reload class data
    classData.value = await getClass(route.params.id as string)
  } else {
    showError(result.message || '操作失敗')
  }
  submitting.value = false
}

const handleCancel = async () => {
  submitting.value = true
  const result = await cancelClass(route.params.id as string, cancelReason.value)

  if (result.success) {
    success('課程已取消')
    showCancelModal.value = false
    // Reload class data
    classData.value = await getClass(route.params.id as string)
  } else {
    showError(result.message || '取消失敗')
  }
  submitting.value = false
}

onMounted(async () => {
  loading.value = true
  classData.value = await getClass(route.params.id as string)
  loading.value = false
})
</script>
