import { Hono } from 'hono';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { db } from '../db/index.js';
import { performanceReviews, kpiTemplates, employees, jobTitles, branches } from '../db/schema.js';
import { authMiddleware, requireAuth } from '../middleware/index.js';
import type { AuthVariables } from '../middleware/index.js';

// =============================================================================
// HR PERFORMANCE ROUTES
// =============================================================================
// Endpoints for managing performance reviews and KPI templates

const app = new Hono<{ Variables: AuthVariables }>();

// Apply auth middleware
app.use('*', authMiddleware, requireAuth);

const REVIEW_RETURNING = {
  id: performanceReviews.id,
  employeeId: performanceReviews.employeeId,
  reviewerId: performanceReviews.reviewerId,
  reviewPeriod: performanceReviews.reviewPeriod,
  reviewType: performanceReviews.reviewType,
  status: performanceReviews.status,
  overallScore: performanceReviews.overallScore,
  reviewerComments: performanceReviews.reviewerComments,
  improvementPlan: performanceReviews.improvementPlan,
  approvedBy: performanceReviews.approvedBy,
  approvedAt: performanceReviews.approvedAt,
  submittedAt: performanceReviews.submittedAt,
  reviewedAt: performanceReviews.reviewedAt,
  kpiData: performanceReviews.kpiData,
  createdAt: performanceReviews.createdAt,
  updatedAt: performanceReviews.updatedAt,
};

const KPI_TEMPLATE_RETURNING = {
  id: kpiTemplates.id,
  name: kpiTemplates.name,
  description: kpiTemplates.description,
  jobTitleId: kpiTemplates.jobTitleId,
  reviewType: kpiTemplates.reviewType,
  kpis: kpiTemplates.kpis,
  isDefault: kpiTemplates.isDefault,
  isActive: kpiTemplates.isActive,
  createdBy: kpiTemplates.createdBy,
  createdAt: kpiTemplates.createdAt,
  updatedAt: kpiTemplates.updatedAt,
};

const PERFORMANCE_REVIEW_SELECT = {
  id: performanceReviews.id,
  employee_id: performanceReviews.employeeId,
  reviewer_id: performanceReviews.reviewerId,
  review_period: performanceReviews.reviewPeriod,
  review_type: performanceReviews.reviewType,
  kpi_data: performanceReviews.kpiData,
  score: performanceReviews.overallScore,
  comments: performanceReviews.reviewerComments,
  improvement_plan: performanceReviews.improvementPlan,
  status: performanceReviews.status,
  reviewed_at: performanceReviews.reviewedAt,
  date_created: performanceReviews.createdAt,
};

const REVIEW_EMPLOYEE_SELECT = {
  id: employees.id,
  full_name: employees.fullName,
  employee_code: employees.employeeCode,
  job_title_id: employees.jobTitleId,
  branch_id: employees.branchId,
  job_title_name: jobTitles.name,
  branch_name: branches.name,
};

const KPI_TEMPLATE_SELECT = {
  id: kpiTemplates.id,
  name: kpiTemplates.name,
  description: kpiTemplates.description,
  job_title_id: kpiTemplates.jobTitleId,
  review_type: kpiTemplates.reviewType,
  kpis: kpiTemplates.kpis,
  is_default: kpiTemplates.isDefault,
  is_active: kpiTemplates.isActive,
  date_created: kpiTemplates.createdAt,
};

// -----------------------------------------------------------------------------
// GET /reviews - List performance reviews with filters
// -----------------------------------------------------------------------------

app.get('/reviews', async (c) => {
  const {
    employee_id,
    reviewer_id,
    status,
    review_type,
    period,
    limit = '20',
    offset = '0'
  } = c.req.query();

  const conditions = [];

  if (employee_id) {
    conditions.push(eq(performanceReviews.employeeId, employee_id));
  }

  if (reviewer_id) {
    conditions.push(eq(performanceReviews.reviewerId, reviewer_id));
  }

  if (status) {
    conditions.push(eq(performanceReviews.status, status as 'DRAFT' | 'SUBMITTED' | 'REVIEWED' | 'APPROVED'));
  }

  if (review_type) {
    conditions.push(eq(performanceReviews.reviewType, review_type));
  }

  if (period) {
    conditions.push(eq(performanceReviews.reviewPeriod, period));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [reviews, countResult] = await Promise.all([
    db.select(PERFORMANCE_REVIEW_SELECT)
      .from(performanceReviews)
      .where(whereClause)
      .orderBy(desc(performanceReviews.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset)),
    db.select({ count: sql<number>`count(*)` })
      .from(performanceReviews)
      .where(whereClause),
  ]);

  // Fetch employee and reviewer details with joined job title and branch
  const employeeIds = [...new Set([
    ...reviews.map(r => r.employee_id),
    ...reviews.filter(r => r.reviewer_id).map(r => r.reviewer_id as string),
  ])];

  const employeeDetails = employeeIds.length > 0
    ? await db.select(REVIEW_EMPLOYEE_SELECT)
        .from(employees)
        .leftJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
        .leftJoin(branches, eq(employees.branchId, branches.id))
        .where(inArray(employees.id, employeeIds))
    : [];

  const employeeMap = new Map(employeeDetails.map(e => [e.id, {
    id: e.id,
    full_name: e.full_name,
    employee_code: e.employee_code,
    job_title_id: e.job_title_id,
    branch_id: e.branch_id,
    job_title: e.job_title_id && e.job_title_name ? { id: e.job_title_id, name: e.job_title_name } : undefined,
    branch: e.branch_id && e.branch_name ? { id: e.branch_id, name: e.branch_name } : undefined,
  }]));

  const enrichedReviews = reviews.map(r => ({
    ...r,
    employee: employeeMap.get(r.employee_id),
    reviewer: r.reviewer_id ? employeeMap.get(r.reviewer_id) : undefined,
  }));

  return c.json({
    success: true,
    data: enrichedReviews,
    meta: { total: countResult[0]?.count || 0 },
  });
});

// -----------------------------------------------------------------------------
// GET /reviews/:id - Get single performance review
// -----------------------------------------------------------------------------

app.get('/reviews/:id', async (c) => {
  const id = c.req.param('id');

  const review = await db.select(PERFORMANCE_REVIEW_SELECT)
    .from(performanceReviews)
    .where(eq(performanceReviews.id, id))
    .limit(1);

  if (review.length === 0) {
    return c.json({ success: false, error: '找不到績效考核記錄' }, 404);
  }

  // Fetch employee details with joined job title and branch
  const employeeIds = [review[0].employee_id];
  if (review[0].reviewer_id) employeeIds.push(review[0].reviewer_id);

  const employeeDetails = await db.select(REVIEW_EMPLOYEE_SELECT)
    .from(employees)
    .leftJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
    .leftJoin(branches, eq(employees.branchId, branches.id))
    .where(inArray(employees.id, employeeIds));

  const employeeMap = new Map(employeeDetails.map(e => [e.id, {
    id: e.id,
    full_name: e.full_name,
    employee_code: e.employee_code,
    job_title_id: e.job_title_id,
    branch_id: e.branch_id,
    job_title: e.job_title_id && e.job_title_name ? { id: e.job_title_id, name: e.job_title_name } : undefined,
    branch: e.branch_id && e.branch_name ? { id: e.branch_id, name: e.branch_name } : undefined,
  }]));

  const enrichedReview = {
    ...review[0],
    employee: employeeMap.get(review[0].employee_id),
    reviewer: review[0].reviewer_id ? employeeMap.get(review[0].reviewer_id) : undefined,
  };

  return c.json({ success: true, data: enrichedReview });
});

// -----------------------------------------------------------------------------
// POST /reviews - Create performance review
// -----------------------------------------------------------------------------

app.post('/reviews', async (c) => {
  const body = await c.req.json();
  const { employee_id, review_period, review_type, template_id, score, comments } = body;

  if (!employee_id || !review_period || !review_type) {
    return c.json({
      success: false,
      error: '缺少必要欄位: employee_id, review_period, review_type'
    }, 400);
  }

  // If template_id is provided, fetch KPIs from template
  let kpiData: unknown[] = [];
  if (template_id) {
    const template = await db.select({ kpis: kpiTemplates.kpis })
      .from(kpiTemplates)
      .where(eq(kpiTemplates.id, template_id))
      .limit(1);

    if (template.length > 0 && template[0].kpis) {
      kpiData = template[0].kpis as unknown[];
    }
  }

  const [created] = await db.insert(performanceReviews)
    .values({
      employeeId: employee_id,
      reviewPeriod: review_period,
      reviewType: review_type,
      kpiData,
      overallScore: score?.toString(),
      reviewerComments: comments,
      status: 'DRAFT',
    })
    .returning(REVIEW_RETURNING);

  return c.json({ success: true, data: created }, 201);
});

// -----------------------------------------------------------------------------
// PATCH /reviews/:id - Update performance review
// -----------------------------------------------------------------------------

app.patch('/reviews/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  const updateData: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (body.kpi_data !== undefined) updateData.kpiData = body.kpi_data;
  if (body.score !== undefined) updateData.overallScore = body.score?.toString();
  if (body.comments !== undefined) updateData.reviewerComments = body.comments;
  if (body.improvement_plan !== undefined) updateData.improvementPlan = body.improvement_plan;
  if (body.reviewer_id !== undefined) updateData.reviewerId = body.reviewer_id;

  const [updated] = await db.update(performanceReviews)
    .set(updateData)
    .where(eq(performanceReviews.id, id))
    .returning(REVIEW_RETURNING);

  if (!updated) {
    return c.json({ success: false, error: '找不到績效考核記錄' }, 404);
  }

  return c.json({ success: true, data: updated });
});

// -----------------------------------------------------------------------------
// POST /reviews/:id/submit - Submit review for approval
// -----------------------------------------------------------------------------

app.post('/reviews/:id/submit', async (c) => {
  const id = c.req.param('id');

  // Fast-path atomic update if in DRAFT status
  const [updated] = await db.update(performanceReviews)
    .set({
      status: 'SUBMITTED',
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(and(
      eq(performanceReviews.id, id),
      eq(performanceReviews.status, 'DRAFT')
    ))
    .returning(REVIEW_RETURNING);

  if (updated) {
    return c.json({ success: true, data: updated });
  }

  // Discriminate between 404 and 400
  const existing = await db.select({ id: performanceReviews.id })
    .from(performanceReviews)
    .where(eq(performanceReviews.id, id))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ success: false, error: '找不到績效考核記錄' }, 404);
  }

  return c.json({ success: false, error: '只有草稿狀態才能提交' }, 400);
});

// -----------------------------------------------------------------------------
// POST /reviews/:id/approve - Approve performance review
// -----------------------------------------------------------------------------

app.post('/reviews/:id/approve', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  // Concurrently fetch existing review and approver's employee record
  const [existingList, approverEmployeeList] = await Promise.all([
    db.select({ id: performanceReviews.id, status: performanceReviews.status })
      .from(performanceReviews)
      .where(eq(performanceReviews.id, id))
      .limit(1),
    user?.id
      ? db.select({ id: employees.id })
          .from(employees)
          .where(eq(employees.userId, user.id))
          .limit(1)
      : Promise.resolve([]),
  ]);

  if (existingList.length === 0) {
    return c.json({ success: false, error: '找不到績效考核記錄' }, 404);
  }

  if (existingList[0].status !== 'SUBMITTED') {
    return c.json({ success: false, error: '只有已提交狀態才能核准' }, 400);
  }

  const approverId = approverEmployeeList.length > 0 ? approverEmployeeList[0].id : null;

  const [updated] = await db.update(performanceReviews)
    .set({
      status: 'APPROVED',
      approvedBy: approverId,
      approvedAt: new Date(),
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(performanceReviews.id, id))
    .returning(REVIEW_RETURNING);

  return c.json({ success: true, data: updated });
});

// -----------------------------------------------------------------------------
// POST /reviews/:id/reject - Reject performance review
// -----------------------------------------------------------------------------

app.post('/reviews/:id/reject', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { reason } = body;

  const existing = await db.select({
    id: performanceReviews.id,
    status: performanceReviews.status,
    reviewerComments: performanceReviews.reviewerComments,
  })
    .from(performanceReviews)
    .where(eq(performanceReviews.id, id))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ success: false, error: '找不到績效考核記錄' }, 404);
  }

  if (existing[0].status !== 'SUBMITTED') {
    return c.json({ success: false, error: '只有已提交狀態才能退回' }, 400);
  }

  const [updated] = await db.update(performanceReviews)
    .set({
      status: 'DRAFT',
      reviewerComments: reason ? `退回原因: ${reason}` : existing[0].reviewerComments,
      updatedAt: new Date(),
    })
    .where(eq(performanceReviews.id, id))
    .returning(REVIEW_RETURNING);

  return c.json({ success: true, data: updated });
});

// -----------------------------------------------------------------------------
// GET /kpi-templates - List KPI templates
// -----------------------------------------------------------------------------

app.get('/kpi-templates', async (c) => {
  const templates = await db.select(KPI_TEMPLATE_SELECT)
    .from(kpiTemplates)
    .where(eq(kpiTemplates.isActive, true))
    .orderBy(desc(kpiTemplates.createdAt));

  return c.json({ success: true, data: templates });
});

// -----------------------------------------------------------------------------
// POST /kpi-templates - Create KPI template
// -----------------------------------------------------------------------------

app.post('/kpi-templates', async (c) => {
  const body = await c.req.json();
  const { name, description, job_title_id, review_type, kpis, is_default } = body;
  const user = c.get('user');

  if (!name || !kpis) {
    return c.json({ success: false, error: '缺少必要欄位: name, kpis' }, 400);
  }

  // Find creator's employee record
  let createdBy: string | null = null;
  if (user?.id) {
    const creatorEmployee = await db.select({ id: employees.id })
      .from(employees)
      .where(eq(employees.userId, user.id))
      .limit(1);

    if (creatorEmployee.length > 0) {
      createdBy = creatorEmployee[0].id;
    }
  }

  const [created] = await db.insert(kpiTemplates)
    .values({
      name,
      description,
      jobTitleId: job_title_id,
      reviewType: review_type || 'QUARTERLY',
      kpis,
      isDefault: is_default || false,
      createdBy,
    })
    .returning(KPI_TEMPLATE_RETURNING);

  return c.json({ success: true, data: created }, 201);
});

// -----------------------------------------------------------------------------
// DELETE /kpi-templates/:id - Delete KPI template (soft delete)
// -----------------------------------------------------------------------------

app.delete('/kpi-templates/:id', async (c) => {
  const id = c.req.param('id');

  const [updated] = await db.update(kpiTemplates)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(kpiTemplates.id, id))
    .returning({ id: kpiTemplates.id });

  if (!updated) {
    return c.json({ success: false, error: '找不到 KPI 範本' }, 404);
  }

  return c.json({ success: true });
});

// -----------------------------------------------------------------------------
// GET /team-dashboard - Team performance dashboard
// -----------------------------------------------------------------------------

app.get('/team-dashboard', async (c) => {
  const { period } = c.req.query();
  // Note: branch_id filtering would require joining with employees table
  // For now we filter by period only

  const conditions = [];
  if (period) {
    conditions.push(eq(performanceReviews.reviewPeriod, period));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const approvedWhere = and(
    eq(performanceReviews.status, 'APPROVED'),
    whereClause || sql`true`,
  );

  // Parallelize:
  // 1. status counts
  // 2. average score & score distribution in a single combined query
  // 3. top performers with left-joined employee names (no separate query)
  const [stats, [scoreStats], topPerformers] = await Promise.all([
    db.select({
      status: performanceReviews.status,
      count: sql<number>`count(*)`,
    })
      .from(performanceReviews)
      .where(whereClause)
      .groupBy(performanceReviews.status),

    db.select({
      avg: sql<string>`avg(${performanceReviews.overallScore})`,
      excellent: sql<number>`count(*) filter (where ${performanceReviews.overallScore} >= 90)`,
      good: sql<number>`count(*) filter (where ${performanceReviews.overallScore} >= 70 and ${performanceReviews.overallScore} < 90)`,
      poor: sql<number>`count(*) filter (where ${performanceReviews.overallScore} < 70)`,
    })
      .from(performanceReviews)
      .where(approvedWhere),

    db.select({
      id: performanceReviews.employeeId,
      full_name: employees.fullName,
      score: performanceReviews.overallScore,
    })
      .from(performanceReviews)
      .leftJoin(employees, eq(performanceReviews.employeeId, employees.id))
      .where(approvedWhere)
      .orderBy(desc(performanceReviews.overallScore))
      .limit(5),
  ]);

  const statusMap = new Map(stats.map(s => [s.status, Number(s.count)]));
  const totalReviews = Array.from(statusMap.values()).reduce((sum, count) => sum + count, 0);

  return c.json({
    success: true,
    data: {
      total_reviews: totalReviews,
      pending_reviews: (statusMap.get('DRAFT') || 0) + (statusMap.get('SUBMITTED') || 0),
      completed_reviews: statusMap.get('APPROVED') || 0,
      average_score: scoreStats?.avg ? parseFloat(scoreStats.avg) : null,
      score_distribution: {
        excellent: Number(scoreStats?.excellent) || 0,
        good: Number(scoreStats?.good) || 0,
        poor: Number(scoreStats?.poor) || 0,
      },
      top_performers: topPerformers.map(t => ({
        id: t.id,
        full_name: t.full_name || 'Unknown',
        score: Number(t.score) || 0,
      })),
    },
  });
});

export default app;
