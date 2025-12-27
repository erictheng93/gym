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
 * 10. Social Login 自動建立會員
 * 11. 權限檢查系統：基於 job_titles.permissions_config 和 employees.custom_permissions 的細粒度權限控制
 *
 * 第二階段優化：Redis 緩存整合 + 權限檢查緩存
 */

// ============================================
// Redis 緩存工具 (可選 - 如果 ioredis 不可用則禁用)
// ============================================
let cacheModule = null;
let cacheEnabled = false;

// 嘗試動態導入緩存模組
// 注意：不使用 await，緩存功能將在後續異步初始化
import('./cache.js').then((module) => {
  cacheModule = module;
  cacheEnabled = true;
  console.log('[GymHook] Redis cache module loaded successfully');
}).catch(() => {
  console.log('[GymHook] Redis cache module not available, running without cache');
});

// 緩存函數包裝器 (如果緩存不可用則返回空操作)
const isCacheAvailable = () => cacheEnabled && cacheModule?.isCacheAvailable?.();
const getCachedMemberContract = async (id) => cacheEnabled ? cacheModule?.getCachedMemberContract?.(id) : null;
const setCachedMemberContract = async (id, data) => cacheEnabled && cacheModule?.setCachedMemberContract?.(id, data);
const invalidateMemberContract = async (id) => cacheEnabled && cacheModule?.invalidateMemberContract?.(id);
const getCachedMemberStatus = async (id) => cacheEnabled ? cacheModule?.getCachedMemberStatus?.(id) : null;
const setCachedMemberStatus = async (id, status) => cacheEnabled && cacheModule?.setCachedMemberStatus?.(id, status);
const invalidateContract = async (id, memberId) => cacheEnabled && cacheModule?.invalidateContract?.(id, memberId);
const recordPerformanceMetric = async (op, duration) => cacheEnabled && cacheModule?.recordPerformanceMetric?.(op, duration);
const invalidateReportCache = async (reportType) => cacheEnabled && cacheModule?.invalidateReportCache?.(reportType);

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

  // 當使用課程（CLASS_USED）時，自動扣除 remaining_counts
  action('contract_logs.items.create', async ({ payload, key }, { schema }) => {
    if (payload.log_type !== 'CLASS_USED') return;
    if (!payload.contract_id) return;

    try {
      const contractsService = new ItemsService('contracts', {
        schema: schema,
        knex: database,
      });

      // 讀取合約資料
      const contract = await contractsService.readOne(payload.contract_id, {
        fields: ['id', 'remaining_counts', 'contract_status'],
      });

      // 確保合約有 remaining_counts (COUNT_BASED 合約)
      if (contract && contract.remaining_counts !== null && contract.remaining_counts > 0) {
        const newCount = contract.remaining_counts - 1;

        // 更新剩餘次數
        await contractsService.updateOne(payload.contract_id, {
          remaining_counts: newCount,
        });

        console.log(`[GymHook] Class used: contract ${payload.contract_id} remaining ${newCount}`);

        // 如果用完了，自動標記為 EXPIRED
        if (newCount === 0) {
          await contractsService.updateOne(payload.contract_id, {
            contract_status: 'EXPIRED',
          });
          console.log(`[GymHook] Contract ${payload.contract_id} expired (all classes used)`);
        }
      }
    } catch (error) {
      console.error('[GymHook] Error deducting class count:', error);
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

  // 當合約狀態更新時，同步更新會員狀態並清除緩存
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

        // ========== 緩存清除 ==========
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
   * 使用原子 SQL 函數防止並發問題
   */
  async function updateContractPaymentStatus(contractId, schema) {
    try {
      // 使用原子 SQL 函數計算付款狀態 (防止 Race Condition)
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
      // 如果原子函數不存在，回退到原始邏輯
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
   * 創建到期通知紀錄 (同時發送 Email)
   */
  async function createExpirationNotifications(schema) {
    try {
      const contractsService = new ItemsService('contracts', {
        schema: schema,
        knex: database,
      });

      const membersService = new ItemsService('members', {
        schema: schema,
        knex: database,
      });

      const plansService = new ItemsService('membership_plans', {
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
          fields: ['id', 'contract_no', 'member_id', 'end_date', 'branch_id', 'plan_id'],
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

            // ========== 發送 Email 通知 ==========
            if (emailServiceLoaded && emailService && emailService.isEmailEnabled()) {
              try {
                // 取得會員資訊
                const member = await membersService.readOne(contract.member_id, {
                  fields: ['id', 'full_name', 'email'],
                });

                // 取得方案名稱
                let planName = '會籍方案';
                if (contract.plan_id) {
                  try {
                    const plan = await plansService.readOne(contract.plan_id, {
                      fields: ['name'],
                    });
                    planName = plan?.name || planName;
                  } catch (e) {
                    // 忽略錯誤
                  }
                }

                if (member && member.email) {
                  const emailContent = emailService.buildContractExpiryEmail({
                    memberName: member.full_name || '會員',
                    contractNo: contract.contract_no,
                    planName: planName,
                    expiryDate: contract.end_date,
                    daysRemaining: days,
                  });

                  const result = await emailService.sendEmail({
                    to: member.email,
                    subject: emailContent.subject,
                    html: emailContent.html,
                  });

                  if (result.success) {
                    console.log(`[GymHook] Sent ${days}-day expiration email to ${member.email}`);
                  }
                }
              } catch (emailError) {
                console.error(`[GymHook] Failed to send expiration email:`, emailError.message);
              }
            }
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

      // 更新休假餘額中的 pending_days (使用原子操作)
      try {
        const year = new Date(payload.start_date).getFullYear();

        // 使用原子 SQL 函數更新餘額
        const result = await database.raw(`
          SELECT * FROM update_leave_balance(?::uuid, ?::varchar, ?::integer, ?::numeric, 0)
        `, [payload.employee_id, payload.leave_type, year, daysRequested]);

        const row = result.rows?.[0] || result[0];
        if (row?.success) {
          console.log(`[GymHook] Leave balance updated: pending=${row.new_pending} [atomic]`);
        } else if (row) {
          console.warn(`[GymHook] Leave balance update warning: ${row.message}`);
        }
      } catch (e) {
        // 如果原子函數不存在，回退到原始邏輯
        if (e.message?.includes('update_leave_balance')) {
          console.log('[GymHook] Atomic leave function not available, using fallback');
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
          } catch (fallbackError) {
            console.log('[GymHook] leave_balances table not available');
          }
        } else {
          console.log('[GymHook] leave_balances table not available');
        }
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

        // 更新休假餘額 (使用原子操作)
        try {
          const year = new Date(request.start_date).getFullYear();
          const daysRequested = parseFloat(request.days_requested) || 0;

          let pendingDelta = 0;
          let usedDelta = 0;

          if (payload.leave_status === 'APPROVED') {
            // 核准：pending 減少，used 增加
            pendingDelta = -daysRequested;
            usedDelta = daysRequested;
          } else if (['REJECTED', 'CANCELLED'].includes(payload.leave_status)) {
            // 駁回/取消：pending 減少
            pendingDelta = -daysRequested;
          }

          // 使用原子 SQL 函數更新餘額
          const result = await database.raw(`
            SELECT * FROM update_leave_balance(?::uuid, ?::varchar, ?::integer, ?::numeric, ?::numeric)
          `, [request.employee_id, request.leave_type, year, pendingDelta, usedDelta]);

          const row = result.rows?.[0] || result[0];
          if (row?.success) {
            console.log(`[GymHook] Leave balance updated: pending=${row.new_pending}, used=${row.new_used} [atomic]`);
          } else if (row) {
            console.warn(`[GymHook] Leave balance update warning: ${row.message}`);
          }
        } catch (e) {
          // 如果原子函數不存在，回退到原始邏輯
          if (e.message?.includes('update_leave_balance')) {
            console.log('[GymHook] Atomic leave function not available, using fallback');
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
                  await balancesService.updateOne(balance.id, {
                    pending_days: Math.max(0, currentPending - daysRequested),
                    used_days: currentUsed + daysRequested,
                  });
                } else if (['REJECTED', 'CANCELLED'].includes(payload.leave_status)) {
                  await balancesService.updateOne(balance.id, {
                    pending_days: Math.max(0, currentPending - daysRequested),
                  });
                }
              }
            } catch (fallbackError) {
              console.log('[GymHook] Could not update leave balance (fallback)');
            }
          } else {
            console.log('[GymHook] Could not update leave balance');
          }
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
  // 9. 會員入場驗證 Hooks (整合 Redis 緩存)
  // ============================================

  // 會員入場時驗證合約有效性
  filter('member_checkins.items.create', async (payload, meta, { schema }) => {
    const startTime = Date.now();

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

      // ========== 緩存優化：先檢查緩存 ==========
      let member = null;
      let validContract = null;
      let cacheHit = false;

      // 嘗試從緩存獲取會員合約資訊
      const cachedData = await getCachedMemberContract(payload.member_id);

      if (cachedData && cachedData.member && cachedData.contract) {
        // 緩存命中：驗證緩存資料是否仍然有效
        const today = new Date().toISOString().split('T')[0];
        const contractEndDate = cachedData.contract.end_date;

        // 檢查合約是否仍在有效期內
        if (cachedData.member.member_status === 'ACTIVE' &&
            cachedData.contract.contract_status === 'ACTIVE' &&
            (!contractEndDate || contractEndDate >= today)) {
          member = cachedData.member;
          validContract = cachedData.contract;
          cacheHit = true;
          console.log(`[GymHook] Check-in cache HIT for member ${payload.member_id}`);
        }
      }

      // ========== 緩存未命中或資料過期：查詢數據庫 ==========
      if (!cacheHit) {
        // 取得會員資訊
        member = await membersService.readOne(payload.member_id, {
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
          fields: ['id', 'plan_id', 'remaining_counts', 'end_date', 'contract_status'],
          limit: 1,
        });

        if (validContracts.length === 0) {
          throw new Error(`會員 ${member.full_name} 沒有有效合約，無法入場`);
        }

        validContract = validContracts[0];

        // 將資料寫入緩存 (非阻塞)
        setCachedMemberContract(payload.member_id, {
          member: {
            id: member.id,
            member_status: member.member_status,
            branch_id: member.branch_id,
            full_name: member.full_name,
          },
          contract: validContract,
          cached_at: new Date().toISOString(),
        }).catch(() => {}); // 忽略緩存錯誤
      }

      // 設定使用的合約
      payload.contract_id = validContract.id;

      // 判斷是否跨店入場
      if (payload.branch_id && member.branch_id && payload.branch_id !== member.branch_id) {
        payload.is_cross_branch = true;
      }

      // 設定入場時間 (如果沒有提供)
      if (!payload.check_time) {
        payload.check_time = new Date().toISOString();
      }

      // 記錄性能指標
      const duration = Date.now() - startTime;
      recordPerformanceMetric('checkin_validation', duration).catch(() => {});

      return payload;
    } catch (error) {
      console.error('[GymHook] Member checkin validation error:', error);
      throw error;
    }
  });

  // 會員入場後 - 如果是次數制合約，扣除次數
  // 使用原子操作防止並發 Race Condition
  action('member_checkins.items.create', async ({ payload, key }, { schema }) => {
    if (!payload.contract_id) return;

    try {
      // 使用原子 SQL 函數扣除次數 (防止 Race Condition)
      const result = await database.raw(`
        SELECT * FROM deduct_contract_count(?::uuid, 1)
      `, [payload.contract_id]);

      const row = result.rows?.[0] || result[0];

      if (row) {
        if (row.success) {
          console.log(`[GymHook] Member checkin: contract ${payload.contract_id} remaining ${row.remaining} (atomic) - ${row.message}`);

          // 如果合約已過期，觸發會員狀態更新
          if (row.contract_status === 'EXPIRED') {
            console.log(`[GymHook] Contract ${payload.contract_id} expired (no remaining counts)`);

            // 使用原子函數更新會員狀態
            const contractsService = new ItemsService('contracts', {
              schema: schema,
              knex: database,
            });
            const contract = await contractsService.readOne(payload.contract_id, {
              fields: ['member_id'],
            });

            if (contract?.member_id) {
              await database.raw(`SELECT * FROM recalculate_member_status(?::uuid)`, [contract.member_id]);
            }
          }
        } else {
          console.warn(`[GymHook] Failed to deduct contract count: ${row.message}`);
        }
      }
    } catch (error) {
      // 如果原子函數不存在，回退到原始邏輯 (向後兼容)
      if (error.message?.includes('deduct_contract_count')) {
        console.log('[GymHook] Atomic function not available, using fallback logic');
        await fallbackDeductCount(payload.contract_id, schema);
      } else {
        console.error('[GymHook] Error processing member checkin:', error);
      }
    }
  });

  // 向後兼容：原始扣除邏輯 (在原子函數不可用時使用)
  async function fallbackDeductCount(contractId, schema) {
    try {
      const contractsService = new ItemsService('contracts', {
        schema: schema,
        knex: database,
      });

      const contract = await contractsService.readOne(contractId, {
        fields: ['id', 'remaining_counts', 'plan_id', 'member_id'],
      });

      if (contract && contract.remaining_counts !== null) {
        const newCount = Math.max(0, contract.remaining_counts - 1);

        await contractsService.updateOne(contractId, {
          remaining_counts: newCount,
        });

        if (newCount === 0) {
          await contractsService.updateOne(contractId, {
            contract_status: 'EXPIRED',
          });
          console.log(`[GymHook] Contract ${contractId} expired (fallback)`);
        }

        console.log(`[GymHook] Member checkin: contract ${contractId} remaining ${newCount} (fallback)`);
      }
    } catch (error) {
      console.error('[GymHook] Fallback deduct count error:', error);
    }
  }

  // ============================================
  // 10. Social Login - 會員自動建立 Hooks
  // ============================================

  /**
   * 產生唯一的會員編號
   * 格式: MYYMMDD#### (例如: M2506150001)
   */
  async function generateMemberCode(membersService) {
    const prefix = 'M';
    const today = new Date();
    const dateStr = today.toISOString().slice(2, 10).replace(/-/g, ''); // YYMMDD

    // 取得今天建立的會員數量
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    try {
      const todayMembers = await membersService.readByQuery({
        filter: {
          date_created: {
            _between: [startOfDay.toISOString(), endOfDay.toISOString()],
          },
        },
        aggregate: { count: ['id'] },
      });

      const count = todayMembers[0]?.count?.id || 0;
      const sequence = (parseInt(count) + 1).toString().padStart(4, '0');
      return `${prefix}${dateStr}${sequence}`;
    } catch (error) {
      // 如果查詢失敗，使用時間戳作為備用
      const timestamp = Date.now().toString().slice(-6);
      return `${prefix}${dateStr}${timestamp}`;
    }
  }

  /**
   * 當透過 SSO 建立新 Directus 用戶時，自動建立會員記錄
   * 這個 Hook 會在用戶透過 Google/LINE/Apple/Facebook 首次登入時觸發
   */
  action('users.create', async ({ payload, key }, { schema }) => {
    // 只處理 SSO 用戶（有 provider 且不是 'default'）
    if (!payload.provider || payload.provider === 'default') {
      return;
    }

    // 取得環境變數中的會員 Role ID
    const memberRoleId = process.env.MEMBER_ROLE_ID || 'b1000000-0000-0000-0000-000000000001';

    // 只處理會員角色的用戶
    if (payload.role !== memberRoleId) {
      console.log(`[GymHook] SSO user ${key} is not a member role, skipping auto-creation`);
      return;
    }

    try {
      const membersService = new ItemsService('members', {
        schema: schema,
        knex: database,
      });

      const socialAccountsService = new ItemsService('member_social_accounts', {
        schema: schema,
        knex: database,
      });

      // 檢查是否已有相同 email 的會員
      let existingMember = null;
      if (payload.email) {
        const members = await membersService.readByQuery({
          filter: { email: { _eq: payload.email } },
          limit: 1,
        });
        existingMember = members[0] || null;
      }

      let memberId;

      if (existingMember) {
        // 已存在會員：連結 user_id
        memberId = existingMember.id;
        await membersService.updateOne(memberId, {
          user_id: key,
        });
        console.log(`[GymHook] Linked existing member ${memberId} to SSO user ${key} (${payload.provider})`);
      } else {
        // 新會員：自動建立
        const memberCode = await generateMemberCode(membersService);
        const fullName = `${payload.first_name || ''} ${payload.last_name || ''}`.trim() ||
                         payload.email?.split('@')[0] ||
                         '新會員';

        memberId = await membersService.createOne({
          user_id: key,
          member_code: memberCode,
          full_name: fullName,
          email: payload.email,
          phone: null, // 社群登入通常沒有電話，之後補填
          member_status: 'INACTIVE', // 需要購買合約才能變成 ACTIVE
          join_date: new Date().toISOString().split('T')[0],
          // branch_id 留空，之後由會員選擇
        });

        console.log(`[GymHook] Created new member ${memberId} (${memberCode}) for SSO user ${key} (${payload.provider})`);

        // ========== 發送歡迎 Email ==========
        if (emailServiceLoaded && emailService && emailService.isEmailEnabled() && payload.email) {
          try {
            const emailContent = emailService.buildWelcomeEmail({
              memberName: fullName,
              memberCode: memberCode,
              branchName: null, // SSO 用戶尚未選擇分店
            });

            await emailService.sendEmail({
              to: payload.email,
              subject: emailContent.subject,
              html: emailContent.html,
            });

            console.log(`[GymHook] Sent welcome email to ${payload.email}`);
          } catch (emailError) {
            console.error(`[GymHook] Failed to send welcome email:`, emailError.message);
          }
        }
      }

      // 建立社群帳號連結紀錄
      try {
        await socialAccountsService.createOne({
          member_id: memberId,
          provider: payload.provider,
          provider_user_id: payload.external_identifier || key,
          provider_email: payload.email,
          provider_name: `${payload.first_name || ''} ${payload.last_name || ''}`.trim(),
          is_primary: !existingMember, // 新會員時為主要登入方式
          last_login_at: new Date().toISOString(),
        });
        console.log(`[GymHook] Created social account link: ${payload.provider} -> member ${memberId}`);
      } catch (socialError) {
        // member_social_accounts 表可能不存在
        console.log('[GymHook] Could not create social account link:', socialError.message);
      }

    } catch (error) {
      console.error('[GymHook] Error auto-creating member from SSO:', error);
    }
  });

  /**
   * 當用戶透過 SSO 登入時，更新 last_login_at
   */
  action('auth.login', async ({ payload, status, user, provider }, { schema }) => {
    // 只處理 SSO 登入成功
    if (!provider || provider === 'default' || status !== 'success') {
      return;
    }

    try {
      const socialAccountsService = new ItemsService('member_social_accounts', {
        schema: schema,
        knex: database,
      });

      // 查找並更新社群帳號紀錄
      const accounts = await socialAccountsService.readByQuery({
        filter: {
          _and: [
            { provider: { _eq: provider } },
            { provider_user_id: { _eq: user?.external_identifier || user?.id } },
            { status: { _eq: 'active' } },
          ],
        },
        limit: 1,
      });

      if (accounts.length > 0) {
        await socialAccountsService.updateOne(accounts[0].id, {
          last_login_at: new Date().toISOString(),
        });
        console.log(`[GymHook] Updated last_login_at for ${provider} account ${accounts[0].id}`);
      }
    } catch (error) {
      // 忽略錯誤，不影響登入流程
      console.log('[GymHook] Could not update social login timestamp');
    }
  });

  // ============================================
  // 11. Push Notification System
  // ============================================

  // 動態導入推播服務
  let pushService = null;
  let pushEnabled = false;

  // 動態導入 Email 服務
  let emailService = null;
  let emailServiceLoaded = false;

  // 異步載入 Email 服務模組
  import('./email-service.js').then((module) => {
    emailService = module;
    emailServiceLoaded = true;
    console.log('[GymHook] Email service module loaded');
  }).catch(() => {
    console.log('[GymHook] Email service module not available');
  });

  // 異步載入推播服務模組
  import('./push-service.js').then((module) => {
    pushService = module;
    pushEnabled = true;
    console.log('[GymHook] Push notification module loaded');

    // 初始化推播服務
    if (typeof init === 'function') {
      init('app.after', async () => {
      try {
        // 從環境變數讀取 VAPID keys
        const env = {
          VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
          VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
          VAPID_SUBJECT: process.env.VAPID_SUBJECT || 'mailto:admin@gym-nexus.com',
        };

        pushEnabled = pushService.initPushService(env);
        if (pushEnabled) {
          console.log('[GymHook] Push notifications enabled');
        } else {
          console.log('[GymHook] Push notifications disabled (VAPID keys not configured)');
        }

        // 初始化 Email 服務
        if (emailServiceLoaded && emailService) {
          const schema = await getSchema();
          const emailEnabled = emailService.initEmailService(services, schema);
          if (emailEnabled) {
            console.log('[GymHook] Email notifications enabled');
          }
        }
      } catch (error) {
        console.error('[GymHook] Notification services init error:', error);
      }
    });
    }
  }).catch(() => {
    console.log('[GymHook] Push notification module not available');
  });

  /**
   * 處理待發送的推播通知
   */
  async function processNotificationQueue(schema) {
    if (!pushEnabled || !pushService) return;

    try {
      // 使用原生 SQL 獲取待發送通知
      const result = await database.raw(`
        SELECT
          nq.id as queue_id,
          nq.notification_type,
          nq.payload,
          ps.id as subscription_id,
          ps.endpoint,
          ps.p256dh,
          ps.auth,
          ps.member_id,
          ps.error_count
        FROM notification_queue nq
        JOIN push_subscriptions ps ON ps.id = nq.subscription_id
        WHERE nq.processed = false
          AND nq.scheduled_at <= NOW()
          AND ps.is_active = true
          AND ps.error_count < 3
        ORDER BY nq.scheduled_at
        LIMIT 50
      `);

      const notifications = result.rows || [];
      if (notifications.length === 0) return;

      console.log(`[GymHook] Processing ${notifications.length} push notifications`);

      for (const notif of notifications) {
        try {
          // 解析 payload
          let payload;
          try {
            payload = typeof notif.payload === 'string' ? JSON.parse(notif.payload) : notif.payload;
          } catch {
            payload = pushService.buildNotificationPayload(notif.notification_type, {});
          }

          // 發送通知
          const sendResult = await pushService.sendNotification(
            {
              endpoint: notif.endpoint,
              p256dh: notif.p256dh,
              auth: notif.auth,
            },
            payload
          );

          // 標記為已處理
          await database.raw(`
            UPDATE notification_queue
            SET processed = true, sent_at = NOW(), success = $2
            WHERE id = $1
          `, [notif.queue_id, sendResult.success]);

          // 如果訂閱失效，更新錯誤計數
          if (sendResult.shouldRemove) {
            await database.raw(`
              UPDATE push_subscriptions
              SET error_count = error_count + 1,
                  is_active = CASE WHEN error_count >= 2 THEN false ELSE is_active END
              WHERE id = $1
            `, [notif.subscription_id]);
          }

          // 記錄到 push_notifications 表
          await database.raw(`
            INSERT INTO push_notifications (subscription_id, notification_type, sent_at, delivered)
            VALUES ($1, $2, NOW(), $3)
          `, [notif.subscription_id, notif.notification_type, sendResult.success]);

        } catch (error) {
          console.error(`[GymHook] Failed to send notification ${notif.queue_id}:`, error.message);

          // 標記為失敗
          await database.raw(`
            UPDATE notification_queue
            SET processed = true, success = false, error = $2
            WHERE id = $1
          `, [notif.queue_id, error.message]);
        }
      }
    } catch (error) {
      console.error('[GymHook] Error processing notification queue:', error);
    }
  }

  // 每分鐘處理通知佇列
  if (typeof schedule === 'function') {
    schedule('* * * * *', async () => {
      if (!pushEnabled) return;
      const schema = await getSchema();
      await processNotificationQueue(schema);
    });
    console.log('[GymHook] Scheduled notification queue processing every minute');

    // 每天早上 8:00 排程合約到期提醒
    schedule('0 8 * * *', async () => {
      if (!pushEnabled) return;
      try {
        await database.raw('SELECT queue_contract_expiry_reminders()');
        console.log('[GymHook] Queued contract expiry reminders');
      } catch (error) {
        console.error('[GymHook] Failed to queue contract expiry reminders:', error);
      }
    });
    console.log('[GymHook] Scheduled daily contract expiry reminders at 8:00 AM');
  }

  // 課程預約成功時 - 排程提醒
  action('bookings.items.create', async ({ payload, key }, { schema }) => {
    if (!pushEnabled || !pushService) return;
    if (payload.booking_status !== 'CONFIRMED') return;

    try {
      // 排程預約提醒
      await database.raw(`
        SELECT queue_booking_reminders($1::uuid)
      `, [payload.session_id]);
      console.log(`[GymHook] Queued booking reminders for session ${payload.session_id}`);
    } catch (error) {
      console.error('[GymHook] Failed to queue booking reminders:', error);
    }
  });

  // 課程取消時 - 通知已預約會員
  action('class_sessions.items.update', async ({ payload, keys }, { schema }) => {
    if (!pushEnabled || !pushService) return;
    if (payload.session_status !== 'CANCELLED') return;

    try {
      const sessionId = keys[0];

      // 取得該課程的所有確認預約的會員
      const bookingsResult = await database.raw(`
        SELECT
          b.member_id,
          c.name as class_name,
          cs.session_date,
          cs.start_time
        FROM bookings b
        JOIN class_sessions cs ON cs.id = b.session_id
        JOIN classes c ON c.id = cs.class_id
        WHERE b.session_id = $1
          AND b.booking_status IN ('CONFIRMED', 'WAITLISTED')
          AND b.status = 'active'
      `, [sessionId]);

      const bookings = bookingsResult.rows || [];
      if (bookings.length === 0) return;

      // 為每個會員建立取消通知
      for (const booking of bookings) {
        // 取得會員的推播訂閱
        const subsResult = await database.raw(`
          SELECT id FROM push_subscriptions
          WHERE member_id = $1
            AND is_active = true
            AND notify_class_cancelled = true
          LIMIT 1
        `, [booking.member_id]);

        const subs = subsResult.rows || [];
        if (subs.length === 0) continue;

        // 建立通知 payload
        const notifPayload = pushService.buildNotificationPayload('class_cancelled', {
          className: booking.class_name,
          sessionId: sessionId,
        });

        // 插入通知佇列
        await database.raw(`
          INSERT INTO notification_queue (subscription_id, notification_type, scheduled_at, payload, dedup_key)
          VALUES ($1, 'class_cancelled', NOW(), $2, $3)
          ON CONFLICT (dedup_key) DO NOTHING
        `, [subs[0].id, JSON.stringify(notifPayload), `cancel_${sessionId}_${booking.member_id}`]);
      }

      console.log(`[GymHook] Queued cancellation notifications for ${bookings.length} bookings`);
    } catch (error) {
      console.error('[GymHook] Failed to queue cancellation notifications:', error);
    }
  });

  // ============================================
  // 11. 權限檢查系統
  // ============================================

  /**
   * 權限緩存 - 避免重複查詢資料庫
   * 格式: { userId: { permissions: {...}, timestamp: Date } }
   */
  const permissionCache = new Map();
  const PERMISSION_CACHE_TTL = 5 * 60 * 1000; // 5 分鐘

  /**
   * 集合名稱到權限模組的對應
   */
  const COLLECTION_TO_MODULE = {
    members: 'members',
    contracts: 'contracts',
    payments: 'payments',
    membership_plans: 'plans',
    employees: 'employees',
    branches: 'branches',
    checkin_logs: 'checkin',
    attendance_records: 'hr',
    leave_requests: 'hr',
    leave_balances: 'hr',
    makeup_punch_requests: 'hr',
    schedules: 'hr',
    // 報表相關集合 (未來實作)
    reports: 'reports',
    // 系統設定
    job_titles: 'settings',
    system_settings: 'settings',
  };

  /**
   * 操作到權限動作的對應
   */
  const OPERATION_TO_ACTION = {
    'items.create': 'create',
    'items.read': 'read',
    'items.update': 'update',
    'items.delete': 'delete',
  };

  /**
   * 取得員工的有效權限
   * 優先使用 custom_permissions，否則使用 job_title.permissions_config
   */
  async function getEffectivePermissions(userId) {
    try {
      // 檢查緩存
      const cached = permissionCache.get(userId);
      if (cached && (Date.now() - cached.timestamp) < PERMISSION_CACHE_TTL) {
        return cached.permissions;
      }

      // 查詢員工資料
      const result = await database.raw(`
        SELECT
          e.id,
          e.custom_permissions,
          jt.permissions_config as job_title_permissions
        FROM employees e
        LEFT JOIN job_titles jt ON jt.id = e.job_title_id
        WHERE e.user_id = $1
          AND e.status = 'active'
        LIMIT 1
      `, [userId]);

      const employee = result.rows?.[0];
      if (!employee) {
        // 如果找不到員工記錄，返回空權限
        console.log(`[PermissionCheck] No active employee found for user ${userId}`);
        return {};
      }

      // 決定使用哪一個權限配置
      let permissions = {};
      if (employee.custom_permissions && typeof employee.custom_permissions === 'object') {
        permissions = employee.custom_permissions;
        console.log(`[PermissionCheck] Using custom permissions for employee ${employee.id}`);
      } else if (employee.job_title_permissions && typeof employee.job_title_permissions === 'object') {
        permissions = employee.job_title_permissions;
        console.log(`[PermissionCheck] Using job title permissions for employee ${employee.id}`);
      } else {
        console.log(`[PermissionCheck] No permissions configured for employee ${employee.id}`);
      }

      // 存入緩存
      permissionCache.set(userId, {
        permissions,
        timestamp: Date.now(),
      });

      return permissions;
    } catch (error) {
      console.error('[PermissionCheck] Error fetching permissions:', error);
      return {};
    }
  }

  /**
   * 清除權限緩存
   */
  function invalidatePermissionCache(userId) {
    if (userId) {
      permissionCache.delete(userId);
    } else {
      permissionCache.clear();
    }
  }

  /**
   * 檢查使用者是否有執行操作的權限
   */
  async function checkPermission(userId, collection, action) {
    const permissions = await getEffectivePermissions(userId);

    // 取得對應的模組名稱
    const module = COLLECTION_TO_MODULE[collection];
    if (!module) {
      // 如果集合沒有對應的權限模組，允許存取
      return true;
    }

    // 檢查權限
    const hasPermission = permissions[module]?.[action] === true;

    if (!hasPermission) {
      console.log(`[PermissionCheck] Permission denied: user=${userId}, collection=${collection}, action=${action}, module=${module}`);
    }

    return hasPermission;
  }

  /**
   * 權限檢查 Filter Hook
   * 在 CRUD 操作之前檢查權限
   */
  ['items.create', 'items.read', 'items.update', 'items.delete'].forEach(operation => {
    filter(operation, async (input, { collection, accountability, schema }) => {
      // 跳過系統操作（沒有 accountability）
      if (!accountability || !accountability.user) {
        return input;
      }

      // 跳過管理員
      if (accountability.admin === true) {
        return input;
      }

      // 跳過內部系統集合
      if (collection.startsWith('directus_')) {
        return input;
      }

      try {
        const action = OPERATION_TO_ACTION[operation];
        const hasPermission = await checkPermission(accountability.user, collection, action);

        if (!hasPermission) {
          const module = COLLECTION_TO_MODULE[collection];
          throw new Error(`權限不足：您沒有權限${getActionName(action)}${getModuleName(module)}`);
        }

        return input;
      } catch (error) {
        // 如果是權限錯誤，直接拋出
        if (error.message && error.message.includes('權限不足')) {
          throw error;
        }
        // 其他錯誤記錄但允許繼續
        console.error('[PermissionCheck] Error in permission check:', error);
        return input;
      }
    });
  });

  /**
   * 當員工或職位資料更新時，清除權限緩存
   */
  action('employees.items.update', async ({ keys }) => {
    try {
      // 查詢受影響員工的 user_id
      const result = await database.raw(`
        SELECT user_id FROM employees WHERE id = ANY($1::uuid[])
      `, [keys]);

      const userIds = result.rows?.map(r => r.user_id).filter(Boolean) || [];
      userIds.forEach(userId => invalidatePermissionCache(userId));

      console.log(`[PermissionCheck] Invalidated permission cache for ${userIds.length} users`);
    } catch (error) {
      console.error('[PermissionCheck] Error invalidating cache:', error);
    }
  });

  action('job_titles.items.update', async ({ keys }) => {
    try {
      // 清空所有緩存，因為不知道哪些員工使用這些職位
      invalidatePermissionCache();
      console.log('[PermissionCheck] Cleared all permission cache due to job title update');
    } catch (error) {
      console.error('[PermissionCheck] Error invalidating cache:', error);
    }
  });

  /**
   * 輔助函數：取得操作名稱
   */
  function getActionName(action) {
    const actionNames = {
      create: '新增',
      read: '檢視',
      update: '編輯',
      delete: '刪除',
    };
    return actionNames[action] || action;
  }

  /**
   * 輔助函數：取得模組名稱
   */
  function getModuleName(module) {
    const moduleNames = {
      members: '會員',
      contracts: '合約',
      payments: '付款紀錄',
      plans: '會籍方案',
      employees: '員工',
      branches: '分店',
      checkin: '入場紀錄',
      hr: '人資資料',
      reports: '報表',
      settings: '系統設定',
    };
    return moduleNames[module] || module;
  }

  // 定期清理過期的權限緩存
  if (typeof schedule === 'function') {
    schedule('*/30 * * * *', async () => {
      const now = Date.now();
      let cleanedCount = 0;

      for (const [userId, cache] of permissionCache.entries()) {
        if ((now - cache.timestamp) >= PERMISSION_CACHE_TTL) {
          permissionCache.delete(userId);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        console.log(`[PermissionCheck] Cleaned ${cleanedCount} expired permission cache entries`);
      }
    });

    // ============================================
    // 報表物化視圖自動刷新 (每天凌晨 4:00 和下午 4:00)
    // ============================================
    schedule('0 4,16 * * *', async () => {
      const startTime = Date.now();
      console.log('[GymHook] Starting scheduled report views refresh...');

      try {
        await database.raw('SELECT refresh_report_views()');

        const duration = Date.now() - startTime;
        console.log(`[GymHook] Report views refreshed successfully in ${duration}ms`);

        // 記錄效能指標（如果 Redis 可用）
        if (cacheEnabled) {
          await recordPerformanceMetric('report_views_refresh', duration);
          // 清除報表緩存，確保下次查詢獲取最新數據
          await invalidateReportCache();
          console.log('[GymHook] Report cache invalidated after views refresh');
        }
      } catch (error) {
        console.error('[GymHook] Failed to refresh report views:', error.message);
      }
    });

    console.log('[GymHook] Scheduled report views refresh: 04:00 and 16:00 daily');
  }
};
