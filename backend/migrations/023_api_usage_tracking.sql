-- Migration: API Usage Tracking
-- Purpose: Track API usage for analytics and quota management
-- Date: 2026-01-08

-- Create api_usage_logs table to store detailed API request logs
CREATE TABLE IF NOT EXISTS api_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER,
    request_size_bytes BIGINT DEFAULT 0,
    response_size_bytes BIGINT DEFAULT 0,
    ip_address INET,
    user_agent TEXT,
    error_message TEXT,
    date_created TIMESTAMP DEFAULT NOW(),
    INDEX idx_api_usage_tenant (tenant_id, date_created),
    INDEX idx_api_usage_endpoint (endpoint, date_created),
    INDEX idx_api_usage_status (status_code, date_created),
    INDEX idx_api_usage_user (user_id, date_created)
);

-- Create api_usage_stats table for aggregated statistics (updated hourly)
CREATE TABLE IF NOT EXISTS api_usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    hour_timestamp TIMESTAMP NOT NULL,
    endpoint VARCHAR(255),
    method VARCHAR(10),
    total_requests INTEGER DEFAULT 0,
    successful_requests INTEGER DEFAULT 0,
    failed_requests INTEGER DEFAULT 0,
    avg_response_time_ms INTEGER DEFAULT 0,
    total_request_size_bytes BIGINT DEFAULT 0,
    total_response_size_bytes BIGINT DEFAULT 0,
    date_created TIMESTAMP DEFAULT NOW(),
    UNIQUE (tenant_id, hour_timestamp, endpoint, method),
    INDEX idx_api_stats_tenant_hour (tenant_id, hour_timestamp),
    INDEX idx_api_stats_endpoint (endpoint, hour_timestamp)
);

-- Create function to aggregate hourly stats
CREATE OR REPLACE FUNCTION aggregate_api_usage_stats(p_start_time TIMESTAMP, p_end_time TIMESTAMP)
RETURNS void AS $$
BEGIN
    INSERT INTO api_usage_stats (
        tenant_id,
        hour_timestamp,
        endpoint,
        method,
        total_requests,
        successful_requests,
        failed_requests,
        avg_response_time_ms,
        total_request_size_bytes,
        total_response_size_bytes
    )
    SELECT
        tenant_id,
        date_trunc('hour', date_created) as hour_timestamp,
        endpoint,
        method,
        COUNT(*) as total_requests,
        COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 300) as successful_requests,
        COUNT(*) FILTER (WHERE status_code >= 400) as failed_requests,
        AVG(response_time_ms)::INTEGER as avg_response_time_ms,
        SUM(request_size_bytes) as total_request_size_bytes,
        SUM(response_size_bytes) as total_response_size_bytes
    FROM api_usage_logs
    WHERE date_created >= p_start_time AND date_created < p_end_time
        AND tenant_id IS NOT NULL
    GROUP BY tenant_id, date_trunc('hour', date_created), endpoint, method
    ON CONFLICT (tenant_id, hour_timestamp, endpoint, method)
    DO UPDATE SET
        total_requests = api_usage_stats.total_requests + EXCLUDED.total_requests,
        successful_requests = api_usage_stats.successful_requests + EXCLUDED.successful_requests,
        failed_requests = api_usage_stats.failed_requests + EXCLUDED.failed_requests,
        avg_response_time_ms = (api_usage_stats.avg_response_time_ms + EXCLUDED.avg_response_time_ms) / 2,
        total_request_size_bytes = api_usage_stats.total_request_size_bytes + EXCLUDED.total_request_size_bytes,
        total_response_size_bytes = api_usage_stats.total_response_size_bytes + EXCLUDED.total_response_size_bytes;
END;
$$ LANGUAGE plpgsql;

-- Create view for API usage summary
CREATE OR REPLACE VIEW v_api_usage_summary AS
SELECT
    tenant_id,
    DATE(hour_timestamp) as usage_date,
    SUM(total_requests) as total_requests,
    SUM(successful_requests) as successful_requests,
    SUM(failed_requests) as failed_requests,
    AVG(avg_response_time_ms)::INTEGER as avg_response_time_ms,
    SUM(total_request_size_bytes) as total_request_size_bytes,
    SUM(total_response_size_bytes) as total_response_size_bytes
FROM api_usage_stats
GROUP BY tenant_id, DATE(hour_timestamp);

-- Create view for endpoint usage ranking
CREATE OR REPLACE VIEW v_api_endpoint_ranking AS
SELECT
    tenant_id,
    endpoint,
    method,
    SUM(total_requests) as total_requests,
    SUM(successful_requests) as successful_requests,
    SUM(failed_requests) as failed_requests,
    AVG(avg_response_time_ms)::INTEGER as avg_response_time_ms,
    (SUM(failed_requests)::FLOAT / NULLIF(SUM(total_requests), 0) * 100)::DECIMAL(5,2) as error_rate
FROM api_usage_stats
WHERE hour_timestamp >= NOW() - INTERVAL '7 days'
GROUP BY tenant_id, endpoint, method
ORDER BY total_requests DESC;

-- Add comment
COMMENT ON TABLE api_usage_logs IS 'Detailed API request logs for analytics and debugging';
COMMENT ON TABLE api_usage_stats IS 'Aggregated hourly API usage statistics';
COMMENT ON FUNCTION aggregate_api_usage_stats IS 'Aggregates API usage logs into hourly stats';
