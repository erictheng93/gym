<script setup lang="ts">
definePageMeta({
  middleware: 'auth'
})

const { member } = useMemberAuth()

const contactOptions = [
  {
    icon: 'phone',
    label: '客服電話',
    value: '02-1234-5678',
    action: 'tel:02-1234-5678'
  },
  {
    icon: 'line',
    label: 'LINE 客服',
    value: '@gymnexus',
    action: 'https://line.me/R/ti/p/@gymnexus'
  },
  {
    icon: 'email',
    label: 'Email',
    value: 'support@gymnexus.com',
    action: 'mailto:support@gymnexus.com'
  }
]

const faqItems = [
  {
    question: '如何暫停合約？',
    answer: '您可以在「我的合約」頁面點選有效合約的「申請暫停」按鈕，填寫暫停原因後提交申請。暫停期間合約到期日將自動順延。'
  },
  {
    question: '入場 QR Code 無法使用怎麼辦？',
    answer: '請確認您的合約狀態為有效，並檢查網路連線是否正常。若仍無法使用，請至櫃台由服務人員協助處理。'
  },
  {
    question: '如何取消課程預約？',
    answer: '請在課程開始前 2 小時至「課程預約」頁面取消。超過時限將無法取消，且可能影響後續預約權益。'
  },
  {
    question: '如何轉讓合約？',
    answer: '合約轉讓需至現場櫃台辦理，請攜帶雙方身份證件。轉讓時需支付行政手續費，詳情請洽客服。'
  },
  {
    question: '忘記密碼怎麼辦？',
    answer: '會員 App 採用手機 OTP 驗證登入，無需記憶密碼。如手機號碼有變更，請至櫃台更新會員資料。'
  }
]

const expandedFaq = ref<number | null>(null)

const toggleFaq = (index: number) => {
  expandedFaq.value = expandedFaq.value === index ? null : index
}

const handleContact = (action: string) => {
  window.open(action, '_blank')
}
</script>

<template>
  <div class="support-page">
    <header class="page-header">
      <NuxtLink to="/profile" class="back-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </NuxtLink>
      <h1 class="page-title">聯絡客服</h1>
    </header>

    <!-- Member Info -->
    <div class="member-info-card">
      <p class="member-info-text">
        如需協助，請提供您的會員編號以加速服務：
      </p>
      <div class="member-code">
        {{ member?.member_code || '-' }}
      </div>
    </div>

    <!-- Contact Options -->
    <section class="section">
      <h2 class="section-title">聯絡方式</h2>
      <div class="contact-list">
        <button
          v-for="contact in contactOptions"
          :key="contact.label"
          class="contact-item"
          @click="handleContact(contact.action)"
        >
          <span class="contact-icon">
            <svg v-if="contact.icon === 'phone'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
            <svg v-else-if="contact.icon === 'line'" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.63-.63.346 0 .628.285.628.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.282.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
            </svg>
            <svg v-else-if="contact.icon === 'email'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </span>
          <div class="contact-info">
            <span class="contact-label">{{ contact.label }}</span>
            <span class="contact-value">{{ contact.value }}</span>
          </div>
          <svg class="contact-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </section>

    <!-- Service Hours -->
    <section class="section">
      <h2 class="section-title">服務時間</h2>
      <div class="hours-card">
        <div class="hours-row">
          <span class="hours-label">週一至週五</span>
          <span class="hours-value">09:00 - 22:00</span>
        </div>
        <div class="hours-row">
          <span class="hours-label">週六、週日</span>
          <span class="hours-value">10:00 - 20:00</span>
        </div>
        <div class="hours-row">
          <span class="hours-label">國定假日</span>
          <span class="hours-value">10:00 - 18:00</span>
        </div>
      </div>
    </section>

    <!-- FAQ -->
    <section class="section">
      <h2 class="section-title">常見問題</h2>
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
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          <div v-show="expandedFaq === index" class="faq-answer">
            {{ item.answer }}
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.support-page {
  padding: 16px;
  padding-bottom: calc(80px + env(safe-area-inset-bottom));
}

.page-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
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
  font-size: 24px;
  font-weight: 700;
  color: var(--color-text);
}

.member-info-card {
  background: linear-gradient(135deg, var(--color-primary) 0%, #059669 100%);
  border-radius: 16px;
  padding: 20px;
  margin-bottom: 24px;
  text-align: center;
}

.member-info-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  margin-bottom: 12px;
}

.member-code {
  font-size: 24px;
  font-weight: 700;
  color: white;
  font-family: monospace;
  letter-spacing: 2px;
}

.section {
  margin-bottom: 24px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: 12px;
}

.contact-list {
  background-color: var(--color-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.contact-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 16px 20px;
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
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background-color: rgba(16, 185, 129, 0.1);
  color: var(--color-primary);
}

.contact-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.contact-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.contact-value {
  font-size: 15px;
  font-weight: 500;
  color: var(--color-text);
}

.contact-arrow {
  color: var(--color-text-secondary);
}

.hours-card {
  background-color: var(--color-surface);
  border-radius: 16px;
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.hours-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
}

.hours-row:not(:last-child) {
  border-bottom: 1px solid var(--color-border);
}

.hours-label {
  font-size: 14px;
  color: var(--color-text-secondary);
}

.hours-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text);
}

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
  padding: 16px 20px;
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
  padding: 0 20px 16px 20px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-secondary);
}
</style>
