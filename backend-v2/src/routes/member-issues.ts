import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, issueReports, branches, employees } from '../db/index.js';
import { eq, and, desc, count } from 'drizzle-orm';
import { memberAuthMiddleware, requireMember, rateLimiter } from '../middleware/index.js';
import type { MemberVariables } from '../middleware/index.js';

// =============================================================================
// MEMBER ISSUES ROUTES
// =============================================================================
// Issue/complaint reporting for member-app
// Endpoints: GET /, POST /, GET /:id, PUT /:id

const app = new Hono<{ Variables: MemberVariables }>();

// Apply auth middleware
app.use('*', memberAuthMiddleware);
app.use('*', requireMember);

// -----------------------------------------------------------------------------
// Validation Schemas
// -----------------------------------------------------------------------------

const attachmentSchema = z.object({
  url: z.string().url(),
  type: z.enum(['image', 'video', 'document']),
  name: z.string().max(255),
});

const createIssueSchema = z.object({
  branchId: z.string().uuid('請提供有效的分店 ID'),
  type: z.enum(['EQUIPMENT', 'SERVICE', 'SUGGESTION', 'COMPLAINT']),
  title: z.string().min(1, '請輸入標題').max(100),
  content: z.string().min(10, '請詳細描述問題（至少 10 字）').max(5000),
  attachments: z.array(attachmentSchema).max(5).optional(),
});

const updateIssueSchema = z.object({
  content: z.string().min(10).max(5000).optional(),
  attachments: z.array(attachmentSchema).max(5).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(20),
  status: z.enum(['SUBMITTED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED', 'all']).default('all'),
});

// -----------------------------------------------------------------------------
// GET /api/member/issues - List member's issues
// -----------------------------------------------------------------------------

app.get(
  '/',
  zValidator('query', listQuerySchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const { page, limit, status } = c.req.valid('query');
    const offset = (page - 1) * limit;

    const conditions = [eq(issueReports.memberId, memberInfo.id)];

    if (status !== 'all') {
      conditions.push(eq(issueReports.status, status));
    }

    // Get total count
    const [{ total }] = await db
      .select({ total: count(issueReports.id) })
      .from(issueReports)
      .where(and(...conditions));

    // Get issues
    const issues = await db
      .select({
        id: issueReports.id,
        type: issueReports.type,
        title: issueReports.title,
        content: issueReports.content,
        status: issueReports.status,
        resolution: issueReports.resolution,
        resolvedAt: issueReports.resolvedAt,
        createdAt: issueReports.createdAt,
        branchId: issueReports.branchId,
        branchName: branches.name,
      })
      .from(issueReports)
      .leftJoin(branches, eq(issueReports.branchId, branches.id))
      .where(and(...conditions))
      .orderBy(desc(issueReports.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      success: true,
      data: {
        issues: issues.map(i => ({
          id: i.id,
          type: i.type,
          title: i.title,
          content: i.content,
          status: i.status,
          resolution: i.resolution,
          resolvedAt: i.resolvedAt,
          createdAt: i.createdAt,
          branch: {
            id: i.branchId,
            name: i.branchName,
          },
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
// POST /api/member/issues - Create issue
// -----------------------------------------------------------------------------

app.post(
  '/',
  rateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: process.env.NODE_ENV === 'test' ? 100 : 5,
    keyGenerator: (c) => {
      const member = c.get('member');
      return `issue:create:${member?.id || 'unknown'}`;
    },
    message: '問題回報過於頻繁，請稍後再試',
  }),
  zValidator('json', createIssueSchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const data = c.req.valid('json');

    // Verify branch exists
    const [branch] = await db
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(eq(branches.id, data.branchId))
      .limit(1);

    if (!branch) {
      return c.json({
        success: false,
        error: '分店不存在',
        code: 'BRANCH_NOT_FOUND',
      }, 404);
    }

    const [issue] = await db.insert(issueReports).values({
      memberId: memberInfo.id,
      branchId: data.branchId,
      type: data.type,
      title: data.title,
      content: data.content,
      attachments: data.attachments || [],
      status: 'SUBMITTED',
    }).returning();

    return c.json({
      success: true,
      message: '問題已提交，我們會盡快處理',
      data: {
        issue: {
          id: issue.id,
          type: issue.type,
          title: issue.title,
          status: issue.status,
          createdAt: issue.createdAt,
        },
      },
    }, 201);
  }
);

// -----------------------------------------------------------------------------
// GET /api/member/issues/:id - Get issue detail
// -----------------------------------------------------------------------------

app.get('/:id', async (c) => {
  const memberInfo = c.get('member')!;
  const issueId = c.req.param('id');

  const [issue] = await db
    .select({
      id: issueReports.id,
      type: issueReports.type,
      title: issueReports.title,
      content: issueReports.content,
      attachments: issueReports.attachments,
      status: issueReports.status,
      resolution: issueReports.resolution,
      resolvedAt: issueReports.resolvedAt,
      createdAt: issueReports.createdAt,
      updatedAt: issueReports.updatedAt,
      branchId: issueReports.branchId,
      branchName: branches.name,
      assignedTo: issueReports.assignedTo,
      assignedToName: employees.fullName,
    })
    .from(issueReports)
    .leftJoin(branches, eq(issueReports.branchId, branches.id))
    .leftJoin(employees, eq(issueReports.assignedTo, employees.id))
    .where(and(
      eq(issueReports.id, issueId),
      eq(issueReports.memberId, memberInfo.id),
    ))
    .limit(1);

  if (!issue) {
    return c.json({
      success: false,
      error: '問題回報不存在',
      code: 'NOT_FOUND',
    }, 404);
  }

  return c.json({
    success: true,
    data: {
      issue: {
        id: issue.id,
        type: issue.type,
        title: issue.title,
        content: issue.content,
        attachments: issue.attachments,
        status: issue.status,
        resolution: issue.resolution,
        resolvedAt: issue.resolvedAt,
        createdAt: issue.createdAt,
        updatedAt: issue.updatedAt,
        branch: {
          id: issue.branchId,
          name: issue.branchName,
        },
        assignedTo: issue.assignedTo ? {
          id: issue.assignedTo,
          name: issue.assignedToName,
        } : null,
        canEdit: issue.status === 'SUBMITTED',
      },
    },
  });
});

// -----------------------------------------------------------------------------
// PUT /api/member/issues/:id - Update issue (only if SUBMITTED)
// -----------------------------------------------------------------------------

app.put(
  '/:id',
  zValidator('json', updateIssueSchema),
  async (c) => {
    const memberInfo = c.get('member')!;
    const issueId = c.req.param('id');
    const updates = c.req.valid('json');

    // Verify ownership and status
    const [existing] = await db
      .select({
        id: issueReports.id,
        status: issueReports.status,
      })
      .from(issueReports)
      .where(and(
        eq(issueReports.id, issueId),
        eq(issueReports.memberId, memberInfo.id),
      ))
      .limit(1);

    if (!existing) {
      return c.json({
        success: false,
        error: '問題回報不存在',
        code: 'NOT_FOUND',
      }, 404);
    }

    if (existing.status !== 'SUBMITTED') {
      return c.json({
        success: false,
        error: '問題已在處理中，無法修改',
        code: 'CANNOT_EDIT',
      }, 400);
    }

    const [issue] = await db
      .update(issueReports)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(issueReports.id, issueId))
      .returning();

    return c.json({
      success: true,
      message: '問題回報已更新',
      data: {
        issue: {
          id: issue.id,
          type: issue.type,
          title: issue.title,
          status: issue.status,
        },
      },
    });
  }
);

// -----------------------------------------------------------------------------
// GET /api/member/issues/types/list - Get available issue types
// -----------------------------------------------------------------------------

app.get('/types/list', async (c) => {
  const issueTypes = [
    { value: 'EQUIPMENT', label: '器材問題', description: '健身器材故障或損壞' },
    { value: 'SERVICE', label: '服務問題', description: '員工服務態度或專業度' },
    { value: 'SUGGESTION', label: '建議', description: '改善建議或新功能需求' },
    { value: 'COMPLAINT', label: '投訴', description: '其他投訴或不滿' },
  ];

  return c.json({
    success: true,
    data: { issueTypes },
  });
});

export default app;
