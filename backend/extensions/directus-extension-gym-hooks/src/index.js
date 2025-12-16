/**
 * Gym Business Logic Hooks
 *
 * 1. 合約暫停自動延長：當 contract_logs 新增 PAUSE 紀錄時，自動延長 contracts.end_date
 * 2. 會員狀態自動更新：根據合約狀態自動更新 members.member_status
 * 3. 員工帳號同步：當員工建立/更新時，自動同步 branch_id 到 directus_users
 * 4. 付款狀態自動計算：當 payments 變更時，自動計算 contracts.payment_status
 * 5. 合約到期自動更新：檢查合約是否過期並自動更新狀態
 * 6. 合約到期通知：合約即將到期時，自動創建通知紀錄
 */

export default ({ filter, action, init, schedule }, { services, database, getSchema }) => {
  const { ItemsService, UsersService } = services;

  // ============================================
  // 1. 合約暫停自動延長 Hook
  // ============================================

  // 當 contract_logs 創建後，檢查是否為 PAUSE 類型
  action('contract_logs.items.create', async ({ payload, key }, { schema }) => {
    // 只處理 PAUSE 類型的記錄
    if (payload.log_type !== 'PAUSE') return;

    // 確保有合約 ID 和暫停天數
    if (!payload.contract_id || !payload.days_affected) return;

    try {
      const contractsService = new ItemsService('contracts', {
        schema: schema,
        knex: database,
      });

      // 取得合約資料
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

      console.log(`[GymHook] Contract ${payload.contract_id} extended by ${payload.days_affected} days due to PAUSE`);
    } catch (error) {
      console.error('[GymHook] Error extending contract:', error);
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

      console.log(`[GymHook] Contract ${payload.contract_id} resumed to ACTIVE`);
    } catch (error) {
      console.error('[GymHook] Error resuming contract:', error);
    }
  });

  // ============================================
  // 2. 會員狀態自動更新邏輯
  // ============================================

  // 當合約狀態更新時，同步更新會員狀態
  action('contracts.items.update', async ({ payload, keys }, { schema }) => {
    // 只在 contract_status 變更時處理
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

      // 處理所有更新的合約
      for (const contractId of keys) {
        const contract = await contractsService.readOne(contractId, {
          fields: ['id', 'member_id', 'contract_status'],
        });

        if (!contract || !contract.member_id) continue;

        // 查詢該會員的所有有效合約
        const memberContracts = await contractsService.readByQuery({
          filter: {
            member_id: { _eq: contract.member_id },
            status: { _eq: 'active' },
          },
          fields: ['id', 'contract_status'],
        });

        // 計算會員狀態
        const memberStatus = calculateMemberStatus(memberContracts);

        // 更新會員狀態
        await membersService.updateOne(contract.member_id, {
          member_status: memberStatus,
        });

        console.log(`[GymHook] Member ${contract.member_id} status updated to ${memberStatus}`);
      }
    } catch (error) {
      console.error('[GymHook] Error updating member status:', error);
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

      // 查詢該會員的所有有效合約
      const memberContracts = await contractsService.readByQuery({
        filter: {
          member_id: { _eq: payload.member_id },
          status: { _eq: 'active' },
        },
        fields: ['id', 'contract_status'],
      });

      // 計算會員狀態
      const memberStatus = calculateMemberStatus(memberContracts);

      // 更新會員狀態
      await membersService.updateOne(payload.member_id, {
        member_status: memberStatus,
      });

      console.log(`[GymHook] Member ${payload.member_id} status updated to ${memberStatus} after new contract`);
    } catch (error) {
      console.error('[GymHook] Error updating member status on contract create:', error);
    }
  });

  // ============================================
  // 3. 員工帳號同步 Hook（同步 branch_id 到 directus_users）
  // ============================================

  /**
   * 將員工的 branch_id 同步到關聯的 directus_users
   */
  async function syncUserBranchId(userId, branchId, schema) {
    if (!userId) return;

    try {
      const usersService = new UsersService({
        schema: schema,
        knex: database,
      });

      await usersService.updateOne(userId, {
        branch_id: branchId,
      });

      console.log(`[GymHook] User ${userId} branch_id synced to ${branchId}`);
    } catch (error) {
      console.error('[GymHook] Error syncing user branch_id:', error);
    }
  }

  // 當員工建立時，同步 branch_id 到 directus_users
  action('employees.items.create', async ({ payload, key }, { schema }) => {
    if (payload.user_id && payload.branch_id) {
      await syncUserBranchId(payload.user_id, payload.branch_id, schema);
    }
  });

  // 當員工更新時，同步 branch_id 到 directus_users
  action('employees.items.update', async ({ payload, keys }, { schema }) => {
    // 如果沒有更新 branch_id 或 user_id，則不需處理
    if (!payload.branch_id && !payload.user_id) return;

    try {
      const employeesService = new ItemsService('employees', {
        schema: schema,
        knex: database,
      });

      // 處理所有更新的員工
      for (const employeeId of keys) {
        const employee = await employeesService.readOne(employeeId, {
          fields: ['id', 'user_id', 'branch_id'],
        });

        if (employee && employee.user_id && employee.branch_id) {
          await syncUserBranchId(employee.user_id, employee.branch_id, schema);
        }
      }
    } catch (error) {
      console.error('[GymHook] Error syncing user branch_id on employee update:', error);
    }
  });

  // ============================================
  // 4. 付款狀態自動計算 Hook
  // ============================================

  /**
   * 計算合約付款狀態
   * @param {number} totalAmount - 合約總金額
   * @param {number} paidAmount - 已付金額
   * @returns {string} 付款狀態: UNPAID | PARTIAL | PAID
   */
  function calculatePaymentStatus(totalAmount, paidAmount) {
    if (!totalAmount || totalAmount <= 0) return 'PAID';
    if (!paidAmount || paidAmount <= 0) return 'UNPAID';
    if (paidAmount >= totalAmount) return 'PAID';
    return 'PARTIAL';
  }

  /**
   * 更新合約的付款狀態
   */
  async function updateContractPaymentStatus(contractId, schema) {
    try {
      const contractsService = new ItemsService('contracts', {
        schema: schema,
        knex: database,
      });

      const paymentsService = new ItemsService('payments', {
        schema: schema,
        knex: database,
      });

      // 取得合約資料
      const contract = await contractsService.readOne(contractId, {
        fields: ['id', 'total_amount', 'payment_status'],
      });

      if (!contract) return;

      // 取得該合約的所有有效付款紀錄
      const payments = await paymentsService.readByQuery({
        filter: {
          contract_id: { _eq: contractId },
          status: { _eq: 'active' },
        },
        fields: ['id', 'amount', 'payment_type'],
      });

      // 計算已付金額 (收入 - 退款)
      let paidAmount = 0;
      for (const payment of payments) {
        const amount = parseFloat(payment.amount) || 0;
        if (payment.payment_type === 'REFUND') {
          paidAmount -= amount;
        } else {
          paidAmount += amount;
        }
      }

      // 計算新的付款狀態
      const newPaymentStatus = calculatePaymentStatus(
        parseFloat(contract.total_amount) || 0,
        paidAmount
      );

      // 只在狀態改變時更新
      if (newPaymentStatus !== contract.payment_status) {
        await contractsService.updateOne(contractId, {
          payment_status: newPaymentStatus,
        });
        console.log(`[GymHook] Contract ${contractId} payment_status updated to ${newPaymentStatus} (paid: ${paidAmount}/${contract.total_amount})`);
      }
    } catch (error) {
      console.error('[GymHook] Error updating contract payment status:', error);
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

    // 取得所有受影響的付款紀錄
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

    // 先取得要刪除的付款紀錄的合約 ID（在刪除前）
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

  // ============================================
  // 5. 合約到期自動更新狀態 Hook
  // ============================================

  /**
   * 檢查並更新過期合約
   */
  async function checkAndUpdateExpiredContracts(schema) {
    try {
      const contractsService = new ItemsService('contracts', {
        schema: schema,
        knex: database,
      });

      const membersService = new ItemsService('members', {
        schema: schema,
        knex: database,
      });

      const today = new Date().toISOString().split('T')[0];

      // 查詢所有應該過期但尚未標記為過期的合約
      const expiredContracts = await contractsService.readByQuery({
        filter: {
          _and: [
            { end_date: { _lt: today } },
            { contract_status: { _in: ['ACTIVE', 'PAUSED'] } },
            { status: { _eq: 'active' } },
          ],
        },
        fields: ['id', 'contract_no', 'member_id', 'end_date'],
      });

      console.log(`[GymHook] Found ${expiredContracts.length} contracts to expire`);

      // 更新過期合約狀態
      for (const contract of expiredContracts) {
        await contractsService.updateOne(contract.id, {
          contract_status: 'EXPIRED',
        });
        console.log(`[GymHook] Contract ${contract.contract_no} (${contract.id}) expired (end_date: ${contract.end_date})`);

        // 更新會員狀態
        if (contract.member_id) {
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
        }
      }

      return expiredContracts.length;
    } catch (error) {
      console.error('[GymHook] Error checking expired contracts:', error);
      return 0;
    }
  }

  // ============================================
  // 6. 合約到期通知 Hook
  // ============================================

  /**
   * 創建到期通知紀錄
   */
  async function createExpirationNotifications(schema) {
    try {
      const contractsService = new ItemsService('contracts', {
        schema: schema,
        knex: database,
      });

      // 檢查 notifications 表是否存在
      let notificationsService;
      try {
        notificationsService = new ItemsService('notifications', {
          schema: schema,
          knex: database,
        });
      } catch (e) {
        // notifications 表不存在，跳過通知功能
        console.log('[GymHook] Notifications table not found, skipping notification creation');
        return;
      }

      const today = new Date();

      // 設定通知時間點：7天、3天、1天前到期提醒
      const notificationDays = [7, 3, 1];

      for (const days of notificationDays) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + days);
        const targetDateStr = targetDate.toISOString().split('T')[0];

        // 查詢即將到期的合約
        const expiringContracts = await contractsService.readByQuery({
          filter: {
            _and: [
              { end_date: { _eq: targetDateStr } },
              { contract_status: { _in: ['ACTIVE', 'PAUSED'] } },
              { status: { _eq: 'active' } },
            ],
          },
          fields: ['id', 'contract_no', 'member_id', 'end_date', 'branch_id'],
        });

        // 為每個即將到期的合約創建通知
        for (const contract of expiringContracts) {
          // 檢查是否已有相同通知
          const existingNotifications = await notificationsService.readByQuery({
            filter: {
              _and: [
                { reference_type: { _eq: 'contract_expiration' } },
                { reference_id: { _eq: contract.id } },
                { notification_type: { _eq: `expiring_${days}d` } },
              ],
            },
            fields: ['id'],
          });

          if (existingNotifications.length === 0) {
            await notificationsService.createOne({
              notification_type: `expiring_${days}d`,
              title: `合約即將到期提醒`,
              message: `合約 ${contract.contract_no} 將於 ${days} 天後 (${contract.end_date}) 到期`,
              reference_type: 'contract_expiration',
              reference_id: contract.id,
              branch_id: contract.branch_id,
              is_read: false,
              status: 'active',
            });
            console.log(`[GymHook] Created ${days}-day expiration notification for contract ${contract.contract_no}`);
          }
        }
      }
    } catch (error) {
      console.error('[GymHook] Error creating expiration notifications:', error);
    }
  }

  // 使用 Directus 的排程功能（如果可用）
  // 每天凌晨 1:00 執行到期檢查和通知
  if (typeof schedule === 'function') {
    schedule('0 1 * * *', async () => {
      console.log('[GymHook] Running scheduled contract expiration check...');
      const schema = await getSchema();
      await checkAndUpdateExpiredContracts(schema);
      await createExpirationNotifications(schema);
    });
    console.log('[GymHook] Scheduled daily contract expiration check at 1:00 AM');
  }

  // 系統啟動時執行一次過期檢查
  if (typeof init === 'function') {
    init('app.after', async () => {
      console.log('[GymHook] Running initial contract expiration check...');
      try {
        const schema = await getSchema();
        const expiredCount = await checkAndUpdateExpiredContracts(schema);
        await createExpirationNotifications(schema);
        console.log(`[GymHook] Initial check completed. ${expiredCount} contracts expired.`);
      } catch (error) {
        console.error('[GymHook] Error in initial expiration check:', error);
      }
    });
  }

  // ============================================
  // Helper Functions
  // ============================================

  /**
   * 根據會員的所有合約計算會員狀態
   * 優先順序：ACTIVE > PAUSED > INACTIVE
   */
  function calculateMemberStatus(contracts) {
    if (!contracts || contracts.length === 0) {
      return 'INACTIVE';
    }

    const hasActive = contracts.some(c => c.contract_status === 'ACTIVE');
    const hasPaused = contracts.some(c => c.contract_status === 'PAUSED');

    if (hasActive) return 'ACTIVE';
    if (hasPaused) return 'PAUSED';
    return 'INACTIVE';
  }
};
