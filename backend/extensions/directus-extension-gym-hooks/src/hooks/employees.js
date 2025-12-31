/**
 * Employees Hooks
 * 處理員工與 Directus 用戶的同步
 */

/**
 * 註冊員工鉤子
 */
export function registerEmployeesHooks({ action }, { services, database }) {
  const { ItemsService, UsersService } = services;

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
    if (!payload.branch_id && !payload.user_id) return;

    try {
      const employeesService = new ItemsService('employees', {
        schema: schema,
        knex: database,
      });

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
}

export default registerEmployeesHooks;
