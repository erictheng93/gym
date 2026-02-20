import 'dotenv/config';
import { beforeAll, afterAll } from 'vitest';

// Track whether DB is available for integration tests
export let dbAvailable = false;

// Test database connection check (non-fatal for unit tests)
beforeAll(async () => {
  try {
    const { db } = await import('../src/db/index.js');
    await db.execute('SELECT 1 as connected');
    dbAvailable = true;
    console.log('✅ Test database connected');
  } catch (error) {
    dbAvailable = false;
    console.warn('⚠️ Database not available — unit tests will still run');
  }
});

// Cleanup after all tests
afterAll(async () => {
  console.log('✅ Test cleanup complete');
});
