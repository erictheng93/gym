<template>
  <div class="p-4">
    <div class="flex justify-between items-center mb-4">
      <h1 class="text-xl font-bold text-gray-900 dark:text-white">行事曆</h1>
    </div>

    <!-- Week Navigation -->
    <div class="flex justify-between items-center mb-4 bg-white dark:bg-gray-800 rounded-lg shadow p-3">
      <button
        class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        @click="previousWeek"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <div class="text-center">
        <p class="font-medium text-gray-900 dark:text-white">
          {{ formatWeekRange(currentWeekStart) }}
        </p>
        <button
          class="text-sm text-blue-600 mt-1"
          @click="goToToday"
        >
          回到今天
        </button>
      </div>
      <button
        class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
        @click="nextWeek"
      >
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="py-12 text-center">
      <div class="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto" />
    </div>

    <!-- Week View -->
    <div v-else class="space-y-3">
      <div
        v-for="day in weekDays"
        :key="day.date"
        class="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden"
      >
        <!-- Day Header -->
        <div
          class="px-4 py-2 border-b border-gray-100 dark:border-gray-700"
          :class="isToday(day.date) ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-gray-50 dark:bg-gray-900'"
        >
          <div class="flex items-center gap-2">
            <span
              v-if="isToday(day.date)"
              class="w-2 h-2 bg-blue-600 rounded-full"
            />
            <span class="font-medium text-gray-900 dark:text-white">
              {{ formatDayHeader(day.date) }}
            </span>
            <span class="text-sm text-gray-500">
              {{ getClassCount(day.date) }} 堂課
            </span>
          </div>
        </div>

        <!-- Classes for this day -->
        <div v-if="getClassesForDay(day.date).length > 0" class="divide-y divide-gray-100 dark:divide-gray-700">
          <div
            v-for="classItem in getClassesForDay(day.date)"
            :key="classItem.id"
            class="p-3 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
            @click="goToClass(classItem.id)"
          >
            <div class="flex justify-between items-start">
              <div>
                <p class="font-medium text-gray-900 dark:text-white">
                  {{ classItem.member.full_name }}
                </p>
                <p class="text-sm text-gray-500">
                  {{ formatTime(classItem.scheduled_at) }} · {{ classItem.duration_minutes }}分鐘
                </p>
              </div>
              <span
                class="px-2 py-0.5 text-xs rounded-full"
                :class="getStatusClass(classItem.status)"
              >
                {{ getStatusText(classItem.status) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div v-else class="p-4 text-center text-gray-400 text-sm">
          沒有排課
        </div>
      </div>
    </div>

    <!-- Summary Card -->
    <div v-if="schedule" class="mt-4 bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <h2 class="font-medium text-gray-900 dark:text-white mb-3">本週統計</h2>
      <div class="grid grid-cols-3 gap-4 text-center">
        <div>
          <p class="text-2xl font-bold text-blue-600">{{ weekStats.total }}</p>
          <p class="text-sm text-gray-500">總課程</p>
        </div>
        <div>
          <p class="text-2xl font-bold text-green-600">{{ weekStats.completed }}</p>
          <p class="text-sm text-gray-500">已完成</p>
        </div>
        <div>
          <p class="text-2xl font-bold text-orange-600">{{ weekStats.upcoming }}</p>
          <p class="text-sm text-gray-500">待上課</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ClassBooking } from '~/types/coach'

definePageMeta({
  middleware: 'auth',
})

const router = useRouter()
const { schedule, loading, getSchedule } = useCoachClasses()

const currentWeekStart = ref(getMonday(new Date()))

const weekDays = computed(() => {
  const days = []
  const start = new Date(currentWeekStart.value)
  for (let i = 0; i < 7; i++) {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    days.push({
      date: date.toISOString().split('T')[0],
      dayOfWeek: date.getDay(),
    })
  }
  return days
})

const weekStats = computed(() => {
  if (!schedule.value?.classes) return { total: 0, completed: 0, upcoming: 0 }

  const classes = schedule.value.classes
  return {
    total: classes.length,
    completed: classes.filter(c => c.status === 'COMPLETED').length,
    upcoming: classes.filter(c => c.status === 'BOOKED').length,
  }
})

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function previousWeek() {
  const newDate = new Date(currentWeekStart.value)
  newDate.setDate(newDate.getDate() - 7)
  currentWeekStart.value = newDate
  loadSchedule()
}

function nextWeek() {
  const newDate = new Date(currentWeekStart.value)
  newDate.setDate(newDate.getDate() + 7)
  currentWeekStart.value = newDate
  loadSchedule()
}

function goToToday() {
  currentWeekStart.value = getMonday(new Date())
  loadSchedule()
}

function formatWeekRange(start: Date) {
  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  const startMonth = start.toLocaleDateString('zh-TW', { month: 'short' })
  const endMonth = end.toLocaleDateString('zh-TW', { month: 'short' })

  if (startMonth === endMonth) {
    return `${startMonth} ${start.getDate()} - ${end.getDate()}日`
  }
  return `${startMonth} ${start.getDate()}日 - ${endMonth} ${end.getDate()}日`
}

function formatDayHeader(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-TW', {
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
  })
}

function isToday(dateStr: string) {
  return dateStr === new Date().toISOString().split('T')[0]
}

function getClassesForDay(dateStr: string): ClassBooking[] {
  if (!schedule.value?.classes) return []
  return schedule.value.classes.filter(c => {
    const classDate = new Date(c.scheduled_at).toISOString().split('T')[0]
    return classDate === dateStr
  })
}

function getClassCount(dateStr: string) {
  return getClassesForDay(dateStr).length
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('zh-TW', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getStatusClass(status: string) {
  const classes: Record<string, string> = {
    BOOKED: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-green-100 text-green-800',
    MEMBER_CANCELLED: 'bg-gray-100 text-gray-600',
    COACH_CANCELLED: 'bg-gray-100 text-gray-600',
    NO_SHOW: 'bg-red-100 text-red-800',
  }
  return classes[status] || 'bg-gray-100 text-gray-600'
}

function getStatusText(status: string) {
  const texts: Record<string, string> = {
    BOOKED: '已預約',
    COMPLETED: '已完成',
    MEMBER_CANCELLED: '學員取消',
    COACH_CANCELLED: '教練取消',
    NO_SHOW: '未到',
  }
  return texts[status] || status
}

function goToClass(id: string) {
  router.push(`/classes/${id}`)
}

async function loadSchedule() {
  const endDate = new Date(currentWeekStart.value)
  endDate.setDate(endDate.getDate() + 6)

  await getSchedule({
    start_date: currentWeekStart.value.toISOString().split('T')[0],
    end_date: endDate.toISOString().split('T')[0],
  })
}

onMounted(() => {
  loadSchedule()
})
</script>
