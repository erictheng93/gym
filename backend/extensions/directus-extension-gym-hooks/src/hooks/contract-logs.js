/**
 * Contract Logs Hooks
 * 處理合約日誌相關事件：PAUSE, RESUME, CLASS_USED, TRANSFER
 */

import { calculateMemberStatus } from './utils.js';

/**
 * 註冊合約日誌鉤子
 */
export function registerContractLogsHooks({ action }, { services, database }) {
  const { ItemsService } = services;

  // 當 contract_logs 創建後，檢查是否為 PAUSE 類型
  action('contract_logs.items.create', async ({ payload, key }, { schema }) => {
    if (payload.log_type !== 'PAUSE') return;
    if (!payload.contract_id || !payload.days_affected) return;

    try {
      const contractsService = new ItemsService('contracts', {
        schema: schema,
        knex: database,
      });

      const contract = await contractsService.readOne(payload.contract_id, {
        fields: ['id', 'end_date', 'contract_status'],
      });

      if (!contract || !contract.end_date) return;

      // 計算新的結束日期
      const currentEndDate = new Date(contract.end_date);
      const newEndDate = new Date(currentEndDate);
      newEndDate.setDate(newEndDate.getDate() + payload.days_affected);

      // 更新合約結束日期和狀態
      await contractsService.updateOne(payload.contract_id, {
        end_date: newEndDate.toISOString().split('T')[0],
        contract_status: 'PAUSED',
      });

      // 自動創建 EXTEND 記錄
      const contractLogsService = new ItemsService('contract_logs', {
        schema: schema,
        knex: database,
      });

      await contractLogsService.createOne({
        contract_id: payload.contract_id,
        log_type: 'EXTEND',
        end_date: newEndDate.toISOString().split('T')[0],
        days_affected: payload.days_affected,
        reason: `因暫停自動展延 ${payload.days_affected} 天`,
        created_by_employee: payload.created_by_employee,
        status: 'active',
      });

      // Status logged(`[GymHook] Contract ${payload.contract_id} extended by ${payload.days_affected} days due to PAUSE`);
    } catch (error) {
      // Error logged('[GymHook] Error extending contract:', error);
    }
  });

  // 當暫停結束（RESUME）時，恢復合約狀態
  action('contract_logs.items.create', async ({ payload, key }, { schema }) => {
    if (payload.log_type !== 'RESUME') return;
    if (!payload.contract_id) return;

    try {
      const contractsService = new ItemsService('contracts', {
        schema: schema,
        knex: database,
      });

      await contractsService.updateOne(payload.contract_id, {
        contract_status: 'ACTIVE',
      });

      // Status logged(`[GymHook] Contract ${payload.contract_id} resumed to ACTIVE`);
    } catch (error) {
      // Error logged('[GymHook] Error resuming contract:', error);
    }
  });

  // 當使用課程（CLASS_USED）時，自動扣除 remaining_counts
  action('contract_logs.items.create', async ({ payload, key }, { schema }) => {
    if (payload.log_type !== 'CLASS_USED') return;
    if (!payload.contract_id) return;

    try {
      const contractsService = new ItemsService('contracts', {
        schema: schema,
        knex: database,
      });

      const contract = await contractsService.readOne(payload.contract_id, {
        fields: ['id', 'remaining_counts', 'contract_status'],
      });

      if (contract && contract.remaining_counts !== null && contract.remaining_counts > 0) {
        const newCount = contract.remaining_counts - 1;

        await contractsService.updateOne(payload.contract_id, {
          remaining_counts: newCount,
        });

        // Status logged(`[GymHook] Class used: contract ${payload.contract_id} remaining ${newCount}`);

        if (newCount === 0) {
          await contractsService.updateOne(payload.contract_id, {
            contract_status: 'EXPIRED',
          });
          // Status logged(`[GymHook] Contract ${payload.contract_id} expired (all classes used)`);
        }
      }
    } catch (error) {
      // Error logged('[GymHook] Error deducting class count:', error);
    }
  });

  // 當合約轉讓（TRANSFER）時，將合約轉移給新會員
  action('contract_logs.items.create', async ({ payload, key }, { schema }) => {
    if (payload.log_type !== 'TRANSFER') return;
    if (!payload.contract_id || !payload.target_member_id) return;

    try {
      const contractsService = new ItemsService('contracts', {
        schema: schema,
        knex: database,
      });

      const membersService = new ItemsService('members', {
        schema: schema,
        knex: database,
      });

      const contract = await contractsService.readOne(payload.contract_id, {
        fields: ['id', 'member_id', 'contract_status'],
      });

      if (!contract) return;

      const originalMemberId = contract.member_id;

      // 更新合約的 member_id 為新會員
      await contractsService.updateOne(payload.contract_id, {
        member_id: payload.target_member_id,
      });

      // Status logged(`[GymHook] Contract ${payload.contract_id} transferred from member ${originalMemberId} to ${payload.target_member_id}`);

      // 更新原會員狀態
      if (originalMemberId) {
        const originalMemberContracts = await contractsService.readByQuery({
          filter: {
            member_id: { _eq: originalMemberId },
            status: { _eq: 'active' },
          },
          fields: ['id', 'contract_status'],
        });
        const originalMemberStatus = calculateMemberStatus(originalMemberContracts);
        await membersService.updateOne(originalMemberId, {
          member_status: originalMemberStatus,
        });
        // Status logged(`[GymHook] Original member ${originalMemberId} status updated to ${originalMemberStatus}`);
      }

      // 更新新會員狀態
      const targetMemberContracts = await contractsService.readByQuery({
        filter: {
          member_id: { _eq: payload.target_member_id },
          status: { _eq: 'active' },
        },
        fields: ['id', 'contract_status'],
      });
      const targetMemberStatus = calculateMemberStatus(targetMemberContracts);
      await membersService.updateOne(payload.target_member_id, {
        member_status: targetMemberStatus,
      });
      // Status logged(`[GymHook] Target member ${payload.target_member_id} status updated to ${targetMemberStatus}`);
    } catch (error) {
      // Error logged('[GymHook] Error transferring contract:', error);
    }
  });
}

export default registerContractLogsHooks;
