-- Migration: 016_category_ownership.sql
-- Description: Add ownership to class_categories for branch-independent category management
-- Date: 2024-12-29

-- ============================================
-- 1. Add owner_branch_id to class_categories
-- ============================================

-- Add owner column (NULL = system-wide/preset category)
ALTER TABLE class_categories
ADD COLUMN IF NOT EXISTS owner_branch_id UUID REFERENCES branches(id) ON DELETE CASCADE;

-- Add visibility scope
ALTER TABLE class_categories
ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'owner_only'
CHECK (visibility IN ('owner_only', 'shared'));

-- owner_only: Only the owner branch can use this category
-- shared: All branches can see and use this category (for preset categories)

COMMENT ON COLUMN class_categories.owner_branch_id IS 'Branch that owns this category. NULL = system-wide preset category';
COMMENT ON COLUMN class_categories.visibility IS 'owner_only: private to owner, shared: visible to all branches';

-- ============================================
-- 2. Modify unique constraint
-- ============================================

-- Drop old unique constraint on code
ALTER TABLE class_categories
DROP CONSTRAINT IF EXISTS uq_class_category_code;

-- Create composite unique: same code allowed for different owners
-- NULL owner_branch_id (system presets) must have unique codes
CREATE UNIQUE INDEX IF NOT EXISTS uq_category_code_owner
ON class_categories (code, COALESCE(owner_branch_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ============================================
-- 3. Update existing preset categories to be shared
-- ============================================
UPDATE class_categories
SET visibility = 'shared', owner_branch_id = NULL
WHERE owner_branch_id IS NULL;

-- ============================================
-- 4. Create index for owner lookup
-- ============================================
CREATE INDEX IF NOT EXISTS idx_class_categories_owner
ON class_categories(owner_branch_id);

CREATE INDEX IF NOT EXISTS idx_class_categories_visibility
ON class_categories(visibility) WHERE visibility = 'shared';

-- ============================================
-- 5. Update get_branch_categories function
-- ============================================
CREATE OR REPLACE FUNCTION get_branch_categories(p_branch_id UUID)
RETURNS TABLE (
    id UUID,
    code VARCHAR,
    name VARCHAR,
    parent_id UUID,
    icon VARCHAR,
    color VARCHAR,
    is_featured BOOLEAN,
    sort_order INT,
    is_own BOOLEAN  -- NEW: indicates if this category belongs to the branch
)
LANGUAGE SQL STABLE AS $$
    -- Categories owned by this branch
    SELECT
        cc.id,
        cc.code,
        cc.name,
        cc.parent_id,
        cc.icon,
        cc.color,
        FALSE AS is_featured,
        cc.sort AS sort_order,
        TRUE AS is_own
    FROM class_categories cc
    WHERE cc.owner_branch_id = p_branch_id
      AND cc.is_active = TRUE
      AND cc.status = 'published'

    UNION ALL

    -- Shared categories enabled for this branch (via class_category_branches)
    SELECT
        cc.id,
        cc.code,
        COALESCE(ccb.custom_name, cc.name) AS name,
        cc.parent_id,
        cc.icon,
        cc.color,
        COALESCE(ccb.is_featured, FALSE) AS is_featured,
        COALESCE(ccb.sort_order, cc.sort) AS sort_order,
        FALSE AS is_own
    FROM class_categories cc
    JOIN class_category_branches ccb ON ccb.category_id = cc.id
    WHERE ccb.branch_id = p_branch_id
      AND ccb.is_active = TRUE
      AND ccb.status = 'published'
      AND cc.visibility = 'shared'
      AND cc.is_active = TRUE
      AND cc.status = 'published'

    ORDER BY sort_order, name;
$$;

-- ============================================
-- 6. Helper function: Create category for a branch
-- ============================================
CREATE OR REPLACE FUNCTION create_branch_category(
    p_branch_id UUID,
    p_code VARCHAR,
    p_name VARCHAR,
    p_parent_code VARCHAR DEFAULT NULL,
    p_icon VARCHAR DEFAULT NULL,
    p_color VARCHAR DEFAULT '#6366f1',
    p_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
    v_category_id UUID;
    v_parent_id UUID := NULL;
BEGIN
    -- Find parent if specified
    IF p_parent_code IS NOT NULL THEN
        SELECT id INTO v_parent_id
        FROM class_categories
        WHERE code = p_parent_code
          AND (owner_branch_id = p_branch_id OR (owner_branch_id IS NULL AND visibility = 'shared'));

        IF v_parent_id IS NULL THEN
            RAISE EXCEPTION 'Parent category "%" not found for this branch', p_parent_code;
        END IF;
    END IF;

    -- Create the category
    INSERT INTO class_categories (
        code, name, parent_id, icon, color, description,
        owner_branch_id, visibility, is_active, status
    )
    VALUES (
        p_code, p_name, v_parent_id, p_icon, p_color, p_description,
        p_branch_id, 'owner_only', TRUE, 'published'
    )
    RETURNING id INTO v_category_id;

    RETURN v_category_id;
END;
$$;

COMMENT ON FUNCTION create_branch_category IS 'Create a category owned by a specific branch';

-- ============================================
-- 7. Helper function: Get available categories for a branch
-- ============================================
CREATE OR REPLACE FUNCTION get_available_categories_for_branch(p_branch_id UUID)
RETURNS TABLE (
    id UUID,
    code VARCHAR,
    name VARCHAR,
    parent_id UUID,
    icon VARCHAR,
    color VARCHAR,
    owner_type VARCHAR,  -- 'own', 'shared', 'enabled'
    is_enabled BOOLEAN
)
LANGUAGE SQL STABLE AS $$
    -- Own categories (always available)
    SELECT
        cc.id,
        cc.code,
        cc.name,
        cc.parent_id,
        cc.icon,
        cc.color,
        'own'::VARCHAR AS owner_type,
        TRUE AS is_enabled
    FROM class_categories cc
    WHERE cc.owner_branch_id = p_branch_id
      AND cc.is_active = TRUE
      AND cc.status = 'published'

    UNION ALL

    -- Shared categories (may or may not be enabled)
    SELECT
        cc.id,
        cc.code,
        cc.name,
        cc.parent_id,
        cc.icon,
        cc.color,
        CASE WHEN ccb.id IS NOT NULL THEN 'enabled' ELSE 'shared' END::VARCHAR AS owner_type,
        ccb.id IS NOT NULL AS is_enabled
    FROM class_categories cc
    LEFT JOIN class_category_branches ccb
        ON ccb.category_id = cc.id
        AND ccb.branch_id = p_branch_id
        AND ccb.is_active = TRUE
    WHERE cc.visibility = 'shared'
      AND cc.owner_branch_id IS NULL
      AND cc.is_active = TRUE
      AND cc.status = 'published'

    ORDER BY owner_type, name;
$$;

COMMENT ON FUNCTION get_available_categories_for_branch IS 'Get all categories available to a branch (own + shared)';

-- ============================================
-- 8. Update v_category_branch_stats view
-- ============================================
DROP VIEW IF EXISTS v_category_branch_stats;
CREATE OR REPLACE VIEW v_category_branch_stats AS
SELECT
    cc.id,
    cc.code,
    cc.name,
    cc.parent_id,
    cc.icon,
    cc.color,
    cc.is_active,
    cc.owner_branch_id,
    cc.visibility,
    b.name AS owner_branch_name,
    COUNT(DISTINCT ccb.branch_id) FILTER (WHERE ccb.is_active) AS enabled_branch_count,
    COUNT(DISTINCT c.id) FILTER (WHERE c.is_active) AS class_count
FROM class_categories cc
LEFT JOIN branches b ON b.id = cc.owner_branch_id
LEFT JOIN class_category_branches ccb ON ccb.category_id = cc.id
LEFT JOIN classes c ON c.category_id = cc.id
GROUP BY cc.id, cc.code, cc.name, cc.parent_id, cc.icon, cc.color,
         cc.is_active, cc.owner_branch_id, cc.visibility, b.name;

-- ============================================
-- 9. Comments
-- ============================================
COMMENT ON FUNCTION get_branch_categories IS 'Get categories for a branch (own + enabled shared)';
