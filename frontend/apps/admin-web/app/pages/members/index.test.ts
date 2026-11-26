import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { computed, defineComponent, h, watch, onMounted, onBeforeUnmount } from 'vue'
import MembersIndex from './index.vue'
import type { ApiMember } from '~/composables/useMembers'

vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('onBeforeUnmount', onBeforeUnmount)
vi.stubGlobal('definePageMeta', vi.fn())

// Two rows in the GET /api/members wire format
const base: ApiMember = {
  id: 'm-1',
  memberCode: 'M000001',
  fullName: '王小明',
  phone: '0912345678',
  email: null,
  gender: 'MALE',
  birthday: null,
  emergencyContact: null,
  emergencyPhone: null,
  branchId: 'branch-1',
  salesPersonId: null,
  status: 'ACTIVE',
  joinDate: '2026-11-01',
  tags: null,
  height: null
}
const rows: ApiMember[] = [base, { ...base, id: 'm-2', memberCode: 'M000002', fullName: '李小華' }]

const mockFetchMembers = vi.fn()
const mockUpdateMembersStatus = vi.fn()
const mockDeleteMember = vi.fn()
vi.stubGlobal('useMembers', () => ({
  members: ref(rows),
  totalCount: ref(2),
  isLoading: ref(false),
  fetchMembers: mockFetchMembers,
  updateMembersStatus: mockUpdateMembersStatus,
  deleteMember: mockDeleteMember
}))
vi.stubGlobal('useBranches', () => ({
  branches: ref([{ id: 'branch-1', name: '總店' }]),
  fetchBranches: vi.fn().mockResolvedValue(undefined)
}))
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.stubGlobal('useToast', () => toast)
const mockConfirm = vi.fn()
vi.stubGlobal('useConfirm', () => ({ confirm: mockConfirm }))

// Minimal DataList: renders the #item slot for every row
const DataListStub = defineComponent({
  props: { data: { type: Array, required: true } },
  setup(props, { slots }) {
    return () => h('div', (props.data as ApiMember[]).map(row => h('div', { 'data-row': row.id }, slots.item?.({ row }))))
  }
})
const passthrough = defineComponent({ setup: (_, { slots }) => () => h('div', slots.default?.()) })

async function mountPage() {
  const wrapper = mount(MembersIndex, {
    global: {
      mocks: {
        getMemberStatusBadge: (s: string) => ({ label: s, variant: 'default' }),
        formatDate: (d: string) => d
      },
      stubs: {
        PageContainer: passthrough,
        PageHeader: true,
        FilterBar: true,
        StatsBar: true,
        DataPagination: true,
        AppAvatar: true,
        AppBadge: true,
        AppModal: true,
        NuxtLink: passthrough,
        DataList: DataListStub
      }
    }
  })
  await flushPromises()
  return wrapper
}

async function selectBoth(w: VueWrapper) {
  for (const box of w.findAll('button.member-checkbox')) await box.trigger('click')
}

const batchButton = (w: VueWrapper, text: string) => w.findAll('.batch-bar button').find(b => b.text().includes(text))!

describe('members/index.vue batch actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchMembers.mockResolvedValue(undefined)
    mockConfirm.mockResolvedValue(true)
  })

  it('sets the status through the members API and toasts only the real number of updates', async () => {
    mockUpdateMembersStatus.mockResolvedValue({ updated: 1, failed: 1 })
    const wrapper = await mountPage()
    await selectBoth(wrapper)

    await batchButton(wrapper, '設為暫停').trigger('click')
    await flushPromises()

    expect(mockUpdateMembersStatus).toHaveBeenCalledWith(['m-1', 'm-2'], 'SUSPENDED')
    expect(toast.success).toHaveBeenCalledWith('已將 1 位會員設為「暫停」')
    expect(toast.error).toHaveBeenCalledWith('1 位會員狀態更新失敗')
    // the list is reloaded so it shows what the server now has
    expect(mockFetchMembers).toHaveBeenCalledTimes(2)
  })

  it('shows no success toast when every update failed', async () => {
    mockUpdateMembersStatus.mockResolvedValue({ updated: 0, failed: 2 })
    const wrapper = await mountPage()
    await selectBoth(wrapper)

    await batchButton(wrapper, '設為有效').trigger('click')
    await flushPromises()

    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('2 位會員狀態更新失敗')
  })

  it('does nothing when the confirmation is cancelled', async () => {
    mockConfirm.mockResolvedValue(false)
    const wrapper = await mountPage()
    await selectBoth(wrapper)

    await batchButton(wrapper, '設為停權').trigger('click')
    await flushPromises()

    expect(mockUpdateMembersStatus).not.toHaveBeenCalled()
  })

  it('archives the selected members and counts only the ones the API accepted', async () => {
    mockDeleteMember.mockResolvedValueOnce(true).mockResolvedValueOnce(false)
    const wrapper = await mountPage()
    await selectBoth(wrapper)

    await batchButton(wrapper, '封存').trigger('click')
    await flushPromises()

    expect(mockDeleteMember).toHaveBeenCalledWith('m-1', { showToast: false })
    expect(mockDeleteMember).toHaveBeenCalledWith('m-2', { showToast: false })
    expect(toast.success).toHaveBeenCalledWith('已封存 1 位會員')
    expect(toast.error).toHaveBeenCalledWith('1 位會員封存失敗')
  })
})
