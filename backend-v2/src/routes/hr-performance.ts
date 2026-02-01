import { Hono } from 'hono';
import { eq, and, sql, desc } from 'drizzle-orm';
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
    db.select({
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
    })
      .from(performanceReviews)
      .where(whereClause)
      .orderBy(desc(performanceReviews.createdAt))
      .limit(parseInt(limit))
      .offset(parseInt(offset)),
    db.select({ count: sql<number>`count(*)` })
      .from(performanceReviews)
      .where(whereClause),
  ]);

  // Fetch employee and reviewer details
  const employeeIds = [...new Set([
    ...reviews.map(r => r.employee_id),
    ...reviews.filter(r => r.reviewer_id).map(r => r.reviewer_id as string),
  ])];

  const employeeDetails = employeeIds.length > 0
    ? await db.select({
        id: employees.id,
        full_name: employees.fullName,
        employee_code: employees.employeeCode,
        job_title_id: employees.jobTitleId,
        branch_id: employees.branchId,
      })
        .from(employees)
        .where(sql`${employees.id} IN ${employeeIds}`)
    : [];

  // Fetch job titles and branches
  const jobTitleIds = [...new Set(employeeDetails.filter(e => e.job_title_id).map(e => e.job_title_id as string))];
  const branchIds = [...new Set(employeeDetails.filter(e => e.branch_id).map(e => e.branch_id as string))];

  const [jobTitlesList, branchesList] = await Promise.all([
    jobTitleIds.length > 0
      ? db.select({ id: jobTitles.id, name: jobTitles.name })
          .from(jobTitles)
          .where(sql`${jobTitles.id} IN ${jobTitleIds}`)
      : [],
    branchIds.length > 0
      ? db.select({ id: branches.id, name: branches.name })
          .from(branches)
          .where(sql`${branches.id} IN ${branchIds}`)
      : [],
  ]);

  const jobTitleMap = new Map(jobTitlesList.map(jt => [jt.id, jt]));
  const branchMap = new Map(branchesList.map(b => [b.id, b]));
  const employeeMap = new Map(employeeDetails.map(e => [e.id, {
    ...e,
    job_title: e.job_title_id ? jobTitleMap.get(e.job_title_id) : undefined,
    branch: e.branch_id ? branchMap.get(e.branch_id) : undefined,
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

  const review = await db.select({
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
  })
    .from(performanceReviews)
    .where(eq(performanceReviews.id, id))
    .limit(1);

  if (review.length === 0) {
    return c.json({ success: false, error: '找不到績效考核記錄' }, 404);
  }

  // Fetch employee details
  const employeeIds = [review[0].employee_id];
  if (review[0].reviewer_id) employeeIds.push(review[0].reviewer_id);

  const employeeDetails = await db.select({
    id: employees.id,
    full_name: employees.fullName,
    employee_code: employees.employeeCode,
    job_title_id: employees.jobTitleId,
    branch_id: employees.branchId,
  })
    .from(employees)
    .where(sql`${employees.id} IN ${employeeIds}`);

  const jobTitleIds = [...new Set(employeeDetails.filter(e => e.job_title_id).map(e => e.job_title_id as string))];
  const branchIds = [...new Set(employeeDetails.filter(e => e.branch_id).map(e => e.branch_id as string))];

  const [jobTitlesList, branchesList] = await Promise.all([
    jobTitleIds.length > 0
      ? db.select({ id: jobTitles.id, name: jobTitles.name })
          .from(jobTitles)
          .where(sql`${jobTitles.id} IN ${jobTitleIds}`)
      : [],
    branchIds.length > 0
      ? db.select({ id: branches.id, name: branches.name })
          .from(branches)
          .where(sql`${branches.id} IN ${branchIds}`)
      : [],
  ]);

  const jobTitleMap = new Map(jobTitlesList.map(jt => [jt.id, jt]));
  const branchMap = new Map(branchesList.map(b => [b.id, b]));
  const employeeMap = new Map(employeeDetails.map(e => [e.id, {
    ...e,
    job_title: e.job_title_id ? jobTitleMap.get(e.job_title_id) : undefined,
    branch: e.branch_id ? branchMap.get(e.branch_id) : undefined,
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
    const template = await db.select()
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
    .returning();

  return c.json({ success: true, data: created }, 201);
});

// -----------------------------------------------------------------------------
// PATCH /reviews/:id - Update performance review
// -----------------------------------------------------------------------------

app.patch('/reviews/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  const existing = await db.select()
    .from(performanceReviews)
    .where(eq(performanceReviews.id, id))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ success: false, error: '找不到績效考核記錄' }, 404);
  }

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
    .returning();

  return c.json({ success: true, data: updated });
});

// -----------------------------------------------------------------------------
// POST /reviews/:id/submit - Submit review for approval
// -----------------------------------------------------------------------------

app.post('/reviews/:id/submit', async (c) => {
  const id = c.req.param('id');

  const existing = await db.select()
    .from(performanceReviews)
    .where(eq(performanceReviews.id, id))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ success: false, error: '找不到績效考核記錄' }, 404);
  }

  if (existing[0].status !== 'DRAFT') {
    return c.json({ success: false, error: '只有草稿狀態才能提交' }, 400);
  }

  const [updated] = await db.update(performanceReviews)
    .set({
      status: 'SUBMITTED',
      submittedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(performanceReviews.id, id))
    .returning();

  return c.json({ success: true, data: updated });
});

// -----------------------------------------------------------------------------
// POST /reviews/:id/approve - Approve performance review
// -----------------------------------------------------------------------------

app.post('/reviews/:id/approve', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');

  const existing = await db.select()
    .from(performanceReviews)
    .where(eq(performanceReviews.id, id))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ success: false, error: '找不到績效考核記錄' }, 404);
  }

  if (existing[0].status !== 'SUBMITTED') {
    return c.json({ success: false, error: '只有已提交狀態才能核准' }, 400);
  }

  // Find approver's employee record
  let approverId: string | null = null;
  if (user?.id) {
    const approverEmployee = await db.select({ id: employees.id })
      .from(employees)
      .where(eq(employees.userId, user.id))
      .limit(1);

    if (approverEmployee.length > 0) {
      approverId = approverEmployee[0].id;
    }
  }

  const [updated] = await db.update(performanceReviews)
    .set({
      status: 'APPROVED',
      approvedBy: approverId,
      approvedAt: new Date(),
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(performanceReviews.id, id))
    .returning();

  return c.json({ success: true, data: updated });
});

// -----------------------------------------------------------------------------
// POST /reviews/:id/reject - Reject performance review
// -----------------------------------------------------------------------------

app.post('/reviews/:id/reject', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const { reason } = body;

  const existing = await db.select()
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
    .returning();

  return c.json({ success: true, data: updated });
});

// -----------------------------------------------------------------------------
// GET /kpi-templates - List KPI templates
// -----------------------------------------------------------------------------

app.get('/kpi-templates', async (c) => {
  const templates = await db.select({
    id: kpiTemplates.id,
    name: kpiTemplates.name,
    description: kpiTemplates.description,
    job_title_id: kpiTemplates.jobTitleId,
    review_type: kpiTemplates.reviewType,
    kpis: kpiTemplates.kpis,
    is_default: kpiTemplates.isDefault,
    is_active: kpiTemplates.isActive,
    date_created: kpiTemplates.createdAt,
  })
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
    .returning();

  return c.json({ success: true, data: created }, 201);
});

// -----------------------------------------------------------------------------
// DELETE /kpi-templates/:id - Delete KPI template (soft delete)
// -----------------------------------------------------------------------------

app.delete('/kpi-templates/:id', async (c) => {
  const id = c.req.param('id');

  const existing = await db.select()
    .from(kpiTemplates)
    .where(eq(kpiTemplates.id, id))
    .limit(1);

  if (existing.length === 0) {
    return c.json({ success: false, error: '找不到 KPI 範本' }, 404);
  }

  await db.update(kpiTemplates)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(kpiTemplates.id, id));

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

  // Get counts by status
  const stats = await db.select({
    status: performanceReviews.status,
    count: sql<number>`count(*)`,
  })
    .from(performanceReviews)
    .where(whereClause)
    .groupBy(performanceReviews.status);

  const statusMap = new Map(stats.map(s => [s.status, Number(s.count)]));

  // Get average score of approved reviews
  const avgScore = await db.select({
    avg: sql<string>`avg(${performanceReviews.overallScore})`,
  })
    .from(performanceReviews)
    .where(and(
      eq(performanceReviews.status, 'APPROVED'),
      whereClause || sql`true`,
    ));

  // Get score distribution (excellent: >=90, good: 70-89, poor: <70)
  const scoreDistribution = await db.select({
    excellent: sql<number>`count(*) filter (where ${performanceReviews.overallScore} >= 90)`,
    good: sql<number>`count(*) filter (where ${performanceReviews.overallScore} >= 70 and ${performanceReviews.overallScore} < 90)`,
    poor: sql<number>`count(*) filter (where ${performanceReviews.overallScore} < 70)`,
  })
    .from(performanceReviews)
    .where(and(
      eq(performanceReviews.status, 'APPROVED'),
      whereClause || sql`true`,
    ));

  // Get top performers
  const topPerformers = await db.select({
    employeeId: performanceReviews.employeeId,
    score: performanceReviews.overallScore,
  })
    .from(performanceReviews)
    .where(and(
      eq(performanceReviews.status, 'APPROVED'),
      whereClause || sql`true`,
    ))
    .orderBy(desc(performanceReviews.overallScore))
    .limit(5);

  // Fetch employee names for top performers
  const topPerformerIds = topPerformers.map(t => t.employeeId);
  const topEmployees = topPerformerIds.length > 0
    ? await db.select({
        id: employees.id,
        full_name: employees.fullName,
      })
        .from(employees)
        .where(sql`${employees.id} IN ${topPerformerIds}`)
    : [];

  const employeeMap = new Map(topEmployees.map(e => [e.id, e.full_name]));

  const topPerformersWithNames = topPerformers.map(t => ({
    id: t.employeeId,
    full_name: employeeMap.get(t.employeeId) || 'Unknown',
    score: Number(t.score) || 0,
  }));

  const totalReviews = Array.from(statusMap.values()).reduce((sum, count) => sum + count, 0);

  return c.json({
    success: true,
    data: {
      total_reviews: totalReviews,
      pending_reviews: (statusMap.get('DRAFT') || 0) + (statusMap.get('SUBMITTED') || 0),
      completed_reviews: statusMap.get('APPROVED') || 0,
      average_score: avgScore[0]?.avg ? parseFloat(avgScore[0].avg) : null,
      score_distribution: {
        excellent: Number(scoreDistribution[0]?.excellent) || 0,
        good: Number(scoreDistribution[0]?.good) || 0,
        poor: Number(scoreDistribution[0]?.poor) || 0,
      },
      top_performers: topPerformersWithNames,
    },
  });
});

export default app;
