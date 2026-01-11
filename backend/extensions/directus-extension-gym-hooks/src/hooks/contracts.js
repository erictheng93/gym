/**
 * Contracts Hooks
 * 處理合約狀態變更時的會員狀態同步
 */

import { calculateMemberStatus } from './utils.js';

/**
 * 註冊合約鉤子
 */
export function registerContractsHooks({ action }, { services, database }, cacheUtils) {
  const { ItemsService } = services;
  const { invalidateMemberContract, invalidateContract } = cacheUtils;

  // 當合約狀態更新時，同步更新會員狀態並清除緩存
  action('contracts.items.update', async ({ payload, keys }, { schema }) => {
    if (!payload.contract_status) return;

    try {
      const contractsService = new ItemsService('contracts', {
        schema: schema,
        knex: database,
      });

      const membersService = new ItemsService('members', {
        schema: schema,
        knex: database,
      });

      for (const contractId of keys) {
        const contract = await contractsService.readOne(contractId, {
          fields: ['id', 'member_id', 'contract_status'],
        });

        if (!contract || !contract.member_id) continue;

        // 清除會員合約緩存 (合約狀態變更時必須清除)
        invalidateMemberContract(contract.member_id).catch(() => {});
        invalidateContract(contractId, contract.member_id).catch(() => {});

        // 查詢該會員的所有有效合約
        const memberContracts = await contractsService.readByQuery({
          filter: {
            member_id: { _eq: contract.member_id },
            status: { _eq: 'active' },
          },
          fields: ['id', 'contract_status'],
        });

        const memberStatus = calculateMemberStatus(memberContracts);

        await membersService.updateOne(contract.member_id, {
          member_status: memberStatus,
        });

        // Status logged(`[GymHook] Member ${contract.member_id} status updated to ${memberStatus}`);
      }
    } catch (error) {
      // Error logged('[GymHook] Error updating member status:', error);
    }
  });

  // 當新合約創建時，更新會員狀態
  action('contracts.items.create', async ({ payload, key }, { schema }) => {
    if (!payload.member_id) return;

    try {
      const contractsService = new ItemsService('contracts', {
        schema: schema,
        knex: database,
      });

      const membersService = new ItemsService('members', {
        schema: schema,
        knex: database,
      });

      const memberContracts = await contractsService.readByQuery({
        filter: {
          member_id: { _eq: payload.member_id },
          status: { _eq: 'active' },
        },
        fields: ['id', 'contract_status'],
      });

      const memberStatus = calculateMemberStatus(memberContracts);

      await membersService.updateOne(payload.member_id, {
        member_status: memberStatus,
      });

      // Status logged(`[GymHook] Member ${payload.member_id} status updated to ${memberStatus} after new contract`);
    } catch (error) {
      // Error logged('[GymHook] Error updating member status on contract create:', error);
    }
  });
}

export default registerContractsHooks;
