import { Hono } from 'hono';
import {
  db,
  employees,
  branches,
  jobTitles,
  coachMemberAssignments,
  classSessions,
} from '../db/index.js';
import { eq, and, sql, gte, lte } from 'drizzle-orm';
import { coachAuthMiddleware, requireCoach } from '../middleware/index.js';
import type { CoachVariables } from '../middleware/index.js';

// =============================================================================
// COACH PROFILE ROUTES
// =============================================================================
// Get current coach profile and stats

const app = new Hono<{ Variables: CoachVariables }>();

const COUNT_SELECT = { count: sql<number>`count(*)` };

const COACH_PROFILE_EMPLOYEE_SELECT = {
  id: employees.id,
  employeeCode: employees.employeeCode,
  fullName: employees.fullName,
  email: employees.email,
  phone: employees.phone,
  branchId: employees.branchId,
  branchName: branches.name,
  jobTitleId: employees.jobTitleId,
  jobTitleName: jobTitles.name,
  jobTitleCode: jobTitles.code,
  status: employees.status,
  tenantId: employees.tenantId,
};

// Apply auth middleware to all routes
app.use('*', coachAuthMiddleware, requireCoach);

// -----------------------------------------------------------------------------
// GET /api/coach/me - Get Current Coach Profile with Stats
// -----------------------------------------------------------------------------

app.get('/', async (c) => {
  const coach = c.get('coach')!;

  // Date calculations for classes
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const mondayStr = monday.toISOString().slice(0, 10);
  const sundayStr = sunday.toISOString().slice(0, 10);

  // Fetch full employee info with joined branch/jobTitle and statistics concurrently in a single round trip
  const [
    [employee],
    [studentCountResult],
    [todayClassCountResult],
    [weekClassCountResult],
  ] = await Promise.all([
    db
      .select(COACH_PROFILE_EMPLOYEE_SELECT)
      .from(employees)
      .leftJoin(branches, eq(employees.branchId, branches.id))
      .leftJoin(jobTitles, eq(employees.jobTitleId, jobTitles.id))
      .where(eq(employees.id, coach.id))
      .limit(1),
    db
      .select(COUNT_SELECT)
      .from(coachMemberAssignments)
      .where(
        and(
          eq(coachMemberAssignments.coachId, coach.id),
          sql`${coachMemberAssignments.unassignedAt} IS NULL`
        )
      ),
    db
      .select(COUNT_SELECT)
      .from(classSessions)
      .where(
        and(
          eq(classSessions.instructorId, coach.id),
          eq(classSessions.sessionDate, today),
          eq(classSessions.sessionStatus, 'SCHEDULED')
        )
      ),
    db
      .select(COUNT_SELECT)
      .from(classSessions)
      .where(
        and(
          eq(classSessions.instructorId, coach.id),
          gte(classSessions.sessionDate, mondayStr),
          lte(classSessions.sessionDate, sundayStr)
        )
      ),
  ]);

  if (!employee) {
    return c.json({
      success: false,
      error: '找不到教練資料',
      code: 'NOT_FOUND',
    }, 404);
  }

  return c.json({
    success: true,
    data: {
      id: employee.id,
      employee_code: employee.employeeCode,
      full_name: employee.fullName,
      email: employee.email,
      phone: employee.phone,
      branch_id: employee.branchId,
      branch_name: employee.branchName,
      job_title: employee.jobTitleName,
      job_title_code: employee.jobTitleCode,
      status: employee.status,
      stats: {
        student_count: Number(studentCountResult?.count || 0),
        today_class_count: Number(todayClassCountResult?.count || 0),
        week_class_count: Number(weekClassCountResult?.count || 0),
      },
    },
  });
});

export default app;
