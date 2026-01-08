/**
 * Payment Routes
 * /gym/payment/*
 * 支付处理端点
 */

import PaymentService from '../services/payment-gateway.js';

/**
 * 注册支付路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 */
export function registerPaymentRoutes(router, context) {
  const { database, env } = context;
  const paymentService = new PaymentService(database, env);

  /**
   * POST /gym/payment/create
   * 创建支付订单
   */
  router.post('/payment/create', async (req, res) => {
    try {
      const { tenantId } = req;
      const {
        invoice_id,
        gateway,
        return_url,
        cancel_url
      } = req.body;

      if (!invoice_id || !gateway) {
        return res.status(400).json({
          success: false,
          message: '请提供发票 ID 和支付网关'
        });
      }

      // 获取发票信息
      const invoiceResult = await database.raw(`
        SELECT * FROM invoices
        WHERE id = $1::uuid
        LIMIT 1
      `, [invoice_id]);

      const invoice = invoiceResult.rows?.[0];

      if (!invoice) {
        return res.status(404).json({
          success: false,
          message: '找不到发票'
        });
      }

      // 权限检查：非管理员只能支付自己租户的发票
      if (tenantId && invoice.tenant_id !== tenantId) {
        return res.status(403).json({
          success: false,
          message: '权限不足'
        });
      }

      // 检查发票是否已支付
      if (invoice.status === 'paid') {
        return res.status(400).json({
          success: false,
          message: '发票已支付'
        });
      }

      // 创建支付订单
      const payment = await paymentService.createPayment({
        gateway,
        invoiceId: invoice_id,
        amount: invoice.amount_total,
        currency: invoice.currency || 'TWD',
        description: `发票 ${invoice.invoice_number}`,
        returnUrl: return_url,
        cancelUrl: cancel_url,
        metadata: {
          invoice_number: invoice.invoice_number,
          tenant_id: invoice.tenant_id
        }
      });

      res.json({
        success: true,
        data: payment
      });
    } catch (error) {
      console.error('[PaymentEndpoint] Error creating payment:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/payment/webhook/:gateway
   * 处理支付回调
   */
  router.post('/payment/webhook/:gateway', async (req, res) => {
    try {
      const { gateway } = req.params;

      console.log(`[PaymentWebhook] Received ${gateway} callback:`, req.body);

      // 处理回调
      const result = await paymentService.handleCallback(gateway, req.body);

      console.log(`[PaymentWebhook] Callback processed:`, result);

      // 返回成功响应（各网关要求不同）
      if (gateway === 'ecpay') {
        res.send('1|OK');
      } else {
        res.json({ success: true });
      }
    } catch (error) {
      console.error('[PaymentWebhook] Error handling callback:', error);

      // 返回失败响应
      if (req.params.gateway === 'ecpay') {
        res.send('0|' + error.message);
      } else {
        res.status(400).json({
          success: false,
          message: error.message
        });
      }
    }
  });

  /**
   * GET /gym/payment/status/:transactionId
   * 查询支付状态
   */
  router.get('/payment/status/:transactionId', async (req, res) => {
    try {
      const { tenantId } = req;
      const { transactionId } = req.params;

      const payment = await paymentService.getPaymentStatus(transactionId);

      if (!payment) {
        return res.status(404).json({
          success: false,
          message: '找不到支付记录'
        });
      }

      // 权限检查
      if (tenantId && payment.tenant_id !== tenantId) {
        return res.status(403).json({
          success: false,
          message: '权限不足'
        });
      }

      res.json({
        success: true,
        data: {
          transaction_id: payment.id,
          payment_id: payment.payment_id,
          gateway: payment.gateway,
          amount: payment.amount,
          currency: payment.currency,
          status: payment.status,
          paid_at: payment.paid_at,
          checkout_url: payment.checkout_url
        }
      });
    } catch (error) {
      console.error('[PaymentEndpoint] Error getting payment status:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/payment/gateways
   * 获取可用的支付网关列表
   */
  router.get('/payment/gateways', async (req, res) => {
    try {
      const { tenantId } = req;

      // 获取租户配置的支付网关
      let gateways = [];

      if (tenantId) {
        const result = await database.raw(`
          SELECT gateway, is_enabled
          FROM payment_gateway_configs
          WHERE tenant_id = $1::uuid OR tenant_id IS NULL
          ORDER BY tenant_id NULLS LAST
        `, [tenantId]);

        gateways = result.rows || [];
      }

      // 默认支持的网关
      const defaultGateways = [
        {
          gateway: 'manual',
          name: '手动支付',
          description: '现金、转账等',
          is_enabled: true
        },
        {
          gateway: 'stripe',
          name: 'Stripe',
          description: '信用卡支付',
          is_enabled: !!env.STRIPE_SECRET_KEY
        },
        {
          gateway: 'ecpay',
          name: 'ECPay 绿界',
          description: '台湾主流支付',
          is_enabled: !!env.ECPAY_MERCHANT_ID
        },
        {
          gateway: 'linepay',
          name: 'LINE Pay',
          description: 'LINE 支付',
          is_enabled: !!env.LINEPAY_CHANNEL_ID
        }
      ];

      // 合并配置
      const availableGateways = defaultGateways.map(dg => {
        const config = gateways.find(g => g.gateway === dg.gateway);
        return {
          ...dg,
          is_enabled: config ? config.is_enabled : dg.is_enabled
        };
      }).filter(g => g.is_enabled);

      res.json({
        success: true,
        data: {
          gateways: availableGateways
        }
      });
    } catch (error) {
      console.error('[PaymentEndpoint] Error getting gateways:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/payment/manual-confirm
   * 手动确认支付（现金、转账等）
   */
  router.post('/payment/manual-confirm', async (req, res) => {
    try {
      const { isSuperAdmin } = req;
      const {
        transaction_id,
        reference,
        notes
      } = req.body;

      // 只有管理员可以手动确认支付
      if (!isSuperAdmin) {
        return res.status(403).json({
          success: false,
          message: '需要管理员权限'
        });
      }

      // 更新支付状态
      await database.raw(`
        UPDATE payment_transactions
        SET status = 'succeeded',
            paid_at = NOW(),
            metadata = jsonb_set(
              COALESCE(metadata, '{}'::jsonb),
              '{reference}',
              $1::jsonb
            ),
            callback_data = jsonb_build_object(
              'confirmed_by', 'admin',
              'reference', $2,
              'notes', $3,
              'confirmed_at', NOW()
            ),
            date_updated = NOW()
        WHERE id = $4::uuid
      `, [
        JSON.stringify(reference || ''),
        reference || '',
        notes || '',
        transaction_id
      ]);

      // 更新发票状态
      await database.raw(`
        UPDATE invoices i
        SET status = 'paid',
            paid_at = NOW(),
            payment_method = 'manual',
            date_updated = NOW()
        FROM payment_transactions pt
        WHERE pt.id = $1::uuid
          AND i.id = pt.invoice_id
      `, [transaction_id]);

      res.json({
        success: true,
        message: '支付已确认'
      });
    } catch (error) {
      console.error('[PaymentEndpoint] Error confirming manual payment:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerPaymentRoutes;
