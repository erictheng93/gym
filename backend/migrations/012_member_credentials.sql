-- Migration: 012_member_credentials.sql
-- Purpose: Create independent member authentication table
-- This separates member auth from directus_users for better security and flexibility

-- ============================================
-- 1. Create member_credentials table
-- ============================================
-- Stores authentication data separately from business data (members table)
-- Supports: password login, email/phone verification, security features

CREATE TABLE IF NOT EXISTS member_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign key to member (1:1 relationship)
    member_id UUID NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,

    -- Password authentication (optional - members can use OTP only)
    password_hash VARCHAR(255),
    password_updated_at TIMESTAMPTZ,

    -- Verification status
    email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at TIMESTAMPTZ,
    phone_verified BOOLEAN DEFAULT FALSE,
    phone_verified_at TIMESTAMPTZ,

    -- Security: failed login tracking
    failed_login_attempts INTEGER DEFAULT 0,
    last_failed_login_at TIMESTAMPTZ,
    locked_until TIMESTAMPTZ,

    -- Login history
    last_login_at TIMESTAMPTZ,
    last_login_ip INET,
    last_login_user_agent TEXT,

    -- Password reset
    password_reset_token_hash VARCHAR(255),
    password_reset_expires_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. Create indexes for performance
-- ============================================

-- Primary lookup by member_id (already unique from constraint)
CREATE INDEX IF NOT EXISTS idx_member_credentials_member_id
ON member_credentials(member_id);

-- For checking locked accounts
CREATE INDEX IF NOT EXISTS idx_member_credentials_locked
ON member_credentials(locked_until)
WHERE locked_until IS NOT NULL;

-- For password reset token lookup
CREATE INDEX IF NOT EXISTS idx_member_credentials_reset_token
ON member_credentials(password_reset_token_hash)
WHERE password_reset_token_hash IS NOT NULL;

-- ============================================
-- 3. Create trigger for updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_member_credentials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_member_credentials_updated_at ON member_credentials;
CREATE TRIGGER trigger_member_credentials_updated_at
    BEFORE UPDATE ON member_credentials
    FOR EACH ROW
    EXECUTE FUNCTION update_member_credentials_updated_at();

-- ============================================
-- 4. Add comments for documentation
-- ============================================

COMMENT ON TABLE member_credentials IS 'Stores member authentication credentials separately from business data';
COMMENT ON COLUMN member_credentials.member_id IS 'Links to members table (1:1 relationship)';
COMMENT ON COLUMN member_credentials.password_hash IS 'Argon2id hashed password (null if using OTP/OAuth only)';
COMMENT ON COLUMN member_credentials.email_verified IS 'Whether the member email has been verified';
COMMENT ON COLUMN member_credentials.phone_verified IS 'Whether the member phone has been verified via OTP';
COMMENT ON COLUMN member_credentials.failed_login_attempts IS 'Count of consecutive failed login attempts';
COMMENT ON COLUMN member_credentials.locked_until IS 'Account locked until this time (null = not locked)';

-- ============================================
-- 5. Create credentials for existing members with directus_users
-- ============================================
-- Migrate existing members who have user_id (linked to directus_users)
-- They will need to set a new password or use OTP

INSERT INTO member_credentials (member_id, phone_verified, created_at)
SELECT
    m.id,
    TRUE,  -- Assume phone is verified if they have an account
    COALESCE(m.created_at, NOW())
FROM members m
WHERE NOT EXISTS (
    SELECT 1 FROM member_credentials mc WHERE mc.member_id = m.id
)
ON CONFLICT (member_id) DO NOTHING;

-- ============================================
-- 6. Update migration 011 to fix directus_roles
-- ============================================
-- Ensure Member role exists with correct structure

INSERT INTO directus_roles (id, name, icon, description)
VALUES (
    'b1000000-0000-0000-0000-000000000001',
    'Member',
    'person',
    'Gym member with limited access via member-app'
) ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    icon = EXCLUDED.icon,
    description = EXCLUDED.description;
