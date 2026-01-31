import cron from 'node-cron';
import { runBillingTasks } from './billing.js';
import { runAnalyticsTasks } from './analytics.js';
import { runContractExpiryCheck } from './contract-expiry.js';

export function initCronJobs() {
  console.log('[Cron] Initializing scheduled jobs...');

  cron.schedule('0 3 * * *', async () => {
    console.log('[Cron] Running billing tasks...');
    await runBillingTasks();
  }, {
    timezone: 'Asia/Taipei',
  });

  cron.schedule('0 4 * * *', async () => {
    console.log('[Cron] Running analytics snapshot...');
    await runAnalyticsTasks();
  }, {
    timezone: 'Asia/Taipei',
  });

  cron.schedule('0 9 * * *', async () => {
    console.log('[Cron] Running contract expiry check...');
    await runContractExpiryCheck();
  }, {
    timezone: 'Asia/Taipei',
  });

  cron.schedule('0 * * * *', async () => {
    console.log('[Cron] Running hourly cleanup...');
  }, {
    timezone: 'Asia/Taipei',
  });

  console.log('[Cron] Scheduled jobs initialized');
}
