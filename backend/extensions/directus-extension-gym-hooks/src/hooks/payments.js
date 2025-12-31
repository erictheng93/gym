/**
 * Payments Hooks
 * 處理付款紀錄變更時的合約付款狀態計算
 */

import { calculatePaymentStatus } from './utils.js';

/**
 * 註冊付款鉤子
 */
export function registerPaymentsHooks({ action, filter }, { services, database, getSchema }) {
  const { ItemsService } = services;

  /**
   * 更新合約的付款狀態
   * 使用原子 SQL 函數防止並發問題
   */
  async function updateContractPaymentStatus(contractId, schema) {
    try {
      const result = await database.raw(`
        SELECT * FROM recalculate_payment_status(?::uuid)
      `, [contractId]);

      const row = result.rows?.[0] || result[0];

      if (row?.success) {
        if (row.old_status !== row.new_status) {
          console.log(`[GymHook] Contract ${contractId} payment_status updated: ${row.old_status} -> ${row.new_status} (paid: ${row.paid_amount}/${row.total_amount}) [atomic]`);
        }
      }
    } catch (error) {
      if (error.message?.includes('recalculate_payment_status')) {
        console.log('[GymHook] Atomic payment function not available, using fallback');
        await fallbackUpdatePaymentStatus(contractId, schema);
      } else {
        console.error('[GymHook] Error updating contract payment status:', error);
      }
    }
  }

  /**
   * 向後兼容：原始付款狀態更新邏輯
   */
  async function fallbackUpdatePaymentStatus(contractId, schema) {
    try {
      const contractsService = new ItemsService('contracts', {
        schema: schema,
        knex: database,
      });

      const paymentsService = new ItemsService('payments', {
        schema: schema,
        knex: database,
      });

      const contract = await contractsService.readOne(contractId, {
        fields: ['id', 'total_amount', 'payment_status'],
      });

      if (!contract) return;

      const payments = await paymentsService.readByQuery({
        filter: {
          contract_id: { _eq: contractId },
          status: { _eq: 'active' },
        },
        fields: ['id', 'amount', 'payment_type'],
      });

      let paidAmount = 0;
      for (const payment of payments) {
        const amount = parseFloat(payment.amount) || 0;
        if (payment.payment_type === 'REFUND') {
          paidAmount -= amount;
        } else {
          paidAmount += amount;
        }
      }

      const newPaymentStatus = calculatePaymentStatus(
        parseFloat(contract.total_amount) || 0,
        paidAmount
      );

      if (newPaymentStatus !== contract.payment_status) {
        await contractsService.updateOne(contractId, {
          payment_status: newPaymentStatus,
        });
        console.log(`[GymHook] Contract ${contractId} payment_status updated to ${newPaymentStatus} (fallback)`);
      }
    } catch (error) {
      console.error('[GymHook] Fallback payment status error:', error);
    }
  }

  // 當付款紀錄創建時，更新合約付款狀態
  action('payments.items.create', async ({ payload, key }, { schema }) => {
    if (!payload.contract_id) return;
    await updateContractPaymentStatus(payload.contract_id, schema);
  });

  // 當付款紀錄更新時，更新合約付款狀態
  action('payments.items.update', async ({ payload, keys }, { schema }) => {
    const paymentsService = new ItemsService('payments', {
      schema: schema,
      knex: database,
    });

    for (const paymentId of keys) {
      try {
        const payment = await paymentsService.readOne(paymentId, {
          fields: ['contract_id'],
        });
        if (payment && payment.contract_id) {
          await updateContractPaymentStatus(payment.contract_id, schema);
        }
      } catch (error) {
        console.error('[GymHook] Error fetching payment for status update:', error);
      }
    }
  });

  // 當付款紀錄刪除時，更新合約付款狀態
  filter('payments.items.delete', async (keys, { schema }) => {
    const paymentsService = new ItemsService('payments', {
      schema: schema,
      knex: database,
    });

    for (const paymentId of keys) {
      try {
        const payment = await paymentsService.readOne(paymentId, {
          fields: ['contract_id'],
        });
        if (payment && payment.contract_id) {
          // 使用 setTimeout 延遲執行，確保在刪除完成後才更新
          setTimeout(async () => {
            const schemaForUpdate = await getSchema();
            await updateContractPaymentStatus(payment.contract_id, schemaForUpdate);
          }, 100);
        }
      } catch (error) {
        console.error('[GymHook] Error handling payment delete:', error);
      }
    }
    return keys;
  });
}

export default registerPaymentsHooks;
