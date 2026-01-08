/**
 * Billing Cron Tasks
 * 账单相关定时任务
 */

/**
 * 注册账单定时任务
 * @param {object} schedule - Directus schedule function
 * @param {object} context - Directus context
 */
export function registerBillingTasks(schedule, context) {
  const { database, services, env } = context;

  /**
   * 每日收集使用量
   * 每天 23:59 执行
   */
  schedule('59 23 * * *', async () => {
    console.log('[BillingCron] Starting daily usage collection...');

    try {
      // 获取所有活跃租户
      const result = await database.raw(`
        SELECT id FROM tenants
        WHERE tenant_status = 'active'
      `);

      const tenants = result.rows || [];
      let successCount = 0;
      let errorCount = 0;

      for (const tenant of tenants) {
        try {
          // 获取租户的当前使用量
          const statsResult = await database.raw(`
            SELECT
              (SELECT COUNT(*) FROM branches WHERE tenant_id = $1::uuid AND status = 'active') as branches_count,
              (SELECT COUNT(*) FROM members m
               INNER JOIN branches b ON b.id = m.branch_id
               WHERE b.tenant_id = $1::uuid AND m.member_status IN ('ACTIVE', 'INACTIVE', 'FROZEN')) as members_count,
              (SELECT COUNT(*) FROM employees e
               INNER JOIN branches b ON b.id = e.branch_id
               WHERE b.tenant_id = $1::uuid AND e.status = 'active') as employees_count,
              (SELECT COUNT(*) FROM contracts c
               INNER JOIN members m ON m.id = c.member_id
               INNER JOIN branches b ON b.id = m.branch_id
               WHERE b.tenant_id = $1::uuid AND c.contract_status = 'ACTIVE') as active_contracts_count,
              (SELECT COALESCE(SUM(filesize), 0)::bigint / 1024.0 / 1024.0 as storage_mb
               FROM directus_files df
               INNER JOIN employees e ON e.user_id = df.uploaded_by
               INNER JOIN branches b ON b.id = e.branch_id
               WHERE b.tenant_id = $1::uuid) as storage_mb,
              (SELECT COALESCE(SUM(amount), 0)
               FROM payments p
               INNER JOIN branches b ON b.id = p.branch_id
               WHERE b.tenant_id = $1::uuid
               AND DATE(p.payment_date) = CURRENT_DATE) as daily_revenue
          `, [tenant.id]);

          const stats = statsResult.rows[0];

          // 插入或更新使用量记录
          await database.raw(`
            INSERT INTO usage_records (
              tenant_id,
              record_date,
              members_count,
              employees_count,
              branches_count,
              storage_mb,
              active_contracts_count,
              daily_revenue
            ) VALUES ($1::uuid, CURRENT_DATE, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (tenant_id, record_date)
            DO UPDATE SET
              members_count = EXCLUDED.members_count,
              employees_count = EXCLUDED.employees_count,
              branches_count = EXCLUDED.branches_count,
              storage_mb = EXCLUDED.storage_mb,
              active_contracts_count = EXCLUDED.active_contracts_count,
              daily_revenue = EXCLUDED.daily_revenue,
              date_created = NOW()
          `, [
            tenant.id,
            stats.members_count || 0,
            stats.employees_count || 0,
            stats.branches_count || 0,
            stats.storage_mb || 0,
            stats.active_contracts_count || 0,
            stats.daily_revenue || 0
          ]);

          successCount++;
        } catch (error) {
          console.error(`[BillingCron] Error collecting usage for tenant ${tenant.id}:`, error);
          errorCount++;
        }
      }

      console.log(`[BillingCron] Daily usage collection completed: ${successCount} succeeded, ${errorCount} failed`);
    } catch (error) {
      console.error('[BillingCron] Error in daily usage collection:', error);
    }
  });

  /**
   * 每月账单生成
   * 每月1号 00:30 执行
   */
  schedule('30 0 1 * *', async () => {
    console.log('[BillingCron] Starting monthly invoice generation...');

    try {
      // 获取所有活跃订阅
      const result = await database.raw(`
        SELECT
          s.*,
          t.name as tenant_name,
          t.email as tenant_email
        FROM subscriptions s
        INNER JOIN tenants t ON t.id = s.tenant_id
        WHERE s.status = 'active'
          AND s.current_period_end = CURRENT_DATE
      `);

      const subscriptions = result.rows || [];
      let successCount = 0;
      let errorCount = 0;

      for (const subscription of subscriptions) {
        try {
          // 计算账单金额
          let amount = 0;
          if (subscription.billing_cycle === 'monthly') {
            amount = subscription.monthly_price || 0;
          } else if (subscription.billing_cycle === 'yearly') {
            amount = subscription.yearly_price || 0;
          }

          // 税费（5%）
          const taxRate = 0.05;
          const taxAmount = amount * taxRate;
          const totalAmount = amount + taxAmount;

          // 生成账单编号
          const invoiceNumberResult = await database.raw(`
            SELECT generate_invoice_number($1::uuid) as invoice_number
          `, [subscription.tenant_id]);

          const invoiceNumber = invoiceNumberResult.rows[0].invoice_number;

          // 计算账单周期
          const periodStart = new Date(subscription.current_period_start);
          const periodEnd = new Date(subscription.current_period_end);

          // 计算到期日（30天后）
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 30);

          // 创建账单
          await database.raw(`
            INSERT INTO invoices (
              tenant_id,
              subscription_id,
              invoice_number,
              amount_subtotal,
              amount_tax,
              amount_total,
              currency,
              status,
              due_date,
              period_start,
              period_end,
              line_items
            ) VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, 'TWD', 'open', $7, $8, $9, $10)
          `, [
            subscription.tenant_id,
            subscription.id,
            invoiceNumber,
            amount,
            taxAmount,
            totalAmount,
            dueDate.toISOString().split('T')[0],
            periodStart.toISOString().split('T')[0],
            periodEnd.toISOString().split('T')[0],
            JSON.stringify([
              {
                description: `${subscription.plan_type} 套餐 (${subscription.billing_cycle === 'monthly' ? '月付' : '年付'})`,
                quantity: 1,
                unit_price: amount,
                amount: amount
              }
            ])
          ]);

          // 更新订阅周期
          const nextPeriodStart = new Date(periodEnd);
          nextPeriodStart.setDate(nextPeriodStart.getDate() + 1);

          const nextPeriodEnd = new Date(nextPeriodStart);
          if (subscription.billing_cycle === 'monthly') {
            nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);
          } else {
            nextPeriodEnd.setFullYear(nextPeriodEnd.getFullYear() + 1);
          }

          await database.raw(`
            UPDATE subscriptions
            SET current_period_start = $1,
                current_period_end = $2,
                date_updated = NOW()
            WHERE id = $3::uuid
          `, [
            nextPeriodStart.toISOString().split('T')[0],
            nextPeriodEnd.toISOString().split('T')[0],
            subscription.id
          ]);

          console.log(`[BillingCron] Generated invoice ${invoiceNumber} for tenant ${subscription.tenant_name}`);
          successCount++;
        } catch (error) {
          console.error(`[BillingCron] Error generating invoice for subscription ${subscription.id}:`, error);
          errorCount++;
        }
      }

      console.log(`[BillingCron] Monthly invoice generation completed: ${successCount} succeeded, ${errorCount} failed`);
    } catch (error) {
      console.error('[BillingCron] Error in monthly invoice generation:', error);
    }
  });

  /**
   * 账单逾期提醒
   * 每天 09:00 执行
   */
  schedule('0 9 * * *', async () => {
    console.log('[BillingCron] Starting overdue invoice reminder...');

    try {
      // 获取逾期未付账单
      const result = await database.raw(`
        SELECT
          i.*,
          t.name as tenant_name,
          t.email as tenant_email
        FROM invoices i
        INNER JOIN tenants t ON t.id = i.tenant_id
        WHERE i.status = 'open'
          AND i.due_date < CURRENT_DATE
          AND (i.metadata->>'reminder_sent_at' IS NULL
               OR (i.metadata->>'reminder_sent_at')::timestamp < (CURRENT_DATE - INTERVAL '7 days'))
      `);

      const overdueInvoices = result.rows || [];
      let successCount = 0;

      for (const invoice of overdueInvoices) {
        try {
          // TODO: 发送提醒邮件
          console.log(`[BillingCron] Reminder for overdue invoice ${invoice.invoice_number} to ${invoice.tenant_email}`);

          // 更新提醒时间
          await database.raw(`
            UPDATE invoices
            SET metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{reminder_sent_at}',
              to_jsonb(NOW())
            )
            WHERE id = $1::uuid
          `, [invoice.id]);

          successCount++;
        } catch (error) {
          console.error(`[BillingCron] Error sending reminder for invoice ${invoice.id}:`, error);
        }
      }

      console.log(`[BillingCron] Overdue invoice reminder completed: ${successCount} reminders sent`);
    } catch (error) {
      console.error('[BillingCron] Error in overdue invoice reminder:', error);
    }
  });

  /**
   * 试用期到期处理
   * 每天 00:00 执行
   */
  schedule('0 0 * * *', async () => {
    console.log('[BillingCron] Starting trial expiration check...');

    try {
      // 获取试用期即将到期的租户（提前3天提醒）
      const result = await database.raw(`
        SELECT *
        FROM tenants
        WHERE tenant_status = 'trial'
          AND trial_ends_at <= (CURRENT_DATE + INTERVAL '3 days')
          AND trial_ends_at >= CURRENT_DATE
      `);

      const expiringTenants = result.rows || [];

      for (const tenant of expiringTenants) {
        // TODO: 发送试用期到期提醒邮件
        console.log(`[BillingCron] Trial expiring soon for tenant ${tenant.name} (${tenant.email})`);
      }

      // 暂停已过期试用租户
      const expiredResult = await database.raw(`
        UPDATE tenants
        SET tenant_status = 'suspended'
        WHERE tenant_status = 'trial'
          AND trial_ends_at < CURRENT_DATE
        RETURNING id, name
      `);

      const expiredTenants = expiredResult.rows || [];

      for (const tenant of expiredTenants) {
        console.log(`[BillingCron] Suspended expired trial tenant: ${tenant.name}`);
        // TODO: 发送试用期已过期邮件
      }

      console.log(`[BillingCron] Trial expiration check completed: ${expiringTenants.length} expiring, ${expiredTenants.length} suspended`);
    } catch (error) {
      console.error('[BillingCron] Error in trial expiration check:', error);
    }
  });

  console.log('[BillingCron] Billing cron tasks registered');
}

export default registerBillingTasks;
