/**
 * Contracts Routes
 * /gym/contracts/*
 */

import {
  InvalidPayloadError,
  ForbiddenError,
  NotFoundError,
} from '../utils/errors.js';

/**
 * 註冊合約路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 * @param {Function} memberAuthMiddleware - 會員認證中間件
 */
export function registerContractsRoutes(router, context, memberAuthMiddleware) {
  const { services, database, getSchema } = context;
  const { ItemsService } = services;

  /**
   * POST /gym/contracts/:id/pause
   * Request to pause a contract
   */
  router.post('/contracts/:id/pause', memberAuthMiddleware, async (req, res) => {
    try {
      const contractId = req.params.id;
      const { reason } = req.body || {};
      const memberId = req.member.id;

      if (!reason || reason.trim().length < 5) {
        throw InvalidPayloadError('請提供暫停原因（至少 5 個字）');
      }

      const schema = await getSchema();
      const contractsService = new ItemsService('contracts', {
        schema,
        knex: database,
      });

      const contract = await contractsService.readOne(contractId, {
        fields: ['id', 'member_id', 'contract_status', 'end_date', 'contract_no'],
      });

      if (!contract) {
        throw NotFoundError('合約不存在');
      }

      if (contract.member_id !== memberId) {
        throw ForbiddenError('無權操作此合約');
      }

      if (contract.contract_status !== 'ACTIVE') {
        throw InvalidPayloadError(`合約狀態為 ${contract.contract_status}，無法暫停`);
      }

      const today = new Date().toISOString().split('T')[0];

      const logsService = new ItemsService('contract_logs', {
        schema,
        knex: database,
      });

      await logsService.createOne({
        contract_id: contractId,
        log_type: 'PAUSE',
        start_date: today,
        reason: reason.trim(),
        branch_id: req.member.branch_id,
      });

      await contractsService.updateOne(contractId, {
        contract_status: 'PAUSED',
      });

      // Contract logged(`[GymEndpoint] Contract ${contract.contract_no} paused by member ${memberId}`);

      res.json({
        success: true,
        message: '合約已暫停',
        contract_no: contract.contract_no,
      });
    } catch (error) {
      // Error logged('[GymEndpoint] Contract pause error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/contracts/:id/resume
   * Request to resume a paused contract
   */
  router.post('/contracts/:id/resume', memberAuthMiddleware, async (req, res) => {
    try {
      const contractId = req.params.id;
      const memberId = req.member.id;

      const schema = await getSchema();
      const contractsService = new ItemsService('contracts', {
        schema,
        knex: database,
      });

      const contract = await contractsService.readOne(contractId, {
        fields: ['id', 'member_id', 'contract_status', 'end_date', 'contract_no'],
      });

      if (!contract) {
        throw NotFoundError('合約不存在');
      }

      if (contract.member_id !== memberId) {
        throw ForbiddenError('無權操作此合約');
      }

      if (contract.contract_status !== 'PAUSED') {
        throw InvalidPayloadError(`合約狀態為 ${contract.contract_status}，無法恢復`);
      }

      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      const logsService = new ItemsService('contract_logs', {
        schema,
        knex: database,
      });

      const pauseLogs = await logsService.readByQuery({
        filter: {
          _and: [
            { contract_id: { _eq: contractId } },
            { log_type: { _eq: 'PAUSE' } },
            { end_date: { _null: true } },
          ],
        },
        sort: ['-date_created'],
        limit: 1,
      });

      let daysAffected = 0;
      if (pauseLogs.length > 0) {
        const pauseLog = pauseLogs[0];
        const pauseStart = new Date(pauseLog.start_date);
        daysAffected = Math.ceil((today - pauseStart) / (1000 * 60 * 60 * 24));

        await logsService.updateOne(pauseLog.id, {
          end_date: todayStr,
          days_affected: daysAffected,
        });
      }

      let newEndDate = contract.end_date;
      if (contract.end_date && daysAffected > 0) {
        const endDate = new Date(contract.end_date);
        endDate.setDate(endDate.getDate() + daysAffected);
        newEndDate = endDate.toISOString().split('T')[0];
      }

      await contractsService.updateOne(contractId, {
        contract_status: 'ACTIVE',
        end_date: newEndDate,
      });

      // Contract logged(`[GymEndpoint] Contract ${contract.contract_no} resumed by member ${memberId}, extended by ${daysAffected} days`);

      res.json({
        success: true,
        message: `合約已恢復${daysAffected > 0 ? `，到期日順延 ${daysAffected} 天` : ''}`,
        contract_no: contract.contract_no,
        new_end_date: newEndDate,
        days_extended: daysAffected,
      });
    } catch (error) {
      // Error logged('[GymEndpoint] Contract resume error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerContractsRoutes;
