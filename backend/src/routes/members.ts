import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, members, contracts, membershipPlans, MEMBER_STATUS } from '../db/index.js';
import { eq, and, or, ilike, sql, desc, asc, inArray } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranchIds, getTenantBranches } from '../utils/tenant-cache.js';
import { generateExcel, generateCsv, membersColumns, translateStatus, translateGender } from '../services/export.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

const MEMBER_RETURNING = {
  id: members.id,
  memberCode: members.memberCode,
  fullName: members.fullName,
  phone: members.phone,
  email: members.email,
  gender: members.gender,
  birthday: members.birthday,
  idNumber: members.idNumber,
  address: members.address,
  emergencyContact: members.emergencyContact,
  emergencyPhone: members.emergencyPhone,
  branchId: members.branchId,
  salesPersonId: members.salesPersonId,
  status: members.status,
  joinDate: members.joinDate,
  tags: members.tags,
  notes: members.notes,
  avatar: members.avatar,
  height: members.height,
  createdAt: members.createdAt,
  updatedAt: members.updatedAt,
  tenantId: members.tenantId,
};

const MEMBER_CONTRACT_SELECT = {
  id: contracts.id,
  contractNo: contracts.contractNo,
  memberId: contracts.memberId,
  planId: contracts.planId,
  branchId: contracts.branchId,
  salesPersonId: contracts.salesPersonId,
  status: contracts.status,
  signDate: contracts.signDate,
  startDate: contracts.startDate,
  originalEndDate: contracts.originalEndDate,
  endDate: contracts.endDate,
  remainingCounts: contracts.remainingCounts,
  totalAmount: contracts.totalAmount,
  paidAmount: contracts.paidAmount,
  paymentStatus: contracts.paymentStatus,
  digitalSignature: contracts.digitalSignature,
  contractPdf: contracts.contractPdf,
  termsAccepted: contracts.termsAccepted,
  notes: contracts.notes,
  createdBy: contracts.createdBy,
  createdAt: contracts.createdAt,
  updatedAt: contracts.updatedAt,
  tenantId: contracts.tenantId,
};

const COUNT_SELECT = {
  count: sql<number>`count(*)`,
};

const MEMBER_EXPORT_SELECT = {
  memberCode: members.memberCode,
  fullName: members.fullName,
  phone: members.phone,
  email: members.email,
  gender: members.gender,
  status: members.status,
  joinDate: members.joinDate,
  branchId: members.branchId,
};

const MEMBER_ID_SELECT = {
  id: members.id,
};

const MEMBER_BRANCH_SELECT = {
  id: members.id,
  branchId: members.branchId,
};

const MEMBER_CONTRACT_WITH_PLAN_SELECT = {
  contract: contracts,
  plan: {
    id: membershipPlans.id,
    name: membershipPlans.name,
    planType: membershipPlans.planType,
  },
};

app.use('*', requireAuth);
app.use('*', requireTenant);

const createMemberSchema = z.object({
  fullName: z.string().min(2, '姓名至少 2 個字元'),
  phone: z.string().min(1, '電話號碼必填'),
  email: z.string().email().optional().nullable(),
  branchId: z.string().uuid(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'SUSPENDED', 'BANNED']).optional(),
  joinDate: z.string().optional(),
  salesPersonId: z.string().uuid().optional().nullable(),
  gender: z.enum(['MALE', 'FEMALE', 'OTHER']).optional().nullable(),
  birthday: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  emergencyContact: z.string().optional().nullable(),
  emergencyPhone: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional().nullable(),
});

const updateMemberSchema = createMemberSchema.partial();

const querySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  branchId: z.string().uuid().optional(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'SUSPENDED', 'BANNED']).optional(),
  sortBy: z.enum(['fullName', 'memberCode', 'joinDate', 'dateCreated']).default('dateCreated'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

app.get('/', zValidator('query', querySchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const { page, limit, search, branchId, status, sortBy, sortOrder } = c.req.valid('query');
  const offset = (page - 1) * limit;

  const branchIds = await getTenantBranchIds(tenantId);

  if (branchIds.length === 0) {
    return c.json({ success: true, data: [], meta: { total: 0, page, limit, totalPages: 0 } });
  }

  if (branchId && !branchIds.includes(branchId.toLowerCase())) {
    return c.json({ success: true, data: [], meta: { total: 0, page, limit, totalPages: 0 } });
  }

  let baseCondition = branchId
    ? eq(members.branchId, branchId)
    : (branchIds.length === 1 ? eq(members.branchId, branchIds[0]) : inArray(members.branchId, branchIds));

  if (status) {
    // Case-insensitive status comparison using index-friendly uppercase normalization
    baseCondition = and(baseCondition, eq(members.status, status.toUpperCase() as typeof MEMBER_STATUS[number]))!;
  }

  if (search) {
    baseCondition = and(
      baseCondition,
      or(
        ilike(members.fullName, `%${search}%`),
        ilike(members.memberCode, `%${search}%`),
        ilike(members.phone, `%${search}%`),
        ilike(members.email, `%${search}%`)
      )
    )!;
  }

  const sortColumn = {
    fullName: members.fullName,
    memberCode: members.memberCode,
    joinDate: members.joinDate,
    dateCreated: members.createdAt,
  }[sortBy];

  const orderBy = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn);

  const [[countResult], result] = await Promise.all([
    db
      .select(COUNT_SELECT)
      .from(members)
      .where(baseCondition),
    db
      .select(MEMBER_RETURNING)
      .from(members)
      .where(baseCondition)
      .orderBy(orderBy)
      .limit(limit)
      .offset(offset),
  ]);

  const total = Number(countResult?.count || 0);

  return c.json({
    success: true,
    data: result,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// -----------------------------------------------------------------------------
// GET /api/members/export - Export Members List
// -----------------------------------------------------------------------------

app.get('/export', async (c) => {
  const tenantId = c.get('tenantId')!;
  const { branchId, status, format = 'csv' } = c.req.query();

  const tenantBranches = await getTenantBranches(tenantId);
  const branchIds = tenantBranches.map(b => b.id);
  const branchMap = new Map(tenantBranches.map(b => [b.id, b.name]));

  if (branchIds.length === 0 || (branchId && !branchIds.includes(branchId.toLowerCase()))) {
    const result = generateCsv(membersColumns, []);
    return new Response(result.buffer, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="members.csv"`,
      },
    });
  }

  let baseCondition = branchId
    ? eq(members.branchId, branchId)
    : (branchIds.length === 1 ? eq(members.branchId, branchIds[0]) : inArray(members.branchId, branchIds));

  if (status) {
    baseCondition = and(baseCondition, eq(members.status, status.toUpperCase() as typeof MEMBER_STATUS[number]))!;
  }

  const result = await db
    .select(MEMBER_EXPORT_SELECT)
    .from(members)
    .where(baseCondition)
    .orderBy(desc(members.createdAt));

  const exportData = new Array(result.length);
  for (let i = 0; i < result.length; i++) {
    const m = result[i]!;
    exportData[i] = {
      memberCode: m.memberCode || '',
      fullName: m.fullName || '',
      phone: m.phone || '',
      email: m.email || '',
      gender: translateGender(m.gender),
      status: translateStatus(m.status),
      joinDate: m.joinDate || '',
      branchName: branchMap.get(m.branchId!) || '',
    };
  }

  const filename = `會員列表_${new Date().toISOString().slice(0, 10)}`;

  if (format === 'xlsx' || format === 'excel') {
    const exportResult = await generateExcel(membersColumns, exportData, '會員列表');
    if (!exportResult.success || !exportResult.buffer) {
      return c.json({ success: false, error: exportResult.error || '匯出失敗' }, 500);
    }
    return new Response(exportResult.buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.xlsx"`,
      },
    });
  }

  const csvResult = generateCsv(membersColumns, exportData);
  if (!csvResult.success || !csvResult.buffer) {
    return c.json({ success: false, error: csvResult.error || '匯出失敗' }, 500);
  }
  return new Response(csvResult.buffer, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.csv"`,
    },
  });
});

app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [[member], branchIds, memberContracts] = await Promise.all([
    db
      .select(MEMBER_RETURNING)
      .from(members)
      .where(eq(members.id, id))
      .limit(1),
    getTenantBranchIds(tenantId),
    db
      .select(MEMBER_CONTRACT_SELECT)
      .from(contracts)
      .where(eq(contracts.memberId, id))
      .orderBy(desc(contracts.createdAt)),
  ]);

  if (!member) {
    return c.json({ success: false, error: '會員不存在' }, 404);
  }

  if (!branchIds.includes(member.branchId!)) {
    return c.json({ success: false, error: '無權限存取此會員' }, 403);
  }

  return c.json({
    success: true,
    data: {
      ...member,
      contracts: memberContracts,
    },
  });
});

app.post('/', zValidator('json', createMemberSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const branchIds = await getTenantBranchIds(tenantId);
  if (!branchIds.includes(data.branchId)) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  const branchFilter = branchIds.length === 1 ? eq(members.branchId, branchIds[0]) : inArray(members.branchId, branchIds);
  const [countResult] = await db
    .select(COUNT_SELECT)
    .from(members)
    .where(branchFilter);

  const memberCount = Number(countResult?.count || 0);

  const memberCode = `M${String(memberCount + 1).padStart(6, '0')}`;

  const [newMember] = await db.insert(members).values({
    ...data,
    memberCode,
    joinDate: data.joinDate || new Date().toISOString().slice(0, 10),
    tenantId,
  }).returning(MEMBER_RETURNING);

  return c.json({ success: true, data: newMember }, 201);
});

app.patch('/:id', zValidator('json', updateMemberSchema), async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;
  const data = c.req.valid('json');

  const branchIds = await getTenantBranchIds(tenantId);
  if (branchIds.length === 0) {
    return c.json({ success: false, error: '無權限修改此會員' }, 403);
  }

  if (data.branchId && !branchIds.includes(data.branchId)) {
    return c.json({ success: false, error: '無效的分店' }, 400);
  }

  const branchCondition = branchIds.length === 1 ? eq(members.branchId, branchIds[0]) : inArray(members.branchId, branchIds);
  const [updatedMember] = await db
    .update(members)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(and(eq(members.id, id), branchCondition))
    .returning(MEMBER_RETURNING);

  if (!updatedMember) {
    const [existingMember] = await db
      .select(MEMBER_ID_SELECT)
      .from(members)
      .where(eq(members.id, id))
      .limit(1);

    if (!existingMember) {
      return c.json({ success: false, error: '會員不存在' }, 404);
    }
    return c.json({ success: false, error: '無權限修改此會員' }, 403);
  }

  return c.json({ success: true, data: updatedMember });
});

app.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const branchIds = await getTenantBranchIds(tenantId);
  if (branchIds.length === 0) {
    return c.json({ success: false, error: '無權限刪除此會員' }, 403);
  }

  const branchCondition = branchIds.length === 1 ? eq(members.branchId, branchIds[0]) : inArray(members.branchId, branchIds);
  const [updatedMember] = await db
    .update(members)
    .set({ status: 'SUSPENDED', updatedAt: new Date() })
    .where(and(eq(members.id, id), branchCondition))
    .returning(MEMBER_ID_SELECT);

  if (!updatedMember) {
    const [existingMember] = await db
      .select(MEMBER_ID_SELECT)
      .from(members)
      .where(eq(members.id, id))
      .limit(1);

    if (!existingMember) {
      return c.json({ success: false, error: '會員不存在' }, 404);
    }
    return c.json({ success: false, error: '無權限刪除此會員' }, 403);
  }

  return c.json({ success: true, message: '會員已封存' });
});

// Get member's contracts
app.get('/:id/contracts', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [[member], branchIds, result] = await Promise.all([
    db
      .select(MEMBER_BRANCH_SELECT)
      .from(members)
      .where(eq(members.id, id))
      .limit(1),
    getTenantBranchIds(tenantId),
    db
      .select(MEMBER_CONTRACT_WITH_PLAN_SELECT)
      .from(contracts)
      .leftJoin(membershipPlans, eq(contracts.planId, membershipPlans.id))
      .where(eq(contracts.memberId, id))
      .orderBy(desc(contracts.createdAt)),
  ]);

  if (!member) {
    return c.json({ success: false, error: '會員不存在' }, 404);
  }

  if (!branchIds.includes(member.branchId!)) {
    return c.json({ success: false, error: '無權限存取此會員' }, 403);
  }

  return c.json({
    success: true,
    data: result.map(r => ({
      ...r.contract,
      plan: r.plan,
    })),
  });
});

export default app;
