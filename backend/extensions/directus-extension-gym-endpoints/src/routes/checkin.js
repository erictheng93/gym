/**
 * Check-in Routes
 * /gym/checkin/*
 */

import {
  InvalidPayloadError,
  ForbiddenError,
  NotFoundError,
} from '../utils/errors.js';
import { getCacheStats, isRedisAvailable } from '../utils/redis.js';

/**
 * 註冊簽到路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 */
export function registerCheckinRoutes(router, context) {
  const { services, database, getSchema } = context;
  const { ItemsService } = services;

  /**
   * POST /gym/checkin/qr-verify
   * Verify QR code and process member check-in
   */
  router.post('/checkin/qr-verify', async (req, res) => {
    try {
      const { payload, branch_id, verified_by } = req.body || {};

      if (!payload) {
        throw InvalidPayloadError('QR payload is required');
      }

      let qrData;
      try {
        qrData = typeof payload === 'string' ? JSON.parse(payload) : payload;
      } catch (e) {
        throw InvalidPayloadError('Invalid QR code format');
      }

      const { m: memberCode, t: timestamp, c: contractId } = qrData;

      if (!memberCode || !timestamp) {
        throw InvalidPayloadError('Invalid QR code data');
      }

      const now = Date.now();
      const qrTime = Number(timestamp);
      if (isNaN(qrTime) || Math.abs(now - qrTime) > 30000) {
        throw InvalidPayloadError('QR Code 已過期，請重新掃描');
      }

      const schema = await getSchema();

      const membersService = new ItemsService('members', {
        schema,
        knex: database,
      });

      const members = await membersService.readByQuery({
        filter: {
          member_code: { _eq: memberCode },
          status: { _eq: 'active' },
        },
        fields: ['id', 'member_code', 'full_name', 'member_status', 'branch_id'],
        limit: 1,
      });

      if (members.length === 0) {
        throw NotFoundError('會員不存在');
      }

      const member = members[0];

      if (member.member_status !== 'ACTIVE') {
        throw ForbiddenError(`會員狀態為 ${member.member_status}，無法入場`);
      }

      const contractsService = new ItemsService('contracts', {
        schema,
        knex: database,
      });

      const today = new Date().toISOString().split('T')[0];
      let contract;

      if (contractId) {
        contract = await contractsService.readOne(contractId, {
          fields: ['id', 'contract_no', 'contract_status', 'remaining_counts', 'end_date', 'plan_id'],
        });

        if (!contract || contract.contract_status !== 'ACTIVE') {
          throw ForbiddenError('指定的合約無效');
        }
      } else {
        const contracts = await contractsService.readByQuery({
          filter: {
            _and: [
              { member_id: { _eq: member.id } },
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
          fields: ['id', 'contract_no', 'contract_status', 'remaining_counts', 'end_date', 'plan_id'],
          limit: 1,
        });

        if (contracts.length === 0) {
          throw ForbiddenError('沒有有效合約，無法入場');
        }

        contract = contracts[0];
      }

      const plansService = new ItemsService('membership_plans', {
        schema,
        knex: database,
      });

      const plan = await plansService.readOne(contract.plan_id, {
        fields: ['id', 'name', 'plan_type'],
      });

      if (plan?.plan_type === 'COUNT_BASED' && contract.remaining_counts !== null) {
        if (contract.remaining_counts <= 0) {
          throw ForbiddenError('剩餘次數不足，無法入場');
        }
      }

      const checkinsService = new ItemsService('member_checkins', {
        schema,
        knex: database,
      });

      const checkinData = {
        member_id: member.id,
        contract_id: contract.id,
        branch_id: branch_id || member.branch_id,
        check_time: new Date().toISOString(),
        check_type: 'ENTRY',
        verification_method: 'QR_CODE',
        verified_by: verified_by || null,
        is_cross_branch: branch_id && member.branch_id && branch_id !== member.branch_id,
        qr_payload: qrData,
        verification_timestamp: new Date(qrTime).toISOString(),
      };

      const checkinId = await checkinsService.createOne(checkinData);

      // Checkin logged(`[GymEndpoint] QR check-in: member ${member.member_code} at branch ${branch_id || member.branch_id}`);

      res.json({
        success: true,
        message: '入場成功',
        checkin_id: checkinId,
        member: {
          id: member.id,
          member_code: member.member_code,
          full_name: member.full_name,
        },
        contract: {
          id: contract.id,
          contract_no: contract.contract_no,
          plan_name: plan?.name,
          plan_type: plan?.plan_type,
          remaining_counts: contract.remaining_counts,
          end_date: contract.end_date,
        },
      });
    } catch (error) {
      // Error logged('[GymEndpoint] QR check-in error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/checkin/batch
   * Batch check-in multiple members at once
   */
  router.post('/checkin/batch', async (req, res) => {
    const startTime = Date.now();

    try {
      const { member_ids, branch_id, verified_by, check_type = 'ENTRY', notes } = req.body || {};

      if (!member_ids || !Array.isArray(member_ids) || member_ids.length === 0) {
        throw InvalidPayloadError('member_ids array is required');
      }

      if (member_ids.length > 50) {
        throw InvalidPayloadError('Maximum 50 members per batch');
      }

      const schema = await getSchema();
      const membersService = new ItemsService('members', { schema, knex: database });
      const contractsService = new ItemsService('contracts', { schema, knex: database });
      const checkinsService = new ItemsService('member_checkins', { schema, knex: database });

      const today = new Date().toISOString().split('T')[0];
      const checkTime = new Date().toISOString();

      const results = [];
      const successIds = [];
      const failedIds = [];

      const members = await membersService.readByQuery({
        filter: {
          id: { _in: member_ids },
          status: { _eq: 'active' },
        },
        fields: ['id', 'member_code', 'full_name', 'member_status', 'branch_id'],
      });

      const memberMap = new Map(members.map(m => [m.id, m]));

      const contracts = await contractsService.readByQuery({
        filter: {
          _and: [
            { member_id: { _in: member_ids } },
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
        fields: ['id', 'member_id', 'remaining_counts', 'end_date'],
      });

      const contractMap = new Map();
      for (const contract of contracts) {
        if (!contractMap.has(contract.member_id)) {
          contractMap.set(contract.member_id, contract);
        }
      }

      for (const memberId of member_ids) {
        const member = memberMap.get(memberId);

        if (!member) {
          failedIds.push(memberId);
          results.push({
            member_id: memberId,
            success: false,
            error: '會員不存在',
          });
          continue;
        }

        if (member.member_status !== 'ACTIVE') {
          failedIds.push(memberId);
          results.push({
            member_id: memberId,
            member_code: member.member_code,
            full_name: member.full_name,
            success: false,
            error: `會員狀態為 ${member.member_status}`,
          });
          continue;
        }

        const contract = contractMap.get(memberId);
        if (!contract) {
          failedIds.push(memberId);
          results.push({
            member_id: memberId,
            member_code: member.member_code,
            full_name: member.full_name,
            success: false,
            error: '沒有有效合約',
          });
          continue;
        }

        try {
          const checkinData = {
            member_id: memberId,
            contract_id: contract.id,
            branch_id: branch_id || member.branch_id,
            check_time: checkTime,
            check_type,
            verification_method: 'BATCH',
            verified_by: verified_by || null,
            is_cross_branch: branch_id && member.branch_id && branch_id !== member.branch_id,
            notes: notes || null,
          };

          const checkinId = await checkinsService.createOne(checkinData);

          successIds.push(memberId);
          results.push({
            member_id: memberId,
            member_code: member.member_code,
            full_name: member.full_name,
            success: true,
            checkin_id: checkinId,
            remaining_counts: contract.remaining_counts !== null ? contract.remaining_counts - 1 : null,
          });
        } catch (checkinError) {
          failedIds.push(memberId);
          results.push({
            member_id: memberId,
            member_code: member.member_code,
            full_name: member.full_name,
            success: false,
            error: checkinError.message || '簽到失敗',
          });
        }
      }

      const duration = Date.now() - startTime;
      // Checkin logged(`[GymEndpoint] Batch check-in: ${successIds.length}/${member_ids.length} success in ${duration}ms`);

      res.json({
        success: true,
        message: `成功簽到 ${successIds.length} 人，失敗 ${failedIds.length} 人`,
        stats: {
          total: member_ids.length,
          success: successIds.length,
          failed: failedIds.length,
          duration_ms: duration,
        },
        results,
      });
    } catch (error) {
      // Error logged('[GymEndpoint] Batch check-in error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/cache/stats
   * Get cache statistics (admin only)
   */
  router.get('/cache/stats', async (req, res) => {
    try {
      const result = await database.raw(`
        SELECT
          (SELECT COUNT(*) FROM contracts WHERE contract_status = 'ACTIVE') as active_contracts,
          (SELECT COUNT(*) FROM members WHERE member_status = 'ACTIVE') as active_members,
          (SELECT COUNT(*) FROM member_checkins WHERE check_time >= CURRENT_DATE) as today_checkins
      `);

      const row = result.rows?.[0] || result[0];

      const cacheStats = await getCacheStats();

      res.json({
        success: true,
        database: {
          active_contracts: row?.active_contracts || 0,
          active_members: row?.active_members || 0,
          today_checkins: row?.today_checkins || 0,
        },
        cache: cacheStats,
      });
    } catch (error) {
      // Error logged('[GymEndpoint] Cache stats error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerCheckinRoutes;
