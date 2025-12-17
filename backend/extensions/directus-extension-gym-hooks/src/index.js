/**
 * Gym Business Logic Hooks
 *
 * 1. 合約暫停自動延長：當 contract_logs 新增 PAUSE 紀錄時，自動延長 contracts.end_date
 * 2. 會員狀態自動更新：根據合約狀態自動更新 members.member_status
 * 3. 員工帳號同步：當員工建立/更新時，自動同步 branch_id 到 directus_users
 * 4. 付款狀態自動計算：當 payments 變更時，自動計算 contracts.payment_status
 * 5. 合約到期自動更新：檢查合約是否過期並自動更新狀態
 * 6. 合約到期通知：合約即將到期時，自動創建通知紀錄
 * 7. HR 休假審核流程：驗證上級審核下級，記錄審核歷史，更新休假餘額
 * 8. HR 考勤自動計算：打卡時自動計算工時、遲到、加班等
 * 9. 會員入場驗證：驗證會員合約有效性，記錄入場紀錄
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

      // 取得原合約資料
      const contract = await contractsService.readOne(payload.contract_id, {
        fields: ['id', 'member_id', 'contract_status'],
      });

      if (!contract) return;

      const originalMemberId = contract.member_id;

      // 更新合約的 member_id 為新會員
      await contractsService.updateOne(payload.contract_id, {
        member_id: payload.target_member_id,
      });

      console.log(`[GymHook] Contract ${payload.contract_id} transferred from member ${originalMemberId} to ${payload.target_member_id}`);

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
        console.log(`[GymHook] Original member ${originalMemberId} status updated to ${originalMemberStatus}`);
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
      console.log(`[GymHook] Target member ${payload.target_member_id} status updated to ${targetMemberStatus}`);

    } catch (error) {
      console.error('[GymHook] Error transferring contract:', error);
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

  // ============================================
  // 7. HR 休假審核流程 Hooks
  // ============================================

  /**
   * 檢查審核者是否為申請者的上級
   * 遞迴向上查找 supervisor_id 鏈
   * @param {string} approverId - 審核者 ID
   * @param {string} employeeId - 申請者 ID
   * @param {object} employeesService - Directus ItemsService
   * @returns {Promise<boolean>} 是否為上級
   */
  async function isSupervisorOf(approverId, employeeId, employeesService) {
    if (!approverId || !employeeId) return false;
    if (approverId === employeeId) return false;

    try {
      // 取得申請者的上級鏈
      let currentId = employeeId;
      const visited = new Set();
      const maxDepth = 10; // 防止無限迴圈
      let depth = 0;

      while (currentId && depth < maxDepth) {
        if (visited.has(currentId)) break; // 避免循環參照
        visited.add(currentId);

        const employee = await employeesService.readOne(currentId, {
          fields: ['id', 'supervisor_id', 'job_title_id'],
        });

        if (!employee) break;

        // 找到審核者是直屬上級
        if (employee.supervisor_id === approverId) {
          return true;
        }

        currentId = employee.supervisor_id;
        depth++;
      }

      // 如果沒有找到直接上級關係，檢查職級 (可選: 透過 job_titles.permissions_config.level)
      // 此處可擴充為依據 job_title 的 level 判斷
      return false;
    } catch (error) {
      console.error('[GymHook] Error checking supervisor relationship:', error);
      return false;
    }
  }

  /**
   * 計算請假天數 (支援半天假)
   */
  function calculateLeaveDays(startDate, endDate, isHalfDay) {
    if (isHalfDay) return 0.5;

    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  }

  // 休假申請提交時 - 驗證並計算天數
  action('leave_requests.items.create', async ({ payload, key }, { schema, accountability }) => {
    try {
      const leaveRequestsService = new ItemsService('leave_requests', {
        schema: schema,
        knex: database,
      });

      const employeesService = new ItemsService('employees', {
        schema: schema,
        knex: database,
      });

      // 計算請假天數
      const daysRequested = calculateLeaveDays(
        payload.start_date,
        payload.end_date,
        payload.is_half_day
      );

      // 更新請假天數
      await leaveRequestsService.updateOne(key, {
        days_requested: daysRequested,
        submitted_at: new Date().toISOString(),
      });

      // 建立審核歷史記錄 (SUBMIT)
      try {
        const logsService = new ItemsService('leave_approval_logs', {
          schema: schema,
          knex: database,
        });

        await logsService.createOne({
          leave_request_id: key,
          action_by: payload.employee_id,
          action: 'SUBMIT',
          previous_status: null,
          new_status: 'PENDING',
          notes: '提交休假申請',
        });
      } catch (e) {
        // leave_approval_logs 表可能不存在
        console.log('[GymHook] leave_approval_logs table not available');
      }

      // 更新休假餘額中的 pending_days
      try {
        const balancesService = new ItemsService('leave_balances', {
          schema: schema,
          knex: database,
        });

        const year = new Date(payload.start_date).getFullYear();
        const balances = await balancesService.readByQuery({
          filter: {
            employee_id: { _eq: payload.employee_id },
            leave_type: { _eq: payload.leave_type },
            year: { _eq: year },
          },
          limit: 1,
        });

        if (balances.length > 0) {
          const currentPending = parseFloat(balances[0].pending_days) || 0;
          await balancesService.updateOne(balances[0].id, {
            pending_days: currentPending + daysRequested,
          });
        }
      } catch (e) {
        console.log('[GymHook] leave_balances table not available');
      }

      console.log(`[GymHook] Leave request ${key} submitted: ${daysRequested} days`);
    } catch (error) {
      console.error('[GymHook] Error processing leave request submission:', error);
    }
  });

  // 休假審核時 - 驗證審核權限 (上級才能審核下級)
  filter('leave_requests.items.update', async (payload, meta, { schema: filterSchema, accountability }) => {
    // 只在更新 leave_status 且為 APPROVED 或 REJECTED 時檢查
    if (!payload.leave_status || !['APPROVED', 'REJECTED'].includes(payload.leave_status)) {
      return payload;
    }

    const keys = meta.keys || [];

    // 需要有審核者
    if (!payload.approver_id && !accountability?.user) {
      throw new Error('缺少審核者資訊');
    }

    const approverId = payload.approver_id || accountability?.user;

    try {
      // 在 filter hook 中需要獲取 schema
      const schema = filterSchema || await getSchema();

      const leaveRequestsService = new ItemsService('leave_requests', {
        schema: schema,
        knex: database,
      });

      const employeesService = new ItemsService('employees', {
        schema: schema,
        knex: database,
      });

      for (const requestId of keys) {
        const request = await leaveRequestsService.readOne(requestId, {
          fields: ['id', 'employee_id', 'leave_status'],
        });

        if (!request) continue;

        // 檢查是否為待審核狀態
        if (request.leave_status !== 'PENDING') {
          throw new Error(`休假申請 ${requestId} 不是待審核狀態，無法審核`);
        }

        // 取得審核者的員工資訊
        const approverEmployees = await employeesService.readByQuery({
          filter: { user_id: { _eq: approverId } },
          limit: 1,
        });

        let approverEmployeeId = approverId;
        if (approverEmployees.length > 0) {
          approverEmployeeId = approverEmployees[0].id;
        }

        // 檢查是否為總部管理員 (admin level)
        let isAdmin = false;
        if (approverEmployees.length > 0) {
          const approver = approverEmployees[0];
          if (approver.job_title_id) {
            const jobTitlesService = new ItemsService('job_titles', {
              schema: schema,
              knex: database,
            });
            const jobTitle = await jobTitlesService.readOne(approver.job_title_id, {
              fields: ['permissions_config'],
            });
            if (jobTitle?.permissions_config?.level === 'admin') {
              isAdmin = true;
            }
          }
        }

        // 管理員可以審核所有人，否則需要是上級
        if (!isAdmin) {
          const isSupervisor = await isSupervisorOf(approverEmployeeId, request.employee_id, employeesService);
          if (!isSupervisor) {
            throw new Error('您不是該員工的上級，無法審核此休假申請');
          }
        }
      }

      // 設定審核時間
      payload.approved_at = new Date().toISOString();
      if (!payload.approver_id) {
        payload.approver_id = approverId;
      }

      return payload;
    } catch (error) {
      console.error('[GymHook] Leave approval validation error:', error);
      throw error;
    }
  });

  // 休假審核完成後 - 記錄審核歷史，更新餘額
  action('leave_requests.items.update', async ({ payload, keys }, { schema }) => {
    // 只處理狀態變更
    if (!payload.leave_status) return;

    try {
      const leaveRequestsService = new ItemsService('leave_requests', {
        schema: schema,
        knex: database,
      });

      for (const requestId of keys) {
        const request = await leaveRequestsService.readOne(requestId, {
          fields: ['id', 'employee_id', 'leave_type', 'days_requested', 'start_date', 'approver_id'],
        });

        if (!request) continue;

        // 記錄審核歷史
        try {
          const logsService = new ItemsService('leave_approval_logs', {
            schema: schema,
            knex: database,
          });

          const actionMap = {
            'APPROVED': 'APPROVE',
            'REJECTED': 'REJECT',
            'CANCELLED': 'CANCEL',
          };

          await logsService.createOne({
            leave_request_id: requestId,
            action_by: payload.approver_id || request.approver_id,
            action: actionMap[payload.leave_status] || payload.leave_status,
            previous_status: 'PENDING',
            new_status: payload.leave_status,
            notes: payload.approval_notes || null,
          });
        } catch (e) {
          console.log('[GymHook] Could not create approval log');
        }

        // 更新休假餘額
        try {
          const balancesService = new ItemsService('leave_balances', {
            schema: schema,
            knex: database,
          });

          const year = new Date(request.start_date).getFullYear();
          const balances = await balancesService.readByQuery({
            filter: {
              employee_id: { _eq: request.employee_id },
              leave_type: { _eq: request.leave_type },
              year: { _eq: year },
            },
            limit: 1,
          });

          if (balances.length > 0) {
            const balance = balances[0];
            const daysRequested = parseFloat(request.days_requested) || 0;
            const currentPending = parseFloat(balance.pending_days) || 0;
            const currentUsed = parseFloat(balance.used_days) || 0;

            if (payload.leave_status === 'APPROVED') {
              // 核准：pending 減少，used 增加
              await balancesService.updateOne(balance.id, {
                pending_days: Math.max(0, currentPending - daysRequested),
                used_days: currentUsed + daysRequested,
              });
            } else if (['REJECTED', 'CANCELLED'].includes(payload.leave_status)) {
              // 駁回/取消：pending 減少
              await balancesService.updateOne(balance.id, {
                pending_days: Math.max(0, currentPending - daysRequested),
              });
            }
          }
        } catch (e) {
          console.log('[GymHook] Could not update leave balance');
        }

        console.log(`[GymHook] Leave request ${requestId} ${payload.leave_status}`);
      }
    } catch (error) {
      console.error('[GymHook] Error processing leave approval:', error);
    }
  });

  // ============================================
  // 8. HR 考勤自動計算 Hooks
  // ============================================

  /**
   * 計算工時 (小時)
   */
  function calculateWorkHours(checkIn, checkOut, breakMinutes = 60) {
    if (!checkIn || !checkOut) return 0;

    const inTime = new Date(checkIn);
    const outTime = new Date(checkOut);
    const diffMs = outTime - inTime;
    const diffHours = diffMs / (1000 * 60 * 60);

    // 扣除休息時間
    const workHours = diffHours - (breakMinutes / 60);
    return Math.max(0, Math.round(workHours * 100) / 100);
  }

  /**
   * 計算遲到分鐘數
   */
  function calculateLateMinutes(checkIn, scheduledStart, graceMinutes = 10) {
    if (!checkIn || !scheduledStart) return 0;

    const inTime = new Date(checkIn);
    const scheduled = new Date(scheduledStart);
    const diffMs = inTime - scheduled;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    // 寬限時間內不算遲到
    if (diffMinutes <= graceMinutes) return 0;
    return diffMinutes - graceMinutes;
  }

  // 打卡簽退時自動計算工時
  action('attendances.items.update', async ({ payload, keys }, { schema }) => {
    // 只在更新 check_out 時計算
    if (!payload.check_out) return;

    try {
      const attendancesService = new ItemsService('attendances', {
        schema: schema,
        knex: database,
      });

      for (const attendanceId of keys) {
        const attendance = await attendancesService.readOne(attendanceId, {
          fields: ['id', 'check_in', 'check_out', 'employee_id', 'branch_id'],
        });

        if (!attendance || !attendance.check_in) continue;

        const checkOut = payload.check_out || attendance.check_out;
        const workHours = calculateWorkHours(attendance.check_in, checkOut);

        // 計算加班 (超過 8 小時)
        const standardHours = 8;
        const overtimeHours = Math.max(0, workHours - standardHours);

        // 決定出勤狀態
        let attendanceStatus = 'PRESENT';
        if (attendance.late_minutes > 0) {
          attendanceStatus = 'LATE';
        }

        await attendancesService.updateOne(attendanceId, {
          work_hours: workHours,
          overtime_hours: overtimeHours,
          attendance_status: attendanceStatus,
        });

        console.log(`[GymHook] Attendance ${attendanceId} calculated: ${workHours}h work, ${overtimeHours}h overtime`);
      }
    } catch (error) {
      console.error('[GymHook] Error calculating attendance:', error);
    }
  });

  // 打卡簽到時記錄日期和檢查遲到
  action('attendances.items.create', async ({ payload, key }, { schema }) => {
    if (!payload.check_in) return;

    try {
      const attendancesService = new ItemsService('attendances', {
        schema: schema,
        knex: database,
      });

      // 設定考勤日期
      const checkInDate = new Date(payload.check_in);
      const attendanceDate = checkInDate.toISOString().split('T')[0];

      // 取得班表設定 (如果有)
      let lateMinutes = 0;
      let scheduledStart = null;

      try {
        const shiftsService = new ItemsService('shift_schedules', {
          schema: schema,
          knex: database,
        });

        const shifts = await shiftsService.readByQuery({
          filter: {
            branch_id: { _eq: payload.branch_id },
            is_default: { _eq: true },
          },
          limit: 1,
        });

        if (shifts.length > 0) {
          const shift = shifts[0];
          // 組合日期和班表時間
          const [hours, minutes] = shift.start_time.split(':');
          scheduledStart = new Date(checkInDate);
          scheduledStart.setHours(parseInt(hours), parseInt(minutes), 0, 0);

          lateMinutes = calculateLateMinutes(
            payload.check_in,
            scheduledStart,
            shift.grace_period_minutes || 10
          );
        }
      } catch (e) {
        // shift_schedules 可能不存在
      }

      const attendanceStatus = lateMinutes > 0 ? 'LATE' : 'PRESENT';

      await attendancesService.updateOne(key, {
        attendance_date: attendanceDate,
        late_minutes: lateMinutes,
        attendance_status: attendanceStatus,
      });

      console.log(`[GymHook] Attendance ${key} created: date=${attendanceDate}, late=${lateMinutes}min`);
    } catch (error) {
      console.error('[GymHook] Error processing attendance check-in:', error);
    }
  });

  // ============================================
  // 9. 會員入場驗證 Hooks
  // ============================================

  // 會員入場時驗證合約有效性
  filter('member_checkins.items.create', async (payload, meta, { schema }) => {
    if (!payload.member_id) {
      throw new Error('缺少會員資訊');
    }

    try {
      const contractsService = new ItemsService('contracts', {
        schema: schema,
        knex: database,
      });

      const membersService = new ItemsService('members', {
        schema: schema,
        knex: database,
      });

      // 取得會員資訊
      const member = await membersService.readOne(payload.member_id, {
        fields: ['id', 'member_status', 'branch_id', 'full_name'],
      });

      if (!member) {
        throw new Error('會員不存在');
      }

      if (member.member_status !== 'ACTIVE') {
        throw new Error(`會員 ${member.full_name} 狀態為 ${member.member_status}，無法入場`);
      }

      // 檢查是否有有效合約
      const today = new Date().toISOString().split('T')[0];
      const validContracts = await contractsService.readByQuery({
        filter: {
          _and: [
            { member_id: { _eq: payload.member_id } },
            { contract_status: { _eq: 'ACTIVE' } },
            { status: { _eq: 'active' } },
            {
              _or: [
                { end_date: { _gte: today } },
                { end_date: { _null: true } }, // 次數制沒有 end_date
              ],
            },
          ],
        },
        fields: ['id', 'plan_id', 'remaining_counts', 'end_date'],
        limit: 1,
      });

      if (validContracts.length === 0) {
        throw new Error(`會員 ${member.full_name} 沒有有效合約，無法入場`);
      }

      // 設定使用的合約
      payload.contract_id = validContracts[0].id;

      // 判斷是否跨店入場
      if (payload.branch_id && member.branch_id && payload.branch_id !== member.branch_id) {
        payload.is_cross_branch = true;
      }

      // 設定入場時間 (如果沒有提供)
      if (!payload.check_time) {
        payload.check_time = new Date().toISOString();
      }

      return payload;
    } catch (error) {
      console.error('[GymHook] Member checkin validation error:', error);
      throw error;
    }
  });

  // 會員入場後 - 如果是次數制合約，扣除次數
  action('member_checkins.items.create', async ({ payload, key }, { schema }) => {
    if (!payload.contract_id) return;

    try {
      const contractsService = new ItemsService('contracts', {
        schema: schema,
        knex: database,
      });

      const contract = await contractsService.readOne(payload.contract_id, {
        fields: ['id', 'remaining_counts', 'plan_id'],
      });

      // 如果是次數制合約 (有 remaining_counts)
      if (contract && contract.remaining_counts !== null) {
        const newCount = Math.max(0, contract.remaining_counts - 1);

        await contractsService.updateOne(payload.contract_id, {
          remaining_counts: newCount,
        });

        // 如果次數用完，更新合約狀態
        if (newCount === 0) {
          await contractsService.updateOne(payload.contract_id, {
            contract_status: 'EXPIRED',
          });
          console.log(`[GymHook] Contract ${payload.contract_id} expired (no remaining counts)`);
        }

        console.log(`[GymHook] Member checkin: contract ${payload.contract_id} remaining ${newCount}`);
      }
    } catch (error) {
      console.error('[GymHook] Error processing member checkin:', error);
    }
  });
};
