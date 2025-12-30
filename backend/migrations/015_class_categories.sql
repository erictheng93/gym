-- Migration: 015_class_categories.sql
-- Description: Dynamic class categories with multi-branch support and hierarchy
-- Date: 2024-12-29

-- ============================================
-- 1. Class Categories Table (with hierarchy)
-- ============================================
CREATE TABLE IF NOT EXISTS class_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Directus standard fields
    status VARCHAR(20) DEFAULT 'published',
    sort INTEGER,
    date_created TIMESTAMPTZ DEFAULT NOW(),
    date_updated TIMESTAMPTZ DEFAULT NOW(),
    user_created UUID REFERENCES directus_users(id),
    user_updated UUID REFERENCES directus_users(id),

    -- Category fields
    code VARCHAR(50) NOT NULL,                    -- Unique identifier: 'aerial_yoga'
    name VARCHAR(100) NOT NULL,                   -- Display name: '空中瑜珈'
    name_en VARCHAR(100),                         -- English name: 'Aerial Yoga'
    parent_id UUID REFERENCES class_categories(id) ON DELETE SET NULL,  -- Parent category

    -- UI display
    icon VARCHAR(100),                            -- Icon name or URL
    color VARCHAR(20) DEFAULT '#6366f1',          -- Theme color
    image_url VARCHAR(500),                       -- Category banner image
    description TEXT,                             -- Category description

    -- Settings
    is_active BOOLEAN DEFAULT TRUE,               -- Whether category is active
    requires_equipment BOOLEAN DEFAULT FALSE,     -- Whether special equipment is needed
    equipment_list JSONB DEFAULT '[]',            -- Required equipment list

    -- Metadata
    metadata JSONB DEFAULT '{}',                  -- Extensible metadata

    CONSTRAINT uq_class_category_code UNIQUE (code)
);

-- ============================================
-- 2. Category-Branch Association (Many-to-Many)
-- ============================================
CREATE TABLE IF NOT EXISTS class_category_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Directus standard fields
    status VARCHAR(20) DEFAULT 'published',
    sort INTEGER,
    date_created TIMESTAMPTZ DEFAULT NOW(),
    date_updated TIMESTAMPTZ DEFAULT NOW(),
    user_created UUID REFERENCES directus_users(id),
    user_updated UUID REFERENCES directus_users(id),

    -- Relationship
    category_id UUID NOT NULL REFERENCES class_categories(id) ON DELETE CASCADE,
    branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,

    -- Branch-specific settings
    is_featured BOOLEAN DEFAULT FALSE,            -- Featured category for this branch
    is_active BOOLEAN DEFAULT TRUE,               -- Active for this branch
    custom_name VARCHAR(100),                     -- Branch-specific name override
    custom_description TEXT,                      -- Branch-specific description
    sort_order INTEGER DEFAULT 0,                 -- Sort order for this branch

    CONSTRAINT uq_category_branch UNIQUE (category_id, branch_id)
);

-- ============================================
-- 3. Modify Classes Table
-- ============================================

-- Add category_id foreign key
ALTER TABLE classes
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES class_categories(id) ON DELETE SET NULL;

-- ============================================
-- 4. Indexes
-- ============================================

-- Class categories indexes
CREATE INDEX IF NOT EXISTS idx_class_categories_parent
    ON class_categories(parent_id);

CREATE INDEX IF NOT EXISTS idx_class_categories_active
    ON class_categories(is_active)
    WHERE is_active = TRUE AND status = 'published';

CREATE INDEX IF NOT EXISTS idx_class_categories_code
    ON class_categories(code);

-- Category-branch association indexes
CREATE INDEX IF NOT EXISTS idx_category_branches_branch
    ON class_category_branches(branch_id);

CREATE INDEX IF NOT EXISTS idx_category_branches_category
    ON class_category_branches(category_id);

CREATE INDEX IF NOT EXISTS idx_category_branches_featured
    ON class_category_branches(branch_id, is_featured)
    WHERE is_featured = TRUE AND is_active = TRUE;

-- Classes category lookup
CREATE INDEX IF NOT EXISTS idx_classes_category_id
    ON classes(category_id);

-- ============================================
-- 5. Seed Default Categories (migrate from hardcoded values)
-- ============================================

-- Insert root categories
INSERT INTO class_categories (code, name, name_en, icon, color, sort, description) VALUES
    ('yoga', '瑜珈', 'Yoga', 'yoga', '#8B5CF6', 10, '各種瑜珈課程，包含哈達、流動、陰瑜珈等'),
    ('pilates', '皮拉提斯', 'Pilates', 'pilates', '#EC4899', 20, '核心訓練與體態調整課程'),
    ('cardio', '有氧運動', 'Cardio', 'heart-pulse', '#EF4444', 30, '提升心肺功能的有氧課程'),
    ('strength', '肌力訓練', 'Strength Training', 'dumbbell', '#F59E0B', 40, '重量訓練與肌力提升課程'),
    ('dance', '舞蹈', 'Dance', 'music', '#10B981', 50, '各類舞蹈課程'),
    ('spinning', '飛輪', 'Spinning', 'bike', '#3B82F6', 60, '室內單車有氧課程'),
    ('boxing', '拳擊', 'Boxing', 'boxing-glove', '#DC2626', 70, '拳擊與搏擊有氧課程'),
    ('swimming', '游泳', 'Swimming', 'swim', '#06B6D4', 80, '游泳相關課程'),
    ('other', '其他', 'Other', 'sparkles', '#6B7280', 999, '其他類型課程')
ON CONFLICT (code) DO NOTHING;

-- Insert sub-categories
INSERT INTO class_categories (code, name, name_en, parent_id, icon, color, sort, requires_equipment, equipment_list, description) VALUES
    -- Yoga sub-categories
    ('hatha_yoga', '哈達瑜珈', 'Hatha Yoga',
        (SELECT id FROM class_categories WHERE code = 'yoga'),
        'yoga', '#A78BFA', 11, FALSE, '["yoga_mat"]', '基礎瑜珈，適合初學者'),
    ('vinyasa_yoga', '流動瑜珈', 'Vinyasa Yoga',
        (SELECT id FROM class_categories WHERE code = 'yoga'),
        'wind', '#A78BFA', 12, FALSE, '["yoga_mat"]', '流暢串連的動態瑜珈'),
    ('yin_yoga', '陰瑜珈', 'Yin Yoga',
        (SELECT id FROM class_categories WHERE code = 'yoga'),
        'moon', '#C4B5FD', 13, FALSE, '["yoga_mat", "yoga_block", "bolster"]', '深層伸展的靜態瑜珈'),
    ('hot_yoga', '熱瑜珈', 'Hot Yoga',
        (SELECT id FROM class_categories WHERE code = 'yoga'),
        'fire', '#F87171', 14, FALSE, '["yoga_mat", "towel"]', '在高溫環境進行的瑜珈'),
    ('aerial_yoga', '空中瑜珈', 'Aerial Yoga',
        (SELECT id FROM class_categories WHERE code = 'yoga'),
        'cloud', '#DDD6FE', 15, TRUE, '["aerial_hammock"]', '使用吊床進行的瑜珈，需要專用設備'),
    ('prenatal_yoga', '孕婦瑜珈', 'Prenatal Yoga',
        (SELECT id FROM class_categories WHERE code = 'yoga'),
        'baby', '#FDA4AF', 16, FALSE, '["yoga_mat", "bolster"]', '專為孕期設計的瑜珈課程'),

    -- Pilates sub-categories
    ('mat_pilates', '墊上皮拉提斯', 'Mat Pilates',
        (SELECT id FROM class_categories WHERE code = 'pilates'),
        'mat', '#F472B6', 21, FALSE, '["pilates_mat"]', '使用墊子進行的皮拉提斯'),
    ('reformer_pilates', 'Reformer 皮拉提斯', 'Reformer Pilates',
        (SELECT id FROM class_categories WHERE code = 'pilates'),
        'reformer', '#FB7185', 22, TRUE, '["reformer_machine"]', '使用 Reformer 器械的皮拉提斯'),
    ('cadillac_pilates', 'Cadillac 皮拉提斯', 'Cadillac Pilates',
        (SELECT id FROM class_categories WHERE code = 'pilates'),
        'cadillac', '#E879F9', 23, TRUE, '["cadillac_machine"]', '使用 Cadillac 器械的皮拉提斯'),

    -- Cardio sub-categories
    ('hiit', 'HIIT 高強度間歇', 'HIIT',
        (SELECT id FROM class_categories WHERE code = 'cardio'),
        'zap', '#F87171', 31, FALSE, '[]', '高強度間歇訓練'),
    ('step_aerobics', '階梯有氧', 'Step Aerobics',
        (SELECT id FROM class_categories WHERE code = 'cardio'),
        'stairs', '#FB923C', 32, TRUE, '["step_platform"]', '使用階梯踏板的有氧課程'),
    ('zumba', 'Zumba', 'Zumba',
        (SELECT id FROM class_categories WHERE code = 'cardio'),
        'music', '#FBBF24', 33, FALSE, '[]', '結合拉丁舞蹈的有氧課程'),

    -- Strength sub-categories
    ('body_pump', 'Body Pump', 'Body Pump',
        (SELECT id FROM class_categories WHERE code = 'strength'),
        'barbell', '#FCD34D', 41, TRUE, '["barbell", "weight_plates"]', '槓鈴有氧肌力課程'),
    ('trx', 'TRX 懸吊訓練', 'TRX Suspension',
        (SELECT id FROM class_categories WHERE code = 'strength'),
        'trx', '#FACC15', 42, TRUE, '["trx_straps"]', '使用懸吊帶的訓練'),
    ('kettlebell', '壺鈴訓練', 'Kettlebell',
        (SELECT id FROM class_categories WHERE code = 'strength'),
        'kettlebell', '#FDE047', 43, TRUE, '["kettlebell"]', '壺鈴肌力訓練'),

    -- Dance sub-categories
    ('jazz_dance', '爵士舞', 'Jazz Dance',
        (SELECT id FROM class_categories WHERE code = 'dance'),
        'music-2', '#34D399', 51, FALSE, '[]', '爵士舞蹈課程'),
    ('hip_hop', '街舞', 'Hip Hop',
        (SELECT id FROM class_categories WHERE code = 'dance'),
        'music-4', '#4ADE80', 52, FALSE, '[]', '嘻哈街舞課程'),
    ('belly_dance', '肚皮舞', 'Belly Dance',
        (SELECT id FROM class_categories WHERE code = 'dance'),
        'sparkles', '#86EFAC', 53, FALSE, '[]', '中東肚皮舞課程'),
    ('barre', '芭蕾提斯', 'Barre',
        (SELECT id FROM class_categories WHERE code = 'dance'),
        'barre', '#BBF7D0', 54, TRUE, '["barre"]', '結合芭蕾與皮拉提斯的課程')
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- 6. Migrate existing class.category to category_id
-- ============================================
UPDATE classes c
SET category_id = cc.id
FROM class_categories cc
WHERE LOWER(c.category) = LOWER(cc.code)
  AND c.category_id IS NULL;

-- ============================================
-- 7. Helper Functions
-- ============================================

-- Get category path (breadcrumb)
CREATE OR REPLACE FUNCTION get_category_path(p_category_id UUID)
RETURNS TABLE (
    id UUID,
    code VARCHAR,
    name VARCHAR,
    level INT
)
LANGUAGE SQL STABLE AS $$
    WITH RECURSIVE category_tree AS (
        SELECT
            cc.id,
            cc.code,
            cc.name,
            cc.parent_id,
            0 AS level
        FROM class_categories cc
        WHERE cc.id = p_category_id

        UNION ALL

        SELECT
            c.id,
            c.code,
            c.name,
            c.parent_id,
            ct.level + 1
        FROM class_categories c
        JOIN category_tree ct ON c.id = ct.parent_id
    )
    SELECT id, code, name, level
    FROM category_tree
    ORDER BY level DESC;
$$;

-- Get all descendants of a category
CREATE OR REPLACE FUNCTION get_category_descendants(p_category_id UUID)
RETURNS TABLE (
    id UUID,
    code VARCHAR,
    name VARCHAR,
    level INT
)
LANGUAGE SQL STABLE AS $$
    WITH RECURSIVE category_tree AS (
        SELECT
            cc.id,
            cc.code,
            cc.name,
            0 AS level
        FROM class_categories cc
        WHERE cc.id = p_category_id

        UNION ALL

        SELECT
            c.id,
            c.code,
            c.name,
            ct.level + 1
        FROM class_categories c
        JOIN category_tree ct ON c.parent_id = ct.id
    )
    SELECT id, code, name, level
    FROM category_tree
    WHERE level > 0
    ORDER BY level, name;
$$;

-- Get categories available for a branch (with hierarchy)
CREATE OR REPLACE FUNCTION get_branch_categories(p_branch_id UUID)
RETURNS TABLE (
    id UUID,
    code VARCHAR,
    name VARCHAR,
    parent_id UUID,
    icon VARCHAR,
    color VARCHAR,
    is_featured BOOLEAN,
    sort_order INT
)
LANGUAGE SQL STABLE AS $$
    SELECT
        cc.id,
        cc.code,
        COALESCE(ccb.custom_name, cc.name) AS name,
        cc.parent_id,
        cc.icon,
        cc.color,
        COALESCE(ccb.is_featured, FALSE) AS is_featured,
        COALESCE(ccb.sort_order, cc.sort) AS sort_order
    FROM class_categories cc
    JOIN class_category_branches ccb ON ccb.category_id = cc.id
    WHERE ccb.branch_id = p_branch_id
      AND ccb.is_active = TRUE
      AND ccb.status = 'published'
      AND cc.is_active = TRUE
      AND cc.status = 'published'
    ORDER BY sort_order, cc.name;
$$;

-- Enable category for a branch
CREATE OR REPLACE FUNCTION enable_category_for_branch(
    p_category_id UUID,
    p_branch_id UUID,
    p_is_featured BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
    v_id UUID;
BEGIN
    INSERT INTO class_category_branches (category_id, branch_id, is_featured, is_active)
    VALUES (p_category_id, p_branch_id, p_is_featured, TRUE)
    ON CONFLICT (category_id, branch_id)
    DO UPDATE SET
        is_active = TRUE,
        is_featured = COALESCE(EXCLUDED.is_featured, class_category_branches.is_featured),
        date_updated = NOW()
    RETURNING id INTO v_id;

    RETURN v_id;
END;
$$;

-- Enable all categories for a branch (convenience function)
CREATE OR REPLACE FUNCTION enable_all_categories_for_branch(p_branch_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    INSERT INTO class_category_branches (category_id, branch_id, is_active)
    SELECT cc.id, p_branch_id, TRUE
    FROM class_categories cc
    WHERE cc.is_active = TRUE
      AND cc.status = 'published'
    ON CONFLICT (category_id, branch_id) DO NOTHING;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

-- ============================================
-- 8. Views for easy querying
-- ============================================

-- View: Categories with branch count
CREATE OR REPLACE VIEW v_category_branch_stats AS
SELECT
    cc.id,
    cc.code,
    cc.name,
    cc.parent_id,
    cc.icon,
    cc.color,
    cc.is_active,
    COUNT(DISTINCT ccb.branch_id) FILTER (WHERE ccb.is_active) AS active_branch_count,
    COUNT(DISTINCT c.id) FILTER (WHERE c.is_active) AS class_count
FROM class_categories cc
LEFT JOIN class_category_branches ccb ON ccb.category_id = cc.id
LEFT JOIN classes c ON c.category_id = cc.id
GROUP BY cc.id, cc.code, cc.name, cc.parent_id, cc.icon, cc.color, cc.is_active;

-- View: Category tree (flattened with path)
CREATE OR REPLACE VIEW v_category_tree AS
WITH RECURSIVE tree AS (
    SELECT
        id,
        code,
        name,
        parent_id,
        icon,
        color,
        is_active,
        sort,
        name::TEXT AS path,
        1 AS depth,
        ARRAY[sort, 0, 0, 0] AS sort_path
    FROM class_categories
    WHERE parent_id IS NULL

    UNION ALL

    SELECT
        c.id,
        c.code,
        c.name,
        c.parent_id,
        c.icon,
        c.color,
        c.is_active,
        c.sort,
        (t.path || ' > ' || c.name)::TEXT,
        t.depth + 1,
        t.sort_path[1:t.depth] || c.sort || ARRAY_FILL(0, ARRAY[4 - t.depth - 1])
    FROM class_categories c
    JOIN tree t ON c.parent_id = t.id
)
SELECT * FROM tree ORDER BY sort_path;

-- ============================================
-- 9. Comments
-- ============================================
COMMENT ON TABLE class_categories IS 'Dynamic class categories with hierarchy support';
COMMENT ON TABLE class_category_branches IS 'Many-to-many: which categories are available at which branches';
COMMENT ON COLUMN classes.category_id IS 'Foreign key to class_categories (replaces hardcoded category)';
COMMENT ON FUNCTION get_category_path IS 'Get category breadcrumb path from leaf to root';
COMMENT ON FUNCTION get_category_descendants IS 'Get all child categories recursively';
COMMENT ON FUNCTION get_branch_categories IS 'Get all active categories for a specific branch';
COMMENT ON FUNCTION enable_category_for_branch IS 'Enable a category for a branch (upsert)';
COMMENT ON FUNCTION enable_all_categories_for_branch IS 'Enable all active categories for a branch';

-- ============================================
-- 10. Note: Keep original category column for backward compatibility
-- ============================================
-- The original classes.category VARCHAR column is preserved for backward compatibility.
-- New code should use category_id instead.
-- Once migration is complete and all code is updated, you can:
-- 1. ALTER TABLE classes DROP CONSTRAINT chk_class_category;
-- 2. ALTER TABLE classes DROP COLUMN category;
