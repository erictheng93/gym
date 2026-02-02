/**
 * RFM Segmentation Cron Job
 * Calculates member segments based on Recency, Frequency, and Monetary value
 * Runs weekly (Sunday 5:00 AM)
 */

import { db, members, contracts, payments, checkIns, branches } from '../db/index.js';
import { eq, and, gte, sql, count, sum, max } from 'drizzle-orm';

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

    // Get all active members
    const allMembers = await db
      .select({
        id: members.id,
        fullName: members.fullName,
        branchId: members.branchId,
        tenantId: members.tenantId,
      })
      .from(members)
      .where(eq(members.status, 'active'));

    console.log(`[RFM] Analyzing ${allMembers.length} members...`);

    const rfmData: MemberRFM[] = [];

    for (const member of allMembers) {
      try {
        // Recency: Days since last check-in
        const [lastCheckIn] = await db
          .select({ lastTime: max(checkIns.checkInTime) })
          .from(checkIns)
          .where(eq(checkIns.memberId, member.id));

        const lastCheckInDate = lastCheckIn?.lastTime;
        const recency = lastCheckInDate
          ? Math.floor((today.getTime() - new Date(lastCheckInDate).getTime()) / (1000 * 60 * 60 * 24))
          : 999; // Never checked in

        // Frequency: Check-ins in last 90 days
        const [frequencyResult] = await db
          .select({ count: count() })
          .from(checkIns)
          .where(
            and(
              eq(checkIns.memberId, member.id),
              gte(checkIns.checkInTime, ninetyDaysAgo)
            )
          );
        const frequency = Number(frequencyResult?.count || 0);

        // Monetary: Total payments in last year
        const [monetaryResult] = await db
          .select({ total: sum(payments.amount) })
          .from(payments)
          .leftJoin(contracts, eq(payments.contractId, contracts.id))
          .where(
            and(
              eq(contracts.memberId, member.id),
              eq(payments.paymentType, 'INCOME'),
              gte(payments.paymentDate, oneYearAgo)
            )
          );
        const monetary = Number(monetaryResult?.total || 0);

        // Calculate segment based on RFM scores
        const segment = calculateSegment(recency, frequency, monetary);

        rfmData.push({
          memberId: member.id,
          recency,
          frequency,
          monetary,
          segment,
        });

        // Update member tags with segment
        const existingTags = member.tenantId ? await getMemberTags(member.id) : [];
        const updatedTags = updateRFMTag(existingTags, segment);

        await db
          .update(members)
          .set({
            tags: updatedTags,
            updatedAt: new Date(),
          })
          .where(eq(members.id, member.id));

      } catch (error) {
        console.error(`[RFM] Failed to analyze member ${member.id}:`, error);
      }
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
