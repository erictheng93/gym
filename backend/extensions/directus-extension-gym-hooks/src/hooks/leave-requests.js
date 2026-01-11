/**
 * Leave Requests Hooks
 * 處理 HR 休假審核流程
 */

import { calculateLeaveDays } from './utils.js';

/**
 * 註冊休假申請鉤子
 */
export function registerLeaveRequestsHooks({ action, filter }, { services, database, getSchema }) {
  const { ItemsService } = services;

  /**
   * 檢查審核者是否為申請者的上級
   */
  async function isSupervisorOf(approverId, employeeId, employeesService) {
    if (!approverId || !employeeId) return false;
    if (approverId === employeeId) return false;

    try {
      let currentId = employeeId;
      const visited = new Set();
      const maxDepth = 10;
      let depth = 0;

      while (currentId && depth < maxDepth) {
        if (visited.has(currentId)) break;
        visited.add(currentId);

        const employee = await employeesService.readOne(currentId, {
          fields: ['id', 'supervisor_id', 'job_title_id'],
        });

        if (!employee) break;

        if (employee.supervisor_id === approverId) {
          return true;
        }

        currentId = employee.supervisor_id;
        depth++;
      }

      return false;
    } catch (error) {
      // Error logged('[GymHook] Error checking supervisor relationship:', error);
      return false;
    }
  }

  // 休假申請提交時 - 驗證並計算天數
  action('leave_requests.items.create', async ({ payload, key }, { schema, accountability }) => {
    try {
      const leaveRequestsService = new ItemsService('leave_requests', {
        schema: schema,
        knex: database,
      });

      const daysRequested = calculateLeaveDays(
        payload.start_date,
        payload.end_date,
        payload.is_half_day
      );

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
        // Status logged('[GymHook] leave_approval_logs table not available');
      }

      // 更新休假餘額中的 pending_days (使用原子操作)
      try {
        const year = new Date(payload.start_date).getFullYear();

        const result = await database.raw(`
          SELECT * FROM update_leave_balance(?::uuid, ?::varchar, ?::integer, ?::numeric, 0)
        `, [payload.employee_id, payload.leave_type, year, daysRequested]);

        const row = result.rows?.[0] || result[0];
        if (row?.success) {
          // Status logged(`[GymHook] Leave balance updated: pending=${row.new_pending} [atomic]`);
        } else if (row) {
          // Warning logged(`[GymHook] Leave balance update warning: ${row.message}`);
        }
      } catch (e) {
        if (e.message?.includes('update_leave_balance')) {
          // Status logged('[GymHook] Atomic leave function not available, using fallback');
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
            // Status logged('[GymHook] leave_balances table not available');
          }
        } else {
          // Status logged('[GymHook] leave_balances table not available');
        }
      }

      // Status logged(`[GymHook] Leave request ${key} submitted: ${daysRequested} days`);
    } catch (error) {
      // Error logged('[GymHook] Error processing leave request submission:', error);
    }
  });

  // 休假審核時 - 驗證審核權限
  filter('leave_requests.items.update', async (payload, meta, { schema: filterSchema, accountability }) => {
    if (!payload.leave_status || !['APPROVED', 'REJECTED'].includes(payload.leave_status)) {
      return payload;
    }

    const keys = meta.keys || [];

    if (!payload.approver_id && !accountability?.user) {
      throw new Error('缺少審核者資訊');
    }

    const approverId = payload.approver_id || accountability?.user;

    try {
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

        if (request.leave_status !== 'PENDING') {
          throw new Error(`休假申請 ${requestId} 不是待審核狀態，無法審核`);
        }

        const approverEmployees = await employeesService.readByQuery({
          filter: { user_id: { _eq: approverId } },
          limit: 1,
        });

        let approverEmployeeId = approverId;
        if (approverEmployees.length > 0) {
          approverEmployeeId = approverEmployees[0].id;
        }

        // 檢查是否為總部管理員
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

        if (!isAdmin) {
          const isSupervisor = await isSupervisorOf(approverEmployeeId, request.employee_id, employeesService);
          if (!isSupervisor) {
            throw new Error('您不是該員工的上級，無法審核此休假申請');
          }
        }
      }

      payload.approved_at = new Date().toISOString();
      if (!payload.approver_id) {
        payload.approver_id = approverId;
      }

      return payload;
    } catch (error) {
      // Error logged('[GymHook] Leave approval validation error:', error);
      throw error;
    }
  });

  // 休假審核完成後 - 記錄審核歷史，更新餘額
  action('leave_requests.items.update', async ({ payload, keys }, { schema }) => {
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
          // Status logged('[GymHook] Could not create approval log');
        }

        // 更新休假餘額
        try {
          const year = new Date(request.start_date).getFullYear();
          const daysRequested = parseFloat(request.days_requested) || 0;

          let pendingDelta = 0;
          let usedDelta = 0;

          if (payload.leave_status === 'APPROVED') {
            pendingDelta = -daysRequested;
            usedDelta = daysRequested;
          } else if (['REJECTED', 'CANCELLED'].includes(payload.leave_status)) {
            pendingDelta = -daysRequested;
          }

          const result = await database.raw(`
            SELECT * FROM update_leave_balance(?::uuid, ?::varchar, ?::integer, ?::numeric, ?::numeric)
          `, [request.employee_id, request.leave_type, year, pendingDelta, usedDelta]);

          const row = result.rows?.[0] || result[0];
          if (row?.success) {
            // Status logged(`[GymHook] Leave balance updated: pending=${row.new_pending}, used=${row.new_used} [atomic]`);
          }
        } catch (e) {
          if (e.message?.includes('update_leave_balance')) {
            // Status logged('[GymHook] Atomic leave function not available, using fallback');
            // Fallback logic here if needed
          }
          // Status logged('[GymHook] Could not update leave balance');
        }

        // Status logged(`[GymHook] Leave request ${requestId} ${payload.leave_status}`);
      }
    } catch (error) {
      // Error logged('[GymHook] Error processing leave approval:', error);
    }
  });
}

export default registerLeaveRequestsHooks;
