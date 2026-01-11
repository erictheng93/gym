/**
 * Notifications Hooks
 * 處理推播通知佇列和課程相關通知
 */

/**
 * 註冊通知鉤子
 */
export function registerNotificationsHooks({ action, schedule }, { services, database, getSchema }, { pushService, pushEnabled }) {
  const { ItemsService } = services;

  /**
   * 處理待發送的推播通知
   */
  async function processNotificationQueue(schema) {
    if (!pushEnabled || !pushService) return;

    try {
      const result = await database.raw(`
        SELECT
          nq.id as queue_id,
          nq.notification_type,
          nq.payload,
          ps.id as subscription_id,
          ps.endpoint,
          ps.p256dh,
          ps.auth,
          ps.member_id,
          ps.error_count
        FROM notification_queue nq
        JOIN push_subscriptions ps ON ps.id = nq.subscription_id
        WHERE nq.processed = false
          AND nq.scheduled_at <= NOW()
          AND ps.is_active = true
          AND ps.error_count < 3
        ORDER BY nq.scheduled_at
        LIMIT 50
      `);

      const notifications = result.rows || [];
      if (notifications.length === 0) return;

      // Status logged(`[GymHook] Processing ${notifications.length} push notifications`);

      for (const notif of notifications) {
        try {
          let payload;
          try {
            payload = typeof notif.payload === 'string' ? JSON.parse(notif.payload) : notif.payload;
          } catch {
            payload = pushService.buildNotificationPayload(notif.notification_type, {});
          }

          const sendResult = await pushService.sendNotification(
            {
              endpoint: notif.endpoint,
              p256dh: notif.p256dh,
              auth: notif.auth,
            },
            payload
          );

          await database.raw(`
            UPDATE notification_queue
            SET processed = true, sent_at = NOW(), success = $2
            WHERE id = $1
          `, [notif.queue_id, sendResult.success]);

          if (sendResult.shouldRemove) {
            await database.raw(`
              UPDATE push_subscriptions
              SET error_count = error_count + 1,
                  is_active = CASE WHEN error_count >= 2 THEN false ELSE is_active END
              WHERE id = $1
            `, [notif.subscription_id]);
          }

          await database.raw(`
            INSERT INTO push_notifications (subscription_id, notification_type, sent_at, delivered)
            VALUES ($1, $2, NOW(), $3)
          `, [notif.subscription_id, notif.notification_type, sendResult.success]);

        } catch (error) {
          // Error logged(`[GymHook] Failed to send notification ${notif.queue_id}:`, error.message);

          await database.raw(`
            UPDATE notification_queue
            SET processed = true, success = false, error = $2
            WHERE id = $1
          `, [notif.queue_id, error.message]);
        }
      }
    } catch (error) {
      // Error logged('[GymHook] Error processing notification queue:', error);
    }
  }

  // 每分鐘處理通知佇列
  if (typeof schedule === 'function') {
    schedule('* * * * *', async () => {
      if (!pushEnabled) return;
      const schema = await getSchema();
      await processNotificationQueue(schema);
    });
    // Status logged('[GymHook] Scheduled notification queue processing every minute');

    // 每天早上 8:00 排程合約到期提醒
    schedule('0 8 * * *', async () => {
      if (!pushEnabled) return;
      try {
        await database.raw('SELECT queue_contract_expiry_reminders()');
        // Status logged('[GymHook] Queued contract expiry reminders');
      } catch (error) {
        // Error logged('[GymHook] Failed to queue contract expiry reminders:', error);
      }
    });
    // Status logged('[GymHook] Scheduled daily contract expiry reminders at 8:00 AM');
  }

  // 課程預約成功時 - 排程提醒
  action('bookings.items.create', async ({ payload, key }, { schema }) => {
    if (!pushEnabled || !pushService) return;
    if (payload.booking_status !== 'CONFIRMED') return;

    try {
      await database.raw(`
        SELECT queue_booking_reminders($1::uuid)
      `, [payload.session_id]);
      // Status logged(`[GymHook] Queued booking reminders for session ${payload.session_id}`);
    } catch (error) {
      // Error logged('[GymHook] Failed to queue booking reminders:', error);
    }
  });

  // 課程取消時 - 通知已預約會員
  action('class_sessions.items.update', async ({ payload, keys }, { schema }) => {
    if (!pushEnabled || !pushService) return;
    if (payload.session_status !== 'CANCELLED') return;

    try {
      const sessionId = keys[0];

      const bookingsResult = await database.raw(`
        SELECT
          b.member_id,
          c.name as class_name,
          cs.session_date,
          cs.start_time
        FROM bookings b
        JOIN class_sessions cs ON cs.id = b.session_id
        JOIN classes c ON c.id = cs.class_id
        WHERE b.session_id = $1
          AND b.booking_status IN ('CONFIRMED', 'WAITLISTED')
          AND b.status = 'active'
      `, [sessionId]);

      const bookings = bookingsResult.rows || [];
      if (bookings.length === 0) return;

      for (const booking of bookings) {
        const subsResult = await database.raw(`
          SELECT id FROM push_subscriptions
          WHERE member_id = $1
            AND is_active = true
            AND notify_class_cancelled = true
          LIMIT 1
        `, [booking.member_id]);

        const subs = subsResult.rows || [];
        if (subs.length === 0) continue;

        const notifPayload = pushService.buildNotificationPayload('class_cancelled', {
          className: booking.class_name,
          sessionId: sessionId,
        });

        await database.raw(`
          INSERT INTO notification_queue (subscription_id, notification_type, scheduled_at, payload, dedup_key)
          VALUES ($1, 'class_cancelled', NOW(), $2, $3)
          ON CONFLICT (dedup_key) DO NOTHING
        `, [subs[0].id, JSON.stringify(notifPayload), `cancel_${sessionId}_${booking.member_id}`]);
      }

      // Status logged(`[GymHook] Queued cancellation notifications for ${bookings.length} bookings`);
    } catch (error) {
      // Error logged('[GymHook] Failed to queue cancellation notifications:', error);
    }
  });
}

export default registerNotificationsHooks;
