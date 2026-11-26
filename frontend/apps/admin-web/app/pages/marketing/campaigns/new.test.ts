import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { computed, watch, onMounted, ref } from 'vue'
import CampaignsNew from './new.vue'
import FormField from '../../../../../../packages/ui/components/form/FormField.vue'
import FormInput from '../../../../../../packages/ui/components/form/FormInput.vue'
import FormSelect from '../../../../../../packages/ui/components/form/FormSelect.vue'
import FormTextarea from '../../../../../../packages/ui/components/form/FormTextarea.vue'
import FormDatePicker from '../../../../../../packages/ui/components/form/FormDatePicker.vue'

// vitest.setup.ts replaces computed/watch/onMounted with inert fakes for composable tests;
// a page test needs Vue's real reactivity.
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('ref', ref)

const mockNavigateTo = vi.fn()
vi.stubGlobal('navigateTo', mockNavigateTo)
vi.stubGlobal('useRouter', () => ({ push: vi.fn(), back: vi.fn() }))
vi.stubGlobal('definePageMeta', vi.fn())

const BRANCH_ID = 'b0000000-0000-4000-8000-000000000001'

const mockCreateCampaign = vi.fn()
vi.stubGlobal('useCampaigns', () => ({ createCampaign: mockCreateCampaign }))
vi.stubGlobal('useBranches', () => ({
  branches: ref([{ id: BRANCH_ID, name: '信義店' }]),
  fetchBranches: vi.fn().mockResolvedValue(undefined)
}))
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.stubGlobal('useToast', () => toast)

const Passthrough = { template: '<div><slot /></div>' }

async function mountPage() {
  const wrapper = mount(CampaignsNew, {
    global: {
      components: { FormField, FormInput, FormSelect, FormTextarea, FormDatePicker },
      stubs: { PageContainer: Passthrough, PageHeader: true }
    }
  })
  await flushPromises()
  return wrapper
}

async function submit(w: VueWrapper) {
  await w.find('form').trigger('submit')
  await flushPromises()
}

const fillRequired = async (w: VueWrapper) => {
  await w.find('input').setValue('夏季促銷') // first input: name
  const [start, end] = w.findAll('input[type="date"]')
  await start!.setValue('2026-06-01')
  await end!.setValue('2026-08-31')
}

describe('marketing/campaigns/new.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockCreateCampaign.mockResolvedValue({ id: 'c-1' })
  })

  it('posts the backend createCampaignSchema field names (camelCase), then toasts and redirects', async () => {
    const wrapper = await mountPage()
    await fillRequired(wrapper)
    await submit(wrapper)

    expect(mockCreateCampaign).toHaveBeenCalledWith({
      name: '夏季促銷',
      campaignType: 'PROMOTION',
      startDate: '2026-06-01',
      endDate: '2026-08-31',
      description: undefined,
      budget: undefined,
      targetAudience: undefined,
      branchId: undefined,
      isActive: true
    })
    expect(toast.success).toHaveBeenCalledWith('活動建立成功')
    expect(mockNavigateTo).toHaveBeenCalledWith('/marketing/campaigns/c-1')
  })

  it('does not send snake_case or fields the backend has no column for', async () => {
    const wrapper = await mountPage()
    await fillRequired(wrapper)
    await submit(wrapper)

    const body = mockCreateCampaign.mock.calls[0]![0] as Record<string, unknown>
    for (const key of ['type', 'status', 'start_date', 'end_date', 'target_segment', 'target_branches', 'associated_coupons']) {
      expect(body).not.toHaveProperty(key)
    }
  })

  it('shows no success toast and does not redirect when the create fails (createCampaign resolves null)', async () => {
    mockCreateCampaign.mockResolvedValue(null)
    const wrapper = await mountPage()
    await fillRequired(wrapper)
    await submit(wrapper)

    expect(mockCreateCampaign).toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(mockNavigateTo).not.toHaveBeenCalled()
  })

  it('does not submit when required fields are missing', async () => {
    const wrapper = await mountPage()
    await submit(wrapper)

    expect(mockCreateCampaign).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
  })
})
