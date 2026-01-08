<script setup lang="ts">
import { MESSAGES, PAGES, STATUS } from '~/constants'
import type { VerificationMethod } from '~/components/VerificationMethodSelector.vue'

// Tab state
const activeTab = ref<'member' | 'staff'>('member')

// Common data
const { members, fetchMembers } = useMembers()
const { employees, fetchEmployees } = useEmployees()
const { currentEmployee } = useAuth()

// Member check-in composable
const {
  todayCheckins,
  todayCount: memberTodayCount,
  isLoading: checkinLoading,
  fetchTodayCheckins,
  performCheckin: doCheckin,
  getMemberActiveContract,
  hasCheckedInToday,
  verifyQrCheckin,
  parseQrPayload,
  isQrExpired
} = useCheckin()

// Staff attendance composable
const {
  todayAttendances,
  todayCount: staffTodayCount,
  isLoading: attendanceLoading,
  fetchTodayAttendances,
  getTodayAttendance,
  performCheckIn,
  performCheckOut
} = useAttendance()

// Verification method
const verificationMethod = ref<VerificationMethod>('MANUAL')

// Member check-in state
const searchQuery = ref('')
const selectedMember = ref<any>(null)
const selectedContract = ref<any>(null)
const memberBranch = ref<any>(null)
const isCrossBranch = ref(false)
const isCheckinSuccess = ref(false)
const isProcessing = ref(false)
const errorMessage = ref('')
const alreadyCheckedIn = ref(false)
const lastCheckinResult = ref<{ countDeducted?: boolean; remainingCounts?: number | null }>({})

// Staff attendance state
const employeeSearchQuery = ref('')
const selectedEmployee = ref<any>(null)
const todayAttendance = ref<any>(null)
const isAttendanceSuccess = ref(false)
const attendanceErrorMessage = ref('')

// Barcode scanner state
const isScannerActive = ref(false)
const scannerSupported = ref(false)
const videoRef = ref<HTMLVideoElement | null>(null)
let barcodeDetector: any = null
let scanInterval: NodeJS.Timeout | null = null

// QR code scanner state
const showQrScanner = ref(false)
const qrCheckinResult = ref<{ success: boolean; message: string; member?: any; contract?: any } | null>(null)

onMounted(async () => {
  await Promise.all([
    fetchMembers(),
    fetchEmployees(),
    fetchTodayCheckins(currentEmployee.value?.branch_id || undefined),
    fetchTodayAttendances(currentEmployee.value?.branch_id || undefined)
  ])

  // Check if Barcode Detection API is supported
  if ('BarcodeDetector' in window) {
    scannerSupported.value = true
  }
})

onUnmounted(() => {
  stopScanner()
})

// ============================================
// MEMBER CHECK-IN FUNCTIONS
// ============================================

const filteredMembers = computed(() => {
  if (!searchQuery.value) return []
  const query = searchQuery.value.toLowerCase()
  return members.value.filter(m =>
    m.full_name?.toLowerCase().includes(query) ||
    m.member_code?.toLowerCase().includes(query) ||
    m.phone?.includes(query)
  ).slice(0, 5)
})

const selectMember = async (member: any) => {
  selectedMember.value = member
  searchQuery.value = ''
  errorMessage.value = ''
  alreadyCheckedIn.value = false
  selectedContract.value = null
  memberBranch.value = null
  isCrossBranch.value = false

  // Get member's branch
  if (member.branch_id) {
    memberBranch.value = member.branch
  }

  // Check if cross-branch
  const currentBranchId = currentEmployee.value?.branch_id
  if (currentBranchId && member.branch_id && member.branch_id !== currentBranchId) {
    isCrossBranch.value = true
  }

  // Check if member has already checked in today
  const branchId = currentEmployee.value?.branch_id || undefined
  const checkedIn = await hasCheckedInToday(member.id, branchId)
  if (checkedIn) {
    alreadyCheckedIn.value = true
  }

  // Get member's active contract
  const contract = await getMemberActiveContract(member.id)
  selectedContract.value = contract
}

const performMemberCheckin = async () => {
  if (!selectedMember.value) return

  isProcessing.value = true
  errorMessage.value = ''

  try {
    const result = await doCheckin({
      memberId: selectedMember.value.id,
      branchId: currentEmployee.value?.branch_id || undefined,
      contractId: selectedContract.value?.id || undefined,
      verifiedBy: currentEmployee.value?.id || undefined
    })

    lastCheckinResult.value = {
      countDeducted: result?.countDeducted,
      remainingCounts: result?.remainingCounts
    }

    isCheckinSuccess.value = true
    useToast().success(MESSAGES.SUCCESS.CHECKIN)
    setTimeout(() => {
      isCheckinSuccess.value = false
      selectedMember.value = null
      selectedContract.value = null
      memberBranch.value = null
      isCrossBranch.value = false
      alreadyCheckedIn.value = false
      lastCheckinResult.value = {}
    }, 3000)
  } catch (error) {
    errorMessage.value = MESSAGES.ERRORS.CHECKIN
    console.error('Checkin failed:', error)
    useToast().error(MESSAGES.ERRORS.CHECKIN)
  } finally {
    isProcessing.value = false
  }
}

// ============================================
// STAFF ATTENDANCE FUNCTIONS
// ============================================

const filteredEmployees = computed(() => {
  if (!employeeSearchQuery.value) return []
  const query = employeeSearchQuery.value.toLowerCase()
  return employees.value.filter(e =>
    e.full_name?.toLowerCase().includes(query) ||
    e.employee_code?.toLowerCase().includes(query) ||
    e.phone?.includes(query)
  ).slice(0, 5)
})

const selectEmployee = async (employee: any) => {
  selectedEmployee.value = employee
  employeeSearchQuery.value = ''
  attendanceErrorMessage.value = ''
  todayAttendance.value = null

  // Check today's attendance
  const attendance = await getTodayAttendance(employee.id)
  todayAttendance.value = attendance
}

const performStaffCheckIn = async () => {
  if (!selectedEmployee.value) return

  isProcessing.value = true
  attendanceErrorMessage.value = ''

  try {
    const result = await performCheckIn({
      employeeId: selectedEmployee.value.id,
      branchId: currentEmployee.value?.branch_id || undefined,
      checkType: 'REGULAR'
    })

    todayAttendance.value = result
    isAttendanceSuccess.value = true
    useToast().success('上班打卡成功')

    setTimeout(() => {
      isAttendanceSuccess.value = false
      selectedEmployee.value = null
      todayAttendance.value = null
    }, 3000)
  } catch (error) {
    attendanceErrorMessage.value = '打卡失敗，請重試'
    console.error('Check-in failed:', error)
    useToast().error('上班打卡失敗，請稍後再試')
  } finally {
    isProcessing.value = false
  }
}

const performStaffCheckOut = async () => {
  if (!todayAttendance.value?.id) return

  isProcessing.value = true
  attendanceErrorMessage.value = ''

  try {
    const result = await performCheckOut(todayAttendance.value.id)
    todayAttendance.value = result
    isAttendanceSuccess.value = true
    useToast().success('下班打卡成功')

    setTimeout(() => {
      isAttendanceSuccess.value = false
      selectedEmployee.value = null
      todayAttendance.value = null
    }, 3000)
  } catch (error) {
    attendanceErrorMessage.value = '打卡失敗，請重試'
    console.error('Check-out failed:', error)
    useToast().error('下班打卡失敗，請稍後再試')
  } finally {
    isProcessing.value = false
  }
}

// ============================================
// SCANNER FUNCTIONS
// ============================================

const startScanner = async () => {
  if (!scannerSupported.value) {
    if (activeTab.value === 'member') {
      errorMessage.value = '您的瀏覽器不支援條碼掃描功能'
    } else {
      attendanceErrorMessage.value = '您的瀏覽器不支援條碼掃描功能'
    }
    return
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' }
    })

    if (videoRef.value) {
      videoRef.value.srcObject = stream
      await videoRef.value.play()
    }

    // @ts-ignore - BarcodeDetector is experimental
    barcodeDetector = new window.BarcodeDetector({
      formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code']
    })

    isScannerActive.value = true

    // Start scanning
    scanInterval = setInterval(async () => {
      if (videoRef.value && barcodeDetector) {
        try {
          const barcodes = await barcodeDetector.detect(videoRef.value)
          if (barcodes.length > 0) {
            const code = barcodes[0].rawValue
            handleScannedCode(code)
          }
        } catch (err) {
          // Ignore detection errors
        }
      }
    }, 200)
  } catch (error) {
    console.error('Failed to start scanner:', error)
    const errorMsg = '無法啟動相機，請檢查權限設定'
    if (activeTab.value === 'member') {
      errorMessage.value = errorMsg
    } else {
      attendanceErrorMessage.value = errorMsg
    }
    useToast().error(errorMsg)
  }
}

const stopScanner = () => {
  if (scanInterval) {
    clearInterval(scanInterval)
    scanInterval = null
  }

  if (videoRef.value?.srcObject) {
    const stream = videoRef.value.srcObject as MediaStream
    stream.getTracks().forEach(track => track.stop())
    videoRef.value.srcObject = null
  }

  isScannerActive.value = false
}

const handleScannedCode = async (code: string) => {
  stopScanner()

  if (activeTab.value === 'member') {
    const member = members.value.find(m => m.member_code === code)
    if (member) {
      await selectMember(member)
    } else {
      errorMessage.value = `找不到會員編號: ${code}`
    }
  } else {
    const employee = employees.value.find(e => e.employee_code === code)
    if (employee) {
      await selectEmployee(employee)
    } else {
      attendanceErrorMessage.value = `找不到員工編號: ${code}`
    }
  }
}

// QR Code scanner handlers (member only)
const handleQrScan = async (payload: string) => {
  showQrScanner.value = false
  isProcessing.value = true
  errorMessage.value = ''
  qrCheckinResult.value = null

  try {
    const parsed = parseQrPayload(payload)
    if (!parsed) {
      errorMessage.value = '無效的 QR Code 格式'
      return
    }

    if (isQrExpired(parsed.timestamp)) {
      errorMessage.value = 'QR Code 已過期，請重新掃描會員的入場碼'
      return
    }

    const result = await verifyQrCheckin({
      payload,
      branchId: currentEmployee.value?.branch_id || undefined,
      verifiedBy: currentEmployee.value?.id || undefined
    })

    qrCheckinResult.value = result

    if (result.success) {
      lastCheckinResult.value = {
        countDeducted: result.contract?.remaining_counts !== undefined,
        remainingCounts: result.contract?.remaining_counts
      }
      selectedMember.value = result.member
      isCheckinSuccess.value = true

      setTimeout(() => {
        isCheckinSuccess.value = false
        selectedMember.value = null
        qrCheckinResult.value = null
        lastCheckinResult.value = {}
      }, 3000)
    } else {
      errorMessage.value = result.message
    }
  } catch (error) {
    console.error('QR checkin failed:', error)
    errorMessage.value = 'QR Code 驗證失敗，請重試'
    useToast().error(MESSAGES.ERRORS.CHECKIN_VERIFY_FAILED)
  } finally {
    isProcessing.value = false
  }
}

const handleQrScanError = (error: Error) => {
  showQrScanner.value = false
  errorMessage.value = error.message || '掃描器錯誤'
}

const handleVerificationMethodChange = (method: VerificationMethod) => {
  verificationMethod.value = method
  if (method === 'BARCODE') {
    startScanner()
  } else if (method === 'QR_CODE' && activeTab.value === 'member') {
    showQrScanner.value = true
  }
}

// Helper functions
const isCountBasedContract = computed(() => {
  return selectedContract.value?.plan?.plan_type === 'COUNT_BASED'
})

const formatTime = (iso: string) => {
  return new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })
}

const getMemberStatusClass = (status: string) => {
  const map: Record<string, string> = {
    'ACTIVE': 'active',
    'active': 'active',
    'EXPIRED': 'expired',
    'SUSPENDED': 'suspended',
    'PAUSED': 'paused'
  }
  return map[status] || 'default'
}

const getMemberStatusLabel = (status: string) => {
  const map: Record<string, string> = {
    'ACTIVE': STATUS.MEMBER.ACTIVE,
    'active': STATUS.MEMBER.ACTIVE,
    'EXPIRED': STATUS.MEMBER.EXPIRED,
    'SUSPENDED': STATUS.MEMBER.SUSPENDED,
    'PAUSED': STATUS.MEMBER.PAUSED
  }
  return map[status] || status
}

const getAttendanceStatusClass = (status: string) => {
  const map: Record<string, string> = {
    'PRESENT': 'present',
    'LATE': 'late',
    'EARLY_LEAVE': 'early-leave',
    'ABSENT': 'absent',
    'LEAVE': 'leave',
    'HOLIDAY': 'holiday'
  }
  return map[status] || 'default'
}

const getAttendanceStatusLabel = (status: string) => {
  const map: Record<string, string> = {
    'PRESENT': '正常',
    'LATE': '遲到',
    'EARLY_LEAVE': '早退',
    'ABSENT': '缺勤',
    'LEAVE': '請假',
    'HOLIDAY': '休假'
  }
  return map[status] || status
}

const canMemberCheckin = computed(() => {
  if (!selectedMember.value) return false
  const status = selectedMember.value.member_status
  return (status === 'ACTIVE' || status === 'active') && !alreadyCheckedIn.value
})

const canStaffCheckIn = computed(() => {
  return selectedEmployee.value && !todayAttendance.value
})

const canStaffCheckOut = computed(() => {
  return todayAttendance.value && todayAttendance.value.check_in && !todayAttendance.value.check_out
})

const memberCheckinButtonText = computed(() => {
  if (alreadyCheckedIn.value) return '今日已入場'
  return PAGES.CHECKIN.CONFIRM_CHECKIN
})

const todayCountDisplay = computed(() => {
  return activeTab.value === 'member' ? memberTodayCount.value : staffTodayCount.value
})

const todayCountLabel = computed(() => {
  return activeTab.value === 'member' ? '今日入場' : '今日打卡'
})
</script>

<template>
  <div class="checkin-page" :class="`theme-${activeTab}`">
    <!-- Header -->
    <div class="page-header">
      <div class="header-content">
        <h1>{{ MESSAGES.NAV.CHECKIN }}</h1>
        <p>會員入場與員工打卡管理</p>
      </div>
      <div class="header-stats">
        <div class="stat-badge" :class="`theme-${activeTab}`">
          <span class="stat-number">{{ todayCountDisplay }}</span>
          <span class="stat-label">{{ todayCountLabel }}</span>
        </div>
      </div>
    </div>

    <!-- Tab Switcher -->
    <div class="tab-switcher">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'member' }"
        @click="activeTab = 'member'"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        會員入場
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'staff' }"
        @click="activeTab = 'staff'"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <line x1="17" y1="11" x2="23" y2="11" />
        </svg>
        員工打卡
      </button>
    </div>

    <div class="checkin-layout">
      <!-- Main Area -->
      <div class="checkin-main" :class="`theme-${activeTab}`">
        <!-- Success Animations -->
        <div v-if="isCheckinSuccess || isAttendanceSuccess" class="success-overlay" :class="`theme-${activeTab}`">
          <div class="success-content">
            <div class="success-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h2>{{ activeTab === 'member' ? MESSAGES.SUCCESS.CHECKIN : '打卡成功' }}</h2>
            <p>{{ activeTab === 'member' ? selectedMember?.full_name : selectedEmployee?.full_name }}</p>
            <div v-if="activeTab === 'member' && lastCheckinResult.countDeducted" class="count-deducted-info">
              <span class="deduct-badge">已扣 1 堂</span>
              <span class="remaining">剩餘 {{ lastCheckinResult.remainingCounts }} 堂</span>
            </div>
            <div v-if="activeTab === 'staff' && todayAttendance" class="attendance-info">
              <span class="status-badge" :class="getAttendanceStatusClass(todayAttendance.attendance_status)">
                {{ getAttendanceStatusLabel(todayAttendance.attendance_status) }}
              </span>
              <span v-if="todayAttendance.late_minutes > 0" class="late-info">遲到 {{ todayAttendance.late_minutes }} 分鐘</span>
            </div>
          </div>
        </div>

        <!-- Barcode Scanner Modal -->
        <div v-if="isScannerActive" class="scanner-overlay">
          <div class="scanner-container">
            <div class="scanner-header">
              <h3>掃描{{ activeTab === 'member' ? '會員' : '員工' }}條碼</h3>
              <button class="scanner-close" @click="stopScanner">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div class="scanner-video-wrapper">
              <video ref="videoRef" class="scanner-video" playsinline></video>
              <div class="scanner-frame"></div>
            </div>
            <p class="scanner-hint">將條碼對準框內進行掃描</p>
          </div>
        </div>

        <!-- QR Code Scanner Modal (Member only) - 使用 Lazy 前缀按需加載 -->
        <div v-if="showQrScanner && activeTab === 'member'" class="qr-scanner-overlay">
          <div class="qr-scanner-modal">
            <LazyQrScanner
              :auto-start="true"
              @scan="handleQrScan"
              @error="handleQrScanError"
              @close="showQrScanner = false"
            />
          </div>
        </div>

        <!-- MEMBER CHECK-IN TAB -->
        <div v-show="activeTab === 'member'" class="tab-content">
          <VerificationMethodSelector
            v-model="verificationMethod"
            color="green"
            @scan="handleVerificationMethodChange"
          />

          <div class="search-area">
            <div class="search-row">
              <div class="search-box">
                <div class="search-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                  </svg>
                </div>
                <input
                  v-model="searchQuery"
                  type="text"
                  :placeholder="PAGES.CHECKIN.SEARCH_PLACEHOLDER"
                  class="search-input"
                  autofocus
                />
              </div>
            </div>

            <!-- Search Results -->
            <div v-if="filteredMembers.length > 0" class="search-results">
              <button
                v-for="member in filteredMembers"
                :key="member.id"
                class="result-item"
                @click="selectMember(member)"
              >
                <div class="result-avatar">{{ member.full_name?.[0] }}</div>
                <div class="result-info">
                  <span class="result-name">{{ member.full_name }}</span>
                  <span class="result-code">{{ member.member_code }}</span>
                </div>
                <span class="member-status" :class="getMemberStatusClass(member.member_status)">
                  {{ getMemberStatusLabel(member.member_status) }}
                </span>
              </button>
            </div>

            <!-- Error Message -->
            <div v-if="errorMessage" class="error-message">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {{ errorMessage }}
            </div>

            <!-- Selected Member Preview -->
            <div v-if="selectedMember" class="selected-preview theme-member">
              <div class="selected-header">
                <div class="selected-avatar">{{ selectedMember.full_name?.[0] }}</div>
                <div class="selected-info">
                  <h3>{{ selectedMember.full_name }}</h3>
                  <p>{{ selectedMember.member_code }}</p>
                </div>
                <span class="member-status large" :class="getMemberStatusClass(selectedMember.member_status)">
                  {{ getMemberStatusLabel(selectedMember.member_status) }}
                </span>
              </div>

              <!-- Cross-branch Warning -->
              <div v-if="isCrossBranch" class="cross-branch-warning">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <div>
                  <strong>跨店入場</strong>
                  <span>會員歸屬店：{{ memberBranch?.name || '未知' }}</span>
                </div>
              </div>

              <div class="selected-details">
                <div class="detail-item">
                  <span class="label">{{ MESSAGES.FORM.PHONE }}</span>
                  <span class="value">{{ selectedMember.phone || '—' }}</span>
                </div>
                <div class="detail-item">
                  <span class="label">{{ MESSAGES.FORM.EMAIL }}</span>
                  <span class="value">{{ selectedMember.email || '—' }}</span>
                </div>
                <div v-if="selectedContract" class="detail-item full-width">
                  <span class="label">有效合約</span>
                  <span class="value contract-info">
                    {{ selectedContract.contract_no }}
                    <span v-if="selectedContract.plan?.name" class="plan-name">({{ selectedContract.plan.name }})</span>
                  </span>
                </div>
                <div v-if="isCountBasedContract" class="detail-item full-width">
                  <span class="label">剩餘堂數</span>
                  <span class="value remaining-counts" :class="{ low: selectedContract.remaining_counts <= 3 }">
                    {{ selectedContract.remaining_counts }} 堂
                    <span v-if="selectedContract.remaining_counts <= 3" class="low-warning">（即將用完）</span>
                  </span>
                </div>
                <div v-else-if="!selectedContract" class="detail-item full-width">
                  <span class="label">有效合約</span>
                  <span class="value no-contract">無有效合約</span>
                </div>
              </div>

              <div v-if="alreadyCheckedIn" class="already-warning">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                此會員今日已經入場過
              </div>

              <div class="action-buttons">
                <button class="btn-cancel" @click="selectedMember = null; selectedContract = null; memberBranch = null; isCrossBranch = false; alreadyCheckedIn = false">
                  {{ MESSAGES.FORM.CANCEL }}
                </button>
                <button
                  class="btn-primary theme-member"
                  :disabled="!canMemberCheckin || isProcessing"
                  @click="performMemberCheckin"
                >
                  <svg v-if="!isProcessing" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span v-if="isProcessing" class="spinner"></span>
                  {{ memberCheckinButtonText }}
                </button>
              </div>
            </div>

            <!-- Empty State -->
            <div v-if="!selectedMember && !searchQuery" class="empty-state">
              <div class="empty-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                  <rect width="10" height="10" x="7" y="7" rx="1" />
                </svg>
              </div>
              <h3>{{ PAGES.CHECKIN.SCAN_OR_SEARCH }}</h3>
              <p>{{ PAGES.CHECKIN.SCAN_HINT }}</p>
            </div>
          </div>
        </div>

        <!-- STAFF ATTENDANCE TAB -->
        <div v-show="activeTab === 'staff'" class="tab-content">
          <VerificationMethodSelector
            v-model="verificationMethod"
            color="indigo"
            @scan="handleVerificationMethodChange"
          />

          <div class="search-area">
            <div class="search-row">
              <div class="search-box">
                <div class="search-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                  </svg>
                </div>
                <input
                  v-model="employeeSearchQuery"
                  type="text"
                  placeholder="搜尋員工姓名、工號或手機"
                  class="search-input"
                />
              </div>
            </div>

            <!-- Search Results -->
            <div v-if="filteredEmployees.length > 0" class="search-results">
              <button
                v-for="employee in filteredEmployees"
                :key="employee.id"
                class="result-item"
                @click="selectEmployee(employee)"
              >
                <div class="result-avatar theme-staff">{{ employee.full_name?.[0] }}</div>
                <div class="result-info">
                  <span class="result-name">{{ employee.full_name }}</span>
                  <span class="result-code">{{ employee.employee_code }}</span>
                </div>
                <span class="employee-role">{{ employee.job_title?.name || '員工' }}</span>
              </button>
            </div>

            <!-- Error Message -->
            <div v-if="attendanceErrorMessage" class="error-message theme-staff">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {{ attendanceErrorMessage }}
            </div>

            <!-- Selected Employee Preview -->
            <div v-if="selectedEmployee" class="selected-preview theme-staff">
              <div class="selected-header">
                <div class="selected-avatar theme-staff">{{ selectedEmployee.full_name?.[0] }}</div>
                <div class="selected-info">
                  <h3>{{ selectedEmployee.full_name }}</h3>
                  <p>{{ selectedEmployee.employee_code }}</p>
                </div>
                <span class="employee-role large">{{ selectedEmployee.job_title?.name || '員工' }}</span>
              </div>

              <div class="selected-details">
                <div class="detail-item">
                  <span class="label">職位</span>
                  <span class="value">{{ selectedEmployee.job_title?.name || '—' }}</span>
                </div>
                <div class="detail-item">
                  <span class="label">{{ MESSAGES.FORM.PHONE }}</span>
                  <span class="value">{{ selectedEmployee.phone || '—' }}</span>
                </div>
                <div v-if="todayAttendance" class="detail-item full-width">
                  <span class="label">今日打卡狀態</span>
                  <span class="value">
                    <span class="attendance-status" :class="getAttendanceStatusClass(todayAttendance.attendance_status)">
                      {{ getAttendanceStatusLabel(todayAttendance.attendance_status) }}
                    </span>
                  </span>
                </div>
                <div v-if="todayAttendance?.check_in" class="detail-item">
                  <span class="label">上班時間</span>
                  <span class="value">{{ formatTime(todayAttendance.check_in) }}</span>
                </div>
                <div v-if="todayAttendance?.check_out" class="detail-item">
                  <span class="label">下班時間</span>
                  <span class="value">{{ formatTime(todayAttendance.check_out) }}</span>
                </div>
                <div v-if="todayAttendance?.work_hours" class="detail-item">
                  <span class="label">工作時數</span>
                  <span class="value">{{ todayAttendance.work_hours }} 小時</span>
                </div>
                <div v-if="todayAttendance?.late_minutes > 0" class="detail-item">
                  <span class="label">遲到</span>
                  <span class="value late-text">{{ todayAttendance.late_minutes }} 分鐘</span>
                </div>
              </div>

              <div class="action-buttons">
                <button class="btn-cancel" @click="selectedEmployee = null; todayAttendance = null">
                  {{ MESSAGES.FORM.CANCEL }}
                </button>
                <button
                  v-if="canStaffCheckIn"
                  class="btn-primary theme-staff"
                  :disabled="isProcessing"
                  @click="performStaffCheckIn"
                >
                  <svg v-if="!isProcessing" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2v20M2 12h20" />
                  </svg>
                  <span v-if="isProcessing" class="spinner"></span>
                  上班打卡
                </button>
                <button
                  v-if="canStaffCheckOut"
                  class="btn-primary theme-staff"
                  :disabled="isProcessing"
                  @click="performStaffCheckOut"
                >
                  <svg v-if="!isProcessing" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span v-if="isProcessing" class="spinner"></span>
                  下班打卡
                </button>
              </div>
            </div>

            <!-- Empty State -->
            <div v-if="!selectedEmployee && !employeeSearchQuery" class="empty-state">
              <div class="empty-icon theme-staff">
                <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
                  <polyline points="17 2 12 7 7 2" />
                </svg>
              </div>
              <h3>搜尋或掃描員工證</h3>
              <p>選擇驗證方式或手動搜尋員工</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Records Sidebar -->
      <div class="recent-sidebar">
        <h3>{{ activeTab === 'member' ? PAGES.CHECKIN.TODAY_RECORDS : '今日打卡記錄' }}</h3>
        <div v-if="activeTab === 'member' && checkinLoading" class="loading-state">
          <span class="spinner"></span>
          載入中...
        </div>
        <div v-else-if="activeTab === 'staff' && attendanceLoading" class="loading-state">
          <span class="spinner"></span>
          載入中...
        </div>
        <div v-else-if="activeTab === 'member' && todayCheckins.length === 0" class="no-records">
          <p>{{ PAGES.CHECKIN.NO_RECORDS }}</p>
        </div>
        <div v-else-if="activeTab === 'staff' && todayAttendances.length === 0" class="no-records">
          <p>今日尚無打卡記錄</p>
        </div>
        <div v-else-if="activeTab === 'member'" class="records-list">
          <div v-for="checkin in todayCheckins" :key="checkin.id" class="record-item theme-member">
            <div class="record-avatar">{{ checkin.member?.full_name?.[0] }}</div>
            <div class="record-info">
              <span class="record-name">{{ checkin.member?.full_name }}</span>
              <span class="record-code">{{ checkin.member?.member_code }}</span>
            </div>
            <span class="record-time">{{ formatTime(checkin.time) }}</span>
          </div>
        </div>
        <div v-else class="records-list">
          <div v-for="att in todayAttendances" :key="att.id" class="record-item theme-staff">
            <div class="record-avatar theme-staff">{{ att.employee?.full_name?.[0] }}</div>
            <div class="record-info">
              <span class="record-name">{{ att.employee?.full_name }}</span>
              <span class="record-code">{{ att.employee?.employee_code }}</span>
              <span v-if="att.check_in" class="record-status" :class="getAttendanceStatusClass(att.attendance_status)">
                {{ getAttendanceStatusLabel(att.attendance_status) }}
              </span>
            </div>
            <div class="record-times">
              <span v-if="att.check_in" class="time-in">{{ formatTime(att.check_in) }}</span>
              <span v-if="att.check_out" class="time-out">{{ formatTime(att.check_out) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Variables for themes */
:root {
  --color-member: #34C759;
  --color-staff: #5856D6;
}

.checkin-page {
  max-width: 1400px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: var(--space-xl);
}

.header-content h1 {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-xs) 0;
}

.header-content p {
  color: var(--color-text-secondary);
  margin: 0;
}

.header-stats {
  display: flex;
  gap: var(--space-md);
}

.stat-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-md) var(--space-lg);
  border-radius: var(--radius-xl);
  color: white;
  transition: all var(--duration-fast) var(--ease-out);
}

.stat-badge.theme-member {
  background: linear-gradient(135deg, var(--color-member), #00c7be);
}

.stat-badge.theme-staff {
  background: linear-gradient(135deg, var(--color-staff), #7b79e5);
}

.stat-number {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
}

.stat-label {
  font-size: 12px;
  opacity: 0.9;
  margin-top: var(--space-xs);
}

/* Tab Switcher */
.tab-switcher {
  display: flex;
  gap: var(--space-sm);
  margin-bottom: var(--space-xl);
  background: var(--color-bg-secondary);
  padding: var(--space-xs);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  background: transparent;
  border: none;
  border-radius: var(--radius-lg);
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.tab-btn:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-tertiary);
}

.tab-btn.active {
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.checkin-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: var(--space-xl);
}

.checkin-main {
  background: var(--color-bg-primary);
  border-radius: var(--radius-2xl);
  border: 1px solid var(--color-border);
  min-height: 600px;
  position: relative;
  overflow: hidden;
}

/* Tab content */
.tab-content {
  padding: var(--space-2xl);
}

/* Success Overlay */
.success-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.3s ease-out;
  z-index: 50;
}

.success-overlay.theme-member {
  background: linear-gradient(135deg, rgba(52, 199, 89, 0.95), rgba(48, 209, 88, 0.95));
}

.success-overlay.theme-staff {
  background: linear-gradient(135deg, rgba(88, 86, 214, 0.95), rgba(123, 121, 229, 0.95));
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.success-content {
  text-align: center;
  color: white;
}

.success-icon {
  width: 100px;
  height: 100px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto var(--space-lg);
  animation: scaleIn 0.4s ease-out;
}

@keyframes scaleIn {
  from { transform: scale(0); }
  to { transform: scale(1); }
}

.success-content h2 {
  font-size: 32px;
  margin: 0 0 var(--space-sm) 0;
}

.success-content p {
  font-size: 18px;
  opacity: 0.9;
  margin: 0;
}

.count-deducted-info,
.attendance-info {
  margin-top: var(--space-md);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
}

.deduct-badge,
.status-badge {
  background: rgba(255, 255, 255, 0.25);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-full);
  font-size: 14px;
  font-weight: 600;
}

.remaining,
.late-info {
  font-size: 14px;
  opacity: 0.9;
}

/* Scanner overlay */
.scanner-overlay,
.qr-scanner-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.9);
  z-index: 100;
}

.scanner-container {
  width: 100%;
  max-width: 400px;
  padding: var(--space-lg);
}

.scanner-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
}

.scanner-header h3 {
  color: white;
  font-size: 18px;
  margin: 0;
}

.scanner-close {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: rgba(255, 255, 255, 0.1);
  border: none;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background var(--duration-fast) var(--ease-out);
}

.scanner-close:hover {
  background: rgba(255, 255, 255, 0.2);
}

.scanner-video-wrapper {
  position: relative;
  border-radius: var(--radius-xl);
  overflow: hidden;
  background: black;
}

.scanner-video {
  width: 100%;
  height: auto;
  display: block;
}

.scanner-frame {
  position: absolute;
  inset: 20%;
  border: 2px solid var(--color-accent);
  border-radius: var(--radius-lg);
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.5);
}

.scanner-hint {
  text-align: center;
  color: rgba(255, 255, 255, 0.7);
  margin-top: var(--space-md);
  font-size: 14px;
}

.qr-scanner-modal {
  width: 100%;
  max-width: 500px;
}

/* Search area */
.search-area {
  margin-top: var(--space-lg);
}

.search-row {
  display: flex;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}

.search-box {
  position: relative;
  flex: 1;
}

.search-icon {
  position: absolute;
  left: var(--space-lg);
  top: 50%;
  transform: translateY(-50%);
  color: var(--color-text-tertiary);
}

.search-input {
  width: 100%;
  padding: var(--space-lg) var(--space-lg) var(--space-lg) 56px;
  font-size: 18px;
  border: 2px solid var(--color-border);
  border-radius: var(--radius-xl);
  background: var(--color-bg-secondary);
  color: var(--color-text-primary);
  outline: none;
  transition: all var(--duration-fast) var(--ease-out);
}

.search-input:focus {
  border-color: var(--color-accent);
  background: var(--color-bg-primary);
}

/* Search results */
.search-results {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}

.result-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  text-align: left;
}

.result-item:hover {
  border-color: var(--color-accent);
  background: var(--color-bg-tertiary);
}

.result-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-member), #00c7be);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  flex-shrink: 0;
}

.result-avatar.theme-staff {
  background: linear-gradient(135deg, var(--color-staff), #7b79e5);
}

.result-info {
  flex: 1;
  min-width: 0;
}

.result-name {
  display: block;
  font-weight: 500;
  color: var(--color-text-primary);
}

.result-code {
  display: block;
  font-size: 13px;
  color: var(--color-text-tertiary);
}

.member-status,
.employee-role {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
}

.member-status.large,
.employee-role.large {
  padding: var(--space-sm) var(--space-md);
  font-size: 14px;
}

.member-status.active {
  background: rgba(52, 199, 89, 0.1);
  color: var(--color-success);
}

.member-status.expired {
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
}

.member-status.suspended,
.member-status.paused {
  background: rgba(255, 59, 48, 0.1);
  color: var(--color-error);
}

.employee-role {
  background: rgba(88, 86, 214, 0.1);
  color: var(--color-staff);
}

/* Error messages */
.error-message {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: rgba(255, 59, 48, 0.1);
  border: 1px solid rgba(255, 59, 48, 0.2);
  border-radius: var(--radius-lg);
  color: var(--color-error);
  margin-bottom: var(--space-lg);
}

.error-message.theme-staff {
  background: rgba(88, 86, 214, 0.1);
  border-color: rgba(88, 86, 214, 0.2);
  color: var(--color-staff);
}

/* Selected preview */
.selected-preview {
  background: var(--color-bg-secondary);
  border-radius: var(--radius-xl);
  padding: var(--space-xl);
}

.selected-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.selected-avatar {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-member), #00c7be);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 600;
  flex-shrink: 0;
}

.selected-avatar.theme-staff {
  background: linear-gradient(135deg, var(--color-staff), #7b79e5);
}

.selected-info {
  flex: 1;
}

.selected-info h3 {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}

.selected-info p {
  font-size: 14px;
  color: var(--color-text-tertiary);
  margin: var(--space-xs) 0 0 0;
}

/* Cross-branch warning */
.cross-branch-warning {
  display: flex;
  align-items: flex-start;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: rgba(255, 149, 0, 0.1);
  border: 1px solid rgba(255, 149, 0, 0.2);
  border-radius: var(--radius-lg);
  color: #ff9500;
  margin-bottom: var(--space-lg);
}

.cross-branch-warning svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.cross-branch-warning div {
  flex: 1;
}

.cross-branch-warning strong {
  display: block;
  font-weight: 600;
  margin-bottom: var(--space-xs);
}

.cross-branch-warning span {
  display: block;
  font-size: 13px;
  opacity: 0.9;
}

.selected-details {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.detail-item.full-width {
  grid-column: 1 / -1;
}

.detail-item .label {
  font-size: 13px;
  color: var(--color-text-tertiary);
}

.detail-item .value {
  font-size: 15px;
  color: var(--color-text-primary);
}

.contract-info {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.plan-name {
  color: var(--color-text-tertiary);
  font-size: 13px;
}

.no-contract {
  color: var(--color-text-quaternary);
}

.remaining-counts {
  font-weight: 600;
  color: var(--color-success);
}

.remaining-counts.low {
  color: #ff9500;
}

.low-warning {
  font-size: 12px;
  font-weight: 400;
}

.attendance-status {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
}

.attendance-status.present {
  background: rgba(52, 199, 89, 0.1);
  color: var(--color-success);
}

.attendance-status.late,
.attendance-status.early-leave {
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
}

.attendance-status.absent {
  background: rgba(255, 59, 48, 0.1);
  color: var(--color-error);
}

.late-text {
  color: #ff9500;
  font-weight: 600;
}

.already-warning {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: rgba(255, 149, 0, 0.1);
  border: 1px solid rgba(255, 149, 0, 0.2);
  border-radius: var(--radius-lg);
  color: #ff9500;
  margin-bottom: var(--space-lg);
}

/* Action buttons */
.action-buttons {
  display: flex;
  gap: var(--space-md);
}

.btn-cancel {
  flex: 1;
  padding: var(--space-md) var(--space-lg);
  background: var(--color-bg-tertiary);
  color: var(--color-text-primary);
  border: none;
  border-radius: var(--radius-lg);
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-cancel:hover {
  background: var(--color-bg-quaternary);
}

.btn-primary {
  flex: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  color: white;
  border: none;
  border-radius: var(--radius-lg);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-primary.theme-member {
  background: var(--color-member);
}

.btn-primary.theme-staff {
  background: var(--color-staff);
}

.btn-primary:hover:not(:disabled) {
  transform: scale(1.02);
  opacity: 0.9;
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner {
  width: 18px;
  height: 18px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Empty state */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl);
  text-align: center;
}

.empty-icon {
  width: 120px;
  height: 120px;
  border-radius: var(--radius-2xl);
  background: var(--color-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-quaternary);
  margin-bottom: var(--space-lg);
}

.empty-icon.theme-staff {
  color: rgba(88, 86, 214, 0.3);
}

.empty-state h3 {
  font-size: 20px;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-sm) 0;
}

.empty-state p {
  color: var(--color-text-tertiary);
  margin: 0;
}

/* Recent sidebar */
.recent-sidebar {
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
  padding: var(--space-lg);
  max-height: calc(100vh - 200px);
  overflow-y: auto;
}

.recent-sidebar h3 {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-lg) 0;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-xl);
  color: var(--color-text-tertiary);
}

.no-records {
  text-align: center;
  padding: var(--space-xl);
  color: var(--color-text-tertiary);
}

.records-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.record-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
}

.record-avatar {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, var(--color-member), #00c7be);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.record-avatar.theme-staff {
  background: linear-gradient(135deg, var(--color-staff), #7b79e5);
}

.record-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.record-name {
  display: block;
  font-weight: 500;
  font-size: 13px;
  color: var(--color-text-primary);
}

.record-code {
  display: block;
  font-size: 11px;
  color: var(--color-text-tertiary);
}

.record-status {
  display: inline-block;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-size: 10px;
  font-weight: 500;
  margin-top: 2px;
}

.record-status.present {
  background: rgba(52, 199, 89, 0.1);
  color: var(--color-success);
}

.record-status.late {
  background: rgba(255, 149, 0, 0.1);
  color: #ff9500;
}

.record-time {
  font-size: 13px;
  color: var(--color-text-tertiary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}

.record-times {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  font-size: 11px;
  color: var(--color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.time-in {
  color: var(--color-success);
}

.time-out {
  color: var(--color-text-tertiary);
}

@media (max-width: 1024px) {
  .page-header {
    flex-direction: column;
    gap: var(--space-md);
  }

  .checkin-layout {
    grid-template-columns: 1fr;
  }

  .recent-sidebar {
    order: -1;
    max-height: 300px;
  }
}
</style>
