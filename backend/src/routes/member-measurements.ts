import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, bodyMeasurements } from '../db/index.js';
import { eq, and, desc, asc, count, sql } from 'drizzle-orm';
import { memberAuthMiddleware, requireMember } from '../middleware/index.js';
import type { MemberVariables } from '../middleware/index.js';

// =============================================================================
// MEMBER MEASUREMENTS ROUTES
// =============================================================================
// Body measurements tracking for member-app
// Endpoints: GET /, POST /, DELETE /:id, GET /progress, GET /latest

const app = new Hono<{ Variables: MemberVariables }>();

// Apply auth middleware
app.use('*', memberAuthMiddleware);
app.use('*', requireMember);

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const createMeasurementSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式: YYYY-MM-DD'),
  weight: z.number().min(20).max(500).optional(), // kg
  bodyFat: z.number().min(1).max(80).optional(), // %
  muscleMass: z.number().min(10).max(200).optional(), // kg
  bmi: z.number().min(10).max(60).optional(),
  source: z.enum(['MANUAL', 'INBODY', 'APPLE_HEALTH']).default('MANUAL'),
  rawData: z.record(z.unknown()).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// -----------------------------------------------------------------------------
// GET /api/member/measurements - List measurements
// -----------------------------------------------------------------------------

app.get(
  '/',
  zValidator('query', listQuerySchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const { page, limit } = c.req.valid('query');
    const offset = (page - 1) * limit;

    // Get total count
    const [{ total }] = await db
      .select({ total: count(bodyMeasurements.id) })
      .from(bodyMeasurements)
      .where(eq(bodyMeasurements.memberId, memberInfo.id));

    // Get measurements
    const measurements = await db
      .select()
      .from(bodyMeasurements)
      .where(eq(bodyMeasurements.memberId, memberInfo.id))
      .orderBy(desc(bodyMeasurements.date))
      .limit(limit)
      .offset(offset);

    return c.json({
      success: true,
      data: {
        measurements: measurements.map(m => ({
          id: m.id,
          date: m.date,
          weight: m.weight,
          bodyFat: m.bodyFat,
          muscleMass: m.muscleMass,
          bmi: m.bmi,
          source: m.source,
          createdAt: m.createdAt,
        })),
        pagination: {
          total: Number(total),
          page,
          limit,
          totalPages: Math.ceil(Number(total) / limit),
        },
      },
    });
  }
);

// -----------------------------------------------------------------------------
// POST /api/member/measurements - Create measurement
// -----------------------------------------------------------------------------

app.post(
  '/',
  zValidator('json', createMeasurementSchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const data = c.req.valid('json');

    const [measurement] = await db.insert(bodyMeasurements).values({
      memberId: memberInfo.id,
      date: data.date,
      weight: data.weight,
      bodyFat: data.bodyFat,
      muscleMass: data.muscleMass,
      bmi: data.bmi,
      source: data.source,
      rawData: data.rawData,
    }).returning();

    return c.json({
      success: true,
      message: '身體數據已記錄',
      data: {
        measurement: {
          id: measurement.id,
          date: measurement.date,
          weight: measurement.weight,
          bodyFat: measurement.bodyFat,
          muscleMass: measurement.muscleMass,
          bmi: measurement.bmi,
          source: measurement.source,
        },
      },
    }, 201);
  }
);

// -----------------------------------------------------------------------------
// DELETE /api/member/measurements/:id - Delete measurement
// -----------------------------------------------------------------------------

app.delete('/:id', async (c) => {
  const memberInfo = c.get('member')!;
  const measurementId = c.req.param('id');

  // Verify ownership
  const [existing] = await db
    .select({ id: bodyMeasurements.id })
    .from(bodyMeasurements)
    .where(and(
      eq(bodyMeasurements.id, measurementId),
      eq(bodyMeasurements.memberId, memberInfo.id),
    ))
    .limit(1);

  if (!existing) {
    return c.json({
      success: false,
      error: '記錄不存在',
      code: 'NOT_FOUND',
    }, 404);
  }

  await db.delete(bodyMeasurements).where(eq(bodyMeasurements.id, measurementId));

  return c.json({
    success: true,
    message: '記錄已刪除',
  });
});

// -----------------------------------------------------------------------------
// GET /api/member/measurements/progress - Get progress/trends
// -----------------------------------------------------------------------------

app.get('/progress', async (c) => {
  const memberInfo = c.get('member')!;
  const metric = c.req.query('metric') || 'weight'; // weight, bodyFat, muscleMass, bmi
  const period = c.req.query('period') || '90'; // days

  // Validate metric
  const validMetrics = ['weight', 'bodyFat', 'muscleMass', 'bmi'];
  if (!validMetrics.includes(metric)) {
    return c.json({
      success: false,
      error: '無效的指標',
      code: 'INVALID_METRIC',
    }, 400);
  }

  // Get all measurements within period
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(period));
  const startDateStr = startDate.toISOString().split('T')[0];

  const metricColumn = bodyMeasurements[metric as keyof typeof bodyMeasurements];

  const measurements = await db
    .select({
      date: bodyMeasurements.date,
      value: metricColumn as typeof bodyMeasurements.weight,
    })
    .from(bodyMeasurements)
    .where(and(
      eq(bodyMeasurements.memberId, memberInfo.id),
      sql`${bodyMeasurements.date} >= ${startDateStr}`,
      sql`${metricColumn} IS NOT NULL`,
    ))
    .orderBy(asc(bodyMeasurements.date));

  if (measurements.length === 0) {
    return c.json({
      success: true,
      data: {
        metric,
        period: parseInt(period),
        dataPoints: [],
        trend: null,
        change: null,
      },
    });
  }

  // Calculate trend
  const dataPoints = measurements.map(m => ({
    date: m.date,
    value: m.value,
  }));

  const firstValue = dataPoints[0].value;
  const lastValue = dataPoints[dataPoints.length - 1].value;

  let change = null;
  let changePercentage = null;
  let trend: 'up' | 'down' | 'stable' | null = null;

  if (firstValue !== null && lastValue !== null) {
    change = lastValue - firstValue;
    changePercentage = ((change / firstValue) * 100).toFixed(1);

    if (Math.abs(change) < 0.5) {
      trend = 'stable';
    } else {
      trend = change > 0 ? 'up' : 'down';
    }
  }

  // Get latest measurement for reference
  const [latest] = await db
    .select()
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.memberId, memberInfo.id))
    .orderBy(desc(bodyMeasurements.date))
    .limit(1);

  return c.json({
    success: true,
    data: {
      metric,
      period: parseInt(period),
      dataPoints,
      trend,
      change: change !== null ? Number(change.toFixed(2)) : null,
      changePercentage: changePercentage !== null ? Number(changePercentage) : null,
      latest: latest ? {
        date: latest.date,
        weight: latest.weight,
        bodyFat: latest.bodyFat,
        muscleMass: latest.muscleMass,
        bmi: latest.bmi,
      } : null,
    },
  });
});

// -----------------------------------------------------------------------------
// GET /api/member/measurements/latest - Get latest measurement
// -----------------------------------------------------------------------------

app.get('/latest', async (c) => {
  const memberInfo = c.get('member')!;

  const [measurement] = await db
    .select()
    .from(bodyMeasurements)
    .where(eq(bodyMeasurements.memberId, memberInfo.id))
    .orderBy(desc(bodyMeasurements.date))
    .limit(1);

  if (!measurement) {
    return c.json({
      success: true,
      data: { measurement: null },
    });
  }

  return c.json({
    success: true,
    data: {
      measurement: {
        id: measurement.id,
        date: measurement.date,
        weight: measurement.weight,
        bodyFat: measurement.bodyFat,
        muscleMass: measurement.muscleMass,
        bmi: measurement.bmi,
        source: measurement.source,
        createdAt: measurement.createdAt,
      },
    },
  });
});

export default app;
