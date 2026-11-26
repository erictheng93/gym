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
import usersRoutes from './routes/users.js';
import { initCronJobs } from './cron/index.js';

// Member-App routes (Phase 8a)
import memberOtpRoutes from './routes/member-otp.js';
import memberAuthRoutes from './routes/member-auth.js';
import memberProfileRoutes from './routes/member-profile.js';
import memberOAuthRoutes from './routes/member-oauth.js';

// Member-App routes (Phase 8b)
import memberPushRoutes from './routes/member-push.js';
import memberNotificationsRoutes from './routes/member-notifications.js';
import memberReviewsRoutes from './routes/member-reviews.js';
import memberCheckInRoutes from './routes/member-check-in.js';

// Member-App routes (Phase 8c)
import memberWorkoutsRoutes from './routes/member-workouts.js';
import memberGoalsRoutes from './routes/member-goals.js';
import memberMeasurementsRoutes from './routes/member-measurements.js';
import memberIssuesRoutes from './routes/member-issues.js';
import memberPaymentsRoutes from './routes/member-payments.js';
import memberContractsRoutes from './routes/member-contracts.js';

// Coach-App routes
import coachAuthRoutes from './routes/coach-auth.js';
import coachProfileRoutes from './routes/coach-profile.js';
import coachClassesRoutes from './routes/coach-classes.js';
import coachScheduleRoutes from './routes/coach-schedule.js';
import coachStudentsRoutes from './routes/coach-students.js';
import coachLessonPlansRoutes from './routes/coach-lesson-plans.js';
import coachTeachingMaterialsRoutes from './routes/coach-teaching-materials.js';

// Payment webhooks
import paymentWebhooksRoutes from './routes/payment-webhooks.js';

// PDF generation
import pdfRoutes from './routes/pdf.js';

// HR routes
import hrPayrollRoutes from './routes/hr-payroll.js';
import hrPerformanceRoutes from './routes/hr-performance.js';
import attendancesRoutes from './routes/attendances.js';
import shiftSchedulesRoutes from './routes/shift-schedules.js';

// Tenant routes
import tenantRoutes from './routes/tenant.js';
import adminTenantsRoutes from './routes/admin-tenants.js';

// Public routes (no auth required)
import brandingRoutes from './routes/branding.js';

type Variables = AuthVariables & TenantVariables;

const app = new Hono<{ Variables: Variables }>();

// Parse CORS origins from environment variable or use defaults
const rawCorsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
  : [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:3004',
      'http://localhost:3005',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:3002',
      'http://127.0.0.1:3003',
      'http://127.0.0.1:3004',
      'http://127.0.0.1:3005',
    ];

const configuredCorsOrigins = rawCorsOrigins.map(o => o.trim().replace(/\/$/, '')).filter(Boolean);

app.use('*', cors({
  origin: (origin) => {
    if (!origin) return '*';
    const normalized = origin.replace(/\/$/, '');
    // Exact match
    if (configuredCorsOrigins.includes(normalized)) return origin;
    // Wildcard pattern match (e.g., https://*.pages.dev or *.gym-nexus.com)
    for (const pattern of configuredCorsOrigins) {
      if (pattern.includes('*')) {
        const escaped = pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const regexStr = '^' + escaped.join('.*') + '$';
        if (new RegExp(regexStr, 'i').test(normalized)) return origin;
      }
    }
    // Allow any localhost/127.0.0.1/0.0.0.0 on any port in development
    if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/.test(normalized)) {
      return origin;
    }
    return undefined;
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'X-Requested-With',
    'X-Branch-Id',
    'X-Tenant-Id',
    'X-Member-Token',
    'X-Coach-Token',
    'X-CSRF-Token',
    'X-Request-Id',
    'X-API-Key',
    'X-Webhook-Signature',
    'X-Webhook-Timestamp',
    'X-Line-Signature',
    'Stripe-Signature',
    'Cache-Control',
    'Pragma',
  ],
  exposeHeaders: [
    'Content-Disposition',
    'Content-Length',
    'X-Total-Count',
    'X-Request-Id',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'Retry-After',
  ],
  maxAge: 86400,
}));

app.use('*', secureHeaders());
app.use('*', compress());
app.use('*', logger());
app.use('*', apiLogger);

// Public routes (before auth middleware)
app.route('/api/public/branding', brandingRoutes);

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
// Webhooks first: gateway callbacks carry no staff session, and paymentsRoutes'
// use('*', requireAuth) would otherwise also match /api/payments/webhook/*
app.route('/api/payments/webhook', paymentWebhooksRoutes);
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
app.route('/api/pdf', pdfRoutes);
app.route('/health', healthRoutes);

// Admin routes
app.route('/api/users', usersRoutes);
app.route('/api/admin/tenants', adminTenantsRoutes);

// HR routes
app.route('/api/payroll', hrPayrollRoutes);
app.route('/api/performance', hrPerformanceRoutes);
app.route('/api/attendances', attendancesRoutes);
app.route('/api/shift_schedules', shiftSchedulesRoutes);
app.route('/api/employee_shifts', shiftSchedulesRoutes);

// Tenant routes
app.route('/api/tenant', tenantRoutes);

// Member-App routes (authenticated via X-Member-Token)
app.route('/api/member/otp', memberOtpRoutes);
app.route('/api/member/auth', memberAuthRoutes);
app.route('/api/member/me', memberProfileRoutes);
app.route('/api/member/oauth', memberOAuthRoutes);
app.route('/api/member/push', memberPushRoutes);
app.route('/api/member/notifications', memberNotificationsRoutes);
app.route('/api/member/reviews', memberReviewsRoutes);
app.route('/api/member/check-in', memberCheckInRoutes);
app.route('/api/member/workouts', memberWorkoutsRoutes);
app.route('/api/member/goals', memberGoalsRoutes);
app.route('/api/member/measurements', memberMeasurementsRoutes);
app.route('/api/member/issues', memberIssuesRoutes);
app.route('/api/member/payments', memberPaymentsRoutes);
app.route('/api/member/contracts', memberContractsRoutes);
app.route('/api/member', memberProfileRoutes);

// Coach-App routes (authenticated via X-Coach-Token)
app.route('/api/coach/auth', coachAuthRoutes);
app.route('/api/coach/me', coachProfileRoutes);
app.route('/api/coach/classes', coachClassesRoutes);
app.route('/api/coach/schedule', coachScheduleRoutes);
app.route('/api/coach/students', coachStudentsRoutes);
app.route('/api/coach/lesson-plans', coachLessonPlansRoutes);
app.route('/api/coach/teaching-materials', coachTeachingMaterialsRoutes);

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
