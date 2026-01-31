/**
 * Leads Hooks
 * Handles auto-assignment and status change notifications
 */

/**
 * Register leads hooks
 * @param {object} directusHooks - Directus hook functions { action, filter }
 * @param {object} context - Directus context { services, database, getSchema }
 */
export function registerLeadsHooks({ action, filter }, context) {
  const { database, services } = context;
  const { ItemsService } = services;

  /**
   * Before create: Auto-assign lead if not assigned
   */
  filter('leads.items.create', async (payload) => {
    // Skip if already assigned
    if (payload.assigned_to) {
      return payload;
    }

    try {
      const branchId = payload.branch_id;
      if (!branchId) return payload;

      // Get sales employees in the branch with least leads
      const salesEmployees = await database('employees')
        .leftJoin('job_titles', 'employees.job_title_id', 'job_titles.id')
        .where('employees.branch_id', branchId)
        .where('employees.status', 'active')
        .where(function() {
          // Match sales-related job titles
          this.where('job_titles.name', 'ilike', '%sales%')
            .orWhere('job_titles.name', 'ilike', '%業務%')
            .orWhere('job_titles.name', 'ilike', '%顧問%');
        })
        .select('employees.id', 'employees.full_name');

      if (salesEmployees.length === 0) {
        // No sales employees found, try to get any active employee
        const fallbackEmployee = await database('employees')
          .where('branch_id', branchId)
          .where('status', 'active')
          .first();

        if (fallbackEmployee) {
          payload.assigned_to = fallbackEmployee.id;
        }
        return payload;
      }

      // Get lead counts for each sales employee (round-robin with load balancing)
      const employeeIds = salesEmployees.map(e => e.id);
      const leadCounts = await database('leads')
        .whereIn('assigned_to', employeeIds)
        .whereNotIn('status', ['CONVERTED', 'LOST'])
        .select('assigned_to')
        .count('* as count')
        .groupBy('assigned_to');

      const countMap = new Map(leadCounts.map(lc => [lc.assigned_to, parseInt(lc.count)]));

      // Find employee with minimum leads
      let minEmployee = salesEmployees[0];
      let minCount = countMap.get(minEmployee.id) || 0;

      for (const emp of salesEmployees) {
        const count = countMap.get(emp.id) || 0;
        if (count < minCount) {
          minCount = count;
          minEmployee = emp;
        }
      }

      payload.assigned_to = minEmployee.id;
      console.log(`[LeadsHook] Auto-assigned lead to ${minEmployee.full_name} (${minCount} existing leads)`);

    } catch (error) {
      console.error('[LeadsHook] Auto-assignment error:', error);
      // Don't block creation if auto-assignment fails
    }

    return payload;
  });

  /**
   * After create: Create initial activity and send notification
   */
  action('leads.items.create', async ({ payload, key }, { schema }) => {
    try {
      // Create initial activity record
      await database('lead_activities').insert({
        lead_id: key,
        activity_type: 'VISIT',
        content: `新增潛在客戶 - 來源: ${payload.source || 'Unknown'}`,
        created_by: payload.assigned_to || null
      });

      // Send notification to assigned employee
      if (payload.assigned_to) {
        try {
          const lead = await database('leads').where('id', key).first();
          const employee = await database('employees').where('id', payload.assigned_to).first();

          if (employee?.email) {
            // Create notification record
            await database('notifications').insert({
              recipient_type: 'employee',
              recipient_id: payload.assigned_to,
              title: '新的潛在客戶分配',
              message: `您有一位新的潛在客戶: ${lead.name} (${lead.phone})，來源: ${lead.source}`,
              type: 'LEAD_ASSIGNED',
              data: JSON.stringify({
                lead_id: key,
                lead_name: lead.name,
                lead_phone: lead.phone,
                source: lead.source
              }),
              read_status: false
            });
          }
        } catch (notifyError) {
          console.error('[LeadsHook] Notification error:', notifyError);
        }
      }

    } catch (error) {
      console.error('[LeadsHook] After create error:', error);
    }
  });

  /**
   * After update: Track status changes and assignment changes
   */
  action('leads.items.update', async ({ payload, keys }, { schema }) => {
    try {
      for (const leadId of keys) {
        const lead = await database('leads').where('id', leadId).first();

        // Track status change
        if (payload.status && lead) {
          const activityContent = getStatusChangeMessage(payload.status);

          await database('lead_activities').insert({
            lead_id: leadId,
            activity_type: 'CALL',
            content: activityContent,
            created_by: payload.updated_by || lead.assigned_to || null
          });

          // Send notification on conversion
          if (payload.status === 'CONVERTED' && lead.assigned_to) {
            await database('notifications').insert({
              recipient_type: 'employee',
              recipient_id: lead.assigned_to,
              title: '恭喜！潛在客戶轉換成功',
              message: `潛在客戶 ${lead.name} 已成功轉換為會員！`,
              type: 'LEAD_CONVERTED',
              data: JSON.stringify({
                lead_id: leadId,
                lead_name: lead.name,
                converted_member_id: payload.converted_member_id
              }),
              read_status: false
            });
          }

          // Send notification on lost
          if (payload.status === 'LOST' && lead.assigned_to) {
            await database('notifications').insert({
              recipient_type: 'employee',
              recipient_id: lead.assigned_to,
              title: '潛在客戶標記為流失',
              message: `潛在客戶 ${lead.name} 已標記為流失`,
              type: 'LEAD_LOST',
              data: JSON.stringify({
                lead_id: leadId,
                lead_name: lead.name
              }),
              read_status: false
            });
          }
        }

        // Track assignment change
        if (payload.assigned_to && lead && payload.assigned_to !== lead.assigned_to) {
          const newAssignee = await database('employees').where('id', payload.assigned_to).first();
          const oldAssignee = lead.assigned_to
            ? await database('employees').where('id', lead.assigned_to).first()
            : null;

          // Activity for reassignment
          await database('lead_activities').insert({
            lead_id: leadId,
            activity_type: 'CALL',
            content: `客戶已重新指派給 ${newAssignee?.full_name || 'Unknown'}${oldAssignee ? ` (原: ${oldAssignee.full_name})` : ''}`,
            created_by: payload.updated_by || null
          });

          // Notify new assignee
          if (newAssignee?.email) {
            await database('notifications').insert({
              recipient_type: 'employee',
              recipient_id: payload.assigned_to,
              title: '潛在客戶已指派給您',
              message: `潛在客戶 ${lead.name} (${lead.phone}) 已指派給您跟進`,
              type: 'LEAD_ASSIGNED',
              data: JSON.stringify({
                lead_id: leadId,
                lead_name: lead.name,
                lead_phone: lead.phone,
                status: lead.status
              }),
              read_status: false
            });
          }

          // Notify old assignee about reassignment
          if (oldAssignee?.email) {
            await database('notifications').insert({
              recipient_type: 'employee',
              recipient_id: lead.assigned_to,
              title: '潛在客戶已重新指派',
              message: `潛在客戶 ${lead.name} 已重新指派給 ${newAssignee?.full_name || 'Other employee'}`,
              type: 'LEAD_REASSIGNED',
              data: JSON.stringify({
                lead_id: leadId,
                lead_name: lead.name,
                new_assignee: newAssignee?.full_name
              }),
              read_status: false
            });
          }
        }
      }
    } catch (error) {
      console.error('[LeadsHook] After update error:', error);
    }
  });
}

/**
 * Get human-readable status change message
 */
function getStatusChangeMessage(status) {
  const messages = {
    'NEW': '狀態更新: 新建',
    'CONTACTED': '狀態更新: 已聯繫',
    'TRIAL_BOOKED': '狀態更新: 已預約體驗',
    'VISITED': '狀態更新: 已到訪',
    'CONVERTED': '狀態更新: 已轉換為會員',
    'LOST': '狀態更新: 已流失'
  };
  return messages[status] || `狀態更新: ${status}`;
}

export default registerLeadsHooks;
