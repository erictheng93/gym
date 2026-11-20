/**
 * RFM Segmentation Cron Job
 * Calculates member segments based on Recency, Frequency, and Monetary value
 * Runs weekly (Sunday 5:00 AM)
 */

import { db, members, contracts, payments, checkIns } from '../db/index.js';
import { eq, and, gte, count, sum, max } from 'drizzle-orm';

type RFMSegment = 'CHAMPION' | 'LOYAL' | 'POTENTIAL' | 'AT_RISK' | 'HIBERNATING' | 'LOST';

interface MemberRFM {
  memberId: string;
  recency: number; // Days since last check-in
  frequency: number; // Check-ins in last 90 days
  monetary: number; // Total payments in last year
  segment: RFMSegment;
}

/**
 * Calculate RFM scores and segments for all members
 */
export async function runRFMSegmentation() {
  console.log('[RFM] Starting RFM segmentation...');

  try {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const ninetyDaysAgo = new Date(today);
    ninetyDaysAgo.setDate(today.getDate() - 90);
    const oneYearAgo = new Date(today);
    oneYearAgo.setFullYear(today.getFullYear() - 1);

    // Get all active members with their current tags
    const allMembers = await db
      .select({
        id: members.id,
        fullName: members.fullName,
        branchId: members.branchId,
        tenantId: members.tenantId,
        tags: members.tags,
      })
      .from(members)
      .where(eq(members.status, 'ACTIVE'));

    console.log(`[RFM] Analyzing ${allMembers.length} members...`);

    if (allMembers.length === 0) {
      return {
        totalMembers: 0,
        segmentCounts: {} as Record<RFMSegment, number>,
      };
    }

    // Pre-aggregate Recency, Frequency, and Monetary in 3 parallel bulk queries
    // Eliminates 20,000+ sequential N+1 round-trips
    const [recencyResults, frequencyResults, monetaryResults] = await Promise.all([
      // 1. Recency: max check-in time per member
      db
        .select({
          memberId: checkIns.memberId,
          lastTime: max(checkIns.checkInTime),
        })
        .from(checkIns)
        .groupBy(checkIns.memberId),

      // 2. Frequency: check-ins count in last 90 days per member
      db
        .select({
          memberId: checkIns.memberId,
          count: count(),
        })
        .from(checkIns)
        .where(gte(checkIns.checkInTime, ninetyDaysAgo))
        .groupBy(checkIns.memberId),

      // 3. Monetary: total payments in last year per member
      db
        .select({
          memberId: contracts.memberId,
          total: sum(payments.amount),
        })
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

    // Build fast in-memory lookup maps
    const recencyMap = new Map<string, Date>();
    for (const row of recencyResults) {
      if (row.memberId && row.lastTime) {
        recencyMap.set(row.memberId, new Date(row.lastTime));
      }
    }

    const frequencyMap = new Map<string, number>();
    for (const row of frequencyResults) {
      if (row.memberId) {
        frequencyMap.set(row.memberId, Number(row.count || 0));
      }
    }

    const monetaryMap = new Map<string, number>();
    for (const row of monetaryResults) {
      if (row.memberId) {
        monetaryMap.set(row.memberId, Number(row.total || 0));
      }
    }

    const rfmData: MemberRFM[] = [];
    const updates: Array<{ id: string; tags: string[] }> = [];

    for (const member of allMembers) {
      const lastCheckInDate = recencyMap.get(member.id);
      const recency = lastCheckInDate
        ? Math.floor((today.getTime() - lastCheckInDate.getTime()) / (1000 * 60 * 60 * 24))
        : 999; // Never checked in

      const frequency = frequencyMap.get(member.id) || 0;
      const monetary = monetaryMap.get(member.id) || 0;

      const segment = calculateSegment(recency, frequency, monetary);

      rfmData.push({
        memberId: member.id,
        recency,
        frequency,
        monetary,
        segment,
      });

      // Prepare updated tags from member's loaded tags
      const existingTags = Array.isArray(member.tags) ? (member.tags as string[]) : [];
      const updatedTags = updateRFMTag(existingTags, segment);
      updates.push({ id: member.id, tags: updatedTags });
    }

    // Batch update member tags in chunks of 50 to avoid connection pool exhaustion
    const CHUNK_SIZE = 50;
    for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
      const chunk = updates.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map((item) =>
          db
            .update(members)
            .set({
              tags: item.tags,
              updatedAt: new Date(),
            })
            .where(eq(members.id, item.id))
        )
      );
    }

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
 * Get member's current tags
 */
async function getMemberTags(memberId: string): Promise<string[]> {
  const [member] = await db
    .select({ tags: members.tags })
    .from(members)
    .where(eq(members.id, memberId));

  if (!member?.tags) return [];
  if (Array.isArray(member.tags)) return member.tags as string[];
  return [];
}

/**
 * Update RFM tag in member tags
 */
function updateRFMTag(tags: string[], newSegment: RFMSegment): string[] {
  // Remove any existing RFM segment tags
  const rfmSegments = ['CHAMPION', 'LOYAL', 'POTENTIAL', 'AT_RISK', 'HIBERNATING', 'LOST'];
  const filtered = tags.filter(tag => !rfmSegments.includes(tag));

  // Add new segment tag
  return [...filtered, `RFM:${newSegment}`];
}
