/**
 * Leads Hooks
 * Handles lead auto-assignment, status changes, and notifications
 */

import { db, leads, employees, jobTitles, leadActivities, notifications } from '../db/index.js';
import { eq, and, or, ilike, sql, inArray } from 'drizzle-orm';

interface LeadData {
  id?: string;
  fullName: string;
  phone: string;
  email?: string;
  source?: string;
  branchId: string;
  assignedTo?: string;
  status?: string;
  tenantId: string;
}

/**
 * Auto-assign lead to sales employee with least leads (round-robin with load balancing)
 * Called before lead creation if not already assigned
 */
export async function autoAssignLead(data: LeadData): Promise<string | null> {
  if (data.assignedTo) {
    return data.assignedTo; // Already assigned
  }

  if (!data.branchId) {
    return null;
  }

  try {
    // Get sales employees in the branch
    const salesEmployees = await db
      .select({
        id: employees.id,
        fullName: employees.fullName,
      })
      .from(employees)
      .leftJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
      .where(
        and(
          eq(employees.branchId, data.branchId),
          eq(employees.status, 'active'),
          or(
            ilike(jobTitles.name, '%sales%'),
            ilike(jobTitles.name, '%業務%'),
            ilike(jobTitles.name, '%顧問%')
          )
        )
      );

    if (salesEmployees.length === 0) {
      // No sales employees, try any active employee
      const [fallbackEmployee] = await db
        .select({ id: employees.id })
        .from(employees)
        .where(
          and(
            eq(employees.branchId, data.branchId),
            eq(employees.status, 'active')
          )
        )
        .limit(1);

      return fallbackEmployee?.id || null;
    }

    // Get lead counts for each sales employee
    const employeeIds = salesEmployees.map(e => e.id);
    const leadCounts = await db
      .select({
        assignedTo: leads.assignedToId,
        count: sql<number>`count(*)`.as('count'),
      })
      .from(leads)
      .where(
        and(
          sql`${leads.assignedToId} = ANY(${employeeIds})`,
          notInArray(leads.status, ['CONVERTED', 'LOST'])
        )
      )
      .groupBy(leads.assignedToId);

    // Create a map of employee -> lead count
    const countMap = new Map<string, number>();
    for (const lc of leadCounts) {
      if (lc.assignedTo) {
        countMap.set(lc.assignedTo, Number(lc.count));
      }
    }

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

    console.log(
      `[LeadsHook] Auto-assigned lead to ${minEmployee.fullName} (${minCount} existing leads)`
    );

    return minEmployee.id;
  } catch (error) {
    console.error('[LeadsHook] Auto-assignment error:', error);
    return null; // Don't block creation if auto-assignment fails
  }
}

/**
 * Handle lead creation
 * - Creates initial activity record
 * - Sends notification to assigned employee
 */
export async function onLeadCreate(leadId: string, data: LeadData): Promise<void> {
  try {
    // Create initial activity record
    await db.insert(leadActivities).values({
      leadId,
      activityType: 'VISIT',
      content: `新增潛在客戶 - 來源: ${data.source || 'Unknown'}`,
      createdBy: data.assignedTo || null,
      tenantId: data.tenantId,
    });

    // Send notification to assigned employee
    if (data.assignedTo) {
      const [employee] = await db
        .select({ email: employees.email })
        .from(employees)
        .where(eq(employees.id, data.assignedTo));

      if (employee?.email) {
        await db.insert(notifications).values({
          recipientType: 'employee',
          recipientId: data.assignedTo,
          title: '新的潛在客戶分配',
          message: `您有一位新的潛在客戶: ${data.fullName} (${data.phone})，來源: ${data.source || 'Unknown'}`,
          type: 'LEAD_ASSIGNED',
          data: JSON.stringify({
            lead_id: leadId,
            lead_name: data.fullName,
            lead_phone: data.phone,
            source: data.source,
          }),
          readStatus: false,
          tenantId: data.tenantId,
        });
      }
    }
  } catch (error) {
    console.error('[LeadsHook] After create error:', error);
  }
}

/**
 * Handle lead status update
 * - Tracks status changes
 * - Sends notifications on conversion/lost
 */
export async function onLeadStatusChange(
  leadId: string,
  oldStatus: string,
  newStatus: string,
  data: {
    assignedTo?: string;
    convertedMemberId?: string;
    updatedBy?: string;
    leadName: string;
    tenantId: string;
  }
): Promise<void> {
  try {
    // Create activity for status change
    const activityContent = getStatusChangeMessage(newStatus);
    await db.insert(leadActivities).values({
      leadId,
      activityType: 'CALL',
      content: activityContent,
      createdBy: data.updatedBy || data.assignedTo || null,
      tenantId: data.tenantId,
    });

    // Send notification on conversion
    if (newStatus === 'CONVERTED' && data.assignedTo) {
      await db.insert(notifications).values({
        recipientType: 'employee',
        recipientId: data.assignedTo,
        title: '恭喜！潛在客戶轉換成功',
        message: `潛在客戶 ${data.leadName} 已成功轉換為會員！`,
        type: 'LEAD_CONVERTED',
        data: JSON.stringify({
          lead_id: leadId,
          lead_name: data.leadName,
          converted_member_id: data.convertedMemberId,
        }),
        readStatus: false,
        tenantId: data.tenantId,
      });
    }

    // Send notification on lost
    if (newStatus === 'LOST' && data.assignedTo) {
      await db.insert(notifications).values({
        recipientType: 'employee',
        recipientId: data.assignedTo,
        title: '潛在客戶標記為流失',
        message: `潛在客戶 ${data.leadName} 已標記為流失`,
        type: 'LEAD_LOST',
        data: JSON.stringify({
          lead_id: leadId,
          lead_name: data.leadName,
        }),
        readStatus: false,
        tenantId: data.tenantId,
      });
    }
  } catch (error) {
    console.error('[LeadsHook] Status change error:', error);
  }
}

/**
 * Handle lead reassignment
 * - Creates activity record
 * - Notifies new and old assignees
 */
export async function onLeadReassign(
  leadId: string,
  oldAssigneeId: string | null,
  newAssigneeId: string,
  data: {
    leadName: string;
    leadPhone: string;
    status: string;
    updatedBy?: string;
    tenantId: string;
  }
): Promise<void> {
  try {
    // Get employee names
    const [newAssignee] = await db
      .select({ fullName: employees.fullName, email: employees.email })
      .from(employees)
      .where(eq(employees.id, newAssigneeId));

    let oldAssignee = null;
    if (oldAssigneeId) {
      [oldAssignee] = await db
        .select({ fullName: employees.fullName, email: employees.email })
        .from(employees)
        .where(eq(employees.id, oldAssigneeId));
    }

    // Create reassignment activity
    await db.insert(leadActivities).values({
      leadId,
      activityType: 'CALL',
      content: `客戶已重新指派給 ${newAssignee?.fullName || 'Unknown'}${oldAssignee ? ` (原: ${oldAssignee.fullName})` : ''}`,
      createdBy: data.updatedBy || null,
      tenantId: data.tenantId,
    });

    // Notify new assignee
    if (newAssignee?.email) {
      await db.insert(notifications).values({
        recipientType: 'employee',
        recipientId: newAssigneeId,
        title: '潛在客戶已指派給您',
        message: `潛在客戶 ${data.leadName} (${data.leadPhone}) 已指派給您跟進`,
        type: 'LEAD_ASSIGNED',
        data: JSON.stringify({
          lead_id: leadId,
          lead_name: data.leadName,
          lead_phone: data.leadPhone,
          status: data.status,
        }),
        readStatus: false,
        tenantId: data.tenantId,
      });
    }

    // Notify old assignee about reassignment
    if (oldAssignee?.email && oldAssigneeId) {
      await db.insert(notifications).values({
        recipientType: 'employee',
        recipientId: oldAssigneeId,
        title: '潛在客戶已重新指派',
        message: `潛在客戶 ${data.leadName} 已重新指派給 ${newAssignee?.fullName || 'Other employee'}`,
        type: 'LEAD_REASSIGNED',
        data: JSON.stringify({
          lead_id: leadId,
          lead_name: data.leadName,
          new_assignee: newAssignee?.fullName,
        }),
        readStatus: false,
        tenantId: data.tenantId,
      });
    }
  } catch (error) {
    console.error('[LeadsHook] Reassignment error:', error);
  }
}

/**
 * Get human-readable status change message
 */
function getStatusChangeMessage(status: string): string {
  const messages: Record<string, string> = {
    'NEW': '狀態更新: 新建',
    'CONTACTED': '狀態更新: 已聯繫',
    'TRIAL_BOOKED': '狀態更新: 已預約體驗',
    'VISITED': '狀態更新: 已到訪',
    'CONVERTED': '狀態更新: 已轉換為會員',
    'LOST': '狀態更新: 已流失',
  };
  return messages[status] || `狀態更新: ${status}`;
}
