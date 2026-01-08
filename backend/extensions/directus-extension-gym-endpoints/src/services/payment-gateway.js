/**
 * Payment Gateway Service
 * 支付网关抽象层，支持多种支付方式
 */

/**
 * 支付网关基类
 */
class PaymentGateway {
  constructor(config) {
    this.config = config;
  }

  /**
   * 创建支付订单
   * @param {object} params - 支付参数
   * @returns {Promise<object>} - 支付订单信息
   */
  async createPayment(params) {
    throw new Error('Method not implemented');
  }

  /**
   * 查询支付状态
   * @param {string} paymentId - 支付订单 ID
   * @returns {Promise<object>} - 支付状态
   */
  async getPaymentStatus(paymentId) {
    throw new Error('Method not implemented');
  }

  /**
   * 处理支付回调
   * @param {object} data - 回调数据
   * @returns {Promise<object>} - 处理结果
   */
  async handleCallback(data) {
    throw new Error('Method not implemented');
  }

  /**
   * 退款
   * @param {string} paymentId - 支付订单 ID
   * @param {number} amount - 退款金额
   * @returns {Promise<object>} - 退款结果
   */
  async refund(paymentId, amount) {
    throw new Error('Method not implemented');
  }
}

/**
 * Stripe 支付网关
 */
class StripeGateway extends PaymentGateway {
  async createPayment({ amount, currency, description, metadata }) {
    // Stripe SDK 集成示例
    // const stripe = require('stripe')(this.config.secretKey);

    return {
      gateway: 'stripe',
      payment_id: 'pi_' + Date.now(),
      amount,
      currency: currency || 'TWD',
      status: 'pending',
      checkout_url: `https://checkout.stripe.com/pay/example`,
      created_at: new Date().toISOString()
    };
  }

  async getPaymentStatus(paymentId) {
    // const stripe = require('stripe')(this.config.secretKey);
    // const payment = await stripe.paymentIntents.retrieve(paymentId);

    return {
      payment_id: paymentId,
      status: 'succeeded', // pending, succeeded, failed
      amount: 0,
      paid_at: new Date().toISOString()
    };
  }

  async handleCallback(data) {
    // 验证 Stripe webhook 签名
    // const stripe = require('stripe')(this.config.secretKey);
    // const event = stripe.webhooks.constructEvent(data, signature, webhookSecret);

    return {
      verified: true,
      event_type: data.type,
      payment_id: data.data?.object?.id
    };
  }

  async refund(paymentId, amount) {
    // const stripe = require('stripe')(this.config.secretKey);
    // const refund = await stripe.refunds.create({ payment_intent: paymentId, amount });

    return {
      refund_id: 're_' + Date.now(),
      payment_id: paymentId,
      amount,
      status: 'succeeded'
    };
  }
}

/**
 * ECPay 綠界支付（台灣）
 */
class ECPayGateway extends PaymentGateway {
  async createPayment({ amount, description, orderId, returnUrl }) {
    // ECPay SDK 集成
    return {
      gateway: 'ecpay',
      payment_id: orderId,
      amount,
      currency: 'TWD',
      status: 'pending',
      checkout_url: `https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5`,
      form_data: {
        MerchantID: this.config.merchantId,
        MerchantTradeNo: orderId,
        MerchantTradeDate: new Date().toISOString(),
        PaymentType: 'aio',
        TotalAmount: amount,
        TradeDesc: description,
        ReturnURL: returnUrl,
        ChoosePayment: 'ALL'
      }
    };
  }

  async getPaymentStatus(paymentId) {
    return {
      payment_id: paymentId,
      status: 'pending',
      amount: 0
    };
  }

  async handleCallback(data) {
    // 验证 ECPay 回调签名
    // const checkMacValue = this.generateCheckMacValue(data);

    return {
      verified: true,
      payment_id: data.MerchantTradeNo,
      status: data.RtnCode === '1' ? 'succeeded' : 'failed'
    };
  }

  async refund(paymentId, amount) {
    throw new Error('ECPay refund not implemented');
  }
}

/**
 * LINE Pay
 */
class LinePayGateway extends PaymentGateway {
  async createPayment({ amount, currency, orderId, productName }) {
    // LINE Pay API 集成
    return {
      gateway: 'linepay',
      payment_id: orderId,
      amount,
      currency: currency || 'TWD',
      status: 'pending',
      checkout_url: `https://sandbox-web-pay.line.me/web/payment/wait`,
      transaction_id: 'txn_' + Date.now()
    };
  }

  async getPaymentStatus(paymentId) {
    return {
      payment_id: paymentId,
      status: 'pending',
      amount: 0
    };
  }

  async handleCallback(data) {
    return {
      verified: true,
      payment_id: data.orderId,
      transaction_id: data.transactionId
    };
  }

  async refund(paymentId, amount) {
    return {
      refund_id: 'refund_' + Date.now(),
      payment_id: paymentId,
      amount,
      status: 'processing'
    };
  }
}

/**
 * 手动支付（现金、转账等）
 */
class ManualGateway extends PaymentGateway {
  async createPayment({ amount, method, reference }) {
    return {
      gateway: 'manual',
      payment_id: 'manual_' + Date.now(),
      amount,
      currency: 'TWD',
      status: 'pending',
      method, // cash, bank_transfer, check
      reference, // 参考号（如转账单号）
      created_at: new Date().toISOString()
    };
  }

  async getPaymentStatus(paymentId) {
    return {
      payment_id: paymentId,
      status: 'pending',
      amount: 0
    };
  }

  async handleCallback(data) {
    // 手动支付无回调
    return { verified: true };
  }

  async refund(paymentId, amount) {
    return {
      refund_id: 'manual_refund_' + Date.now(),
      payment_id: paymentId,
      amount,
      status: 'manual_processing'
    };
  }
}

/**
 * 支付网关工厂
 */
class PaymentGatewayFactory {
  static gateways = {
    stripe: StripeGateway,
    ecpay: ECPayGateway,
    linepay: LinePayGateway,
    manual: ManualGateway
  };

  /**
   * 创建支付网关实例
   * @param {string} gateway - 网关类型
   * @param {object} config - 配置
   * @returns {PaymentGateway}
   */
  static create(gateway, config) {
    const GatewayClass = this.gateways[gateway];

    if (!GatewayClass) {
      throw new Error(`Unsupported payment gateway: ${gateway}`);
    }

    return new GatewayClass(config);
  }

  /**
   * 注册自定义网关
   * @param {string} name - 网关名称
   * @param {class} gatewayClass - 网关类
   */
  static register(name, gatewayClass) {
    this.gateways[name] = gatewayClass;
  }
}

/**
 * 支付服务（主要接口）
 */
class PaymentService {
  constructor(database, env) {
    this.database = database;
    this.env = env;
  }

  /**
   * 获取配置的支付网关
   * @param {string} gateway - 网关类型
   * @returns {PaymentGateway}
   */
  getGateway(gateway) {
    const configs = {
      stripe: {
        secretKey: this.env.STRIPE_SECRET_KEY,
        publishableKey: this.env.STRIPE_PUBLISHABLE_KEY,
        webhookSecret: this.env.STRIPE_WEBHOOK_SECRET
      },
      ecpay: {
        merchantId: this.env.ECPAY_MERCHANT_ID,
        hashKey: this.env.ECPAY_HASH_KEY,
        hashIV: this.env.ECPAY_HASH_IV
      },
      linepay: {
        channelId: this.env.LINEPAY_CHANNEL_ID,
        channelSecret: this.env.LINEPAY_CHANNEL_SECRET
      },
      manual: {}
    };

    return PaymentGatewayFactory.create(gateway, configs[gateway] || {});
  }

  /**
   * 创建支付订单
   * @param {object} params - 支付参数
   * @returns {Promise<object>}
   */
  async createPayment({ gateway, invoiceId, amount, ...otherParams }) {
    const paymentGateway = this.getGateway(gateway);

    // 创建支付订单
    const payment = await paymentGateway.createPayment({
      amount,
      orderId: invoiceId,
      ...otherParams
    });

    // 保存到数据库
    const result = await this.database.raw(`
      INSERT INTO payment_transactions (
        invoice_id,
        gateway,
        payment_id,
        amount,
        currency,
        status,
        checkout_url,
        metadata
      ) VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, [
      invoiceId,
      gateway,
      payment.payment_id,
      payment.amount,
      payment.currency || 'TWD',
      payment.status,
      payment.checkout_url || null,
      JSON.stringify(payment)
    ]);

    return {
      transaction_id: result.rows[0].id,
      ...payment
    };
  }

  /**
   * 处理支付回调
   * @param {string} gateway - 网关类型
   * @param {object} data - 回调数据
   * @returns {Promise<object>}
   */
  async handleCallback(gateway, data) {
    const paymentGateway = this.getGateway(gateway);

    // 验证回调
    const callbackResult = await paymentGateway.handleCallback(data);

    if (!callbackResult.verified) {
      throw new Error('Invalid payment callback');
    }

    // 更新支付状态
    await this.database.raw(`
      UPDATE payment_transactions
      SET status = $1,
          paid_at = NOW(),
          callback_data = $2,
          date_updated = NOW()
      WHERE payment_id = $3
    `, [
      callbackResult.status || 'succeeded',
      JSON.stringify(data),
      callbackResult.payment_id
    ]);

    // 如果支付成功，更新发票状态
    if (callbackResult.status === 'succeeded') {
      await this.database.raw(`
        UPDATE invoices i
        SET status = 'paid',
            paid_at = NOW(),
            payment_method = $1,
            payment_transaction_id = $2,
            date_updated = NOW()
        FROM payment_transactions pt
        WHERE pt.payment_id = $3
          AND i.id = pt.invoice_id
      `, [gateway, callbackResult.payment_id, callbackResult.payment_id]);
    }

    return callbackResult;
  }

  /**
   * 查询支付状态
   * @param {string} transactionId - 交易 ID
   * @returns {Promise<object>}
   */
  async getPaymentStatus(transactionId) {
    const result = await this.database.raw(`
      SELECT * FROM payment_transactions
      WHERE id = $1::uuid
      LIMIT 1
    `, [transactionId]);

    return result.rows?.[0] || null;
  }
}

export {
  PaymentGateway,
  PaymentGatewayFactory,
  PaymentService,
  StripeGateway,
  ECPayGateway,
  LinePayGateway,
  ManualGateway
};

export default PaymentService;
