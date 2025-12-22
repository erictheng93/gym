-- Migration: 010_push_subscriptions.sql
-- Description: Web Push notification subscriptions and logs
-- Date: 2024-12-22

-- ============================================
-- Push Subscriptions Table
-- ============================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status VARCHAR(20) DEFAULT 'active',
    date_created TIMESTAMPTZ DEFAULT NOW(),
    date_updated TIMESTAMPTZ,

    -- Subscription owner (one of these must be set)
    member_id UUID REFERENCES members(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
    user_id UUID REFERENCES directus_users(id) ON DELETE CASCADE,

    -- Push subscription data
    endpoint TEXT NOT NULL,
    p256dh VARCHAR(500) NOT NULL,              -- keys.p256dh
    auth VARCHAR(100) NOT NULL,                -- keys.auth

    -- Device info
    device_name VARCHAR(100),
    user_agent TEXT,

    -- Notification preferences
    notify_booking_reminder BOOLEAN DEFAULT TRUE,   -- Class reminder (24h & 2h before)
    notify_contract_expiry BOOLEAN DEFAULT TRUE,    -- Contract expiry (7/3/1 days)
    notify_class_cancelled BOOLEAN DEFAULT TRUE,    -- Class cancellation
    notify_promotions BOOLEAN DEFAULT FALSE,        -- Marketing promotions

    -- Subscription status
    expires_at TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    error_count INTEGER DEFAULT 0,                  -- Consecutive send errors
    last_error TEXT,

    CONSTRAINT uq_push_endpoint UNIQUE (endpoint),
    CONSTRAINT chk_subscription_owner CHECK (
        (member_id IS NOT NULL)::INTEGER +
        (employee_id IS NOT NULL)::INTEGER +
        (user_id IS NOT NULL)::INTEGER = 1
    )
);

-- ============================================
-- Push Notifications Log Table
-- ============================================
CREATE TABLE IF NOT EXISTS push_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_created TIMESTAMPTZ DEFAULT NOW(),

    subscription_id UUID NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,   -- booking_reminder, contract_expiry, class_cancelled, promotion

    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    icon VARCHAR(500),
    badge VARCHAR(500),
    data JSONB,                               -- Extra data (url, action, etc.)

    -- Send status
    sent_at TIMESTAMPTZ,
    delivered BOOLEAN,
    clicked BOOLEAN DEFAULT FALSE,
    clicked_at TIMESTAMPTZ,
    error_message TEXT,

    -- Reference to related entity
    reference_type VARCHAR(50),               -- bookings, contracts, class_sessions, etc.
    reference_id UUID,

    CONSTRAINT chk_notification_type CHECK (notification_type IN (
        'booking_reminder_24h', 'booking_reminder_2h',
        'contract_expiry_7d', 'contract_expiry_3d', 'contract_expiry_1d',
        'class_cancelled', 'waitlist_promoted',
        'promotion', 'system'
    ))
);

-- ============================================
-- Notification Queue Table (for scheduled sends)
-- ============================================
CREATE TABLE IF NOT EXISTS notification_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_created TIMESTAMPTZ DEFAULT NOW(),

    subscription_id UUID NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
    notification_type VARCHAR(50) NOT NULL,

    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    data JSONB,

    scheduled_at TIMESTAMPTZ NOT NULL,        -- When to send
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,

    reference_type VARCHAR(50),
    reference_id UUID,

    -- Prevent duplicate notifications
    dedup_key VARCHAR(200),                   -- e.g., "booking_reminder_24h:{booking_id}"

    CONSTRAINT uq_notification_dedup UNIQUE (dedup_key)
);

-- ============================================
-- Indexes
-- ============================================

-- Subscriptions
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_member
ON push_subscriptions(member_id)
WHERE member_id IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_employee
ON push_subscriptions(employee_id)
WHERE employee_id IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active
ON push_subscriptions(status, error_count)
WHERE status = 'active' AND error_count < 5;

-- Notifications
CREATE INDEX IF NOT EXISTS idx_push_notifications_subscription
ON push_notifications(subscription_id, date_created);

CREATE INDEX IF NOT EXISTS idx_push_notifications_type
ON push_notifications(notification_type, sent_at);

-- Queue
CREATE INDEX IF NOT EXISTS idx_notification_queue_pending
ON notification_queue(scheduled_at)
WHERE processed = FALSE;

CREATE INDEX IF NOT EXISTS idx_notification_queue_reference
ON notification_queue(reference_type, reference_id);

-- ============================================
-- Functions
-- ============================================

-- Subscribe to push notifications
CREATE OR REPLACE FUNCTION subscribe_push(
    p_endpoint TEXT,
    p_p256dh VARCHAR(500),
    p_auth VARCHAR(100),
    p_member_id UUID DEFAULT NULL,
    p_employee_id UUID DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_device_name VARCHAR(100) DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_preferences JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
    v_subscription_id UUID;
BEGIN
    -- Upsert subscription
    INSERT INTO push_subscriptions (
        endpoint, p256dh, auth,
        member_id, employee_id, user_id,
        device_name, user_agent,
        notify_booking_reminder, notify_contract_expiry,
        notify_class_cancelled, notify_promotions
    )
    VALUES (
        p_endpoint, p_p256dh, p_auth,
        p_member_id, p_employee_id, p_user_id,
        p_device_name, p_user_agent,
        COALESCE((p_preferences->>'notify_booking_reminder')::BOOLEAN, TRUE),
        COALESCE((p_preferences->>'notify_contract_expiry')::BOOLEAN, TRUE),
        COALESCE((p_preferences->>'notify_class_cancelled')::BOOLEAN, TRUE),
        COALESCE((p_preferences->>'notify_promotions')::BOOLEAN, FALSE)
    )
    ON CONFLICT (endpoint) DO UPDATE SET
        p256dh = EXCLUDED.p256dh,
        auth = EXCLUDED.auth,
        member_id = COALESCE(EXCLUDED.member_id, push_subscriptions.member_id),
        employee_id = COALESCE(EXCLUDED.employee_id, push_subscriptions.employee_id),
        user_id = COALESCE(EXCLUDED.user_id, push_subscriptions.user_id),
        device_name = COALESCE(EXCLUDED.device_name, push_subscriptions.device_name),
        user_agent = EXCLUDED.user_agent,
        notify_booking_reminder = COALESCE((p_preferences->>'notify_booking_reminder')::BOOLEAN, push_subscriptions.notify_booking_reminder),
        notify_contract_expiry = COALESCE((p_preferences->>'notify_contract_expiry')::BOOLEAN, push_subscriptions.notify_contract_expiry),
        notify_class_cancelled = COALESCE((p_preferences->>'notify_class_cancelled')::BOOLEAN, push_subscriptions.notify_class_cancelled),
        notify_promotions = COALESCE((p_preferences->>'notify_promotions')::BOOLEAN, push_subscriptions.notify_promotions),
        status = 'active',
        error_count = 0,
        last_error = NULL,
        date_updated = NOW()
    RETURNING id INTO v_subscription_id;

    RETURN v_subscription_id;
END;
$$;

-- Unsubscribe from push notifications
CREATE OR REPLACE FUNCTION unsubscribe_push(p_endpoint TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE push_subscriptions
    SET status = 'inactive', date_updated = NOW()
    WHERE endpoint = p_endpoint;

    RETURN FOUND;
END;
$$;

-- Queue booking reminders for a session
CREATE OR REPLACE FUNCTION queue_booking_reminders(p_session_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_session RECORD;
    v_booking RECORD;
    v_queued INTEGER := 0;
    v_session_datetime TIMESTAMPTZ;
BEGIN
    -- Get session info
    SELECT cs.*, c.name as class_name, b.name as branch_name
    INTO v_session
    FROM class_sessions cs
    JOIN classes c ON c.id = cs.class_id
    JOIN branches b ON b.id = cs.branch_id
    WHERE cs.id = p_session_id AND cs.status = 'active';

    IF NOT FOUND THEN
        RETURN 0;
    END IF;

    v_session_datetime := v_session.session_date + v_session.start_time;

    -- Queue reminders for each confirmed booking
    FOR v_booking IN
        SELECT b.*, m.full_name, ps.id as subscription_id
        FROM bookings b
        JOIN members m ON m.id = b.member_id
        JOIN push_subscriptions ps ON ps.member_id = m.id
        WHERE b.session_id = p_session_id
          AND b.booking_status = 'CONFIRMED'
          AND b.status = 'active'
          AND ps.status = 'active'
          AND ps.notify_booking_reminder = TRUE
    LOOP
        -- 24-hour reminder
        IF v_session_datetime > NOW() + INTERVAL '24 hours' THEN
            INSERT INTO notification_queue (
                subscription_id, notification_type,
                title, body, data,
                scheduled_at, reference_type, reference_id, dedup_key
            )
            VALUES (
                v_booking.subscription_id, 'booking_reminder_24h',
                '課程提醒',
                FORMAT('明天 %s 有 %s 課程，地點：%s',
                    TO_CHAR(v_session.start_time, 'HH24:MI'),
                    v_session.class_name,
                    v_session.branch_name
                ),
                jsonb_build_object('url', '/bookings', 'booking_id', v_booking.id),
                v_session_datetime - INTERVAL '24 hours',
                'bookings', v_booking.id,
                FORMAT('booking_reminder_24h:%s', v_booking.id)
            )
            ON CONFLICT (dedup_key) DO NOTHING;

            IF FOUND THEN v_queued := v_queued + 1; END IF;
        END IF;

        -- 2-hour reminder
        IF v_session_datetime > NOW() + INTERVAL '2 hours' THEN
            INSERT INTO notification_queue (
                subscription_id, notification_type,
                title, body, data,
                scheduled_at, reference_type, reference_id, dedup_key
            )
            VALUES (
                v_booking.subscription_id, 'booking_reminder_2h',
                '課程即將開始',
                FORMAT('%s 課程將在 2 小時後開始！', v_session.class_name),
                jsonb_build_object('url', '/bookings', 'booking_id', v_booking.id),
                v_session_datetime - INTERVAL '2 hours',
                'bookings', v_booking.id,
                FORMAT('booking_reminder_2h:%s', v_booking.id)
            )
            ON CONFLICT (dedup_key) DO NOTHING;

            IF FOUND THEN v_queued := v_queued + 1; END IF;
        END IF;
    END LOOP;

    RETURN v_queued;
END;
$$;

-- Queue contract expiry reminders
CREATE OR REPLACE FUNCTION queue_contract_expiry_reminders()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_contract RECORD;
    v_queued INTEGER := 0;
    v_days_intervals INTEGER[] := ARRAY[7, 3, 1];
    v_days INTEGER;
BEGIN
    FOREACH v_days IN ARRAY v_days_intervals LOOP
        FOR v_contract IN
            SELECT c.*, m.full_name, mp.name as plan_name, ps.id as subscription_id
            FROM contracts c
            JOIN members m ON m.id = c.member_id
            JOIN membership_plans mp ON mp.id = c.plan_id
            JOIN push_subscriptions ps ON ps.member_id = m.id
            WHERE c.end_date = CURRENT_DATE + v_days
              AND c.contract_status = 'ACTIVE'
              AND c.status = 'active'
              AND ps.status = 'active'
              AND ps.notify_contract_expiry = TRUE
        LOOP
            INSERT INTO notification_queue (
                subscription_id, notification_type,
                title, body, data,
                scheduled_at, reference_type, reference_id, dedup_key
            )
            VALUES (
                v_contract.subscription_id,
                FORMAT('contract_expiry_%sd', v_days),
                '會籍即將到期',
                CASE
                    WHEN v_days = 1 THEN FORMAT('您的 %s 將於明天到期，請盡快續約！', v_contract.plan_name)
                    ELSE FORMAT('您的 %s 將於 %s 天後到期', v_contract.plan_name, v_days)
                END,
                jsonb_build_object('url', '/contracts', 'contract_id', v_contract.id),
                NOW(), -- Send immediately
                'contracts', v_contract.id,
                FORMAT('contract_expiry_%sd:%s', v_days, v_contract.id)
            )
            ON CONFLICT (dedup_key) DO NOTHING;

            IF FOUND THEN v_queued := v_queued + 1; END IF;
        END LOOP;
    END LOOP;

    RETURN v_queued;
END;
$$;

-- Process notification queue (call this periodically)
CREATE OR REPLACE FUNCTION get_pending_notifications(p_limit INTEGER DEFAULT 100)
RETURNS TABLE (
    id UUID,
    subscription_id UUID,
    endpoint TEXT,
    p256dh VARCHAR(500),
    auth VARCHAR(100),
    notification_type VARCHAR(50),
    title VARCHAR(200),
    body TEXT,
    data JSONB
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        nq.id,
        nq.subscription_id,
        ps.endpoint,
        ps.p256dh,
        ps.auth,
        nq.notification_type,
        nq.title,
        nq.body,
        nq.data
    FROM notification_queue nq
    JOIN push_subscriptions ps ON ps.id = nq.subscription_id
    WHERE nq.processed = FALSE
      AND nq.scheduled_at <= NOW()
      AND ps.status = 'active'
      AND ps.error_count < 5
    ORDER BY nq.scheduled_at
    LIMIT p_limit;
END;
$$;

-- Mark notification as sent
CREATE OR REPLACE FUNCTION mark_notification_sent(
    p_queue_id UUID,
    p_success BOOLEAN,
    p_error TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    v_subscription_id UUID;
BEGIN
    -- Update queue
    UPDATE notification_queue
    SET processed = TRUE, processed_at = NOW()
    WHERE id = p_queue_id
    RETURNING subscription_id INTO v_subscription_id;

    -- Log the notification
    INSERT INTO push_notifications (
        subscription_id, notification_type, title, body, data,
        sent_at, delivered, error_message, reference_type, reference_id
    )
    SELECT
        subscription_id, notification_type, title, body, data,
        NOW(), p_success, p_error, reference_type, reference_id
    FROM notification_queue
    WHERE id = p_queue_id;

    -- Update subscription error count
    IF p_success THEN
        UPDATE push_subscriptions
        SET last_used_at = NOW(), error_count = 0, last_error = NULL, date_updated = NOW()
        WHERE id = v_subscription_id;
    ELSE
        UPDATE push_subscriptions
        SET error_count = error_count + 1, last_error = p_error, date_updated = NOW()
        WHERE id = v_subscription_id;
    END IF;
END;
$$;

-- Cleanup old data
CREATE OR REPLACE FUNCTION cleanup_push_data()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_deleted INTEGER := 0;
BEGIN
    -- Delete processed queue items older than 7 days
    DELETE FROM notification_queue
    WHERE processed = TRUE AND processed_at < NOW() - INTERVAL '7 days';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    -- Delete old notification logs (keep 30 days)
    DELETE FROM push_notifications
    WHERE date_created < NOW() - INTERVAL '30 days';

    -- Deactivate subscriptions with too many errors
    UPDATE push_subscriptions
    SET status = 'inactive', date_updated = NOW()
    WHERE error_count >= 5 AND status = 'active';

    RETURN v_deleted;
END;
$$;

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE push_subscriptions IS 'Web Push notification subscriptions';
COMMENT ON TABLE push_notifications IS 'Push notification send log';
COMMENT ON TABLE notification_queue IS 'Scheduled notifications queue';
COMMENT ON FUNCTION subscribe_push IS 'Subscribe or update push subscription';
COMMENT ON FUNCTION unsubscribe_push IS 'Unsubscribe from push notifications';
COMMENT ON FUNCTION queue_booking_reminders IS 'Queue reminders for a class session';
COMMENT ON FUNCTION queue_contract_expiry_reminders IS 'Queue contract expiry reminders';
COMMENT ON FUNCTION get_pending_notifications IS 'Get pending notifications to send';
COMMENT ON FUNCTION mark_notification_sent IS 'Mark notification as sent and log result';
