import { beforeAll, afterAll, beforeEach } from 'vitest';
import { db } from '../src/db/index.js';

// Test database connection check
beforeAll(async () => {
  try {
    // Verify database connection
    const result = await db.execute('SELECT 1 as connected');
    console.log('✅ Test database connected');
  } catch (error) {
    console.error('❌ Failed to connect to test database:', error);
    throw error;
  }
});

// Cleanup after all tests
afterAll(async () => {
  // Close database connections if needed
  console.log('✅ Test cleanup complete');
});
