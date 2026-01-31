import 'dotenv/config';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { compress } from 'hono/compress';
import { logger } from 'hono/logger';
import { authMiddleware, tenantMiddleware, apiLogger } from './middleware/index.js';
import type { AuthVariables } from './middleware/index.js';
import type { TenantVariables } from './middleware/index.js';

import authRoutes from './routes/auth.js';
import membersRoutes from './routes/members.js';
import contractsRoutes from './routes/contracts.js';
import contractLogsRoutes from './routes/contract-logs.js';
import branchesRoutes from './routes/branches.js';
import employeesRoutes from './routes/employees.js';
import jobTitlesRoutes from './routes/job-titles.js';
import membershipPlansRoutes from './routes/membership-plans.js';
import classesRoutes from './routes/classes.js';
import bookingsRoutes from './routes/bookings.js';
import checkInsRoutes from './routes/check-ins.js';
import paymentsRoutes from './routes/payments.js';
import leadsRoutes from './routes/leads.js';
import campaignsRoutes from './routes/campaigns.js';
import couponsRoutes from './routes/coupons.js';
import notificationsRoutes from './routes/notifications.js';
import dashboardRoutes from './routes/dashboard.js';
import reportsRoutes from './routes/reports.js';
import healthRoutes from './routes/health.js';
import filesRoutes from './routes/files.js';
import { initCronJobs } from './cron/index.js';

type Variables = AuthVariables & TenantVariables;

const app = new Hono<{ Variables: Variables }>();

app.use('*', cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Branch-Id', 'X-Tenant-Id'],
}));

app.use('*', secureHeaders());
app.use('*', compress());
app.use('*', logger());
app.use('*', apiLogger);

app.use('*', authMiddleware);
app.use('*', tenantMiddleware);

// Core routes
app.route('/api/auth', authRoutes);
app.route('/api/members', membersRoutes);
app.route('/api/contracts', contractsRoutes);
app.route('/api/contract-logs', contractLogsRoutes);
app.route('/api/branches', branchesRoutes);
app.route('/api/employees', employeesRoutes);
app.route('/api/job-titles', jobTitlesRoutes);
app.route('/api/membership-plans', membershipPlansRoutes);

// Class & booking routes
app.route('/api/classes', classesRoutes);
app.route('/api/bookings', bookingsRoutes);
app.route('/api/check-ins', checkInsRoutes);

// Payment routes
app.route('/api/payments', paymentsRoutes);

// Marketing routes
app.route('/api/leads', leadsRoutes);
app.route('/api/campaigns', campaignsRoutes);
app.route('/api/coupons', couponsRoutes);

// System routes
app.route('/api/notifications', notificationsRoutes);
app.route('/api/dashboard', dashboardRoutes);
app.route('/api/reports', reportsRoutes);
app.route('/api/files', filesRoutes);
app.route('/health', healthRoutes);

app.get('/', (c) => {
  return c.json({
    name: 'Gym Nexus API',
    version: '2.0.0',
    status: 'running',
  });
});

app.notFound((c) => {
  return c.json({ success: false, error: '路由不存在' }, 404);
});

app.onError((err, c) => {
  console.error('[Error]', err);
  return c.json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? '伺服器錯誤' : err.message,
  }, 500);
});

const port = Number(process.env.PORT) || 8056;

// Only start server and cron jobs if not in test mode
if (process.env.NODE_ENV !== 'test') {
  if (process.env.ENABLE_CRON !== 'false') {
    initCronJobs();
  }

  console.log(`🚀 Gym Nexus API v2 is running on http://localhost:${port}`);

  serve({
    fetch: app.fetch,
    port,
  });
}

export default app;
export type AppType = typeof app;
