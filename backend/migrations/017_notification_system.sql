-- Migration: 017_notification_system.sql
-- Description: Multi-channel notification system with LINE Messaging and SMS (Mitake) support
-- Date: 2024-12-30
-- Features: LINE Push Messages, SMS fallback, multi-tenant configuration, unified logging

-- ============================================
-- 1. Branch Notification Configuration (Multi-Tenant)
-- ============================================
-- Each branch can have its own LINE OA and SMS credentials
-- Falls back to system environment variables if not set

CREATE TABLE IF NOT EXISTS branch_notification_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_id UUID NOT NULL UNIQUE REFERENCES branches(id) ON DELETE CASCADE,

    -- LINE Messaging API Configuration
    line_channel_access_token TEXT,           -- Long-lived channel access token
    line_channel_secret TEXT,                 -- Channel secret for webhook validation
    line_enabled BOOLEAN DEFAULT TRUE,

    -- Mitake SMS Configuration
    mitake_username VARCHAR(100),
    mitake_password VARCHAR(100),             -- Consider encrypting in production
    mitake_api_url VARCHAR(255) DEFAULT 'https://smsapi.mitake.com.tw/api/mtk/SmSend',
    sms_enabled BOOLEAN DEFAULT FALSE,        -- SMS disabled by default (cost)
    sms_cost_per_message DECIMAL(10, 4) DEFAULT 0.5,  -- NT$ per SMS segment

    -- General Settings
    default_notification_channels VARCHAR(20)[] DEFAULT ARRAY['line', 'push', 'email'],

    -- Audit
    date_created TIMESTAMPTZ DEFAULT NOW(),
    date_updated TIMESTAMPTZ,
    created_by UUID REFERENCES directus_users(id),
    updated_by UUID REFERENCES directus_users(id)
);

COMMENT ON TABLE branch_notification_config IS 'Per-branch notification service configuration (LINE OA, SMS credentials)';
COMMENT ON COLUMN branch_notification_config.line_channel_access_token IS 'LINE Messaging API channel access token (different from LINE Login)';

-- ============================================
-- 2. LINE Message Logs Table
-- ============================================

CREATE TABLE IF NOT EXISTS line_message_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_created TIMESTAMPTZ DEFAULT NOW(),

    -- Target
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    line_user_id VARCHAR(255) NOT NULL,       -- LINE UID from member_social_accounts

    -- Message content
    message_type VARCHAR(50) NOT NULL,        -- 'text', 'flex', 'template', 'image', 'sticker'
    notification_type VARCHAR(50) NOT NULL,   -- 'booking_confirmation', 'contract_expiry', etc.
    message_payload JSONB NOT NULL,           -- Full LINE message object
    alt_text VARCHAR(400),                    -- Alt text for flex messages

    -- Delivery status
    request_id VARCHAR(255),                  -- LINE API x-line-request-id
    sent_at TIMESTAMPTZ,
    delivery_status VARCHAR(50) DEFAULT 'pending',
    error_code VARCHAR(50),
    error_message TEXT,

    -- Reference to related entity
    reference_type VARCHAR(50),               -- 'bookings', 'contracts', 'payments'
    reference_id UUID,

    -- Rate limiting and quota
    quota_consumed INTEGER DEFAULT 1,

    CONSTRAINT chk_line_message_type CHECK (message_type IN ('text', 'flex', 'template', 'image', 'sticker')),
    CONSTRAINT chk_line_delivery_status CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'failed', 'blocked', 'rate_limited'))
);

-- ============================================
-- 3. SMS Logs Table (Mitake)
-- ============================================

CREATE TABLE IF NOT EXISTS sms_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_created TIMESTAMPTZ DEFAULT NOW(),

    -- Target
    member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
    phone_number VARCHAR(20) NOT NULL,        -- Normalized: 8869xxxxxxxx

    -- Message content
    notification_type VARCHAR(50) NOT NULL,
    message_content TEXT NOT NULL,
    character_count INTEGER NOT NULL,
    segment_count INTEGER DEFAULT 1,          -- SMS segments (70 chars/segment for Chinese)

    -- Mitake API response
    mitake_msgid VARCHAR(100),
    mitake_statuscode VARCHAR(10),

    -- Delivery status
    sent_at TIMESTAMPTZ,
    delivery_status VARCHAR(50) DEFAULT 'pending',
    delivery_time TIMESTAMPTZ,                -- When carrier confirmed delivery
    error_code VARCHAR(50),
    error_message TEXT,

    -- Cost tracking
    cost_per_segment DECIMAL(10, 4) DEFAULT 0.5,
    total_cost DECIMAL(10, 4),

    -- Reference
    reference_type VARCHAR(50),
    reference_id UUID,

    CONSTRAINT chk_sms_delivery_status CHECK (delivery_status IN ('pending', 'submitted', 'delivered', 'failed', 'expired', 'rejected'))
);

-- ============================================
-- 4. Unified Notification Logs Table
-- ============================================

CREATE TABLE IF NOT EXISTS notification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_created TIMESTAMPTZ DEFAULT NOW(),

    -- Target
    member_id UUID REFERENCES members(id) ON DELETE SET NULL,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,

    -- Notification info
    notification_type VARCHAR(50) NOT NULL,
    title VARCHAR(255),
    body TEXT,
    data JSONB,

    -- Channel attempts (ordered by priority)
    channels_attempted JSONB DEFAULT '[]'::JSONB,  -- [{"channel": "line", "success": true, "at": "...", "error": null}]
    successful_channel VARCHAR(20),           -- 'line', 'push', 'email', 'sms'

    -- Status
    overall_status VARCHAR(20) DEFAULT 'pending',
    sent_at TIMESTAMPTZ,

    -- Reference
    reference_type VARCHAR(50),
    reference_id UUID,
    dedup_key VARCHAR(255) UNIQUE,            -- Prevent duplicate notifications

    CONSTRAINT chk_notification_overall_status CHECK (overall_status IN ('pending', 'sent', 'partial', 'failed'))
);

-- ============================================
-- 5. Member Notification Preferences Table
-- ============================================

CREATE TABLE IF NOT EXISTS member_notification_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    member_id UUID NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,

    -- Channel preferences
    enable_line BOOLEAN DEFAULT TRUE,
    enable_push BOOLEAN DEFAULT TRUE,
    enable_email BOOLEAN DEFAULT TRUE,
    enable_sms BOOLEAN DEFAULT FALSE,         -- SMS as fallback only

    -- Notification type preferences
    notify_booking_confirmation BOOLEAN DEFAULT TRUE,
    notify_booking_reminder BOOLEAN DEFAULT TRUE,
    notify_booking_cancelled BOOLEAN DEFAULT TRUE,
    notify_contract_expiry BOOLEAN DEFAULT TRUE,
    notify_payment_confirmation BOOLEAN DEFAULT TRUE,
    notify_promotions BOOLEAN DEFAULT FALSE,  -- Marketing opt-in
    notify_system BOOLEAN DEFAULT TRUE,

    -- Quiet hours (respect user's rest time)
    quiet_hours_enabled BOOLEAN DEFAULT FALSE,
    quiet_hours_start TIME DEFAULT '22:00',
    quiet_hours_end TIME DEFAULT '08:00',

    -- SMS-specific settings
    sms_fallback_enabled BOOLEAN DEFAULT FALSE,  -- Use SMS when other channels fail
    sms_otp_only BOOLEAN DEFAULT TRUE,           -- Only use SMS for OTP, not marketing

    -- Timestamps
    date_created TIMESTAMPTZ DEFAULT NOW(),
    date_updated TIMESTAMPTZ
);

-- ============================================
-- 6. Extend notification_queue for multi-channel
-- ============================================

-- Add new columns if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_queue' AND column_name = 'channel') THEN
        ALTER TABLE notification_queue ADD COLUMN channel VARCHAR(20) DEFAULT 'push';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_queue' AND column_name = 'channels_to_try') THEN
        ALTER TABLE notification_queue ADD COLUMN channels_to_try VARCHAR(20)[] DEFAULT ARRAY['line', 'push', 'email'];
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_queue' AND column_name = 'current_channel_index') THEN
        ALTER TABLE notification_queue ADD COLUMN current_channel_index INTEGER DEFAULT 0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_queue' AND column_name = 'member_id') THEN
        ALTER TABLE notification_queue ADD COLUMN member_id UUID REFERENCES members(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_queue' AND column_name = 'employee_id') THEN
        ALTER TABLE notification_queue ADD COLUMN employee_id UUID REFERENCES employees(id) ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'notification_queue' AND column_name = 'metadata') THEN
        ALTER TABLE notification_queue ADD COLUMN metadata JSONB DEFAULT '{}'::JSONB;
    END IF;
END $$;

-- ============================================
-- 7. Indexes
-- ============================================

-- Branch notification config
CREATE INDEX IF NOT EXISTS idx_branch_notif_config_branch
ON branch_notification_config(branch_id);

-- LINE message logs
CREATE INDEX IF NOT EXISTS idx_line_logs_member
ON line_message_logs(member_id, date_created DESC);

CREATE INDEX IF NOT EXISTS idx_line_logs_status
ON line_message_logs(delivery_status, date_created)
WHERE delivery_status IN ('pending', 'sent');

CREATE INDEX IF NOT EXISTS idx_line_logs_reference
ON line_message_logs(reference_type, reference_id)
WHERE reference_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_line_logs_branch
ON line_message_logs(branch_id, date_created DESC)
WHERE branch_id IS NOT NULL;

-- SMS logs
CREATE INDEX IF NOT EXISTS idx_sms_logs_member
ON sms_logs(member_id, date_created DESC)
WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sms_logs_phone
ON sms_logs(phone_number, date_created DESC);

CREATE INDEX IF NOT EXISTS idx_sms_logs_status
ON sms_logs(delivery_status, date_created)
WHERE delivery_status IN ('pending', 'submitted');

CREATE INDEX IF NOT EXISTS idx_sms_logs_branch
ON sms_logs(branch_id, date_created DESC)
WHERE branch_id IS NOT NULL;

-- Notification logs
CREATE INDEX IF NOT EXISTS idx_notif_logs_member
ON notification_logs(member_id, date_created DESC)
WHERE member_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notif_logs_employee
ON notification_logs(employee_id, date_created DESC)
WHERE employee_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notif_logs_type
ON notification_logs(notification_type, date_created DESC);

CREATE INDEX IF NOT EXISTS idx_notif_logs_reference
ON notification_logs(reference_type, reference_id)
WHERE reference_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notif_logs_status
ON notification_logs(overall_status, date_created)
WHERE overall_status IN ('pending', 'partial');

-- Member preferences
CREATE INDEX IF NOT EXISTS idx_member_prefs_member
ON member_notification_preferences(member_id);

-- ============================================
-- 8. Functions
-- ============================================

-- Get branch notification config (with env fallback handled in app)
CREATE OR REPLACE FUNCTION get_branch_notification_config(p_branch_id UUID)
RETURNS TABLE (
    line_channel_access_token TEXT,
    line_channel_secret TEXT,
    line_enabled BOOLEAN,
    mitake_username VARCHAR(100),
    mitake_password VARCHAR(100),
    mitake_api_url VARCHAR(255),
    sms_enabled BOOLEAN,
    sms_cost_per_message DECIMAL(10, 4)
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        bnc.line_channel_access_token,
        bnc.line_channel_secret,
        COALESCE(bnc.line_enabled, TRUE),
        bnc.mitake_username,
        bnc.mitake_password,
        COALESCE(bnc.mitake_api_url, 'https://smsapi.mitake.com.tw/api/mtk/SmSend'),
        COALESCE(bnc.sms_enabled, FALSE),
        COALESCE(bnc.sms_cost_per_message, 0.5)
    FROM branch_notification_config bnc
    WHERE bnc.branch_id = p_branch_id;

    -- If no config found, return empty (app will use env vars)
END;
$$;

-- Get member's preferred notification channels (ordered by priority)
CREATE OR REPLACE FUNCTION get_member_notification_channels(
    p_member_id UUID,
    p_notification_type VARCHAR(50) DEFAULT NULL
)
RETURNS VARCHAR(20)[]
LANGUAGE plpgsql AS $$
DECLARE
    v_prefs RECORD;
    v_has_line BOOLEAN;
    v_has_push BOOLEAN;
    v_has_email BOOLEAN;
    v_has_phone BOOLEAN;
    v_channels VARCHAR(20)[];
    v_type_enabled BOOLEAN;
BEGIN
    -- Get member's notification preferences
    SELECT * INTO v_prefs
    FROM member_notification_preferences
    WHERE member_id = p_member_id;

    -- Check if specific notification type is enabled
    IF p_notification_type IS NOT NULL AND v_prefs IS NOT NULL THEN
        CASE p_notification_type
            WHEN 'booking_confirmation' THEN v_type_enabled := v_prefs.notify_booking_confirmation;
            WHEN 'booking_reminder_24h', 'booking_reminder_2h' THEN v_type_enabled := v_prefs.notify_booking_reminder;
            WHEN 'booking_cancelled', 'class_cancelled' THEN v_type_enabled := v_prefs.notify_booking_cancelled;
            WHEN 'contract_expiry_7d', 'contract_expiry_3d', 'contract_expiry_1d' THEN v_type_enabled := v_prefs.notify_contract_expiry;
            WHEN 'payment_confirmation' THEN v_type_enabled := v_prefs.notify_payment_confirmation;
            WHEN 'promotion' THEN v_type_enabled := v_prefs.notify_promotions;
            ELSE v_type_enabled := v_prefs.notify_system;
        END CASE;

        IF NOT COALESCE(v_type_enabled, TRUE) THEN
            RETURN ARRAY[]::VARCHAR(20)[];  -- User disabled this notification type
        END IF;
    END IF;

    -- Check if LINE is linked
    SELECT EXISTS(
        SELECT 1 FROM member_social_accounts
        WHERE member_id = p_member_id
          AND provider = 'line'
          AND status = 'active'
    ) INTO v_has_line;

    -- Check if push subscription exists
    SELECT EXISTS(
        SELECT 1 FROM push_subscriptions
        WHERE member_id = p_member_id
          AND status = 'active'
          AND error_count < 5
    ) INTO v_has_push;

    -- Check member contact info
    SELECT
        email IS NOT NULL AND email != '',
        phone IS NOT NULL AND phone != ''
    INTO v_has_email, v_has_phone
    FROM members WHERE id = p_member_id;

    -- Build channel list based on availability and preferences
    v_channels := ARRAY[]::VARCHAR(20)[];

    -- LINE first (if available and enabled)
    IF v_has_line AND COALESCE(v_prefs.enable_line, TRUE) THEN
        v_channels := v_channels || 'line';
    END IF;

    -- Push second (if available and enabled)
    IF v_has_push AND COALESCE(v_prefs.enable_push, TRUE) THEN
        v_channels := v_channels || 'push';
    END IF;

    -- Email third (if available and enabled)
    IF v_has_email AND COALESCE(v_prefs.enable_email, TRUE) THEN
        v_channels := v_channels || 'email';
    END IF;

    -- SMS last (only as fallback if explicitly enabled)
    IF v_has_phone AND COALESCE(v_prefs.enable_sms, FALSE) AND COALESCE(v_prefs.sms_fallback_enabled, FALSE) THEN
        v_channels := v_channels || 'sms';
    END IF;

    RETURN v_channels;
END;
$$;

-- Queue a multi-channel notification
CREATE OR REPLACE FUNCTION queue_multi_channel_notification(
    p_member_id UUID,
    p_notification_type VARCHAR(50),
    p_title VARCHAR(255),
    p_body TEXT,
    p_data JSONB DEFAULT '{}'::JSONB,
    p_scheduled_at TIMESTAMPTZ DEFAULT NOW(),
    p_reference_type VARCHAR(50) DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
    v_queue_id UUID;
    v_channels VARCHAR(20)[];
    v_dedup_key VARCHAR(255);
BEGIN
    -- Generate dedup key
    v_dedup_key := FORMAT('%s:%s:%s',
        p_notification_type,
        p_member_id,
        COALESCE(p_reference_id::TEXT, NOW()::TEXT)
    );

    -- Get available channels
    v_channels := get_member_notification_channels(p_member_id, p_notification_type);

    -- If no channels available, return NULL
    IF array_length(v_channels, 1) IS NULL OR array_length(v_channels, 1) = 0 THEN
        RETURN NULL;
    END IF;

    -- Insert into queue
    INSERT INTO notification_queue (
        member_id,
        notification_type,
        title,
        body,
        data,
        scheduled_at,
        channels_to_try,
        current_channel_index,
        channel,
        reference_type,
        reference_id,
        dedup_key
    )
    VALUES (
        p_member_id,
        p_notification_type,
        p_title,
        p_body,
        p_data,
        p_scheduled_at,
        v_channels,
        0,
        v_channels[1],  -- Start with first channel
        p_reference_type,
        p_reference_id,
        v_dedup_key
    )
    ON CONFLICT (dedup_key) DO NOTHING
    RETURNING id INTO v_queue_id;

    RETURN v_queue_id;
END;
$$;

-- Log notification attempt and update status
CREATE OR REPLACE FUNCTION log_notification_attempt(
    p_member_id UUID,
    p_notification_type VARCHAR(50),
    p_channel VARCHAR(20),
    p_success BOOLEAN,
    p_error TEXT DEFAULT NULL,
    p_title VARCHAR(255) DEFAULT NULL,
    p_body TEXT DEFAULT NULL,
    p_data JSONB DEFAULT NULL,
    p_reference_type VARCHAR(50) DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
    v_log_id UUID;
    v_dedup_key VARCHAR(255);
    v_existing_log_id UUID;
    v_channels_attempted JSONB;
BEGIN
    -- Generate dedup key
    v_dedup_key := FORMAT('%s:%s:%s',
        p_notification_type,
        p_member_id,
        COALESCE(p_reference_id::TEXT, NOW()::TEXT)
    );

    -- Check if log entry already exists
    SELECT id, channels_attempted INTO v_existing_log_id, v_channels_attempted
    FROM notification_logs
    WHERE dedup_key = v_dedup_key;

    IF v_existing_log_id IS NOT NULL THEN
        -- Update existing log
        UPDATE notification_logs SET
            channels_attempted = v_channels_attempted || jsonb_build_object(
                'channel', p_channel,
                'success', p_success,
                'at', NOW()::TEXT,
                'error', p_error
            ),
            successful_channel = CASE WHEN p_success THEN p_channel ELSE successful_channel END,
            overall_status = CASE
                WHEN p_success THEN 'sent'
                WHEN successful_channel IS NOT NULL THEN 'sent'
                ELSE 'partial'
            END,
            sent_at = CASE WHEN p_success AND sent_at IS NULL THEN NOW() ELSE sent_at END
        WHERE id = v_existing_log_id
        RETURNING id INTO v_log_id;
    ELSE
        -- Create new log entry
        INSERT INTO notification_logs (
            member_id,
            notification_type,
            title,
            body,
            data,
            channels_attempted,
            successful_channel,
            overall_status,
            sent_at,
            reference_type,
            reference_id,
            dedup_key
        ) VALUES (
            p_member_id,
            p_notification_type,
            p_title,
            p_body,
            p_data,
            jsonb_build_array(jsonb_build_object(
                'channel', p_channel,
                'success', p_success,
                'at', NOW()::TEXT,
                'error', p_error
            )),
            CASE WHEN p_success THEN p_channel ELSE NULL END,
            CASE WHEN p_success THEN 'sent' ELSE 'pending' END,
            CASE WHEN p_success THEN NOW() ELSE NULL END,
            p_reference_type,
            p_reference_id,
            v_dedup_key
        )
        RETURNING id INTO v_log_id;
    END IF;

    RETURN v_log_id;
END;
$$;

-- Get SMS usage statistics for a branch (for cost tracking)
CREATE OR REPLACE FUNCTION get_sms_usage_stats(
    p_branch_id UUID,
    p_start_date DATE DEFAULT DATE_TRUNC('month', CURRENT_DATE)::DATE,
    p_end_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
    total_messages INTEGER,
    total_segments INTEGER,
    total_cost DECIMAL(10, 2),
    success_count INTEGER,
    failure_count INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER as total_messages,
        COALESCE(SUM(segment_count), 0)::INTEGER as total_segments,
        COALESCE(SUM(total_cost), 0)::DECIMAL(10, 2) as total_cost,
        COUNT(*) FILTER (WHERE delivery_status IN ('submitted', 'delivered'))::INTEGER as success_count,
        COUNT(*) FILTER (WHERE delivery_status IN ('failed', 'rejected'))::INTEGER as failure_count
    FROM sms_logs
    WHERE branch_id = p_branch_id
      AND date_created >= p_start_date
      AND date_created < p_end_date + INTERVAL '1 day';
END;
$$;

-- Cleanup old notification data
CREATE OR REPLACE FUNCTION cleanup_notification_data(
    p_days_to_keep INTEGER DEFAULT 90
)
RETURNS TABLE (
    line_logs_deleted INTEGER,
    sms_logs_deleted INTEGER,
    notification_logs_deleted INTEGER
)
LANGUAGE plpgsql AS $$
DECLARE
    v_line_deleted INTEGER;
    v_sms_deleted INTEGER;
    v_notif_deleted INTEGER;
    v_cutoff_date TIMESTAMPTZ := NOW() - (p_days_to_keep || ' days')::INTERVAL;
BEGIN
    -- Delete old LINE logs
    DELETE FROM line_message_logs
    WHERE date_created < v_cutoff_date;
    GET DIAGNOSTICS v_line_deleted = ROW_COUNT;

    -- Delete old SMS logs
    DELETE FROM sms_logs
    WHERE date_created < v_cutoff_date;
    GET DIAGNOSTICS v_sms_deleted = ROW_COUNT;

    -- Delete old notification logs
    DELETE FROM notification_logs
    WHERE date_created < v_cutoff_date;
    GET DIAGNOSTICS v_notif_deleted = ROW_COUNT;

    RETURN QUERY SELECT v_line_deleted, v_sms_deleted, v_notif_deleted;
END;
$$;

-- ============================================
-- 9. Comments
-- ============================================

COMMENT ON TABLE branch_notification_config IS 'Per-branch LINE OA and SMS credentials for multi-tenant support';
COMMENT ON TABLE line_message_logs IS 'LINE Messaging API delivery tracking';
COMMENT ON TABLE sms_logs IS 'Mitake SMS delivery tracking and cost accounting';
COMMENT ON TABLE notification_logs IS 'Unified notification delivery logs across all channels';
COMMENT ON TABLE member_notification_preferences IS 'Per-member notification channel and type preferences';

COMMENT ON FUNCTION get_branch_notification_config IS 'Get notification service credentials for a branch';
COMMENT ON FUNCTION get_member_notification_channels IS 'Get ordered list of available notification channels for a member';
COMMENT ON FUNCTION queue_multi_channel_notification IS 'Queue a notification for multi-channel delivery with fallback';
COMMENT ON FUNCTION log_notification_attempt IS 'Log a notification delivery attempt and update overall status';
COMMENT ON FUNCTION get_sms_usage_stats IS 'Get SMS usage and cost statistics for a branch';
COMMENT ON FUNCTION cleanup_notification_data IS 'Cleanup old notification logs (default: 90 days retention)';
