/**
 * Segmentation Cron Tasks
 * Daily RFM score calculation for member segmentation
 */

// RFM Segment definitions based on scores
const RFM_SEGMENTS = {
  CHAMPIONS: { r: [4, 5], f: [4, 5], m: [4, 5] },
  LOYAL: { r: [3, 5], f: [3, 5], m: [3, 5] },
  POTENTIAL_LOYAL: { r: [4, 5], f: [2, 3], m: [2, 3] },
  NEW_CUSTOMERS: { r: [4, 5], f: [1, 1], m: [1, 2] },
  PROMISING: { r: [3, 4], f: [1, 2], m: [1, 2] },
  NEED_ATTENTION: { r: [2, 3], f: [2, 3], m: [2, 3] },
  ABOUT_TO_SLEEP: { r: [2, 3], f: [1, 2], m: [1, 2] },
  AT_RISK: { r: [1, 2], f: [3, 5], m: [3, 5] },
  HIBERNATING: { r: [1, 2], f: [1, 2], m: [2, 3] },
  LOST: { r: [1, 1], f: [1, 2], m: [1, 2] }
};

/**
 * Determine RFM segment based on scores
 */
function determineSegment(r, f, m) {
  for (const [segment, criteria] of Object.entries(RFM_SEGMENTS)) {
    const rMatch = r >= criteria.r[0] && r <= criteria.r[1];
    const fMatch = f >= criteria.f[0] && f <= criteria.f[1];
    const mMatch = m >= criteria.m[0] && m <= criteria.m[1];

    if (rMatch && fMatch && mMatch) {
      return segment;
    }
  }
  return 'NEED_ATTENTION';
}

/**
 * Register segmentation cron tasks
 * @param {function} schedule - Cron schedule function
 * @param {object} context - Directus context { database, services, env }
 */
export function registerSegmentationTasks(schedule, context) {
  const { database, env } = context;

  // Run daily at 02:00 AM
  schedule('0 2 * * *', async () => {
    console.log('[SegmentationTask] Starting daily RFM calculation...');

    try {
      const startTime = Date.now();

      // Calculate date 12 months ago
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      const cutoffDate = twelveMonthsAgo.toISOString().split('T')[0];

      // Get all active members
      const members = await database('members')
        .where('status', 'active')
        .select('id', 'branch_id');

      if (members.length === 0) {
        console.log('[SegmentationTask] No active members to process');
        return;
      }

      const memberIds = members.map(m => m.id);
      console.log(`[SegmentationTask] Processing ${members.length} active members`);

      // Calculate Recency - days since last payment or checkin
      const recencyData = await database.raw(`
        SELECT
          m.id as member_id,
          GREATEST(
            COALESCE((SELECT MAX(payment_date) FROM payments WHERE member_id = m.id), '1970-01-01'::date),
            COALESCE((SELECT MAX(check_in_time)::date FROM checkin_logs WHERE member_id = m.id), '1970-01-01'::date)
          ) as last_activity
        FROM members m
        WHERE m.id = ANY(?)
      `, [memberIds]);

      // Calculate Frequency - checkin count in last 12 months
      const frequencyData = await database.raw(`
        SELECT
          member_id,
          COUNT(*) as checkin_count
        FROM checkin_logs
        WHERE member_id = ANY(?)
          AND check_in_time >= ?::date
        GROUP BY member_id
      `, [memberIds, cutoffDate]);

      // Calculate Monetary - total payments in last 12 months
      const monetaryData = await database.raw(`
        SELECT
          member_id,
          COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) as total_payments
        FROM payments
        WHERE member_id = ANY(?)
          AND payment_date >= ?::date
          AND status = 'PAID'
        GROUP BY member_id
      `, [memberIds, cutoffDate]);

      // Convert to maps
      const recencyMap = new Map((recencyData.rows || recencyData).map(r => [r.member_id, r.last_activity]));
      const frequencyMap = new Map((frequencyData.rows || frequencyData).map(r => [r.member_id, parseInt(r.checkin_count)]));
      const monetaryMap = new Map((monetaryData.rows || monetaryData).map(r => [r.member_id, parseFloat(r.total_payments)]));

      // Calculate quintiles for scoring
      const today = new Date();
      const recencyValues = members.map(m => {
        const lastActivity = recencyMap.get(m.id);
        if (!lastActivity || lastActivity === '1970-01-01') return 999;
        return Math.floor((today - new Date(lastActivity)) / (1000 * 60 * 60 * 24));
      }).sort((a, b) => a - b);

      const frequencyValues = members.map(m => frequencyMap.get(m.id) || 0).sort((a, b) => a - b);
      const monetaryValues = members.map(m => monetaryMap.get(m.id) || 0).sort((a, b) => a - b);

      // Calculate quintile thresholds
      const getQuintiles = (values) => {
        const n = values.length;
        if (n === 0) return [0, 0, 0, 0];
        return [
          values[Math.floor(n * 0.2)] || 0,
          values[Math.floor(n * 0.4)] || 0,
          values[Math.floor(n * 0.6)] || 0,
          values[Math.floor(n * 0.8)] || 0
        ];
      };

      const recencyQ = getQuintiles(recencyValues);
      const frequencyQ = getQuintiles(frequencyValues);
      const monetaryQ = getQuintiles(monetaryValues);

      // Score functions
      const scoreRecency = (days) => {
        if (days <= recencyQ[0]) return 5;
        if (days <= recencyQ[1]) return 4;
        if (days <= recencyQ[2]) return 3;
        if (days <= recencyQ[3]) return 2;
        return 1;
      };

      const scoreFrequency = (count) => {
        if (count >= frequencyQ[3]) return 5;
        if (count >= frequencyQ[2]) return 4;
        if (count >= frequencyQ[1]) return 3;
        if (count >= frequencyQ[0]) return 2;
        return 1;
      };

      const scoreMonetary = (amount) => {
        if (amount >= monetaryQ[3]) return 5;
        if (amount >= monetaryQ[2]) return 4;
        if (amount >= monetaryQ[1]) return 3;
        if (amount >= monetaryQ[0]) return 2;
        return 1;
      };

      // Calculate scores for each member
      const rfmRecords = members.map(member => {
        const lastActivity = recencyMap.get(member.id);
        const daysSinceActivity = lastActivity && lastActivity !== '1970-01-01'
          ? Math.floor((today - new Date(lastActivity)) / (1000 * 60 * 60 * 24))
          : 999;

        const checkins = frequencyMap.get(member.id) || 0;
        const payments = monetaryMap.get(member.id) || 0;

        const r = scoreRecency(daysSinceActivity);
        const f = scoreFrequency(checkins);
        const m = scoreMonetary(payments);

        return {
          member_id: member.id,
          branch_id: member.branch_id,
          recency_score: r,
          frequency_score: f,
          monetary_score: m,
          rfm_segment: determineSegment(r, f, m),
          last_payment_date: lastActivity !== '1970-01-01' ? lastActivity : null,
          last_checkin_date: lastActivity !== '1970-01-01' ? lastActivity : null,
          total_payments_12m: payments,
          total_checkins_12m: checkins,
          calculated_at: new Date()
        };
      });

      // Batch upsert RFM scores
      const batchSize = 100;
      let processedCount = 0;

      for (let i = 0; i < rfmRecords.length; i += batchSize) {
        const batch = rfmRecords.slice(i, i + batchSize);

        for (const record of batch) {
          await database('rfm_scores')
            .insert(record)
            .onConflict('member_id')
            .merge();
        }

        processedCount += batch.length;
      }

      // Log segment distribution
      const segmentCounts = {};
      for (const record of rfmRecords) {
        segmentCounts[record.rfm_segment] = (segmentCounts[record.rfm_segment] || 0) + 1;
      }

      const elapsed = Date.now() - startTime;
      console.log(`[SegmentationTask] Completed RFM calculation for ${processedCount} members in ${elapsed}ms`);
      console.log('[SegmentationTask] Segment distribution:', JSON.stringify(segmentCounts));

      // Store calculation log
      await database('api_usage_stats').insert({
        hour_timestamp: new Date(),
        endpoint: 'cron/segmentation',
        method: 'CRON',
        total_requests: 1,
        successful_requests: 1,
        failed_requests: 0,
        avg_response_time: elapsed,
        min_response_time: elapsed,
        max_response_time: elapsed
      }).catch(() => {
        // Ignore if stats table doesn't exist
      });

    } catch (error) {
      console.error('[SegmentationTask] RFM calculation failed:', error);

      // Log failure
      await database('api_usage_stats').insert({
        hour_timestamp: new Date(),
        endpoint: 'cron/segmentation',
        method: 'CRON',
        total_requests: 1,
        successful_requests: 0,
        failed_requests: 1,
        avg_response_time: 0,
        min_response_time: 0,
        max_response_time: 0
      }).catch(() => {});
    }
  });

  console.log('[SegmentationTask] Registered daily RFM calculation job (02:00 AM)');
}

export default registerSegmentationTasks;
