-- Migration: 011_member_social_auth.sql
-- Purpose: Add social login support for member-app OAuth integration
-- Providers: LINE, Google, Apple, Facebook

-- ============================================
-- 1. Add user_id to members table
-- ============================================
-- This links members to directus_users (similar to how employees have user_id)

ALTER TABLE members
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES directus_users(id) ON DELETE SET NULL;

-- Create index for fast lookup by user_id
CREATE INDEX IF NOT EXISTS idx_members_user_id ON members(user_id);

-- Unique constraint: one directus_user can only link to one member
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_user_id_unique
ON members(user_id) WHERE user_id IS NOT NULL;

-- ============================================
-- 2. Create member_social_accounts table
-- ============================================
-- Tracks social login providers linked to each member
-- Supports multiple providers per member (e.g., both LINE and Google)

CREATE TABLE IF NOT EXISTS member_social_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Foreign key to member
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,

    -- OAuth provider information
    provider VARCHAR(50) NOT NULL,           -- 'google', 'apple', 'facebook', 'line', 'phone'
    provider_user_id VARCHAR(255) NOT NULL,  -- unique ID from the OAuth provider
    provider_email VARCHAR(255),             -- email from provider (may differ from member email)
    provider_name VARCHAR(255),              -- display name from provider
    provider_avatar_url TEXT,                -- profile picture URL

    -- Account status
    is_primary BOOLEAN DEFAULT FALSE,        -- primary login method for this member
    status VARCHAR(20) DEFAULT 'active',     -- 'active', 'inactive', 'revoked'

    -- Timestamps
    linked_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ,
    date_created TIMESTAMPTZ DEFAULT NOW(),
    date_updated TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT chk_social_provider CHECK (provider IN ('google', 'apple', 'facebook', 'line', 'phone')),
    CONSTRAINT chk_social_status CHECK (status IN ('active', 'inactive', 'revoked'))
);

-- Unique constraint: one provider account can only link to one member
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_provider_user
ON member_social_accounts(provider, provider_user_id);

-- Unique constraint: one member can only have one account per provider
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_member_provider
ON member_social_accounts(member_id, provider);

-- Index for member lookup
CREATE INDEX IF NOT EXISTS idx_social_member_id ON member_social_accounts(member_id);

-- Index for provider lookup during login
CREATE INDEX IF NOT EXISTS idx_social_provider_lookup
ON member_social_accounts(provider, provider_user_id) WHERE status = 'active';

-- ============================================
-- 3. Create Member role for Directus
-- ============================================
-- This role is assigned to members who login via OAuth
-- Limited permissions - no admin access

INSERT INTO directus_roles (id, name, icon, description, app_access, admin_access)
VALUES (
    'b1000000-0000-0000-0000-000000000001',
    'Member',
    'person',
    'Gym member with limited access via member-app',
    false,
    false
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 4. Add comments for documentation
-- ============================================

COMMENT ON TABLE member_social_accounts IS 'Links gym members to OAuth social login providers (LINE, Google, Apple, Facebook)';
COMMENT ON COLUMN member_social_accounts.provider IS 'OAuth provider name: google, apple, facebook, line, or phone for OTP auth';
COMMENT ON COLUMN member_social_accounts.provider_user_id IS 'Unique user ID from the OAuth provider (external_identifier)';
COMMENT ON COLUMN member_social_accounts.is_primary IS 'Indicates the primary authentication method used for account creation';
COMMENT ON COLUMN members.user_id IS 'Links member to directus_users for authentication';

-- ============================================
-- 5. Grant permissions to the collection
-- ============================================
-- Note: Directus permissions should be configured via admin UI or API
-- The member_social_accounts table will be managed by backend hooks

