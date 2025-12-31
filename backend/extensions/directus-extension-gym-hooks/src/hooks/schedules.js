/**
 * Scheduled Tasks Hooks
 * 合約到期檢查、通知排程、報表刷新等排程任務
 */

import { calculateMemberStatus } from './utils.js';

/**
 * 註冊排程鉤子
 */
export function registerScheduledHooks({ init, schedule }, { services, database, getSchema }, { emailService, emailServiceLoaded, cacheEnabled, invalidateReportCache, recordPerformanceMetric }) {
  const { ItemsService } = services;

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

      for (const contract of expiredContracts) {
        await contractsService.updateOne(contract.id, {
          contract_status: 'EXPIRED',
        });
        console.log(`[GymHook] Contract ${contract.contract_no} (${contract.id}) expired (end_date: ${contract.end_date})`);

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

      let notificationsService;
      try {
        notificationsService = new ItemsService('notifications', {
          schema: schema,
          knex: database,
        });
      } catch (e) {
        console.log('[GymHook] Notifications table not found, skipping notification creation');
        return;
      }

      const today = new Date();
      const notificationDays = [7, 3, 1];

      for (const days of notificationDays) {
        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + days);
        const targetDateStr = targetDate.toISOString().split('T')[0];

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

        for (const contract of expiringContracts) {
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

            // 發送 Email 通知
            if (emailServiceLoaded && emailService && emailService.isEmailEnabled()) {
              try {
                const member = await membersService.readOne(contract.member_id, {
                  fields: ['id', 'full_name', 'email'],
                });

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

  // 每天凌晨 1:00 執行到期檢查和通知
  if (typeof schedule === 'function') {
    schedule('0 1 * * *', async () => {
      console.log('[GymHook] Running scheduled contract expiration check...');
      const schema = await getSchema();
      await checkAndUpdateExpiredContracts(schema);
      await createExpirationNotifications(schema);
    });
    console.log('[GymHook] Scheduled daily contract expiration check at 1:00 AM');

    // 報表物化視圖自動刷新 (每天凌晨 4:00 和下午 4:00)
    schedule('0 4,16 * * *', async () => {
      const startTime = Date.now();
      console.log('[GymHook] Starting scheduled report views refresh...');

      try {
        await database.raw('SELECT refresh_report_views()');

        const duration = Date.now() - startTime;
        console.log(`[GymHook] Report views refreshed successfully in ${duration}ms`);

        if (cacheEnabled) {
          await recordPerformanceMetric('report_views_refresh', duration);
          await invalidateReportCache();
          console.log('[GymHook] Report cache invalidated after views refresh');
        }
      } catch (error) {
        console.error('[GymHook] Failed to refresh report views:', error.message);
      }
    });

    console.log('[GymHook] Scheduled report views refresh: 04:00 and 16:00 daily');
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
}

export default registerScheduledHooks;
