/**
 * Segmentation Routes
 * /gym/segmentation/*
 *
 * RFM 會員分群分析 API
 */

import { InvalidPayloadError, NotFoundError } from '../utils/errors.js';

// RFM Segment definitions based on scores
const RFM_SEGMENTS = {
  CHAMPIONS: { r: [4, 5], f: [4, 5], m: [4, 5], label: '冠軍客戶', description: '最近消費、高頻率、高價值' },
  LOYAL: { r: [3, 5], f: [3, 5], m: [3, 5], label: '忠誠客戶', description: '穩定消費、活躍度高' },
  POTENTIAL_LOYAL: { r: [4, 5], f: [2, 3], m: [2, 3], label: '潛力客戶', description: '最近活躍但尚未成為忠誠客戶' },
  NEW_CUSTOMERS: { r: [4, 5], f: [1, 1], m: [1, 2], label: '新客戶', description: '最近加入的新會員' },
  PROMISING: { r: [3, 4], f: [1, 2], m: [1, 2], label: '有前景', description: '有發展潛力的客戶' },
  NEED_ATTENTION: { r: [2, 3], f: [2, 3], m: [2, 3], label: '需要關注', description: '曾經活躍但近期下降' },
  ABOUT_TO_SLEEP: { r: [2, 3], f: [1, 2], m: [1, 2], label: '即將沉睡', description: '活躍度正在下降' },
  AT_RISK: { r: [1, 2], f: [3, 5], m: [3, 5], label: '有風險', description: '曾經的優質客戶但已流失' },
  HIBERNATING: { r: [1, 2], f: [1, 2], m: [2, 3], label: '休眠中', description: '低活躍度的一般客戶' },
  LOST: { r: [1, 1], f: [1, 2], m: [1, 2], label: '已流失', description: '長時間無活動' }
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
  return 'NEED_ATTENTION'; // Default fallback
}

/**
 * Register segmentation routes
 * @param {object} router - Express router
 * @param {object} context - Directus context
 */
export function registerSegmentationRoutes(router, context) {
  const { database } = context;

  /**
   * GET /gym/segmentation/rfm
   * Get all members' RFM scores
   */
  router.get('/segmentation/rfm', async (req, res) => {
    try {
      const { branch_id, segment, limit = 100, offset = 0 } = req.query;

      let query = database('rfm_scores')
        .leftJoin('members', 'rfm_scores.member_id', 'members.id')
        .leftJoin('branches', 'rfm_scores.branch_id', 'branches.id')
        .select(
          'rfm_scores.*',
          'members.full_name as member_name',
          'members.member_code',
          'members.phone as member_phone',
          'members.email as member_email',
          'branches.name as branch_name'
        );

      if (branch_id) {
        query = query.where('rfm_scores.branch_id', branch_id);
      }
      if (segment) {
        query = query.where('rfm_scores.rfm_segment', segment.toUpperCase());
      }

      const countQuery = query.clone().count('rfm_scores.id as count').first();

      query = query
        .orderBy('rfm_scores.calculated_at', 'desc')
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      const [scores, countResult] = await Promise.all([query, countQuery]);

      res.json({
        success: true,
        data: scores,
        meta: {
          total: parseInt(countResult?.count || 0),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/segmentation/rfm/:memberId
   * Get single member's RFM score
   */
  router.get('/segmentation/rfm/:memberId', async (req, res) => {
    try {
      const { memberId } = req.params;

      const score = await database('rfm_scores')
        .leftJoin('members', 'rfm_scores.member_id', 'members.id')
        .where('rfm_scores.member_id', memberId)
        .select(
          'rfm_scores.*',
          'members.full_name as member_name',
          'members.member_code'
        )
        .first();

      if (!score) {
        throw NotFoundError('RFM score not found for this member');
      }

      // Get segment info
      const segmentInfo = RFM_SEGMENTS[score.rfm_segment] || {};

      res.json({
        success: true,
        data: {
          ...score,
          segment_label: segmentInfo.label,
          segment_description: segmentInfo.description
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/segmentation/calculate
   * Trigger RFM recalculation
   */
  router.post('/segmentation/calculate', async (req, res) => {
    try {
      const { branch_id } = req.body || {};

      // Calculate date 12 months ago
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      const cutoffDate = twelveMonthsAgo.toISOString().split('T')[0];

      // Get all active members
      let membersQuery = database('members')
        .where('status', 'active')
        .select('id', 'branch_id');

      if (branch_id) {
        membersQuery = membersQuery.where('branch_id', branch_id);
      }

      const members = await membersQuery;

      if (members.length === 0) {
        return res.json({
          success: true,
          message: 'No active members to calculate',
          data: { calculated: 0 }
        });
      }

      const memberIds = members.map(m => m.id);

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

      // Score function (recency is inverted - lower days = higher score)
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

      // Upsert RFM scores
      for (const record of rfmRecords) {
        await database('rfm_scores')
          .insert(record)
          .onConflict('member_id')
          .merge();
      }

      res.json({
        success: true,
        message: 'RFM calculation completed',
        data: {
          calculated: rfmRecords.length,
          calculated_at: new Date().toISOString()
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/segmentation/segments
   * Get segment definitions and member counts
   */
  router.get('/segmentation/segments', async (req, res) => {
    try {
      const { branch_id } = req.query;

      let countQuery = database('rfm_scores')
        .select('rfm_segment')
        .count('* as count')
        .groupBy('rfm_segment');

      if (branch_id) {
        countQuery = countQuery.where('branch_id', branch_id);
      }

      const counts = await countQuery;
      const countMap = new Map(counts.map(c => [c.rfm_segment, parseInt(c.count)]));

      const segments = Object.entries(RFM_SEGMENTS).map(([key, value]) => ({
        segment: key,
        label: value.label,
        description: value.description,
        criteria: {
          recency: value.r,
          frequency: value.f,
          monetary: value.m
        },
        member_count: countMap.get(key) || 0
      }));

      // Sort by member count descending
      segments.sort((a, b) => b.member_count - a.member_count);

      const total = segments.reduce((sum, s) => sum + s.member_count, 0);

      res.json({
        success: true,
        data: {
          segments,
          total_members: total
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/segmentation/segments/:segment/members
   * Get members in a specific segment
   */
  router.get('/segmentation/segments/:segment/members', async (req, res) => {
    try {
      const { segment } = req.params;
      const { branch_id, limit = 50, offset = 0 } = req.query;

      const segmentUpper = segment.toUpperCase();
      if (!RFM_SEGMENTS[segmentUpper]) {
        throw InvalidPayloadError(`Invalid segment. Valid segments: ${Object.keys(RFM_SEGMENTS).join(', ')}`);
      }

      let query = database('rfm_scores')
        .leftJoin('members', 'rfm_scores.member_id', 'members.id')
        .where('rfm_scores.rfm_segment', segmentUpper)
        .select(
          'rfm_scores.*',
          'members.full_name',
          'members.member_code',
          'members.phone',
          'members.email',
          'members.status as member_status'
        );

      if (branch_id) {
        query = query.where('rfm_scores.branch_id', branch_id);
      }

      const countQuery = query.clone().count('rfm_scores.id as count').first();

      query = query
        .orderBy('rfm_scores.total_payments_12m', 'desc')
        .limit(parseInt(limit))
        .offset(parseInt(offset));

      const [members, countResult] = await Promise.all([query, countQuery]);

      const segmentInfo = RFM_SEGMENTS[segmentUpper];

      res.json({
        success: true,
        data: {
          segment: segmentUpper,
          segment_label: segmentInfo.label,
          segment_description: segmentInfo.description,
          members
        },
        meta: {
          total: parseInt(countResult?.count || 0),
          limit: parseInt(limit),
          offset: parseInt(offset)
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * POST /gym/segmentation/auto-tag
   * Auto-apply tags to members based on segments
   */
  router.post('/segmentation/auto-tag', async (req, res) => {
    try {
      const { branch_id, segment } = req.body || {};

      let query = database('rfm_scores')
        .leftJoin('members', 'rfm_scores.member_id', 'members.id')
        .select('rfm_scores.member_id', 'rfm_scores.rfm_segment', 'members.tags');

      if (branch_id) {
        query = query.where('rfm_scores.branch_id', branch_id);
      }
      if (segment) {
        query = query.where('rfm_scores.rfm_segment', segment.toUpperCase());
      }

      const records = await query;
      let updated = 0;

      for (const record of records) {
        const segmentInfo = RFM_SEGMENTS[record.rfm_segment];
        if (!segmentInfo) continue;

        const currentTags = record.tags || [];
        const segmentTag = `RFM:${segmentInfo.label}`;

        // Remove old RFM tags and add new one
        const newTags = currentTags.filter(t => !t.startsWith('RFM:'));
        newTags.push(segmentTag);

        await database('members')
          .where('id', record.member_id)
          .update({ tags: JSON.stringify(newTags) });

        updated++;
      }

      res.json({
        success: true,
        message: 'Tags applied successfully',
        data: { updated }
      });
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });

  /**
   * GET /gym/segmentation/export/:segment
   * Export segment members as CSV
   */
  router.get('/segmentation/export/:segment', async (req, res) => {
    try {
      const { segment } = req.params;
      const { branch_id } = req.query;

      const segmentUpper = segment.toUpperCase();
      if (segmentUpper !== 'ALL' && !RFM_SEGMENTS[segmentUpper]) {
        throw InvalidPayloadError(`Invalid segment. Valid segments: ${Object.keys(RFM_SEGMENTS).join(', ')}, ALL`);
      }

      let query = database('rfm_scores')
        .leftJoin('members', 'rfm_scores.member_id', 'members.id')
        .leftJoin('branches', 'rfm_scores.branch_id', 'branches.id')
        .select(
          'members.member_code',
          'members.full_name',
          'members.phone',
          'members.email',
          'branches.name as branch_name',
          'rfm_scores.rfm_segment',
          'rfm_scores.recency_score',
          'rfm_scores.frequency_score',
          'rfm_scores.monetary_score',
          'rfm_scores.total_payments_12m',
          'rfm_scores.total_checkins_12m',
          'rfm_scores.last_payment_date',
          'rfm_scores.calculated_at'
        );

      if (segmentUpper !== 'ALL') {
        query = query.where('rfm_scores.rfm_segment', segmentUpper);
      }
      if (branch_id) {
        query = query.where('rfm_scores.branch_id', branch_id);
      }

      const members = await query.orderBy('rfm_scores.total_payments_12m', 'desc');

      // Convert to CSV
      const headers = [
        '會員編號', '姓名', '電話', 'Email', '分店', '分群',
        'R分數', 'F分數', 'M分數', '12月消費額', '12月打卡數', '最後付款日', '計算時間'
      ];

      const csvRows = [headers.join(',')];

      for (const m of members) {
        const segmentLabel = RFM_SEGMENTS[m.rfm_segment]?.label || m.rfm_segment;
        csvRows.push([
          m.member_code || '',
          m.full_name || '',
          m.phone || '',
          m.email || '',
          m.branch_name || '',
          segmentLabel,
          m.recency_score,
          m.frequency_score,
          m.monetary_score,
          m.total_payments_12m || 0,
          m.total_checkins_12m || 0,
          m.last_payment_date || '',
          m.calculated_at ? new Date(m.calculated_at).toISOString() : ''
        ].join(','));
      }

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="rfm_${segmentUpper.toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv"`);
      res.send('\uFEFF' + csvRows.join('\n')); // BOM for Excel compatibility
    } catch (error) {
      res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
      });
    }
  });
}

export default registerSegmentationRoutes;
