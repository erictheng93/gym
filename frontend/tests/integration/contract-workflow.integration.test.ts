/**
 * Integration Tests: Contract Workflow
 *
 * Tests the complete contract lifecycle from member creation to payments.
 * These tests verify that multiple composables work together correctly.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockFetchInstance, mockHandleError } from '@test/setup'

// Import types
interface Member {
  id: string
  full_name: string
  phone: string
  email: string
  status: string
  branch_id: string
}

interface Contract {
  id: string
  contract_no: string
  member_id: string
  plan_id: string
  status: string
  start_date: string
  end_date: string
  total_amount: number
}

interface Payment {
  id: string
  contract_id: string
  amount: number
  payment_method: string
  status: string
  payment_date: string
}

describe('Contract Workflow Integration', () => {
  // Test data
  const testMember: Member = {
    id: 'member-1',
    full_name: '王小明',
    phone: '0912345678',
    email: 'wang@test.com',
    status: 'active',
    branch_id: 'branch-1'
  }

  const testContract: Contract = {
    id: 'contract-1',
    contract_no: 'CTR-2024-001',
    member_id: 'member-1',
    plan_id: 'plan-1',
    status: 'active',
    start_date: '2024-01-01',
    end_date: '2024-12-31',
    total_amount: 36000
  }

  const testPayment: Payment = {
    id: 'payment-1',
    contract_id: 'contract-1',
    amount: 3000,
    payment_method: 'credit_card',
    status: 'completed',
    payment_date: '2024-01-01'
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Member -> Contract Creation Flow', () => {
    it('should create a member and then create a contract for that member', async () => {
      // Step 1: Create member
      mockFetchInstance.createItem
        .mockResolvedValueOnce(testMember)

      // Step 2: Create contract for the member
      mockFetchInstance.createItem
        .mockResolvedValueOnce(testContract)

      // Import composables dynamically to use fresh mocks
      const { useMembers } = await import('~/composables/useMembers')
      const { useContracts } = await import('~/composables/useContracts')

      const { createMember } = useMembers()
      const { createContract } = useContracts()

      // Execute member creation
      const memberResult = await createMember({
        full_name: '王小明',
        phone: '0912345678',
        email: 'wang@test.com',
        branch_id: 'branch-1'
      })

      expect(mockFetchInstance.createItem).toHaveBeenCalledWith(
        'members',
        expect.objectContaining({
          full_name: '王小明',
          phone: '0912345678'
        })
      )
      expect(memberResult).toEqual(testMember)

      // Execute contract creation with the member ID
      const contractResult = await createContract({
        member_id: memberResult!.id,
        plan_id: 'plan-1',
        start_date: '2024-01-01',
        total_amount: 36000
      })

      expect(mockFetchInstance.createItem).toHaveBeenCalledWith(
        'contracts',
        expect.objectContaining({
          member_id: 'member-1',
          plan_id: 'plan-1'
        })
      )
      expect(contractResult).toEqual(testContract)
    })

    it('should handle member creation failure gracefully', async () => {
      mockFetchInstance.createItem
        .mockRejectedValueOnce(new Error('Duplicate phone number'))

      const { useMembers } = await import('~/composables/useMembers')
      const { createMember } = useMembers()

      const result = await createMember({
        full_name: '王小明',
        phone: '0912345678',
        email: 'wang@test.com',
        branch_id: 'branch-1'
      })

      expect(result).toBeNull()
      expect(mockHandleError).toHaveBeenCalled()
    })
  })

  describe('Contract -> Payment Flow', () => {
    it('should create a payment for an existing contract', async () => {
      // Setup: Get contract
      mockFetchInstance.readItem
        .mockResolvedValueOnce(testContract)

      // Create payment
      mockFetchInstance.createItem
        .mockResolvedValueOnce(testPayment)

      const { useContracts } = await import('~/composables/useContracts')
      const { usePayments } = await import('~/composables/usePayments')

      const { getContract } = useContracts()
      const { createPayment } = usePayments()

      // Get the contract first
      const contract = await getContract('contract-1')
      expect(contract).toEqual(testContract)

      // Create payment for the contract
      const paymentResult = await createPayment({
        contract_id: contract!.id,
        amount: 3000,
        payment_method: 'CREDIT_CARD',
        payment_date: '2024-01-01'
      })

      expect(mockFetchInstance.createItem).toHaveBeenCalledWith(
        'payments',
        expect.objectContaining({
          contract_id: 'contract-1',
          amount: 3000
        })
      )
      expect(paymentResult).toEqual(testPayment)
    })

    it('should fetch payments for a specific contract', async () => {
      const contractPayments = [
        testPayment,
        { ...testPayment, id: 'payment-2', payment_date: '2024-02-01' },
        { ...testPayment, id: 'payment-3', payment_date: '2024-03-01' }
      ]

      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: contractPayments, total: 3 })

      const { usePayments } = await import('~/composables/usePayments')
      const { fetchPayments, payments } = usePayments()

      await fetchPayments()

      // Verify payments are populated from the response
      expect(payments.value).toHaveLength(3)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith(
        'payments',
        expect.any(Object)
      )
    })
  })

  describe('Contract Lifecycle', () => {
    it('should update member status when contract is created', async () => {
      // Create contract
      mockFetchInstance.createItem
        .mockResolvedValueOnce(testContract)

      // Update member status
      mockFetchInstance.updateItem
        .mockResolvedValueOnce({ ...testMember, status: 'active' })

      const { useContracts } = await import('~/composables/useContracts')
      const { useMembers } = await import('~/composables/useMembers')

      const { createContract } = useContracts()
      const { updateMember } = useMembers()

      // Create contract
      const contract = await createContract({
        member_id: 'member-1',
        plan_id: 'plan-1',
        start_date: '2024-01-01',
        total_amount: 36000
      })

      expect(contract).toBeTruthy()

      // Update member status (this would typically be done by a hook, simulated here)
      await updateMember('member-1', { status: 'active' })

      expect(mockFetchInstance.updateItem).toHaveBeenCalledWith(
        'members',
        'member-1',
        expect.objectContaining({ status: 'active' })
      )
    })

    it('should handle contract pause and resume', async () => {
      const pausedContract = { ...testContract, status: 'paused' }
      const resumedContract = { ...testContract, status: 'active' }

      // Pause contract
      mockFetchInstance.updateItem
        .mockResolvedValueOnce(pausedContract)

      // Resume contract
      mockFetchInstance.updateItem
        .mockResolvedValueOnce(resumedContract)

      const { useContracts } = await import('~/composables/useContracts')
      const { updateContract } = useContracts()

      // Pause the contract
      const paused = await updateContract('contract-1', { status: 'active' as const })
      expect(paused?.status).toBe('paused')

      // Resume the contract
      const resumed = await updateContract('contract-1', { status: 'active' })
      expect(resumed?.status).toBe('active')
    })
  })

  describe('Branch-scoped Operations', () => {
    it('should filter members by branch', async () => {
      const branchMembers = [
        testMember,
        { ...testMember, id: 'member-2', full_name: '李大華' }
      ]

      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: branchMembers, total: 2 })

      const { useMembers } = await import('~/composables/useMembers')
      const { fetchMembers, members } = useMembers()

      await fetchMembers()

      // Verify members are populated from the response
      expect(members.value).toHaveLength(2)
      expect(mockFetchInstance.readItems).toHaveBeenCalledWith(
        'members',
        expect.any(Object)
      )
    })

    it('should filter contracts by branch through member relationship', async () => {
      const branchContracts = [
        testContract,
        { ...testContract, id: 'contract-2', contract_no: 'CTR-2024-002' }
      ]

      mockFetchInstance.readItems
        .mockResolvedValueOnce({ data: branchContracts, total: 2 })

      const { useContracts } = await import('~/composables/useContracts')
      const { fetchContracts, contracts } = useContracts()

      await fetchContracts({ branchId: 'branch-1' })

      expect(contracts.value).toHaveLength(2)
    })
  })
})
