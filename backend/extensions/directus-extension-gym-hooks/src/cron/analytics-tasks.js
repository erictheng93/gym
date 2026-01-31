/**
 * Analytics Cron Tasks
 * Scheduled jobs for aggregating API usage and cleaning up old logs
 */

/**
 * Register analytics cron tasks
 * @param {Function} schedule - Directus schedule function
 * @param {object} context - Directus context
 */
export function registerAnalyticsTasks(schedule, context) {
  const { database } = context;

  /**
   * Aggregate API usage logs into hourly stats
   * Runs every hour at :05 (e.g., 00:05, 01:05, 02:05)
   */
  schedule('5 * * * *', async () => {
    try {
      // Status logged('[AnalyticsTasks] Starting hourly API usage aggregation...');

      const startTime = new Date();
      startTime.setHours(startTime.getHours() - 1, 0, 0, 0);
      const endTime = new Date(startTime);
      endTime.setHours(endTime.getHours() + 1);

      // Call aggregation function
      await database.raw(`
        SELECT aggregate_api_usage_stats($1::timestamp, $2::timestamp)
      `, [startTime.toISOString(), endTime.toISOString()]);

      // Status logged(`[AnalyticsTasks] Aggregated API usage from ${startTime.toISOString()} to ${endTime.toISOString()}`);
    } catch (error) {
      // Error logged('[AnalyticsTasks] Error aggregating API usage:', error);
    }
  });

  /**
   * Clean up old API usage logs (older than 90 days)
   * Runs daily at 02:00
   */
  schedule('0 2 * * *', async () => {
    try {
      // Status logged('[AnalyticsTasks] Starting cleanup of old API usage logs...');

      const result = await database.raw(`
        DELETE FROM api_usage_logs
        WHERE date_created < NOW() - INTERVAL '90 days'
      `);

      const deletedCount = result.rowCount || 0;
      // Status logged(`[AnalyticsTasks] Deleted ${deletedCount} old API usage log entries`);
    } catch (error) {
      // Error logged('[AnalyticsTasks] Error cleaning up old logs:', error);
    }
  });

  /**
   * Clean up old aggregated stats (older than 1 year)
   * Runs daily at 02:30
   */
  schedule('30 2 * * *', async () => {
    try {
      // Status logged('[AnalyticsTasks] Starting cleanup of old API usage stats...');

      const result = await database.raw(`
        DELETE FROM api_usage_stats
        WHERE hour_timestamp < NOW() - INTERVAL '1 year'
      `);

      const deletedCount = result.rowCount || 0;
      // Status logged(`[AnalyticsTasks] Deleted ${deletedCount} old API usage stat entries`);
    } catch (error) {
      // Error logged('[AnalyticsTasks] Error cleaning up old stats:', error);
    }
  });

  /**
   * Generate daily API usage summary report
   * Runs daily at 01:00
   */
  schedule('0 1 * * *', async () => {
    try {
      // Status logged('[AnalyticsTasks] Generating daily API usage summary...');

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date(yesterday);
      today.setDate(today.getDate() + 1);

      // Get summary stats for yesterday
      const summaryResult = await database.raw(`
        SELECT
          tenant_id,
          SUM(total_requests)::INTEGER as total_requests,
          SUM(successful_requests)::INTEGER as successful_requests,
          SUM(failed_requests)::INTEGER as failed_requests,
          AVG(avg_response_time_ms)::INTEGER as avg_response_time,
          SUM(total_request_size_bytes)::BIGINT as total_request_size,
          SUM(total_response_size_bytes)::BIGINT as total_response_size
        FROM api_usage_stats
        WHERE hour_timestamp >= $1::timestamp
          AND hour_timestamp < $2::timestamp
        GROUP BY tenant_id
      `, [yesterday.toISOString(), today.toISOString()]);

      // Status logged(`[AnalyticsTasks] Generated summary for ${summaryResult.rows.length} tenants:`);

      summaryResult.rows.forEach(row => {
        const errorRate = row.total_requests > 0
          ? ((row.failed_requests / row.total_requests) * 100).toFixed(2)
          : '0.00';

        // Status logged(`  - Tenant ${row.tenant_id}: ${row.total_requests} requests, ${errorRate}% error rate, ${row.avg_response_time}ms avg response time`);
      });

    } catch (error) {
      // Error logged('[AnalyticsTasks] Error generating daily summary:', error);
    }
  });

  /**
   * Refresh Dashboard KPIs materialized views
   * Runs every 15 minutes
   */
  schedule('*/15 * * * *', async () => {
    try {
      // Status logged('[AnalyticsTasks] Refreshing Dashboard KPIs...');

      await database.raw('SELECT refresh_dashboard_kpis()');

      // Status logged('[AnalyticsTasks] Dashboard KPIs refreshed successfully');
    } catch (error) {
      // 如果函數不存在，靜默失敗 (migration 可能尚未執行)
      if (error.message && error.message.includes('function refresh_dashboard_kpis() does not exist')) {
        // Status logged('[AnalyticsTasks] Dashboard KPIs function not found, skipping refresh');
      } else {
        console.error('[AnalyticsTasks] Error refreshing Dashboard KPIs:', error);
      }
    }
  });

  // Status logged('[AnalyticsTasks] All analytics cron tasks registered successfully');
}

export default registerAnalyticsTasks;
