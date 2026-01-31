/**
 * Coupons Routes
 * /gym/coupons/*
 *
 * 優惠券管理 API
 */

import { InvalidPayloadError, NotFoundError } from '../utils/errors.js';
import crypto from 'crypto';

// Discount types
const DISCOUNT_TYPES = ['PERCENTAGE', 'FIXED_AMOUNT'];
const COUPON_STATUSES = ['ACTIVE', 'INACTIVE', 'EXPIRED'];

/**
 * Generate a unique coupon code
 */
function generateCouponCode(prefix = '') {
  const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
  return prefix ? `${prefix}-${randomPart}` : randomPart;
}

/**
 * Calculate discount amount
 */
function calculateDiscount(coupon, originalAmount) {
  if (coupon.discount_type === 'PERCENTAGE') {
    const discount = (originalAmount * coupon.discount_value) / 100;
    // Apply max discount cap if set
    if (coupon.max_discount && discount > coupon.max_discount) {
      return parseFloat(coupon.max_discount);
    }
    return discount;
  } else if (coupon.discount_type === 'FIXED_AMOUNT') {
    return parseFloat(coupon.discount_value);
  }
  return 0;
}

/**
 * Register coupons routes
 * @param {object} router - Express router
 * @param {object} context - Directus context
 */
export function registerCouponsRoutes(router, context) {
  const { database } = context;

  /**
   * GET /gym/coupons
   * List coupons
   */
  router.get('/coupons', async (req, res) => {
    try {
      const { status, discount_type, search, limit = 20, offset = 0 } = req.query;

      let query = database('coupons')
        .leftJoin('employees', 'coupons.created_by', 'employees.id')
        .select(
          'coupons.*',
          'employees.full_name as created_by_name'
        );

      if (status) {
        query = query.where('coupons.status', status.toUpperCase());
      }
      if (discount_type) {
        query = query.where('coupons.discount_type', discount_type.toUpperCase());
      }
      if (search) {
        query = query.where(function() {
          this.where('coupons.code', 'ilike', `%${search}%`)
            .orWhere('coupons.name', 'ilike', `%${search}%`);
        });
      }

      const countQuery = query.clone().count('coupons.id as count').first();

      query = query
        .orderBy('coupons.created_at', 'desc')
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      const [coupons, countResult] = await Promise.all([query, countQuery]);

      // Add computed fields
      const enrichedCoupons = coupons.map(c => ({
        ...c,
        is_valid: c.status === 'ACTIVE' &&
          new Date(c.start_date) <= new Date() &&
          new Date(c.end_date) >= new Date() &&
          (c.usage_limit === null || c.used_count < c.usage_limit),
        remaining_uses: c.usage_limit ? c.usage_limit - c.used_count : null
      }));

      res.json({
        success: true,
        data: enrichedCoupons,
        meta: {
          total: parseInt(countResult?.count || 0),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/coupons/:id
   * Get coupon details
   */
  router.get('/coupons/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const coupon = await database('coupons')
        .leftJoin('employees', 'coupons.created_by', 'employees.id')
        .where('coupons.id', id)
        .select(
          'coupons.*',
          'employees.full_name as created_by_name'
        )
        .first();

      if (!coupon) {
        throw NotFoundError('Coupon not found');
      }

      // Get usage stats
      const usageStats = await database('coupon_usages')
        .where('coupon_id', id)
        .select(
          database.raw('COUNT(*) as total_uses'),
          database.raw('SUM(discount_amount) as total_discount')
        )
        .first();

      res.json({
        success: true,
        data: {
          ...coupon,
          is_valid: coupon.status === 'ACTIVE' &&
            new Date(coupon.start_date) <= new Date() &&
            new Date(coupon.end_date) >= new Date() &&
            (coupon.usage_limit === null || coupon.used_count < coupon.usage_limit),
          remaining_uses: coupon.usage_limit ? coupon.usage_limit - coupon.used_count : null,
          usage_stats: {
            total_uses: parseInt(usageStats?.total_uses || 0),
            total_discount: parseFloat(usageStats?.total_discount || 0)
          }
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/coupons
   * Create a new coupon
   */
  router.post('/coupons', async (req, res) => {
    try {
      const {
        code,
        name,
        discount_type,
        discount_value,
        min_purchase,
        max_discount,
        usage_limit,
        usage_per_member,
        applicable_plans,
        start_date,
        end_date,
        created_by
      } = req.body || {};

      // Validation
      if (!name || name.trim().length === 0) {
        throw InvalidPayloadError('name is required');
      }
      if (!discount_type || !DISCOUNT_TYPES.includes(discount_type.toUpperCase())) {
        throw InvalidPayloadError(`discount_type must be one of: ${DISCOUNT_TYPES.join(', ')}`);
      }
      if (discount_value === undefined || discount_value <= 0) {
        throw InvalidPayloadError('discount_value must be a positive number');
      }
      if (discount_type.toUpperCase() === 'PERCENTAGE' && discount_value > 100) {
        throw InvalidPayloadError('Percentage discount cannot exceed 100');
      }
      if (!start_date) {
        throw InvalidPayloadError('start_date is required');
      }
      if (!end_date) {
        throw InvalidPayloadError('end_date is required');
      }
      if (new Date(end_date) <= new Date(start_date)) {
        throw InvalidPayloadError('end_date must be after start_date');
      }

      // Generate code if not provided
      const couponCode = code?.trim().toUpperCase() || generateCouponCode('GYM');

      // Check code uniqueness
      const existing = await database('coupons').where('code', couponCode).first();
      if (existing) {
        throw InvalidPayloadError('Coupon code already exists');
      }

      const [coupon] = await database('coupons')
        .insert({
          code: couponCode,
          name: name.trim(),
          discount_type: discount_type.toUpperCase(),
          discount_value: parseFloat(discount_value),
          min_purchase: min_purchase ? parseFloat(min_purchase) : 0,
          max_discount: max_discount ? parseFloat(max_discount) : null,
          usage_limit: usage_limit ? parseInt(usage_limit) : null,
          usage_per_member: usage_per_member ? parseInt(usage_per_member) : 1,
          used_count: 0,
          applicable_plans: applicable_plans ?
            (typeof applicable_plans === 'string' ? JSON.parse(applicable_plans) : applicable_plans) : null,
          start_date: new Date(start_date),
          end_date: new Date(end_date),
          status: 'ACTIVE',
          created_by: created_by || null
        })
        .returning('*');

      res.status(201).json({
        success: true,
        message: 'Coupon created successfully',
        data: coupon
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * PATCH /gym/coupons/:id
   * Update coupon
   */
  router.patch('/coupons/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        discount_type,
        discount_value,
        min_purchase,
        max_discount,
        usage_limit,
        usage_per_member,
        applicable_plans,
        start_date,
        end_date,
        status
      } = req.body || {};

      const existing = await database('coupons').where('id', id).first();
      if (!existing) {
        throw NotFoundError('Coupon not found');
      }

      const updateData = {};

      if (name !== undefined) updateData.name = name.trim();
      if (discount_type !== undefined) {
        if (!DISCOUNT_TYPES.includes(discount_type.toUpperCase())) {
          throw InvalidPayloadError(`discount_type must be one of: ${DISCOUNT_TYPES.join(', ')}`);
        }
        updateData.discount_type = discount_type.toUpperCase();
      }
      if (discount_value !== undefined) {
        if (discount_value <= 0) {
          throw InvalidPayloadError('discount_value must be a positive number');
        }
        updateData.discount_value = parseFloat(discount_value);
      }
      if (min_purchase !== undefined) updateData.min_purchase = parseFloat(min_purchase) || 0;
      if (max_discount !== undefined) updateData.max_discount = max_discount ? parseFloat(max_discount) : null;
      if (usage_limit !== undefined) updateData.usage_limit = usage_limit ? parseInt(usage_limit) : null;
      if (usage_per_member !== undefined) updateData.usage_per_member = parseInt(usage_per_member) || 1;
      if (applicable_plans !== undefined) {
        updateData.applicable_plans = applicable_plans ?
          (typeof applicable_plans === 'string' ? JSON.parse(applicable_plans) : applicable_plans) : null;
      }
      if (start_date !== undefined) updateData.start_date = new Date(start_date);
      if (end_date !== undefined) updateData.end_date = new Date(end_date);
      if (status !== undefined) {
        if (!COUPON_STATUSES.includes(status.toUpperCase())) {
          throw InvalidPayloadError(`status must be one of: ${COUPON_STATUSES.join(', ')}`);
        }
        updateData.status = status.toUpperCase();
      }

      const [updated] = await database('coupons')
        .where('id', id)
        .update(updateData)
        .returning('*');

      res.json({
        success: true,
        message: 'Coupon updated successfully',
        data: updated
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * DELETE /gym/coupons/:id
   * Deactivate coupon
   */
  router.delete('/coupons/:id', async (req, res) => {
    try {
      const { id } = req.params;

      const existing = await database('coupons').where('id', id).first();
      if (!existing) {
        throw NotFoundError('Coupon not found');
      }

      const [updated] = await database('coupons')
        .where('id', id)
        .update({ status: 'INACTIVE' })
        .returning('*');

      res.json({
        success: true,
        message: 'Coupon deactivated',
        data: updated
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/coupons/validate
   * Validate coupon for use (called during contract creation)
   */
  router.post('/coupons/validate', async (req, res) => {
    try {
      const {
        code,
        member_id,
        plan_id,
        amount
      } = req.body || {};

      if (!code) {
        throw InvalidPayloadError('code is required');
      }
      if (!member_id) {
        throw InvalidPayloadError('member_id is required');
      }
      if (!amount || amount <= 0) {
        throw InvalidPayloadError('amount must be a positive number');
      }

      const coupon = await database('coupons')
        .where('code', code.toUpperCase())
        .first();

      if (!coupon) {
        return res.json({
          success: true,
          data: {
            valid: false,
            reason: '優惠券不存在'
          }
        });
      }

      const now = new Date();
      const validationErrors = [];

      // Check status
      if (coupon.status !== 'ACTIVE') {
        validationErrors.push('優惠券已停用');
      }

      // Check date range
      if (new Date(coupon.start_date) > now) {
        validationErrors.push('優惠券尚未生效');
      }
      if (new Date(coupon.end_date) < now) {
        validationErrors.push('優惠券已過期');
      }

      // Check usage limit
      if (coupon.usage_limit && coupon.used_count >= coupon.usage_limit) {
        validationErrors.push('優惠券使用次數已達上限');
      }

      // Check per-member usage limit
      if (coupon.usage_per_member) {
        const memberUsageCount = await database('coupon_usages')
          .where('coupon_id', coupon.id)
          .where('member_id', member_id)
          .count('* as count')
          .first();

        if (parseInt(memberUsageCount?.count || 0) >= coupon.usage_per_member) {
          validationErrors.push('您已達到此優惠券的使用次數上限');
        }
      }

      // Check minimum purchase
      if (coupon.min_purchase && amount < coupon.min_purchase) {
        validationErrors.push(`訂單金額需達 ${coupon.min_purchase} 元才能使用此優惠券`);
      }

      // Check applicable plans
      if (coupon.applicable_plans && plan_id) {
        const applicablePlans = Array.isArray(coupon.applicable_plans)
          ? coupon.applicable_plans
          : JSON.parse(coupon.applicable_plans);

        if (applicablePlans.length > 0 && !applicablePlans.includes(plan_id)) {
          validationErrors.push('此優惠券不適用於所選方案');
        }
      }

      if (validationErrors.length > 0) {
        return res.json({
          success: true,
          data: {
            valid: false,
            reason: validationErrors[0],
            errors: validationErrors
          }
        });
      }

      // Calculate discount
      const discountAmount = calculateDiscount(coupon, amount);
      const finalAmount = Math.max(0, amount - discountAmount);

      res.json({
        success: true,
        data: {
          valid: true,
          coupon_id: coupon.id,
          coupon_code: coupon.code,
          coupon_name: coupon.name,
          discount_type: coupon.discount_type,
          discount_value: coupon.discount_value,
          discount_amount: discountAmount,
          original_amount: amount,
          final_amount: finalAmount
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/coupons/:id/usages
   * Get coupon usage history
   */
  router.get('/coupons/:id/usages', async (req, res) => {
    try {
      const { id } = req.params;
      const { limit = 50, offset = 0 } = req.query;

      const coupon = await database('coupons').where('id', id).first();
      if (!coupon) {
        throw NotFoundError('Coupon not found');
      }

      const usages = await database('coupon_usages')
        .leftJoin('members', 'coupon_usages.member_id', 'members.id')
        .leftJoin('contracts', 'coupon_usages.contract_id', 'contracts.id')
        .leftJoin('employees', 'coupon_usages.used_by', 'employees.id')
        .where('coupon_usages.coupon_id', id)
        .select(
          'coupon_usages.*',
          'members.full_name as member_name',
          'members.member_code',
          'contracts.contract_no',
          'employees.full_name as used_by_name'
        )
        .orderBy('coupon_usages.used_at', 'desc')
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      const countResult = await database('coupon_usages')
        .where('coupon_id', id)
        .count('* as count')
        .first();

      res.json({
        success: true,
        data: usages,
        meta: {
          total: parseInt(countResult?.count || 0),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/coupons/generate-batch
   * Generate multiple unique coupon codes
   */
  router.post('/coupons/generate-batch', async (req, res) => {
    try {
      const {
        prefix,
        count,
        name,
        discount_type,
        discount_value,
        min_purchase,
        max_discount,
        usage_limit,
        usage_per_member,
        applicable_plans,
        start_date,
        end_date,
        created_by
      } = req.body || {};

      // Validation
      if (!count || count < 1 || count > 1000) {
        throw InvalidPayloadError('count must be between 1 and 1000');
      }
      if (!name || name.trim().length === 0) {
        throw InvalidPayloadError('name is required');
      }
      if (!discount_type || !DISCOUNT_TYPES.includes(discount_type.toUpperCase())) {
        throw InvalidPayloadError(`discount_type must be one of: ${DISCOUNT_TYPES.join(', ')}`);
      }
      if (discount_value === undefined || discount_value <= 0) {
        throw InvalidPayloadError('discount_value must be a positive number');
      }
      if (!start_date || !end_date) {
        throw InvalidPayloadError('start_date and end_date are required');
      }

      const couponsToInsert = [];
      const generatedCodes = new Set();

      // Get existing codes to avoid duplicates
      const existingCodes = await database('coupons')
        .select('code')
        .then(rows => new Set(rows.map(r => r.code)));

      for (let i = 0; i < count; i++) {
        let code;
        do {
          code = generateCouponCode(prefix?.toUpperCase() || 'BATCH');
        } while (generatedCodes.has(code) || existingCodes.has(code));

        generatedCodes.add(code);

        couponsToInsert.push({
          code,
          name: name.trim(),
          discount_type: discount_type.toUpperCase(),
          discount_value: parseFloat(discount_value),
          min_purchase: min_purchase ? parseFloat(min_purchase) : 0,
          max_discount: max_discount ? parseFloat(max_discount) : null,
          usage_limit: usage_limit ? parseInt(usage_limit) : 1, // Default to single-use for batch
          usage_per_member: usage_per_member ? parseInt(usage_per_member) : 1,
          used_count: 0,
          applicable_plans: applicable_plans ?
            (typeof applicable_plans === 'string' ? JSON.parse(applicable_plans) : applicable_plans) : null,
          start_date: new Date(start_date),
          end_date: new Date(end_date),
          status: 'ACTIVE',
          created_by: created_by || null
        });
      }

      const inserted = await database('coupons').insert(couponsToInsert).returning('*');

      res.status(201).json({
        success: true,
        message: `Generated ${inserted.length} coupons`,
        data: {
          count: inserted.length,
          codes: inserted.map(c => c.code)
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/coupons/apply
   * Apply coupon to contract (creates usage record)
   * Called internally when contract is created with coupon
   */
  router.post('/coupons/apply', async (req, res) => {
    try {
      const {
        coupon_id,
        member_id,
        contract_id,
        discount_amount,
        used_by
      } = req.body || {};

      if (!coupon_id || !member_id || !discount_amount) {
        throw InvalidPayloadError('coupon_id, member_id, and discount_amount are required');
      }

      const coupon = await database('coupons').where('id', coupon_id).first();
      if (!coupon) {
        throw NotFoundError('Coupon not found');
      }

      // Create usage record
      const [usage] = await database('coupon_usages')
        .insert({
          coupon_id,
          member_id,
          contract_id: contract_id || null,
          discount_amount: parseFloat(discount_amount),
          used_by: used_by || null
        })
        .returning('*');

      // Update used count
      await database('coupons')
        .where('id', coupon_id)
        .increment('used_count', 1);

      res.status(201).json({
        success: true,
        message: 'Coupon applied successfully',
        data: usage
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerCouponsRoutes;
