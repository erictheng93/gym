import cron from 'node-cron';
import { runBillingTasks } from './billing.js';
import { runAnalyticsTasks } from './analytics.js';
import { runContractExpiryCheck } from './contract-expiry.js';
import { runRFMSegmentation } from './rfm.js';

export function initCronJobs() {
  console.log('[Cron] Initializing scheduled jobs...');

  // Daily at 3:00 AM - Billing tasks (invoice generation, usage recording)
  cron.schedule('0 3 * * *', async () => {
    console.log('[Cron] Running billing tasks...');
    await runBillingTasks();
  }, {
    timezone: 'Asia/Taipei',
  });

  // Daily at 4:00 AM - Analytics snapshot
  cron.schedule('0 4 * * *', async () => {
    console.log('[Cron] Running analytics snapshot...');
    await runAnalyticsTasks();
  }, {
    timezone: 'Asia/Taipei',
  });

  // Weekly on Sunday at 5:00 AM - RFM segmentation
  cron.schedule('0 5 * * 0', async () => {
    console.log('[Cron] Running RFM segmentation...');
    await runRFMSegmentation();
  }, {
    timezone: 'Asia/Taipei',
  });

  // Daily at 9:00 AM - Contract expiry notifications
  cron.schedule('0 9 * * *', async () => {
    console.log('[Cron] Running contract expiry check...');
    await runContractExpiryCheck();
  }, {
    timezone: 'Asia/Taipei',
  });

  // Hourly - Cleanup tasks (expired sessions, old logs)
  cron.schedule('0 * * * *', async () => {
    console.log('[Cron] Running hourly cleanup...');
    await runHourlyCleanup();
  }, {
    timezone: 'Asia/Taipei',
  });

  console.log('[Cron] Scheduled jobs initialized');
  console.log('[Cron] Schedule:');
  console.log('[Cron]   - 03:00 Daily: Billing tasks');
  console.log('[Cron]   - 04:00 Daily: Analytics snapshot');
  console.log('[Cron]   - 05:00 Sunday: RFM segmentation');
  console.log('[Cron]   - 09:00 Daily: Contract expiry check');
  console.log('[Cron]   - Every hour: Cleanup tasks');
}

/**
 * Hourly cleanup tasks
 * - Remove expired sessions
 * - Clean old OTP tokens
 */
async function runHourlyCleanup() {
  try {
    // Import here to avoid circular dependencies
    const { db, sessions, otpTokens } = await import('../db/index.js');
    const { lt } = await import('drizzle-orm');

    const now = new Date();

    // Delete expired sessions
    await db.delete(sessions).where(lt(sessions.expiresAt, now));

    // Delete expired OTP tokens older than 24 hours
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    await db.delete(otpTokens).where(lt(otpTokens.expiresAt, oneDayAgo));

    console.log('[Cleanup] Hourly cleanup completed');
  } catch (error) {
    console.error('[Cleanup] Error running hourly cleanup:', error);
  }
}
