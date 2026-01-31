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
    <div v-else-if="!student" class="py-12 text-center text-gray-500">
      找不到學員資料
    </div>

    <!-- Student Detail -->
    <div v-else>
      <!-- Header -->
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
        <div class="flex items-center space-x-4">
          <div class="w-16 h-16 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-2xl font-medium text-gray-600 dark:text-gray-300">
            {{ student.full_name.charAt(0) }}
          </div>
          <div>
            <h1 class="text-xl font-bold text-gray-900 dark:text-white">
              {{ student.full_name }}
            </h1>
            <p class="text-gray-500">{{ student.member_code }}</p>
            <span
              class="text-xs px-2 py-0.5 rounded-full"
              :class="student.coach_role === 'PRIMARY' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'"
            >
              {{ student.coach_role === 'PRIMARY' ? '主教練' : '副教練' }}
            </span>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span class="text-gray-500">電話</span>
            <p class="font-medium">{{ student.phone || '-' }}</p>
          </div>
          <div>
            <span class="text-gray-500">Email</span>
            <p class="font-medium">{{ student.email || '-' }}</p>
          </div>
          <div>
            <span class="text-gray-500">入會日期</span>
            <p class="font-medium">{{ formatDate(student.join_date) }}</p>
          </div>
          <div>
            <span class="text-gray-500">指派日期</span>
            <p class="font-medium">{{ formatDate(student.assigned_at) }}</p>
          </div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex border-b border-gray-200 dark:border-gray-700 mb-4">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="px-4 py-2 text-sm font-medium border-b-2 -mb-px"
          :class="activeTab === tab.key
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700'"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Tab Content: Contracts -->
      <div v-if="activeTab === 'contracts'" class="space-y-3">
        <div
          v-for="contract in student.contracts"
          :key="contract.id"
          class="bg-white dark:bg-gray-800 rounded-lg shadow p-4"
        >
          <div class="flex justify-between items-start">
            <div>
              <p class="font-medium text-gray-900 dark:text-white">{{ contract.plan_name }}</p>
              <p class="text-sm text-gray-500">{{ contract.contract_no }}</p>
            </div>
            <span
              class="px-2 py-1 text-xs rounded-full"
              :class="getContractStatusClass(contract.status)"
            >
              {{ getContractStatusText(contract.status) }}
            </span>
          </div>
          <div class="mt-2 text-sm text-gray-500">
            <p>{{ formatDate(contract.start_date) }} ~ {{ formatDate(contract.end_date) }}</p>
            <p v-if="contract.plan_type === 'COUNT_BASED'" class="text-orange-600">
              剩餘 {{ contract.remaining_counts }} 堂
            </p>
          </div>
        </div>
        <div v-if="student.contracts.length === 0" class="text-center text-gray-500 py-8">
          沒有有效合約
        </div>
      </div>

      <!-- Tab Content: Goals -->
      <div v-if="activeTab === 'goals'" class="space-y-3">
        <div
          v-for="goal in student.goals"
          :key="goal.id"
          class="bg-white dark:bg-gray-800 rounded-lg shadow p-4"
        >
          <div class="flex justify-between items-start">
            <p class="font-medium text-gray-900 dark:text-white">{{ getGoalText(goal.goal_type) }}</p>
            <span
              class="px-2 py-1 text-xs rounded-full"
              :class="goal.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'"
            >
              {{ goal.status === 'IN_PROGRESS' ? '進行中' : '已達成' }}
            </span>
          </div>
          <div class="mt-2 text-sm text-gray-500">
            <p>開始：{{ formatDate(goal.start_date) }}</p>
            <p v-if="goal.target_date">目標：{{ formatDate(goal.target_date) }}</p>
          </div>
        </div>
        <div v-if="student.goals.length === 0" class="text-center text-gray-500 py-8">
          尚未設定目標
        </div>
      </div>

      <!-- Tab Content: Measurements -->
      <div v-if="activeTab === 'measurements'" class="space-y-3">
        <div
          v-for="m in student.measurements"
          :key="m.id"
          class="bg-white dark:bg-gray-800 rounded-lg shadow p-4"
        >
          <div class="flex justify-between items-center mb-2">
            <p class="font-medium text-gray-900 dark:text-white">{{ formatDate(m.date) }}</p>
            <span class="text-xs text-gray-500">{{ m.source }}</span>
          </div>
          <div class="grid grid-cols-4 gap-2 text-center text-sm">
            <div>
              <p class="text-gray-500">體重</p>
              <p class="font-medium">{{ m.weight ? `${m.weight}kg` : '-' }}</p>
            </div>
            <div>
              <p class="text-gray-500">體脂</p>
              <p class="font-medium">{{ m.body_fat ? `${m.body_fat}%` : '-' }}</p>
            </div>
            <div>
              <p class="text-gray-500">肌肉量</p>
              <p class="font-medium">{{ m.muscle_mass ? `${m.muscle_mass}kg` : '-' }}</p>
            </div>
            <div>
              <p class="text-gray-500">BMI</p>
              <p class="font-medium">{{ m.bmi || '-' }}</p>
            </div>
          </div>
        </div>
        <div v-if="student.measurements.length === 0" class="text-center text-gray-500 py-8">
          尚無身體數據記錄
        </div>
      </div>

      <!-- Tab Content: Notes -->
      <div v-if="activeTab === 'notes'">
        <!-- Add Note Button -->
        <button
          class="w-full mb-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 hover:border-blue-500 hover:text-blue-500"
          @click="showNoteForm = true"
        >
          + 新增筆記
        </button>

        <!-- Notes List -->
        <div class="space-y-3">
          <div
            v-for="note in student.notes"
            :key="note.id"
            class="bg-white dark:bg-gray-800 rounded-lg shadow p-4"
          >
            <div class="flex justify-between items-start mb-2">
              <span
                class="px-2 py-0.5 text-xs rounded-full"
                :class="getNoteTypeClass(note.note_type)"
              >
                {{ getNoteTypeText(note.note_type) }}
              </span>
              <span class="text-xs text-gray-500">{{ formatDate(note.created_at) }}</span>
            </div>
            <p class="text-gray-900 dark:text-white whitespace-pre-wrap">{{ note.content }}</p>
          </div>
        </div>
        <div v-if="student.notes.length === 0" class="text-center text-gray-500 py-8">
          尚無筆記
        </div>
      </div>

      <!-- Tab Content: History -->
      <div v-if="activeTab === 'history'" class="space-y-3">
        <div
          v-for="cls in student.class_history"
          :key="cls.id"
          class="bg-white dark:bg-gray-800 rounded-lg shadow p-4"
        >
          <div class="flex justify-between items-start">
            <div>
              <p class="font-medium text-gray-900 dark:text-white">
                {{ formatDateTime(cls.scheduled_at) }}
              </p>
              <p class="text-sm text-gray-500">{{ cls.duration_minutes }} 分鐘</p>
            </div>
            <span
              class="px-2 py-1 text-xs rounded-full"
              :class="getClassStatusClass(cls.status)"
            >
              {{ getClassStatusText(cls.status) }}
            </span>
          </div>
          <div v-if="cls.coach_notes" class="mt-2 text-sm text-gray-600 dark:text-gray-400">
            {{ cls.coach_notes }}
          </div>
        </div>
        <div v-if="student.class_history.length === 0" class="text-center text-gray-500 py-8">
          尚無課程記錄
        </div>
      </div>
    </div>

    <!-- Note Form Modal -->
    <div
      v-if="showNoteForm"
      class="fixed inset-0 z-50 bg-black/50 flex items-end"
      @click="showNoteForm = false"
    >
      <div
        class="w-full bg-white dark:bg-gray-800 rounded-t-xl p-4 max-h-[80vh] overflow-auto"
        @click.stop
      >
        <h3 class="text-lg font-medium mb-4">新增學員筆記</h3>
        <form @submit.prevent="handleCreateNote">
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              筆記類型
            </label>
            <select
              v-model="noteForm.note_type"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
              required
            >
              <option value="PROGRESS">進度記錄</option>
              <option value="GOAL">目標設定</option>
              <option value="INJURY">傷病記錄</option>
              <option value="FEEDBACK">回饋意見</option>
              <option value="GENERAL">一般筆記</option>
            </select>
          </div>
          <div class="mb-4">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              內容
            </label>
            <textarea
              v-model="noteForm.content"
              rows="4"
              class="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700"
              required
            />
          </div>
          <div class="flex gap-2">
            <button
              type="button"
              class="flex-1 py-2 border border-gray-300 dark:border-gray-600 rounded-lg"
              @click="showNoteForm = false"
            >
              取消
            </button>
            <button
              type="submit"
              class="flex-1 py-2 bg-blue-600 text-white rounded-lg"
              :disabled="noteSubmitting"
            >
              {{ noteSubmitting ? '儲存中...' : '儲存' }}
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
const { getStudent, createNote } = useStudents()

const loading = ref(true)
const student = ref<Awaited<ReturnType<typeof getStudent>>>(null)

const tabs = [
  { key: 'contracts', label: '合約' },
  { key: 'goals', label: '目標' },
  { key: 'measurements', label: '身體數據' },
  { key: 'notes', label: '筆記' },
  { key: 'history', label: '課程歷史' },
]
const activeTab = ref('contracts')

const showNoteForm = ref(false)
const noteSubmitting = ref(false)
const noteForm = ref({
  note_type: 'PROGRESS',
  content: '',
})

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('zh-TW')
}

const formatDateTime = (dateStr: string) => {
  return new Date(dateStr).toLocaleString('zh-TW', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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

const getContractStatusClass = (status: string) => {
  const classes: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    PAUSED: 'bg-yellow-100 text-yellow-800',
    EXPIRED: 'bg-gray-100 text-gray-600',
  }
  return classes[status] || 'bg-gray-100 text-gray-600'
}

const getContractStatusText = (status: string) => {
  const texts: Record<string, string> = {
    ACTIVE: '有效',
    PAUSED: '暫停',
    EXPIRED: '已過期',
    TERMINATED: '已終止',
  }
  return texts[status] || status
}

const getClassStatusClass = (status: string) => {
  const classes: Record<string, string> = {
    BOOKED: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-green-100 text-green-800',
    MEMBER_CANCELLED: 'bg-gray-100 text-gray-600',
    COACH_CANCELLED: 'bg-gray-100 text-gray-600',
    NO_SHOW: 'bg-red-100 text-red-800',
  }
  return classes[status] || 'bg-gray-100 text-gray-600'
}

const getClassStatusText = (status: string) => {
  const texts: Record<string, string> = {
    BOOKED: '已預約',
    COMPLETED: '已完成',
    MEMBER_CANCELLED: '學員取消',
    COACH_CANCELLED: '教練取消',
    NO_SHOW: '未到',
  }
  return texts[status] || status
}

const getNoteTypeClass = (type: string) => {
  const classes: Record<string, string> = {
    PROGRESS: 'bg-blue-100 text-blue-800',
    GOAL: 'bg-green-100 text-green-800',
    INJURY: 'bg-red-100 text-red-800',
    FEEDBACK: 'bg-purple-100 text-purple-800',
    GENERAL: 'bg-gray-100 text-gray-600',
  }
  return classes[type] || 'bg-gray-100 text-gray-600'
}

const getNoteTypeText = (type: string) => {
  const texts: Record<string, string> = {
    PROGRESS: '進度',
    GOAL: '目標',
    INJURY: '傷病',
    FEEDBACK: '回饋',
    GENERAL: '一般',
  }
  return texts[type] || type
}

const handleCreateNote = async () => {
  noteSubmitting.value = true
  const result = await createNote(route.params.id as string, noteForm.value)

  if (result.success) {
    success('筆記已新增')
    showNoteForm.value = false
    noteForm.value = { note_type: 'PROGRESS', content: '' }
    // Reload student data
    student.value = await getStudent(route.params.id as string)
  } else {
    showError(result.message || '新增筆記失敗')
  }
  noteSubmitting.value = false
}

onMounted(async () => {
  loading.value = true
  student.value = await getStudent(route.params.id as string)
  loading.value = false
})
</script>
