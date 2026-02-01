<script setup lang="ts">
/**
 * 客服支援頁面
 * 提供聯絡方式、常見問題、問題回報功能
 */
definePageMeta({
  middleware: 'auth'
})

const config = useRuntimeConfig()
const apiUrl = config.public.apiBaseUrl
const { member, getAuthHeader } = useMemberAuth()
const toast = useToast()
const { handleError } = useApiError()

// 目前顯示的 Tab
type Tab = 'contact' | 'faq' | 'report'
const activeTab = ref<Tab>('contact')

// 問題回報表單
interface ReportForm {
  category: string
  subject: string
  description: string
  attachScreenshot: boolean
}

const reportForm = reactive<ReportForm>({
  category: '',
  subject: '',
  description: '',
  attachScreenshot: false,
})

const isSubmitting = ref(false)
const submitSuccess = ref(false)

const reportCategories = [
  { value: 'booking', label: '課程預約問題' },
  { value: 'contract', label: '合約相關問題' },
  { value: 'payment', label: '付款與退款' },
  { value: 'app', label: 'App 功能異常' },
  { value: 'facility', label: '設備與環境' },
  { value: 'service', label: '服務品質' },
  { value: 'other', label: '其他問題' },
]

const contactOptions = [
  {
    icon: 'phone',
    label: '客服電話',
    value: '02-1234-5678',
    description: '週一至週五 09:00-21:00',
    action: 'tel:02-1234-5678'
  },
  {
    icon: 'line',
    label: 'LINE 客服',
    value: '@gymnexus',
    description: '24 小時智能客服',
    action: 'https://line.me/R/ti/p/@gymnexus'
  },
  {
    icon: 'email',
    label: 'Email 客服',
    value: 'support@gymnexus.com',
    description: '1-2 個工作天內回覆',
    action: 'mailto:support@gymnexus.com'
  }
]

const faqItems = [
  {
    question: '如何暫停合約？',
    answer: '您可以在「我的合約」頁面點選有效合約的「申請暫停」按鈕，填寫暫停原因後提交申請。暫停期間合約到期日將自動順延。每份合約最多可暫停 2 次，每次暫停天數上限為 30 天。'
  },
  {
    question: '入場 QR Code 無法使用怎麼辦？',
    answer: '請先確認：1. 您的合約狀態為有效 2. 網路連線正常 3. 螢幕亮度足夠。若仍無法使用，請至櫃台出示會員編號，由服務人員協助入場並排除問題。'
  },
  {
    question: '如何取消課程預約？',
    answer: '請在課程開始前 2 小時至「課程預約」頁面取消。超過時限將無法取消，且該堂課程會計入已使用堂數。連續 3 次未到場（No Show）可能影響後續預約權益。'
  },
  {
    question: '如何轉讓合約給他人？',
    answer: '合約轉讓需至現場櫃台辦理，請攜帶雙方身份證件。轉讓時需支付 NT$500 行政手續費，且受讓人需通過會籍資格審查。部分促銷合約不適用轉讓。'
  },
  {
    question: '忘記密碼怎麼辦？',
    answer: '會員 App 採用手機 OTP 驗證登入，無需記憶密碼。如手機號碼有變更，請攜帶身份證件至櫃台更新會員資料後，即可使用新號碼登入。'
  },
  {
    question: '如何申請退費？',
    answer: '依據消費者保護法，新購合約於 7 天內可申請無條件退費。超過 7 天的退費申請需扣除已使用天數費用及手續費。請至櫃台填寫退費申請表單。'
  },
  {
    question: '可以跨分店使用嗎？',
    answer: '視您的合約類型而定。單店會籍僅限該分店使用；多店會籍可於指定分店群組內使用；全館會籍則可於全台分店使用。詳情請查看您的合約內容。'
  }
]

const expandedFaq = ref<number | null>(null)

const toggleFaq = (index: number) => {
  expandedFaq.value = expandedFaq.value === index ? null : index
}

const handleContact = (action: string) => {
  window.open(action, '_blank')
}

// 提交問題回報
const submitReport = async () => {
  // 驗證
  if (!reportForm.category) {
    toast.error('請選擇問題類別')
    return
  }
  if (!reportForm.subject.trim()) {
    toast.error('請輸入問題標題')
    return
  }
  if (!reportForm.description.trim()) {
    toast.error('請描述您的問題')
    return
  }
  if (reportForm.description.trim().length < 10) {
    toast.error('請提供更詳細的問題描述（至少 10 字）')
    return
  }

  isSubmitting.value = true

  try {
    // 提交到後端（假設有 support_tickets 表）
    await $fetch(`${apiUrl}/api/member/support-tickets`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: {
        member_id: member.value?.id,
        category: reportForm.category,
        subject: reportForm.subject.trim(),
        description: reportForm.description.trim(),
        status: 'pending',
        // 可以加入更多資訊如裝置、App 版本等
        metadata: {
          member_code: member.value?.member_code,
          user_agent: navigator.userAgent,
          timestamp: new Date().toISOString(),
        },
      },
    })

    submitSuccess.value = true
    toast.success('問題已提交，我們會盡快處理')

    // 重置表單
    reportForm.category = ''
    reportForm.subject = ''
    reportForm.description = ''
    reportForm.attachScreenshot = false

    // 3 秒後隱藏成功訊息
    setTimeout(() => {
      submitSuccess.value = false
    }, 5000)
  } catch (error) {
    handleError(error, { fallbackMessage: '提交失敗，請稍後再試' })
  } finally {
    isSubmitting.value = false
  }
}

// 字數計算
const descriptionLength = computed(() => reportForm.description.length)
</script>

<template>
  <div class="support-page">
    <header class="page-header">
      <NuxtLink to="/profile" class="back-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </NuxtLink>
      <h1 class="page-title">客服中心</h1>
    </header>

    <!-- Member Info Banner -->
    <div class="member-info-card">
      <div class="member-info-content">
        <p class="member-info-label">您的會員編號</p>
        <p class="member-code">{{ member?.member_code || '-' }}</p>
        <p class="member-info-hint">聯繫客服時請提供此編號</p>
      </div>
    </div>

    <!-- Tab Navigation -->
    <div class="tab-nav">
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'contact' }"
        @click="activeTab = 'contact'"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
        </svg>
        聯絡方式
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'faq' }"
        @click="activeTab = 'faq'"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10" />
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        常見問題
      </button>
      <button
        class="tab-btn"
        :class="{ active: activeTab === 'report' }"
        @click="activeTab = 'report'"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        問題回報
      </button>
    </div>

    <!-- Tab Content -->
    <div class="tab-content">
      <!-- Contact Tab -->
      <section v-show="activeTab === 'contact'" class="content-section">
        <div class="contact-list">
          <button
            v-for="contact in contactOptions"
            :key="contact.label"
            class="contact-item"
            @click="handleContact(contact.action)"
          >
            <span class="contact-icon">
              <svg v-if="contact.icon === 'phone'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <svg v-else-if="contact.icon === 'line'" width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
              </svg>
              <svg v-else-if="contact.icon === 'email'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </span>
            <div class="contact-info">
              <span class="contact-label">{{ contact.label }}</span>
              <span class="contact-value">{{ contact.value }}</span>
              <span class="contact-description">{{ contact.description }}</span>
            </div>
            <svg class="contact-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        <!-- Service Hours -->
        <div class="hours-card">
          <h3 class="hours-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            服務時間
          </h3>
          <div class="hours-grid">
            <div class="hours-row">
              <span>週一至週五</span>
              <span>09:00 - 22:00</span>
            </div>
            <div class="hours-row">
              <span>週六、週日</span>
              <span>10:00 - 20:00</span>
            </div>
            <div class="hours-row">
              <span>國定假日</span>
              <span>10:00 - 18:00</span>
            </div>
          </div>
        </div>
      </section>

      <!-- FAQ Tab -->
      <section v-show="activeTab === 'faq'" class="content-section">
        <div class="faq-list">
          <div
            v-for="(item, index) in faqItems"
            :key="index"
            class="faq-item"
            :class="{ expanded: expandedFaq === index }"
          >
            <button class="faq-question" @click="toggleFaq(index)">
              <span>{{ item.question }}</span>
              <svg
                class="faq-icon"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <Transition name="expand">
              <div v-show="expandedFaq === index" class="faq-answer">
                {{ item.answer }}
              </div>
            </Transition>
          </div>
        </div>

        <div class="faq-footer">
          <p>找不到您的問題？</p>
          <button class="link-btn" @click="activeTab = 'report'">
            提交問題回報
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </section>

      <!-- Report Tab -->
      <section v-show="activeTab === 'report'" class="content-section">
        <!-- Success Message -->
        <Transition name="fade">
          <div v-if="submitSuccess" class="success-card">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <h3>問題已提交</h3>
            <p>我們會在 1-2 個工作天內回覆您</p>
          </div>
        </Transition>

        <form v-if="!submitSuccess" class="report-form" @submit.prevent="submitReport">
          <div class="form-group">
            <label for="category">問題類別 <span class="required">*</span></label>
            <select id="category" v-model="reportForm.category">
              <option value="" disabled>請選擇問題類別</option>
              <option v-for="cat in reportCategories" :key="cat.value" :value="cat.value">
                {{ cat.label }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label for="subject">問題標題 <span class="required">*</span></label>
            <input
              id="subject"
              v-model="reportForm.subject"
              type="text"
              placeholder="簡述您遇到的問題"
              maxlength="50"
            >
          </div>

          <div class="form-group">
            <label for="description">
              詳細描述 <span class="required">*</span>
              <span class="char-count">{{ descriptionLength }}/500</span>
            </label>
            <textarea
              id="description"
              v-model="reportForm.description"
              placeholder="請詳細說明問題情況，包括發生時間、步驟等，以便我們更快為您解決"
              rows="5"
              maxlength="500"
            />
          </div>

          <div class="form-hint">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
            <p>提交後我們會透過您的會員 Email 或電話聯繫您</p>
          </div>

          <button type="submit" class="submit-btn" :disabled="isSubmitting">
            <span v-if="!isSubmitting">提交問題</span>
            <span v-else class="loading-spinner" />
          </button>
        </form>

        <button v-if="submitSuccess" class="back-to-form-btn" @click="submitSuccess = false">
          提交新問題
        </button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.support-page {
  padding: 16px;
  padding-bottom: calc(100px + env(safe-area-inset-bottom));
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  color: var(--color-text);
  text-decoration: none;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-text);
}

/* Member Info Card */
.member-info-card {
  background: linear-gradient(135deg, var(--color-primary) 0%, #059669 100%);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 20px;
}

.member-info-content {
  text-align: center;
}

.member-info-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 8px;
}

.member-code {
  font-size: 28px;
  font-weight: 700;
  color: white;
  font-family: monospace;
  letter-spacing: 2px;
  margin-bottom: 8px;
}

.member-info-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

/* Tab Navigation */
.tab-nav {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
  padding: 4px;
  background-color: var(--color-surface);
  border-radius: 14px;
  border: 1px solid var(--color-border);
}

.tab-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px 8px;
  background: transparent;
  border: none;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  background-color: var(--color-primary);
  color: white;
}

.tab-btn svg {
  flex-shrink: 0;
}

/* Content Section */
.content-section {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Contact List */
.contact-list {
  background-color: var(--color-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  overflow: hidden;
  margin-bottom: 16px;
}

.contact-item {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 18px 20px;
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.contact-item:not(:last-child) {
  border-bottom: 1px solid var(--color-border);
}

.contact-item:active {
  background-color: var(--color-border);
}

.contact-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background-color: rgba(16, 185, 129, 0.1);
  color: var(--color-primary);
  flex-shrink: 0;
}

.contact-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.contact-label {
  font-size: 12px;
  color: var(--color-text-tertiary);
}

.contact-value {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.contact-description {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.contact-arrow {
  color: var(--color-text-tertiary);
  flex-shrink: 0;
}

/* Hours Card */
.hours-card {
  background-color: var(--color-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  padding: 20px;
}

.hours-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 16px;
}

.hours-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hours-row {
  display: flex;
  justify-content: space-between;
  font-size: 14px;
}

.hours-row span:first-child {
  color: var(--color-text-secondary);
}

.hours-row span:last-child {
  font-weight: 500;
  color: var(--color-text);
}

/* FAQ List */
.faq-list {
  background-color: var(--color-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.faq-item {
  border-bottom: 1px solid var(--color-border);
}

.faq-item:last-child {
  border-bottom: none;
}

.faq-question {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 18px 20px;
  background: transparent;
  border: none;
  text-align: left;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text);
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.faq-question:active {
  background-color: var(--color-border);
}

.faq-icon {
  flex-shrink: 0;
  color: var(--color-text-secondary);
  transition: transform 0.2s ease;
}

.faq-item.expanded .faq-icon {
  transform: rotate(180deg);
}

.faq-answer {
  padding: 0 20px 18px 20px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--color-text-secondary);
}

.expand-enter-active,
.expand-leave-active {
  transition: all 0.2s ease;
  overflow: hidden;
}

.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
  padding-bottom: 0;
}

.faq-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: 20px;
  padding: 16px;
  background-color: var(--color-surface);
  border-radius: 12px;
}

.faq-footer p {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
}

.link-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: none;
  border: none;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-primary);
  cursor: pointer;
}

/* Report Form */
.report-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-group label {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

.required {
  color: var(--color-error);
}

.char-count {
  margin-left: auto;
  font-size: 12px;
  font-weight: 400;
  color: var(--color-text-tertiary);
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 14px 16px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  font-size: 15px;
  color: var(--color-text);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.1);
}

.form-group input::placeholder,
.form-group textarea::placeholder {
  color: var(--color-text-tertiary);
}

.form-group select {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 20px;
  padding-right: 40px;
}

.form-group textarea {
  resize: none;
  line-height: 1.6;
}

.form-hint {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 14px 16px;
  background-color: rgba(16, 185, 129, 0.08);
  border-radius: 12px;
}

.form-hint svg {
  flex-shrink: 0;
  color: var(--color-primary);
  margin-top: 1px;
}

.form-hint p {
  font-size: 13px;
  color: var(--color-text-secondary);
  line-height: 1.5;
  margin: 0;
}

.submit-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 16px;
  background-color: var(--color-primary);
  border: none;
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  color: white;
  cursor: pointer;
  transition: background-color 0.2s;
}

.submit-btn:active:not(:disabled) {
  background-color: #059669;
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.loading-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* Success Card */
.success-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 40px 24px;
  background-color: var(--color-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
}

.success-card svg {
  color: var(--color-primary);
  margin-bottom: 16px;
}

.success-card h3 {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text);
  margin: 0 0 8px 0;
}

.success-card p {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0;
}

.back-to-form-btn {
  display: block;
  width: 100%;
  margin-top: 16px;
  padding: 14px;
  background-color: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 12px;
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text);
  cursor: pointer;
  transition: background-color 0.2s;
}

.back-to-form-btn:active {
  background-color: var(--color-border);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
