import { describe, it, expect, afterEach } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'
import { usePlans, type ApiPlan, type PlanInput } from './usePlans'
import { MESSAGES } from '~/constants'

// =============================================================================
// Fixtures in the exact wire format of backend/src/routes/membership-plans.ts
// (MEMBERSHIP_PLAN_SELECT + joined branch): camelCase, price as a decimal string
// =============================================================================

const timePlan: ApiPlan = {
  id: 'p0000000-0000-4000-8000-000000000001',
  name: '年卡',
  code: 'YEAR-12',
  planType: 'TIME_BASED',
  description: '一年無限次',
  durationMonths: 12,
  classCounts: null,
  price: '30000.00',
  allowPause: true,
  maxPauseDays: 30,
  allowTransfer: false,
  isActive: true,
  sort: null,
  branchId: null,
  branch: { id: null, name: null },
  createdAt: '2026-11-01T02:00:00.000Z',
  updatedAt: null
}

const countPlan: ApiPlan = {
  ...timePlan,
  id: 'p0000000-0000-4000-8000-000000000002',
  name: '十堂課',
  code: 'PT-10',
  planType: 'COUNT_BASED',
  durationMonths: 3,
  classCounts: 10,
  price: '5000.00',
  isActive: false
}

const lastCall = () => mockFetchInstance.apiFetch.mock.calls.at(-1)!

describe('usePlans', () => {
  afterEach(() => {
    mockFetchInstance.apiFetch.mockReset()
  })

  it('initial state is empty', () => {
    const { plans, isLoading } = usePlans()
    expect(plans.value).toEqual([])
    expect(isLoading.value).toBe(false)
  })

  describe('fetchPlans', () => {
    it('GET /membership-plans and keeps camelCase rows with the price as a number', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: [timePlan, countPlan] })
      const { fetchPlans, plans, isLoading } = usePlans()

      await fetchPlans({}, true)

      expect(lastCall()).toEqual(['/membership-plans', { params: {} }])
      expect(plans.value[0]).toMatchObject({ name: '年卡', planType: 'TIME_BASED', durationMonths: 12, price: 30000, isActive: true })
      expect(plans.value[1]).toMatchObject({ planType: 'COUNT_BASED', classCounts: 10, price: 5000, isActive: false })
      expect(isLoading.value).toBe(false)
    })

    it('sends the filters under the names the handler reads (planType / branchId / activeOnly)', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: [] })
      const { fetchPlans } = usePlans()

      await fetchPlans({ planType: 'COUNT_BASED', branchId: 'b-1', activeOnly: true }, true)

      const params = lastCall()[1].params
      expect(params).toEqual({ planType: 'COUNT_BASED', branchId: 'b-1', activeOnly: 'true' })
      expect(Object.keys(params)).not.toContain('plan_type')
    })

    it('clears the list and reports the error on failure', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('boom'))
      const { fetchPlans, plans } = usePlans()
      plans.value = [{ ...timePlan, price: 1 }]

      await fetchPlans({}, true)

      expect(plans.value).toEqual([])
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ context: 'usePlans.fetchPlans' }))
    })

    it('deduplicates concurrent identical requests', async () => {
      mockFetchInstance.apiFetch.mockResolvedValue({ success: true, data: [] })
      const { fetchPlans } = usePlans()

      await Promise.all([fetchPlans({ activeOnly: true }), fetchPlans({ activeOnly: true })])

      expect(mockFetchInstance.apiFetch).toHaveBeenCalledTimes(1)
    })
  })

  describe('getPlan', () => {
    it('GET /membership-plans/:id', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: countPlan })
      const { getPlan } = usePlans()

      const result = await getPlan(countPlan.id)

      expect(lastCall()).toEqual([`/membership-plans/${countPlan.id}`])
      expect(result).toMatchObject({ code: 'PT-10', classCounts: 10, price: 5000 })
    })

    it('returns null and shows the backend reason on 404', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('方案不存在'))
      const { getPlan } = usePlans()

      expect(await getPlan('missing')).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ customMessage: '方案不存在' }))
    })
  })

  describe('createPlan / updatePlan', () => {
    const input: PlanInput = {
      name: '年卡',
      code: 'YEAR-12',
      planType: 'TIME_BASED',
      durationMonths: 12,
      price: 30000,
      description: '',
      allowTransfer: false,
      allowPause: true,
      isActive: true
    }

    it('POSTs the body as given and returns the normalized plan', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: timePlan })
      const { createPlan } = usePlans()

      const result = await createPlan(input)

      expect(lastCall()).toEqual(['/membership-plans', { method: 'POST', body: input }])
      expect(result).toMatchObject({ id: timePlan.id, price: 30000 })
    })

    it('returns null and surfaces the backend reason on a 400', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('時間制方案需要設定月數'))
      const { createPlan } = usePlans()

      expect(await createPlan(input)).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ customMessage: '時間制方案需要設定月數' }))
    })

    it('PATCHes only the fields given', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, data: { ...timePlan, isActive: false } })
      const { updatePlan } = usePlans()

      const result = await updatePlan(timePlan.id, { isActive: false })

      expect(lastCall()).toEqual([`/membership-plans/${timePlan.id}`, { method: 'PATCH', body: { isActive: false } }])
      expect(result).toMatchObject({ isActive: false })
    })

    it('returns null (not the stale form) when the PATCH fails', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('HTTP 403'))
      const { updatePlan } = usePlans()

      expect(await updatePlan(timePlan.id, { name: 'x' })).toBeNull()
      expect(mockHandleError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ customMessage: MESSAGES.ERRORS.PLAN_UPDATE_FAILED }))
    })
  })

  describe('deletePlan', () => {
    it('DELETE /membership-plans/:id and returns true', async () => {
      mockFetchInstance.apiFetch.mockResolvedValueOnce({ success: true, message: '方案已停用' })
      const { deletePlan } = usePlans()

      expect(await deletePlan(timePlan.id)).toBe(true)
      expect(lastCall()).toEqual([`/membership-plans/${timePlan.id}`, { method: 'DELETE' }])
    })

    it('returns false on failure', async () => {
      mockFetchInstance.apiFetch.mockRejectedValueOnce(new Error('權限不足'))
      const { deletePlan } = usePlans()

      expect(await deletePlan(timePlan.id)).toBe(false)
      expect(mockHandleError).toHaveBeenCalledTimes(1)
    })
  })
})
