/**
 * RFM Segmentation Cron Job
 * Calculates member segments based on Recency, Frequency, and Monetary value
 * Runs weekly (Sunday 5:00 AM)
 */

import { db, members, contracts, payments, checkIns } from '../db/index.js';
import { eq, and, gte, sum, max, sql } from 'drizzle-orm';

type RFMSegment = 'CHAMPION' | 'LOYAL' | 'POTENTIAL' | 'AT_RISK' | 'HIBERNATING' | 'LOST';

interface MemberRFM {
  memberId: string;
  recency: number; // Days since last check-in
  frequency: number; // Check-ins in last 90 days
  monetary: number; // Total payments in last year
  segment: RFMSegment;
}

const ALL_ACTIVE_MEMBERS_SELECT = {
  id: members.id,
  fullName: members.fullName,
  branchId: members.branchId,
  tenantId: members.tenantId,
  tags: members.tags,
};

const UPDATE_CHUNK_SIZE = 500;

/**
 * Recency (all-time last check-in) and frequency (check-ins since a cutoff)
 * come from one pass over check_ins; the cutoff is bound as a parameter.
 */
const checkInAggSelect = (since: Date) => ({
  memberId: checkIns.memberId,
  lastTime: max(checkIns.checkInTime),
  frequency: sql<number>`count(*) filter (where ${checkIns.checkInTime} >= ${since})`,
});

const MONETARY_AGG_SELECT = {
  memberId: contracts.memberId,
  total: sum(payments.amount),
};

/**
 * Calculate RFM scores and segments for all members
 */
export async function runRFMSegmentation() {
  console.log('[RFM] Starting RFM segmentation...');

  try {
    const today = new Date();
    const ninetyDaysAgo = new Date(today);
    ninetyDaysAgo.setDate(today.getDate() - 90);
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(today.getFullYear() - 1);

    // Get all active members
    const allMembers = await db
      .select(ALL_ACTIVE_MEMBERS_SELECT)
      .from(members)
      .where(eq(members.status, 'ACTIVE'));

    console.log(`[RFM] Analyzing ${allMembers.length} members...`);

    if (allMembers.length === 0) {
      return {
        totalMembers: 0,
        segmentCounts: {} as Record<RFMSegment, number>,
      };
    }

    // Batch aggregate Recency, Frequency, and Monetary metrics across all members
    const [checkInRows, monetaryRows] = await Promise.all([
      db
        .select(checkInAggSelect(ninetyDaysAgo))
        .from(checkIns)
        .groupBy(checkIns.memberId),
      db
        .select(MONETARY_AGG_SELECT)
        .from(payments)
        .innerJoin(contracts, eq(payments.contractId, contracts.id))
        .where(
          and(
            eq(payments.type, 'INCOME'),
            gte(payments.paymentDate, oneYearAgo)
          )
        )
        .groupBy(contracts.memberId),
    ]);

    const recencyMap = new Map<string, Date>();
    const frequencyMap = new Map<string, number>();
    for (const r of checkInRows) {
      if (!r.memberId) continue;
      if (r.lastTime) recencyMap.set(r.memberId, new Date(r.lastTime));
      frequencyMap.set(r.memberId, Number(r.frequency || 0));
    }

    const monetaryMap = new Map<string, number>();
    for (const m of monetaryRows) {
      if (m.memberId) {
        monetaryMap.set(m.memberId, Number(m.total || 0));
      }
    }

    const rfmData: MemberRFM[] = [];
    const pendingUpdates: Array<{ id: string; tags: string[] }> = [];

    for (const member of allMembers) {
      try {
        const lastCheckInDate = recencyMap.get(member.id);
        const recency = lastCheckInDate
          ? Math.floor((today.getTime() - lastCheckInDate.getTime()) / (1000 * 60 * 60 * 24))
          : 999;

        const frequency = frequencyMap.get(member.id) || 0;
        const monetary = monetaryMap.get(member.id) || 0;

        // Calculate segment based on RFM scores
        const segment = calculateSegment(recency, frequency, monetary);

        rfmData.push({
          memberId: member.id,
          recency,
          frequency,
          monetary,
          segment,
        });

        // Update member tags with segment only if changed
        const existingTags = Array.isArray(member.tags) ? (member.tags as string[]) : [];
        const updatedTags = updateRFMTag(existingTags, segment);
        const tagsChanged =
          existingTags.length !== updatedTags.length ||
          existingTags.some((t, i) => t !== updatedTags[i]);

        if (tagsChanged) {
          pendingUpdates.push({ id: member.id, tags: updatedTags });
        }
      } catch (error) {
        console.error(`[RFM] Failed to analyze member ${member.id}:`, error);
      }
    }

    await applyTagUpdates(pendingUpdates);

    // Generate summary statistics
    const segmentCounts = rfmData.reduce((acc, m) => {
      acc[m.segment] = (acc[m.segment] || 0) + 1;
      return acc;
    }, {} as Record<RFMSegment, number>);

    console.log('[RFM] Segmentation summary:', segmentCounts);
    console.log('[RFM] RFM segmentation completed');

    return {
      totalMembers: allMembers.length,
      segmentCounts,
    };
  } catch (error) {
    console.error('[RFM] Error running RFM segmentation:', error);
    throw error;
  }
}

/**
 * Persist changed tags in batches: one UPDATE ... FROM (VALUES ...) per chunk.
 * All values are bound as parameters.
 */
async function applyTagUpdates(updates: Array<{ id: string; tags: string[] }>) {
  for (let i = 0; i < updates.length; i += UPDATE_CHUNK_SIZE) {
    const chunk = updates.slice(i, i + UPDATE_CHUNK_SIZE);
    const rows = sql.join(
      chunk.map((u) => sql`(${u.id}::uuid, ${JSON.stringify(u.tags)}::jsonb)`),
      sql`, `
    );
    try {
      await db.execute(sql`
        UPDATE members AS m
        SET tags = v.tags, updated_at = now()
        FROM (VALUES ${rows}) AS v(id, tags)
        WHERE m.id = v.id
      `);
    } catch (error) {
      console.error(`[RFM] Failed to update tags for batch starting at ${i}:`, error);
    }
  }
}

/**
 * Calculate segment based on RFM values
 */
function calculateSegment(recency: number, frequency: number, monetary: number): RFMSegment {
  // Score each metric 1-5
  const rScore = recency <= 7 ? 5 : recency <= 14 ? 4 : recency <= 30 ? 3 : recency <= 60 ? 2 : 1;
  const fScore = frequency >= 12 ? 5 : frequency >= 8 ? 4 : frequency >= 4 ? 3 : frequency >= 1 ? 2 : 1;
  const mScore = monetary >= 50000 ? 5 : monetary >= 30000 ? 4 : monetary >= 15000 ? 3 : monetary >= 5000 ? 2 : 1;

  const avgScore = (rScore + fScore + mScore) / 3;

  // Map to segments
  if (rScore >= 4 && fScore >= 4) {
    return 'CHAMPION';
  } else if (rScore >= 3 && fScore >= 3 && mScore >= 3) {
    return 'LOYAL';
  } else if (rScore >= 3 && (fScore >= 2 || mScore >= 2)) {
    return 'POTENTIAL';
  } else if (rScore <= 2 && fScore >= 3) {
    return 'AT_RISK';
  } else if (rScore <= 2 && fScore <= 2) {
    return recency > 90 ? 'LOST' : 'HIBERNATING';
  }

  return avgScore >= 3 ? 'POTENTIAL' : 'HIBERNATING';
}


/**
 * Update RFM tag in member tags
 */
function updateRFMTag(tags: string[], newSegment: RFMSegment): string[] {
  // Remove any existing RFM segment tags
  const rfmSegments = ['CHAMPION', 'LOYAL', 'POTENTIAL', 'AT_RISK', 'HIBERNATING', 'LOST'];
  const filtered = tags.filter(tag => {
    const name = typeof tag === 'string' && tag.startsWith('RFM:') ? tag.slice(4) : tag;
    return !rfmSegments.includes(name);
  });

  // Add new segment tag
  return [...filtered, `RFM:${newSegment}`];
}
