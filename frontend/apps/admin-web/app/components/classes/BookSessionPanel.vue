<script setup lang="ts">
/**
 * Staff booking for one session: find a member, pick one of their ACTIVE contracts
 * (counts are deducted from it at check-in), POST /api/bookings.
 */
import { useFetch } from '~/composables/core/useFetch'
import type { ApiMember } from '~/composables/useMembers'
import { NO_VALID_CONTRACT } from '~/composables/useClassBookings'
import type { ApiClassSession } from '~/composables/useClasses'

const props = defineProps<{ session: ApiClassSession; className: string }>()
const emit = defineEmits<{ booked: []; close: [] }>()

interface MemberContract {
  id: string
  contractNo: string
  status: string
  remainingCounts: number | null
  plan: { id: string | null; name: string | null; planType: string | null } | null
}

const { apiFetch } = useFetch()
const { bookSession, canOverrideBooking } = useClassBookings()
const toast = useToast()

const query = ref('')
const results = ref<ApiMember[]>([])
const selected = ref<ApiMember | null>(null)
const contracts = ref<MemberContract[]>([])
const contractId = ref('')
const searching = ref(false)
const submitting = ref(false)
// Manager+ exception path, offered only after the backend refused for lack of a valid contract
const needsOverride = ref(false)
const overrideReason = ref('')
const reasonValid = computed(() => {
  const length = overrideReason.value.trim().length
  return length >= 2 && length <= 200
})

const search = async () => {
  const term = query.value.trim()
  if (!term) return
  searching.value = true
  try {
    const response = await apiFetch<ApiMember[]>('/members', { params: { search: term, limit: 10, status: 'ACTIVE' } })
    results.value = response.data ?? []
  } catch {
    toast.error('搜尋會員失敗')
  } finally {
    searching.value = false
  }
}

const selectMember = async (member: ApiMember) => {
  selected.value = member
  contractId.value = ''
  needsOverride.value = false
  overrideReason.value = ''
  try {
    const response = await apiFetch<MemberContract[]>(`/members/${member.id}/contracts`)
    contracts.value = (response.data ?? []).filter(c => c.status === 'ACTIVE')
    contractId.value = contracts.value[0]?.id ?? ''
  } catch {
    contracts.value = []
    toast.error('載入會員合約失敗')
  }
}

const submit = async (override = false) => {
  if (!selected.value) return
  if (override && !reasonValid.value) return
  submitting.value = true
  try {
    const result = await bookSession({
      sessionId: props.session.id,
      memberId: selected.value.id,
      ...(override
        ? { override: { reason: overrideReason.value.trim() } }
        : { contractId: contractId.value || null })
    })
    if (!result.ok) {
      if (!override && result.code === NO_VALID_CONTRACT && canOverrideBooking.value) {
        needsOverride.value = true
        return
      }
      toast.error(result.error)
      return
    }
    toast.success(result.data.message)
    emit('booked')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="book-panel">
    <div class="panel-header">
      <h4>預約：{{ className }} · {{ session.sessionDate }} {{ session.startTime.slice(0, 5) }}</h4>
      <button type="button" class="btn btn-ghost btn-small" @click="emit('close')">關閉</button>
    </div>

    <form class="search-row" @submit.prevent="search">
      <input v-model="query" type="text" class="input" placeholder="會員姓名、編號或電話" />
      <button type="submit" class="btn btn-secondary btn-small" :disabled="searching">搜尋</button>
    </form>

    <ul v-if="results.length && !selected" class="member-results">
      <li v-for="member in results" :key="member.id">
        <button type="button" class="member-option" @click="selectMember(member)">
          <span>{{ member.fullName }}</span>
          <span class="text-tertiary">{{ member.memberCode }} · {{ member.phone }}</span>
        </button>
      </li>
    </ul>

    <div v-if="selected" class="selected-member">
      <p>
        會員：<strong>{{ selected.fullName }}</strong>（{{ selected.memberCode }}）
        <button type="button" class="link-btn" @click="selected = null">更換</button>
      </p>
      <label class="contract-label">
        扣堂合約
        <select v-model="contractId" class="input">
          <option value="">自動選擇有效合約</option>
          <option v-for="c in contracts" :key="c.id" :value="c.id">
            {{ c.contractNo }} · {{ c.plan?.name ?? '—' }}{{ c.remainingCounts !== null ? `（剩 ${c.remainingCounts} 堂）` : '' }}
          </option>
        </select>
      </label>
      <button v-if="!needsOverride" type="button" class="btn btn-primary btn-small" :disabled="submitting" @click="submit(false)">
        確認預約
      </button>

      <div v-if="needsOverride" class="override-box" data-testid="booking-override">
        <p class="override-title">此會員沒有有效合約</p>
        <p class="override-hint">主管可建立「例外預約（體驗/補課）」：不綁定合約、到課時不扣堂，原因與核准人會留下紀錄。</p>
        <label class="contract-label">
          例外原因（必填）
          <input v-model="overrideReason" type="text" class="input" maxlength="200" placeholder="例如：體驗課、補課" />
        </label>
        <div class="override-actions">
          <button type="button" class="btn btn-primary btn-small" :disabled="submitting || !reasonValid" @click="submit(true)">
            例外預約（體驗/補課）
          </button>
          <button type="button" class="btn btn-ghost btn-small" @click="needsOverride = false">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.book-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding: var(--space-lg);
  margin-top: var(--space-sm);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-xl);
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-md);
}

.panel-header h4 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.search-row {
  display: flex;
  gap: var(--space-sm);
}

.search-row .input {
  flex: 1;
}

.member-results {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.member-option {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-bg-primary);
  border: none;
  border-radius: var(--radius-lg);
  cursor: pointer;
  font-size: 14px;
  color: var(--color-text-primary);
  transition: background var(--duration-fast) var(--ease-out);
}

.member-option:hover {
  background: var(--color-accent-light);
}

.selected-member {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  font-size: 14px;
}

.selected-member p {
  margin: 0;
}

.contract-label {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  font-size: 13px;
  color: var(--color-text-secondary);
}

.override-box {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: var(--space-md);
  background: var(--color-bg-primary);
  border-radius: var(--radius-lg);
}

.override-title {
  font-weight: 600;
  color: var(--color-warning, #ff9500);
}

.override-hint {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.override-actions {
  display: flex;
  gap: var(--space-sm);
}

.link-btn {
  border: none;
  background: none;
  color: var(--color-accent);
  cursor: pointer;
  font-size: 13px;
}
</style>
