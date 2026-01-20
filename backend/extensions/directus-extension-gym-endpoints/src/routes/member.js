/**
 * Member Profile Routes
 * /gym/member/*
 */

import {
  InvalidPayloadError,
  UnauthorizedError,
  NotFoundError,
} from '../utils/errors.js';

/**
 * 註冊會員路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 * @param {Function} memberAuthMiddleware - 會員認證中間件
 */
export function registerMemberRoutes(router, context, memberAuthMiddleware) {
  const { services, database, getSchema } = context;
  const { ItemsService } = services;

  /**
   * GET /gym/member/me
   * Get current member profile
   */
  router.get('/member/me', memberAuthMiddleware, async (req, res) => {
    try {
      const memberId = req.member.id;

      const schema = await getSchema();
      const membersService = new ItemsService('members', {
        schema,
        knex: database,
      });

      const member = await membersService.readOne(memberId, {
        fields: [
          'id', 'member_code', 'full_name', 'phone', 'email',
          'gender', 'birthday', 'address',
          'status', 'join_date',
          'branch_id.id', 'branch_id.name',
        ],
      });

      if (!member) {
        throw NotFoundError('Member not found');
      }

      const contractsService = new ItemsService('contracts', {
        schema,
        knex: database,
      });

      const contracts = await contractsService.readByQuery({
        filter: {
          _and: [
            { member_id: { _eq: memberId } },
            { status: { _in: ['ACTIVE', 'PAUSED'] } },
          ],
        },
        fields: [
          'id', 'contract_no', 'status', 'start_date', 'end_date',
          'remaining_counts', 'payment_status',
          'plan_id.id', 'plan_id.name', 'plan_id.type',
        ],
        sort: ['-start_date'],
      });

      res.json({
        success: true,
        data: {
          ...member,
          contracts,
        },
      });
    } catch (error) {
      // Error logged('[GymEndpoint] Get member profile error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/member/complete-profile
   * Complete member profile after social login
   */
  router.post('/member/complete-profile', async (req, res) => {
    try {
      const { full_name, phone, gender, birthday, branch_id, emergency_contact, emergency_phone } = req.body || {};

      if (!full_name || !full_name.trim()) {
        throw InvalidPayloadError('請輸入您的姓名');
      }

      if (!phone || !phone.trim()) {
        throw InvalidPayloadError('請輸入您的手機號碼');
      }

      const cleanPhone = phone.replace(/[-\s]/g, '');
      if (!/^09\d{8}$/.test(cleanPhone)) {
        throw InvalidPayloadError('請輸入有效的手機號碼（09開頭，10位數字）');
      }

      if (gender && !['MALE', 'FEMALE', 'OTHER'].includes(gender)) {
        throw InvalidPayloadError('性別格式不正確');
      }

      let userId = req.accountability?.user;

      if (!userId) {
        const sessionToken = req.cookies?.directus_session_token;
        if (sessionToken) {
          try {
            const sessionResult = await database('directus_sessions')
              .where({ token: sessionToken })
              .whereRaw('expires > NOW()')
              .first();

            if (sessionResult) {
              userId = sessionResult.user;
            }
          } catch (e) {
            // Error logged('[GymEndpoint] Session lookup error:', e);
          }
        }
      }

      if (!userId) {
        throw UnauthorizedError('請先登入');
      }

      const schema = await getSchema();
      const membersService = new ItemsService('members', {
        schema,
        knex: database,
      });

      const members = await membersService.readByQuery({
        filter: {
          user_id: { _eq: userId },
          status: { _eq: 'active' },
        },
        limit: 1,
      });

      if (!members || members.length === 0) {
        throw NotFoundError('找不到會員資料，請聯繫客服');
      }

      const member = members[0];

      const updateData = {
        full_name: full_name.trim(),
        phone: cleanPhone,
      };

      if (gender) {
        updateData.gender = gender;
      }
      if (birthday) {
        updateData.birthday = birthday;
      }
      if (branch_id) {
        updateData.branch_id = branch_id;
      }
      if (emergency_contact && emergency_contact.trim()) {
        updateData.emergency_contact = emergency_contact.trim();
      }
      if (emergency_phone && emergency_phone.trim()) {
        updateData.emergency_phone = emergency_phone.replace(/[-\s]/g, '');
      }

      await membersService.updateOne(member.id, updateData);

      const updatedMember = await membersService.readOne(member.id, {
        fields: [
          'id', 'member_code', 'full_name', 'phone', 'email',
          'gender', 'birthday', 'address',
          'status', 'join_date',
          'branch_id.id', 'branch_id.name',
        ],
      });

      res.json({
        success: true,
        message: '資料已更新',
        member: updatedMember,
      });
    } catch (error) {
      // Error logged('[GymEndpoint] Complete profile error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerMemberRoutes;
