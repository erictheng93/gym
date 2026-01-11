/**
 * Notification Preferences Routes
 * /gym/notifications/*
 */

/**
 * 註冊通知偏好路由
 * @param {object} router - Express router
 * @param {object} context - Directus context
 * @param {Function} memberAuthMiddleware - 會員認證中間件
 */
export function registerNotificationsRoutes(router, context, memberAuthMiddleware) {
  const { database, env } = context;

  /**
   * GET /gym/notifications/preferences
   */
  router.get('/notifications/preferences', memberAuthMiddleware, async (req, res) => {
    try {
      const memberId = req.member.id;

      let prefsResult = await database.raw(`
        SELECT * FROM member_notification_preferences WHERE member_id = ?::uuid
      `, [memberId]);

      let preferences = prefsResult.rows?.[0];

      if (!preferences) {
        await database.raw(`
          INSERT INTO member_notification_preferences (member_id)
          VALUES (?::uuid) ON CONFLICT (member_id) DO NOTHING
        `, [memberId]);
        prefsResult = await database.raw(`
          SELECT * FROM member_notification_preferences WHERE member_id = ?::uuid
        `, [memberId]);
        preferences = prefsResult.rows?.[0];
      }

      const channelsResult = await database.raw(`
        SELECT
          EXISTS(SELECT 1 FROM member_social_accounts WHERE member_id = ?::uuid AND provider = 'line' AND status = 'active') as has_line,
          EXISTS(SELECT 1 FROM push_subscriptions WHERE member_id = ?::uuid AND status = 'active' AND error_count < 5) as has_push,
          (SELECT email IS NOT NULL AND email != '' FROM members WHERE id = ?::uuid) as has_email,
          (SELECT phone IS NOT NULL AND phone != '' FROM members WHERE id = ?::uuid) as has_phone
      `, [memberId, memberId, memberId, memberId]);

      const channels = channelsResult.rows?.[0] || {};

      res.json({
        success: true,
        preferences: {
          enable_line: preferences?.enable_line ?? true,
          enable_push: preferences?.enable_push ?? true,
          enable_email: preferences?.enable_email ?? true,
          enable_sms: preferences?.enable_sms ?? false,
          notify_booking_confirmation: preferences?.notify_booking_confirmation ?? true,
          notify_booking_reminder: preferences?.notify_booking_reminder ?? true,
          notify_booking_cancelled: preferences?.notify_booking_cancelled ?? true,
          notify_contract_expiry: preferences?.notify_contract_expiry ?? true,
          notify_payment_confirmation: preferences?.notify_payment_confirmation ?? true,
          notify_promotions: preferences?.notify_promotions ?? false,
          notify_system: preferences?.notify_system ?? true,
          quiet_hours_enabled: preferences?.quiet_hours_enabled ?? false,
          quiet_hours_start: preferences?.quiet_hours_start ?? '22:00',
          quiet_hours_end: preferences?.quiet_hours_end ?? '08:00',
          sms_fallback_enabled: preferences?.sms_fallback_enabled ?? false,
          sms_otp_only: preferences?.sms_otp_only ?? true,
        },
        available_channels: {
          line: channels.has_line || false,
          push: channels.has_push || false,
          email: channels.has_email || false,
          sms: channels.has_phone || false,
        },
      });
    } catch (error) {
      // Error logged('[GymEndpoint] Get notification preferences error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  });

  /**
   * PATCH /gym/notifications/preferences
   */
  router.patch('/notifications/preferences', memberAuthMiddleware, async (req, res) => {
    try {
      const memberId = req.member.id;
      const updates = req.body || {};

      const allowedFields = [
        'enable_line', 'enable_push', 'enable_email', 'enable_sms',
        'notify_booking_confirmation', 'notify_booking_reminder', 'notify_booking_cancelled',
        'notify_contract_expiry', 'notify_payment_confirmation', 'notify_promotions', 'notify_system',
        'quiet_hours_enabled', 'quiet_hours_start', 'quiet_hours_end',
        'sms_fallback_enabled', 'sms_otp_only',
      ];

      const validUpdates = {};
      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) validUpdates[key] = value;
      }

      if (Object.keys(validUpdates).length === 0) {
        return res.status(400).json({ success: false, message: '沒有有效的欄位可更新' });
      }

      await database.raw(`
        INSERT INTO member_notification_preferences (member_id)
        VALUES (?::uuid) ON CONFLICT (member_id) DO NOTHING
      `, [memberId]);

      const setClauses = Object.keys(validUpdates).map((key, i) => `${key} = $${i + 2}`);
      const values = [memberId, ...Object.values(validUpdates)];

      await database.raw(`
        UPDATE member_notification_preferences
        SET ${setClauses.join(', ')}, date_updated = NOW()
        WHERE member_id = $1::uuid
      `, values);

      const result = await database.raw(`
        SELECT * FROM member_notification_preferences WHERE member_id = ?::uuid
      `, [memberId]);

      res.json({ success: true, message: '通知設定已更新', preferences: result.rows?.[0] });
    } catch (error) {
      // Error logged('[GymEndpoint] Update notification preferences error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  });

  /**
   * GET /gym/notifications/history
   */
  router.get('/notifications/history', memberAuthMiddleware, async (req, res) => {
    try {
      const memberId = req.member.id;
      const limit = Math.min(parseInt(req.query.limit) || 20, 100);
      const offset = parseInt(req.query.offset) || 0;

      const result = await database.raw(`
        SELECT id, notification_type, title, body, successful_channel, overall_status, sent_at, reference_type, reference_id, date_created
        FROM notification_logs WHERE member_id = ?::uuid
        ORDER BY date_created DESC LIMIT ?::integer OFFSET ?::integer
      `, [memberId, limit, offset]);

      const countResult = await database.raw(`
        SELECT COUNT(*) as total FROM notification_logs WHERE member_id = ?::uuid
      `, [memberId]);

      res.json({
        success: true,
        data: result.rows || [],
        pagination: { limit, offset, total: parseInt(countResult.rows?.[0]?.total || 0) },
      });
    } catch (error) {
      // Error logged('[GymEndpoint] Get notification history error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  });

  /**
   * GET /gym/notifications/channels
   */
  router.get('/notifications/channels', memberAuthMiddleware, async (req, res) => {
    try {
      const memberId = req.member.id;

      const result = await database.raw(`
        SELECT m.email, m.phone,
          msa.provider_user_id as line_user_id, msa.provider_name as line_display_name, msa.linked_at as line_linked_at,
          ps.id as push_subscription_id, ps.device_name as push_device_name, ps.date_created as push_subscribed_at
        FROM members m
        LEFT JOIN member_social_accounts msa ON msa.member_id = m.id AND msa.provider = 'line' AND msa.status = 'active'
        LEFT JOIN push_subscriptions ps ON ps.member_id = m.id AND ps.status = 'active' AND ps.error_count < 5
        WHERE m.id = ?::uuid
      `, [memberId]);

      const row = result.rows?.[0] || {};

      res.json({
        success: true,
        channels: {
          line: { available: !!row.line_user_id, displayName: row.line_display_name, linkedAt: row.line_linked_at },
          push: { available: !!row.push_subscription_id, deviceName: row.push_device_name, subscribedAt: row.push_subscribed_at },
          email: { available: !!row.email, address: row.email ? row.email.replace(/(.{2}).*(@.*)/, '$1***$2') : null },
          sms: { available: !!row.phone, phone: row.phone ? row.phone.replace(/(\d{4}).*(\d{3})/, '$1****$2') : null },
        },
      });
    } catch (error) {
      // Error logged('[GymEndpoint] Get notification channels error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  });

  /**
   * POST /gym/notifications/test
   */
  router.post('/notifications/test', memberAuthMiddleware, async (req, res) => {
    if (env.NODE_ENV === 'production') {
      return res.status(403).json({ success: false, message: '測試功能僅在開發環境可用' });
    }

    try {
      const memberId = req.member.id;
      const { channel, type = 'test' } = req.body || {};

      let notificationService;
      try {
        notificationService = await import('../../directus-extension-gym-hooks/src/notification-service.js');
      } catch (e) {
        return res.status(500).json({ success: false, message: 'NotificationService not available' });
      }

      if (!notificationService.isInitialized()) {
        return res.status(500).json({ success: false, message: 'NotificationService not initialized' });
      }

      const result = await notificationService.sendNotification({
        memberId,
        type,
        data: { message: '這是一則測試通知', memberName: req.member.full_name || req.member.member_code },
        forcedChannels: channel ? [channel] : undefined,
      });

      res.json({ success: result.success, channel: result.channel, attempts: result.attempts, error: result.error });
    } catch (error) {
      // Error logged('[GymEndpoint] Test notification error:', error);
      res.status(500).json({ success: false, message: error.message || 'Internal server error' });
    }
  });
}

export default registerNotificationsRoutes;
