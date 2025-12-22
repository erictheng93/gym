<script setup lang="ts">
import { MESSAGES, PAGES, STATUS } from '~/constants'

const { members, fetchMembers } = useMembers()
const { currentEmployee } = useAuth()
const {
  todayCheckins,
  todayCount,
  isLoading: checkinLoading,
  fetchTodayCheckins,
  performCheckin: doCheckin,
  getMemberActiveContract,
  hasCheckedInToday,
  verifyQrCheckin,
  parseQrPayload,
  isQrExpired
} = useCheckin()

const searchQuery = ref('')
const selectedMember = ref<any>(null)
const selectedContract = ref<any>(null)
const isCheckinSuccess = ref(false)
const isProcessing = ref(false)
const errorMessage = ref('')
const alreadyCheckedIn = ref(false)
const lastCheckinResult = ref<{ countDeducted?: boolean; remainingCounts?: number | null }>({})

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
    fetchTodayCheckins(currentEmployee.value?.branch_id || undefined)
  ])

  // Check if Barcode Detection API is supported
  if ('BarcodeDetector' in window) {
    scannerSupported.value = true
  }
})

onUnmounted(() => {
  stopScanner()
})

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

const performCheckin = async () => {
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

    // Store the result for displaying count info
    lastCheckinResult.value = {
      countDeducted: result?.countDeducted,
      remainingCounts: result?.remainingCounts
    }

    isCheckinSuccess.value = true
    setTimeout(() => {
      isCheckinSuccess.value = false
      selectedMember.value = null
      selectedContract.value = null
      alreadyCheckedIn.value = false
      lastCheckinResult.value = {}
    }, 3000)
  } catch (error) {
    errorMessage.value = MESSAGES.ERRORS.CHECKIN
    console.error('Checkin failed:', error)
  } finally {
    isProcessing.value = false
  }
}

// Barcode scanner functions
const startScanner = async () => {
  if (!scannerSupported.value) {
    errorMessage.value = '您的瀏覽器不支援條碼掃描功能'
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
    errorMessage.value = '無法啟動相機，請檢查權限設定'
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
  // Stop scanning after detecting a barcode
  stopScanner()

  // Search for member by member_code
  const member = members.value.find(m => m.member_code === code)
  if (member) {
    await selectMember(member)
  } else {
    errorMessage.value = `找不到會員編號: ${code}`
  }
}

// QR Code scanner handlers
const handleQrScan = async (payload: string) => {
  showQrScanner.value = false
  isProcessing.value = true
  errorMessage.value = ''
  qrCheckinResult.value = null

  try {
    // First validate the QR payload format
    const parsed = parseQrPayload(payload)
    if (!parsed) {
      errorMessage.value = '無效的 QR Code 格式'
      return
    }

    // Check if QR code is expired
    if (isQrExpired(parsed.timestamp)) {
      errorMessage.value = 'QR Code 已過期，請重新掃描會員的入場碼'
      return
    }

    // Call backend to verify and perform check-in
    const result = await verifyQrCheckin({
      payload,
      branchId: currentEmployee.value?.branch_id || undefined,
      verifiedBy: currentEmployee.value?.id || undefined
    })

    qrCheckinResult.value = result

    if (result.success) {
      // Show success overlay
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
  } finally {
    isProcessing.value = false
  }
}

const handleQrScanError = (error: Error) => {
  showQrScanner.value = false
  errorMessage.value = error.message || '掃描器錯誤'
}

// Check if contract is count-based
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

const canCheckin = computed(() => {
  if (!selectedMember.value) return false
  const status = selectedMember.value.member_status
  return (status === 'ACTIVE' || status === 'active') && !alreadyCheckedIn.value
})

const checkinButtonText = computed(() => {
  if (alreadyCheckedIn.value) return '今日已入場'
  return PAGES.CHECKIN.CONFIRM_CHECKIN
})
</script>

<template>
  <div class="checkin-page">
    <!-- Header -->
    <div class="page-header">
      <div class="header-content">
        <h1>{{ MESSAGES.NAV.CHECKIN }}</h1>
        <p>{{ PAGES.CHECKIN.DESCRIPTION }}</p>
      </div>
      <div class="header-stats">
        <div class="stat-badge">
          <span class="stat-number">{{ todayCount }}</span>
          <span class="stat-label">今日入場</span>
        </div>
      </div>
    </div>

    <div class="checkin-layout">
      <!-- Main Checkin Area -->
      <div class="checkin-main">
        <!-- Success Animation -->
        <div v-if="isCheckinSuccess" class="success-overlay">
          <div class="success-content">
            <div class="success-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
            </div>
            <h2>{{ MESSAGES.SUCCESS.CHECKIN }}</h2>
            <p>{{ selectedMember?.full_name }}</p>
            <div v-if="lastCheckinResult.countDeducted" class="count-deducted-info">
              <span class="deduct-badge">已扣 1 堂</span>
              <span class="remaining">剩餘 {{ lastCheckinResult.remainingCounts }} 堂</span>
            </div>
          </div>
        </div>

        <!-- Barcode Scanner Modal -->
        <div v-if="isScannerActive" class="scanner-overlay">
          <div class="scanner-container">
            <div class="scanner-header">
              <h3>掃描會員條碼</h3>
              <button class="scanner-close" @click="stopScanner">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
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

        <!-- QR Code Scanner Modal -->
        <div v-if="showQrScanner" class="qr-scanner-overlay">
          <div class="qr-scanner-modal">
            <QrScanner
              :auto-start="true"
              @scan="handleQrScan"
              @error="handleQrScanError"
              @close="showQrScanner = false"
            />
          </div>
        </div>

        <!-- Search Area -->
        <div v-else-if="!isScannerActive" class="search-area">
          <div class="search-row">
            <div class="search-box">
              <div class="search-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
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
            <button
              v-if="scannerSupported"
              class="btn-scan"
              @click="startScanner"
              title="掃描條碼"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
                <line x1="7" y1="12" x2="17" y2="12"/>
              </svg>
            </button>
            <button
              class="btn-qr-scan"
              @click="showQrScanner = true"
              title="掃描 QR Code"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="3" height="3"/>
                <rect x="18" y="14" width="3" height="3"/>
                <rect x="14" y="18" width="3" height="3"/>
                <rect x="18" y="18" width="3" height="3"/>
              </svg>
            </button>
          </div>

          <!-- Search Results -->
          <div v-if="filteredMembers.length > 0" class="search-results">
            <button
              v-for="member in filteredMembers"
              :key="member.id"
              class="member-result"
              @click="selectMember(member)"
            >
              <div class="member-avatar">{{ member.full_name?.[0] }}</div>
              <div class="member-info">
                <span class="member-name">{{ member.full_name }}</span>
                <span class="member-code">{{ member.member_code }}</span>
              </div>
              <span class="member-status" :class="getMemberStatusClass(member.member_status)">
                {{ getMemberStatusLabel(member.member_status) }}
              </span>
            </button>
          </div>

          <!-- Error Message -->
          <div v-if="errorMessage" class="error-message">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {{ errorMessage }}
          </div>

          <!-- Selected Member Preview -->
          <div v-if="selectedMember" class="selected-member">
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
              <!-- COUNT_BASED 合約顯示剩餘堂數 -->
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

            <!-- Already Checked In Warning -->
            <div v-if="alreadyCheckedIn" class="already-checkin-warning">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              此會員今日已經入場過
            </div>

            <div class="checkin-actions">
              <button class="btn-cancel" @click="selectedMember = null; selectedContract = null; alreadyCheckedIn = false">
                {{ MESSAGES.FORM.CANCEL }}
              </button>
              <button
                class="btn-checkin"
                @click="performCheckin"
                :disabled="!canCheckin || isProcessing"
              >
                <svg v-if="!isProcessing" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                <span v-if="isProcessing" class="spinner"></span>
                {{ checkinButtonText }}
              </button>
            </div>
          </div>

          <!-- Empty State -->
          <div v-if="!selectedMember && !searchQuery" class="empty-state">
            <div class="scan-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
                <rect width="10" height="10" x="7" y="7" rx="1"/>
              </svg>
            </div>
            <h3>{{ PAGES.CHECKIN.SCAN_OR_SEARCH }}</h3>
            <p>{{ PAGES.CHECKIN.SCAN_HINT }}</p>
          </div>
        </div>
      </div>

      <!-- Recent Checkins Sidebar -->
      <div class="recent-checkins">
        <h3>{{ PAGES.CHECKIN.TODAY_RECORDS }}</h3>
        <div v-if="checkinLoading" class="loading-state">
          <span class="spinner"></span>
          載入中...
        </div>
        <div v-else-if="todayCheckins.length === 0" class="no-checkins">
          <p>{{ PAGES.CHECKIN.NO_RECORDS }}</p>
        </div>
        <div v-else class="checkins-list">
          <div v-for="checkin in todayCheckins" :key="checkin.id" class="checkin-item">
            <div class="checkin-avatar">{{ checkin.member?.full_name?.[0] }}</div>
            <div class="checkin-info">
              <span class="checkin-name">{{ checkin.member?.full_name }}</span>
              <span class="checkin-code">{{ checkin.member?.member_code }}</span>
            </div>
            <span class="checkin-time">{{ formatTime(checkin.time) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
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
  background: linear-gradient(135deg, var(--color-accent), #00c7be);
  border-radius: var(--radius-xl);
  color: white;
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

.checkin-layout {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: var(--space-xl);
}

.checkin-main {
  background: var(--color-bg-primary);
  border-radius: var(--radius-2xl);
  border: 1px solid var(--color-border);
  min-height: 500px;
  position: relative;
  overflow: hidden;
}

.success-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(52, 199, 89, 0.95), rgba(48, 209, 88, 0.95));
  animation: fadeIn 0.3s ease-out;
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

.search-area {
  padding: var(--space-2xl);
}

.search-box {
  position: relative;
  margin-bottom: var(--space-lg);
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

.search-results {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}

.member-result {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  background: var(--color-bg-secondary);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.member-result:hover {
  border-color: var(--color-accent);
  background: var(--color-bg-tertiary);
}

.member-avatar,
.selected-avatar,
.checkin-avatar {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-full);
  background: linear-gradient(135deg, #0071e3, #00c7be);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  flex-shrink: 0;
}

.member-info,
.checkin-info {
  flex: 1;
  min-width: 0;
}

.member-name,
.checkin-name {
  display: block;
  font-weight: 500;
  color: var(--color-text-primary);
}

.member-code,
.checkin-code {
  display: block;
  font-size: 13px;
  color: var(--color-text-tertiary);
}

.member-status {
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
}

.member-status.large {
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

.selected-member {
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
  font-size: 20px;
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

.detail-item .contract-info {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.detail-item .plan-name {
  color: var(--color-text-tertiary);
  font-size: 13px;
}

.detail-item .no-contract {
  color: var(--color-text-quaternary);
}

.already-checkin-warning {
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

.checkin-actions {
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

.btn-checkin {
  flex: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-md) var(--space-lg);
  background: var(--color-success);
  color: white;
  border: none;
  border-radius: var(--radius-lg);
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
}

.btn-checkin:hover:not(:disabled) {
  background: #2ecc71;
  transform: scale(1.02);
}

.btn-checkin:disabled {
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

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-3xl);
  text-align: center;
}

.scan-icon {
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

.empty-state h3 {
  font-size: 20px;
  color: var(--color-text-primary);
  margin: 0 0 var(--space-sm) 0;
}

.empty-state p {
  color: var(--color-text-tertiary);
  margin: 0;
}

/* Recent Checkins Sidebar */
.recent-checkins {
  background: var(--color-bg-primary);
  border-radius: var(--radius-xl);
  border: 1px solid var(--color-border);
  padding: var(--space-lg);
}

.recent-checkins h3 {
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

.no-checkins {
  text-align: center;
  padding: var(--space-xl);
  color: var(--color-text-tertiary);
}

.checkins-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.checkin-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
}

.checkin-avatar {
  width: 32px;
  height: 32px;
  font-size: 12px;
}

.checkin-time {
  font-size: 13px;
  color: var(--color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

/* Count deducted info in success overlay */
.count-deducted-info {
  margin-top: var(--space-md);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
}

.deduct-badge {
  background: rgba(255, 255, 255, 0.25);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-full);
  font-size: 14px;
  font-weight: 600;
}

.count-deducted-info .remaining {
  font-size: 14px;
  opacity: 0.9;
}

/* Scanner overlay */
.scanner-overlay {
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

/* Search row with scan button */
.search-row {
  display: flex;
  gap: var(--space-sm);
  margin-bottom: var(--space-lg);
}

.search-row .search-box {
  flex: 1;
  margin-bottom: 0;
}

.btn-scan {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-xl);
  background: var(--color-accent);
  border: none;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  flex-shrink: 0;
}

.btn-scan:hover {
  background: #0077ed;
  transform: scale(1.05);
}

/* Remaining counts display */
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
  color: #ff9500;
}

/* QR Scanner button */
.btn-qr-scan {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-xl);
  background: var(--color-success);
  border: none;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all var(--duration-fast) var(--ease-out);
  flex-shrink: 0;
}

.btn-qr-scan:hover {
  background: #2ecc71;
  transform: scale(1.05);
}

/* QR Scanner Modal */
.qr-scanner-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.8);
  z-index: 100;
  padding: var(--space-lg);
}

.qr-scanner-modal {
  width: 100%;
  max-width: 500px;
}

@media (max-width: 1024px) {
  .page-header {
    flex-direction: column;
    gap: var(--space-md);
  }

  .checkin-layout {
    grid-template-columns: 1fr;
  }

  .recent-checkins {
    order: -1;
  }
}
</style>
