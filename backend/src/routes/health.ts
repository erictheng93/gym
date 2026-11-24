import { Hono } from 'hono';
import { db } from '../db/index.js';
import { sql } from 'drizzle-orm';

const app = new Hono();

const HEALTH_CHECK_SQL = sql`SELECT 1 as ok`;
const READY_CHECK_SQL = sql`SELECT 1`;

app.get('/', async (c) => {
  try {
    const [result] = await db.execute(HEALTH_CHECK_SQL);
    const dbHealthy = result !== undefined;

    return c.json({
      status: dbHealthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        api: 'up',
        database: dbHealthy ? 'up' : 'down',
      },
      version: '2.0.0',
    });
  } catch (error) {
    return c.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        api: 'up',
        database: 'down',
      },
      error: error instanceof Error ? error.message : 'Unknown error',
    }, 503);
  }
});

app.get('/ready', async (c) => {
  try {
    await db.execute(READY_CHECK_SQL);
    return c.json({ ready: true });
  } catch {
    return c.json({ ready: false }, 503);
  }
});

app.get('/live', (c) => {
  return c.json({ alive: true });
});

export default app;
