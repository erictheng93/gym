-- Migration: 008_otp_tokens.sql
-- Description: OTP authentication system tables
-- Date: 2024-12-22

-- ============================================
-- OTP Tokens Table
-- ============================================
CREATE TABLE IF NOT EXISTS otp_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier VARCHAR(100) NOT NULL,          -- phone or email
    identifier_type VARCHAR(20) NOT NULL,      -- 'phone' or 'email'
    code VARCHAR(6) NOT NULL,                  -- 6-digit OTP
    expires_at TIMESTAMPTZ NOT NULL,           -- expiry time (5 minutes)
    attempts INTEGER DEFAULT 0,                -- verification attempts
    max_attempts INTEGER DEFAULT 3,            -- max allowed attempts
    verified BOOLEAN DEFAULT FALSE,            -- whether OTP was verified
    verified_at TIMESTAMPTZ,                   -- verification timestamp
    ip_address INET,                           -- request IP
    user_agent TEXT,                           -- user agent string
    date_created TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT chk_identifier_type CHECK (identifier_type IN ('phone', 'email'))
);

-- ============================================
-- OTP Send Logs Table (for Rate Limiting)
-- ============================================
CREATE TABLE IF NOT EXISTS otp_send_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    identifier VARCHAR(100) NOT NULL,
    identifier_type VARCHAR(20) NOT NULL,
    sent_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address INET,
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,

    CONSTRAINT chk_send_log_identifier_type CHECK (identifier_type IN ('phone', 'email'))
);

-- ============================================
-- Indexes
-- ============================================

-- Fast OTP lookup
CREATE INDEX IF NOT EXISTS idx_otp_tokens_lookup
ON otp_tokens(identifier, identifier_type, expires_at)
WHERE verified = FALSE;

-- Cleanup expired OTPs
CREATE INDEX IF NOT EXISTS idx_otp_tokens_cleanup
ON otp_tokens(expires_at)
WHERE verified = FALSE;

-- Rate limiting queries
CREATE INDEX IF NOT EXISTS idx_otp_send_logs_rate_limit
ON otp_send_logs(identifier, identifier_type, sent_at);

-- ============================================
-- Functions
-- ============================================

-- Generate OTP and insert token
CREATE OR REPLACE FUNCTION generate_otp(
    p_identifier VARCHAR(100),
    p_identifier_type VARCHAR(20),
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE (
    success BOOLEAN,
    otp_code VARCHAR(6),
    expires_at TIMESTAMPTZ,
    message TEXT
)
LANGUAGE plpgsql AS $$
DECLARE
    v_code VARCHAR(6);
    v_expires TIMESTAMPTZ;
    v_one_minute_ago TIMESTAMPTZ;
    v_one_hour_ago TIMESTAMPTZ;
    v_minute_count INTEGER;
    v_hour_count INTEGER;
BEGIN
    v_one_minute_ago := NOW() - INTERVAL '1 minute';
    v_one_hour_ago := NOW() - INTERVAL '1 hour';

    -- Rate limit check: 1 per minute
    SELECT COUNT(*) INTO v_minute_count
    FROM otp_send_logs
    WHERE otp_send_logs.identifier = p_identifier
      AND otp_send_logs.identifier_type = p_identifier_type
      AND otp_send_logs.sent_at > v_one_minute_ago
      AND otp_send_logs.success = TRUE;

    IF v_minute_count >= 1 THEN
        RETURN QUERY SELECT FALSE, NULL::VARCHAR(6), NULL::TIMESTAMPTZ, '請稍後再試，每分鐘只能發送一次'::TEXT;
        RETURN;
    END IF;

    -- Rate limit check: 5 per hour
    SELECT COUNT(*) INTO v_hour_count
    FROM otp_send_logs
    WHERE otp_send_logs.identifier = p_identifier
      AND otp_send_logs.identifier_type = p_identifier_type
      AND otp_send_logs.sent_at > v_one_hour_ago
      AND otp_send_logs.success = TRUE;

    IF v_hour_count >= 5 THEN
        RETURN QUERY SELECT FALSE, NULL::VARCHAR(6), NULL::TIMESTAMPTZ, '已達每小時發送上限，請稍後再試'::TEXT;
        RETURN;
    END IF;

    -- Invalidate previous unused OTPs
    UPDATE otp_tokens
    SET verified = TRUE, verified_at = NOW()
    WHERE identifier = p_identifier
      AND identifier_type = p_identifier_type
      AND verified = FALSE;

    -- Generate 6-digit OTP
    v_code := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    v_expires := NOW() + INTERVAL '5 minutes';

    -- Insert new OTP
    INSERT INTO otp_tokens (identifier, identifier_type, code, expires_at, ip_address, user_agent)
    VALUES (p_identifier, p_identifier_type, v_code, v_expires, p_ip_address, p_user_agent);

    -- Log the send
    INSERT INTO otp_send_logs (identifier, identifier_type, ip_address, success)
    VALUES (p_identifier, p_identifier_type, p_ip_address, TRUE);

    RETURN QUERY SELECT TRUE, v_code, v_expires, '驗證碼已發送'::TEXT;
END;
$$;

-- Verify OTP
CREATE OR REPLACE FUNCTION verify_otp(
    p_identifier VARCHAR(100),
    p_identifier_type VARCHAR(20),
    p_code VARCHAR(6)
)
RETURNS TABLE (
    success BOOLEAN,
    member_id UUID,
    message TEXT
)
LANGUAGE plpgsql AS $$
DECLARE
    v_token_id UUID;
    v_attempts INTEGER;
    v_max_attempts INTEGER;
    v_member_id UUID;
BEGIN
    -- Find valid OTP
    SELECT id, attempts, max_attempts INTO v_token_id, v_attempts, v_max_attempts
    FROM otp_tokens
    WHERE identifier = p_identifier
      AND identifier_type = p_identifier_type
      AND verified = FALSE
      AND expires_at > NOW()
    ORDER BY date_created DESC
    LIMIT 1
    FOR UPDATE;

    IF v_token_id IS NULL THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, '驗證碼不存在或已過期'::TEXT;
        RETURN;
    END IF;

    -- Check attempts
    IF v_attempts >= v_max_attempts THEN
        UPDATE otp_tokens SET verified = TRUE WHERE id = v_token_id;
        RETURN QUERY SELECT FALSE, NULL::UUID, '驗證碼已失效，請重新獲取'::TEXT;
        RETURN;
    END IF;

    -- Verify code
    IF NOT EXISTS (SELECT 1 FROM otp_tokens WHERE id = v_token_id AND code = p_code) THEN
        UPDATE otp_tokens SET attempts = attempts + 1 WHERE id = v_token_id;
        RETURN QUERY SELECT FALSE, NULL::UUID, '驗證碼錯誤，請重新輸入'::TEXT;
        RETURN;
    END IF;

    -- Mark as verified
    UPDATE otp_tokens
    SET verified = TRUE, verified_at = NOW()
    WHERE id = v_token_id;

    -- Find member by phone or email
    IF p_identifier_type = 'phone' THEN
        SELECT id INTO v_member_id FROM members WHERE phone = p_identifier AND status = 'active' LIMIT 1;
    ELSE
        SELECT id INTO v_member_id FROM members WHERE email = p_identifier AND status = 'active' LIMIT 1;
    END IF;

    IF v_member_id IS NULL THEN
        RETURN QUERY SELECT FALSE, NULL::UUID, '找不到此會員，請確認手機號碼是否正確'::TEXT;
        RETURN;
    END IF;

    RETURN QUERY SELECT TRUE, v_member_id, '驗證成功'::TEXT;
END;
$$;

-- Cleanup expired OTPs (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_deleted INTEGER;
BEGIN
    DELETE FROM otp_tokens
    WHERE expires_at < NOW() - INTERVAL '1 hour';
    GET DIAGNOSTICS v_deleted = ROW_COUNT;

    -- Also cleanup old send logs (keep 7 days)
    DELETE FROM otp_send_logs
    WHERE sent_at < NOW() - INTERVAL '7 days';

    RETURN v_deleted;
END;
$$;

-- ============================================
-- Comments
-- ============================================
COMMENT ON TABLE otp_tokens IS 'OTP verification tokens for member authentication';
COMMENT ON TABLE otp_send_logs IS 'OTP send logs for rate limiting';
COMMENT ON FUNCTION generate_otp IS 'Generate and store OTP with rate limiting';
COMMENT ON FUNCTION verify_otp IS 'Verify OTP and return member ID';
COMMENT ON FUNCTION cleanup_expired_otps IS 'Cleanup expired OTP tokens and old logs';
