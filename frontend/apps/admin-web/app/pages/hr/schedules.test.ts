import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { ref, computed, watch, onMounted, reactive } from 'vue'
import { MESSAGES } from '~/constants'
import type { ShiftSchedule } from '~/types/schema'

// vitest.setup.ts replaces computed/watch/onMounted with inert fakes for composable tests;
// a page test needs Vue's real reactivity.
vi.stubGlobal('computed', computed)
vi.stubGlobal('watch', watch)
vi.stubGlobal('onMounted', onMounted)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('ref', ref)
vi.stubGlobal('definePageMeta', vi.fn())

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() }
vi.stubGlobal('useToast', () => toast)
vi.stubGlobal('useBranches', () => ({
  branches: ref([{ id: 'branch-1', name: '信義店' }]),
  fetchBranches: vi.fn().mockResolvedValue(undefined)
}))

// A row as GET /api/shift_schedules answers it (routes/shift-schedules.ts)
const weekendShift: ShiftSchedule = {
  id: 'shift-1',
  status: 'published',
  date_created: '2025-01-01T00:00:00.000Z',
  date_updated: null,
  branch_id: 'branch-1',
  name: '週末班',
  start_time: '10:00:00',
  end_time: '19:00:00',
  break_start: null,
  break_end: null,
  grace_period_minutes: 15,
  early_leave_minutes: 15,
  overtime_start_after: null,
  is_default: false,
  applicable_days: ['SATURDAY', 'SUNDAY'],
  branch: { name: '信義店' } as ShiftSchedule['branch']
}

const shifts = {
  shiftSchedules: ref<ShiftSchedule[]>([]),
  isShiftLoading: ref(false),
  fetchShiftSchedules: vi.fn(),
  createShiftSchedule: vi.fn(),
  updateShiftSchedule: vi.fn(),
  deleteShiftSchedule: vi.fn(),
  fetchShiftEmployees: vi.fn(),
  fetchBranchEmployees: vi.fn(),
  batchAssignShift: vi.fn(),
  removeEmployeeShift: vi.fn()
}
vi.mock('~/composables/hr', () => ({ useShiftSchedules: () => shifts }))

const { default: SchedulesPage } = await import('./schedules.vue')

const mountPage = () => mount(SchedulesPage, {
  global: { stubs: { teleport: true, NuxtLink: { template: '<a><slot /></a>' } } }
})

const openCreate = async (w: VueWrapper) => {
  const button = w.findAll('button').find(b => b.text().includes('新增班表'))!
  await button.trigger('click')
  await w.find('input[type="text"]').setValue('早班')
}

describe('hr/schedules.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shifts.shiftSchedules.value = [weekendShift]
    shifts.fetchShiftSchedules.mockResolvedValue(undefined)
  })

  it('shows the days of a backend schedule (MONDAY..SUNDAY enum)', async () => {
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.text()).toContain('六、日')
  })

  it('creates a schedule with the backend weekday enum', async () => {
    shifts.createShiftSchedule.mockResolvedValue({ ...weekendShift, id: 'shift-new' })
    const wrapper = mountPage()
    await flushPromises()
    await openCreate(wrapper)

    const saturday = wrapper.findAll('button.weekday-btn').find(b => b.text() === '六')!
    await saturday.trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(shifts.createShiftSchedule).toHaveBeenCalledWith(expect.objectContaining({
      name: '早班',
      branch_id: 'branch-1',
      applicable_days: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
    }))
    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.SCHEDULE_CREATED)
  })

  it('shows the backend error and no success toast when the create is rejected', async () => {
    shifts.createShiftSchedule.mockRejectedValue(new Error('無效的分店'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const wrapper = mountPage()
    await flushPromises()
    await openCreate(wrapper)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('無效的分店')
  })

  it('edits a schedule keeping its backend days', async () => {
    shifts.updateShiftSchedule.mockResolvedValue(weekendShift)
    const wrapper = mountPage()
    await flushPromises()

    const edit = wrapper.findAll('.schedule-actions button').find(b => b.attributes('title') === '編輯')!
    await edit.trigger('click')
    const active = wrapper.findAll('button.weekday-btn.active').map(b => b.text())
    expect(active).toEqual(['六', '日'])

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(shifts.updateShiftSchedule).toHaveBeenCalledWith('shift-1', expect.objectContaining({
      applicable_days: ['SATURDAY', 'SUNDAY']
    }))
    expect(toast.success).toHaveBeenCalledWith(MESSAGES.SUCCESS.SCHEDULE_UPDATED)
  })
})
