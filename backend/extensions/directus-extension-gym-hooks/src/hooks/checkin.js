/**
 * Member Checkin Hooks
 * 處理會員入場驗證和次數扣除
 */

/**
 * 註冊會員打卡鉤子
 */
export function registerCheckinHooks({ action, filter }, { services, database }, cacheUtils) {
  const { ItemsService } = services;
  const { getCachedMemberContract, setCachedMemberContract, recordPerformanceMetric } = cacheUtils;

  /**
   * 向後兼容：原始扣除邏輯
   */
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

      let member = null;
      let validContract = null;
      let cacheHit = false;

      // 嘗試從緩存獲取會員合約資訊
      const cachedData = await getCachedMemberContract(payload.member_id);

      if (cachedData && cachedData.member && cachedData.contract) {
        const today = new Date().toISOString().split('T')[0];
        const contractEndDate = cachedData.contract.end_date;

        if (cachedData.member.member_status === 'ACTIVE' &&
            cachedData.contract.contract_status === 'ACTIVE' &&
            (!contractEndDate || contractEndDate >= today)) {
          member = cachedData.member;
          validContract = cachedData.contract;
          cacheHit = true;
          console.log(`[GymHook] Check-in cache HIT for member ${payload.member_id}`);
        }
      }

      if (!cacheHit) {
        member = await membersService.readOne(payload.member_id, {
          fields: ['id', 'member_status', 'branch_id', 'full_name'],
        });

        if (!member) {
          throw new Error('會員不存在');
        }

        if (member.member_status !== 'ACTIVE') {
          throw new Error(`會員 ${member.full_name} 狀態為 ${member.member_status}，無法入場`);
        }

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
                  { end_date: { _null: true } },
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

        // 將資料寫入緩存
        setCachedMemberContract(payload.member_id, {
          member: {
            id: member.id,
            member_status: member.member_status,
            branch_id: member.branch_id,
            full_name: member.full_name,
          },
          contract: validContract,
          cached_at: new Date().toISOString(),
        }).catch(() => {});
      }

      payload.contract_id = validContract.id;

      if (payload.branch_id && member.branch_id && payload.branch_id !== member.branch_id) {
        payload.is_cross_branch = true;
      }

      if (!payload.check_time) {
        payload.check_time = new Date().toISOString();
      }

      const duration = Date.now() - startTime;
      recordPerformanceMetric('checkin_validation', duration).catch(() => {});

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
      const result = await database.raw(`
        SELECT * FROM deduct_contract_count(?::uuid, 1)
      `, [payload.contract_id]);

      const row = result.rows?.[0] || result[0];

      if (row) {
        if (row.success) {
          console.log(`[GymHook] Member checkin: contract ${payload.contract_id} remaining ${row.remaining} (atomic) - ${row.message}`);

          if (row.contract_status === 'EXPIRED') {
            console.log(`[GymHook] Contract ${payload.contract_id} expired (no remaining counts)`);

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
      if (error.message?.includes('deduct_contract_count')) {
        console.log('[GymHook] Atomic function not available, using fallback logic');
        await fallbackDeductCount(payload.contract_id, schema);
      } else {
        console.error('[GymHook] Error processing member checkin:', error);
      }
    }
  });
}

export default registerCheckinHooks;
