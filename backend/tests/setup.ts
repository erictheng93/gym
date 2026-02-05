import { beforeAll, afterAll } from 'vitest';

// Flag to track database connection status
export let isDbConnected = false;

// Test database connection check
beforeAll(async () => {
  try {
    // Dynamic import to avoid errors if DB env vars are missing
    const { db } = await import('../src/db/index.js');
    // Verify database connection
    await db.execute('SELECT 1 as connected');
    isDbConnected = true;
    console.log('✅ Test database connected');
  } catch (error) {
    isDbConnected = false;
    console.warn('⚠️ Test database not available - integration tests will be skipped');
    // Don't throw - allow unit tests to run
  }
});

// Cleanup after all tests
afterAll(async () => {
  // Close database connections if needed
  console.log('✅ Test cleanup complete');
});
