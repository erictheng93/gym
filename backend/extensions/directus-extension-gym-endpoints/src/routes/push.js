/**
 * Push Notification Routes
 * /gym/push/*
 */

import {
  InvalidPayloadError,
  NotFoundError,
} from '../utils/errors.js';

/**
 * 註冊推播通知路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 * @param {Function} memberAuthMiddleware - 會員認證中間件
 */
export function registerPushRoutes(router, context, memberAuthMiddleware) {
  const { services, database, getSchema, env } = context;
  const { ItemsService } = services;

  /**
   * GET /gym/push/vapid-public-key
   * Get VAPID public key for push subscription
   */
  router.get('/push/vapid-public-key', (req, res) => {
    const publicKey = env.VAPID_PUBLIC_KEY;

    if (!publicKey) {
      res.status(500).json({
        success: false,
        message: 'VAPID public key not configured',
      });
      return;
    }

    res.json({
      success: true,
      publicKey,
    });
  });

  /**
   * POST /gym/push/subscribe
   * Subscribe to push notifications
   */
  router.post('/push/subscribe', memberAuthMiddleware, async (req, res) => {
    try {
      const { endpoint, keys, preferences = {} } = req.body || {};
      const memberId = req.member.id;

      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        throw InvalidPayloadError('endpoint and keys are required');
      }

      const deviceName = req.body.device_name || null;
      const userAgent = req.headers['user-agent'] || null;

      const result = await database.raw(`
        SELECT subscribe_push(
          ?::text, ?::varchar, ?::varchar,
          ?::uuid, NULL::uuid, NULL::uuid,
          ?::varchar, ?::text,
          ?::jsonb
        ) as subscription_id
      `, [
        endpoint, keys.p256dh, keys.auth,
        memberId,
        deviceName, userAgent,
        JSON.stringify(preferences),
      ]);

      const row = result.rows?.[0] || result[0];

      console.log(`[GymEndpoint] Push subscription created for member ${memberId}`);

      res.json({
        success: true,
        subscription_id: row?.subscription_id,
      });
    } catch (error) {
      console.error('[GymEndpoint] Push subscribe error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * DELETE /gym/push/unsubscribe
   * Unsubscribe from push notifications
   */
  router.delete('/push/unsubscribe', async (req, res) => {
    try {
      const { endpoint } = req.body || {};

      if (!endpoint) {
        throw InvalidPayloadError('endpoint is required');
      }

      const result = await database.raw(`
        SELECT unsubscribe_push(?::text) as success
      `, [endpoint]);

      const row = result.rows?.[0] || result[0];

      console.log(`[GymEndpoint] Push unsubscribed: ${endpoint}`);

      res.json({
        success: row?.success || false,
      });
    } catch (error) {
      console.error('[GymEndpoint] Push unsubscribe error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * PATCH /gym/push/preferences
   * Update push notification preferences
   */
  router.patch('/push/preferences', memberAuthMiddleware, async (req, res) => {
    try {
      const { endpoint, preferences } = req.body || {};

      if (!endpoint || !preferences) {
        throw InvalidPayloadError('endpoint and preferences are required');
      }

      const schema = await getSchema();
      const subscriptionsService = new ItemsService('push_subscriptions', {
        schema,
        knex: database,
      });

      const subs = await subscriptionsService.readByQuery({
        filter: {
          endpoint: { _eq: endpoint },
          member_id: { _eq: req.member.id },
        },
        limit: 1,
      });

      if (subs.length === 0) {
        throw NotFoundError('Subscription not found');
      }

      await subscriptionsService.updateOne(subs[0].id, {
        notify_booking_reminder: preferences.notify_booking_reminder ?? subs[0].notify_booking_reminder,
        notify_contract_expiry: preferences.notify_contract_expiry ?? subs[0].notify_contract_expiry,
        notify_class_cancelled: preferences.notify_class_cancelled ?? subs[0].notify_class_cancelled,
        notify_promotions: preferences.notify_promotions ?? subs[0].notify_promotions,
      });

      console.log(`[GymEndpoint] Push preferences updated for member ${req.member.id}`);

      res.json({
        success: true,
      });
    } catch (error) {
      console.error('[GymEndpoint] Update preferences error:', error);
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerPushRoutes;
