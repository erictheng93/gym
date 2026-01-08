-- ============================================
-- 操作审计日志系统 Migration
-- 版本: 021
-- 日期: 2026-01-08
-- 说明: 实现 Phase 4.3 审计日志功能
-- ============================================

BEGIN;

-- ============================================
-- 1. 审计日志表 (audit_logs)
-- ============================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date_created TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- 租户和用户信息
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,

    -- 操作信息
    action VARCHAR(50) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id UUID,

    -- 详细信息
    description TEXT,
    ip_address INET,
    user_agent TEXT,

    -- 变更数据
    old_values JSONB,
    new_values JSONB,
    diff JSONB,

    -- 请求信息
    request_method VARCHAR(10),
    request_path TEXT,
    request_params JSONB,

    -- 响应信息
    response_status INTEGER,
    response_time_ms INTEGER,

    -- 严重程度和分类
    severity VARCHAR(20) DEFAULT 'info',
    category VARCHAR(50),

    -- 额外信息
    metadata JSONB DEFAULT '{}',

    -- 约束
    CONSTRAINT valid_audit_action CHECK (action IN (
        'create', 'read', 'update', 'delete',
        'login', 'logout', 'login_failed',
        'permission_denied', 'export', 'import',
        'config_change', 'password_change', 'password_reset',
        'quota_exceeded', 'payment', 'refund'
    )),
    CONSTRAINT valid_severity CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical'))
);

-- 索引（优化查询性能）
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_employee ON audit_logs(employee_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs(date_created DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(category);

-- 复合索引（常用查询组合）
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_date ON audit_logs(tenant_id, date_created DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_date ON audit_logs(user_id, date_created DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_date ON audit_logs(resource_type, resource_id, date_created DESC);

-- GIN 索引（支持 JSONB 查询）
CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata ON audit_logs USING gin(metadata);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_params ON audit_logs USING gin(request_params);

COMMENT ON TABLE audit_logs IS '操作审计日志表（记录所有关键操作）';
COMMENT ON COLUMN audit_logs.action IS '操作类型：create, read, update, delete, login, logout 等';
COMMENT ON COLUMN audit_logs.resource_type IS '资源类型：members, contracts, employees, settings 等';
COMMENT ON COLUMN audit_logs.severity IS '严重程度：debug, info, warning, error, critical';
COMMENT ON COLUMN audit_logs.diff IS '变更对比数据（仅记录有变化的字段）';

-- ============================================
-- 2. 创建审计日志函数
-- ============================================
CREATE OR REPLACE FUNCTION create_audit_log(
    p_tenant_id UUID,
    p_user_id UUID,
    p_employee_id UUID,
    p_action VARCHAR,
    p_resource_type VARCHAR,
    p_resource_id UUID,
    p_description TEXT DEFAULT NULL,
    p_old_values JSONB DEFAULT NULL,
    p_new_values JSONB DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_audit_id UUID;
    v_diff JSONB;
BEGIN
    -- 计算变更差异
    IF p_old_values IS NOT NULL AND p_new_values IS NOT NULL THEN
        v_diff := jsonb_object_agg(
            key,
            jsonb_build_object(
                'old', p_old_values->key,
                'new', p_new_values->key
            )
        )
        FROM jsonb_each(p_new_values)
        WHERE p_old_values->key IS DISTINCT FROM p_new_values->key;
    ELSE
        v_diff := NULL;
    END IF;

    -- 插入审计日志
    INSERT INTO audit_logs (
        tenant_id,
        user_id,
        employee_id,
        action,
        resource_type,
        resource_id,
        description,
        old_values,
        new_values,
        diff,
        metadata
    ) VALUES (
        p_tenant_id,
        p_user_id,
        p_employee_id,
        p_action,
        p_resource_type,
        p_resource_id,
        p_description,
        p_old_values,
        p_new_values,
        v_diff,
        p_metadata
    )
    RETURNING id INTO v_audit_id;

    RETURN v_audit_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_audit_log IS '创建审计日志记录';

-- ============================================
-- 3. 创建视图：审计日志摘要
-- ============================================
CREATE OR REPLACE VIEW v_audit_logs_summary AS
SELECT
    al.id,
    al.date_created,
    al.tenant_id,
    t.name AS tenant_name,
    al.user_id,
    al.employee_id,
    e.full_name AS employee_name,
    al.action,
    al.resource_type,
    al.resource_id,
    al.description,
    al.severity,
    al.category,
    al.ip_address,

    -- 提取关键变更信息
    CASE
        WHEN al.diff IS NOT NULL THEN (SELECT COUNT(*) FROM jsonb_object_keys(al.diff))
        ELSE 0
    END AS changed_fields_count,

    al.response_status,
    al.response_time_ms

FROM audit_logs al
LEFT JOIN tenants t ON t.id = al.tenant_id
LEFT JOIN employees e ON e.id = al.employee_id;

COMMENT ON VIEW v_audit_logs_summary IS '审计日志摘要视图';

-- ============================================
-- 4. 审计日志统计函数
-- ============================================
CREATE OR REPLACE FUNCTION get_audit_stats(
    p_tenant_id UUID,
    p_start_date DATE DEFAULT CURRENT_DATE - INTERVAL '30 days',
    p_end_date DATE DEFAULT CURRENT_DATE
) RETURNS TABLE (
    action VARCHAR,
    total_count BIGINT,
    success_count BIGINT,
    failed_count BIGINT,
    avg_response_time_ms NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        al.action,
        COUNT(*) AS total_count,
        COUNT(*) FILTER (WHERE al.response_status >= 200 AND al.response_status < 400) AS success_count,
        COUNT(*) FILTER (WHERE al.response_status >= 400) AS failed_count,
        ROUND(AVG(al.response_time_ms)::NUMERIC, 2) AS avg_response_time_ms
    FROM audit_logs al
    WHERE al.tenant_id = p_tenant_id
      AND al.date_created >= p_start_date
      AND al.date_created <= p_end_date + INTERVAL '1 day'
    GROUP BY al.action
    ORDER BY total_count DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_audit_stats IS '获取审计日志统计数据';

-- ============================================
-- 5. 定期清理旧审计日志（可选）
-- ============================================
-- 创建函数来清理超过指定天数的审计日志
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(p_retention_days INTEGER DEFAULT 365)
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM audit_logs
    WHERE date_created < (CURRENT_DATE - (p_retention_days || ' days')::INTERVAL)
      AND severity NOT IN ('error', 'critical');

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_audit_logs IS '清理旧审计日志（保留错误和严重级别）';

-- ============================================
-- 6. 审计日志分区表（可选，用于大规模数据）
-- ============================================
-- 如果预期审计日志数据量很大，可以创建分区表
-- 这里提供注释说明，实际使用时取消注释

/*
-- 将现有表转换为分区表（需要先备份数据）
-- ALTER TABLE audit_logs RENAME TO audit_logs_old;

-- 创建分区主表
CREATE TABLE audit_logs (
    LIKE audit_logs_old INCLUDING ALL
) PARTITION BY RANGE (date_created);

-- 创建月度分区（示例）
CREATE TABLE audit_logs_2026_01 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

CREATE TABLE audit_logs_2026_02 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');

-- 迁移数据
-- INSERT INTO audit_logs SELECT * FROM audit_logs_old;
-- DROP TABLE audit_logs_old;
*/

COMMIT;
