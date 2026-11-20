import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { db, contractLogs, contracts, members, branches, employees, LOG_TYPE } from '../db/index.js';
import { eq, and, count, desc, inArray } from 'drizzle-orm';
import { requireAuth, requireTenant } from '../middleware/index.js';
import type { AuthVariables, TenantVariables } from '../middleware/index.js';
import { getTenantBranchIds } from '../utils/tenant-cache.js';

const app = new Hono<{ Variables: AuthVariables & TenantVariables }>();

app.use('*', requireAuth);
app.use('*', requireTenant);

const createLogSchema = z.object({
  contractId: z.string().uuid(),
  logType: z.enum(['PAUSE', 'RESUME', 'EXTEND', 'TRANSFER', 'CANCEL', 'CLASS_USED', 'RENEWAL']),
  startDate: z.string(),
  endDate: z.string(),
  days: z.number().int().default(0),
  reason: z.string().optional(),
  originalMemberId: z.string().uuid().optional(),
  targetMemberId: z.string().uuid().optional(),
});

const CONTRACT_LOG_SELECT = {
  id: contractLogs.id,
  contractId: contractLogs.contractId,
  logType: contractLogs.logType,
  startDate: contractLogs.startDate,
  endDate: contractLogs.endDate,
  daysAffected: contractLogs.daysAffected,
  reason: contractLogs.reason,
  createdByEmployee: contractLogs.createdByEmployee,
  branchId: contractLogs.branchId,
  originalMemberId: contractLogs.originalMemberId,
  targetMemberId: contractLogs.targetMemberId,
  status: contractLogs.status,
  dateCreated: contractLogs.dateCreated,
  tenantId: contractLogs.tenantId,
};

const CONTRACT_LOG_RETURNING = CONTRACT_LOG_SELECT;

const CONTRACT_LOG_CONTRACT_SELECT = {
  id: contracts.id,
  contractNo: contracts.contractNo,
};

const CONTRACT_LOG_MEMBER_SELECT = {
  id: members.id,
  fullName: members.fullName,
};

const CONTRACT_LOG_EMPLOYEE_SELECT = {
  id: employees.id,
  fullName: employees.fullName,
};

const CONTRACT_LOG_WITH_RELATIONS_SELECT = {
  log: CONTRACT_LOG_SELECT,
  contract: CONTRACT_LOG_CONTRACT_SELECT,
  member: CONTRACT_LOG_MEMBER_SELECT,
  createdBy: CONTRACT_LOG_EMPLOYEE_SELECT,
};

const CONTRACT_LOG_WITH_CREATOR_SELECT = {
  log: CONTRACT_LOG_SELECT,
  createdBy: CONTRACT_LOG_EMPLOYEE_SELECT,
};

const CONTRACT_BRANCH_ID_SELECT = {
  branchId: contracts.branchId,
};

const CONTRACT_ID_SELECT = {
  id: contracts.id,
};

const COUNT_SELECT = {
  count: count(),
};

// List contract logs
app.get('/', async (c) => {
  const tenantId = c.get('tenantId')!;
  const contractId = c.req.query('contractId');
  const logType = c.req.query('logType');
  const page = Number(c.req.query('page')) || 1;
  const limit = Math.min(Number(c.req.query('limit')) || 20, 100);
  const offset = (page - 1) * limit;

  const branchIds = await getTenantBranchIds(tenantId);
  if (branchIds.length === 0) {
    return c.json({
      success: true,
      data: [],
      pagination: {
        total: 0,
        page,
        limit,
        totalPages: 0,
      },
    });
  }

  const conditions = [];

  if (contractId) {
    conditions.push(eq(contractLogs.contractId, contractId));
  }

  if (logType && LOG_TYPE.includes(logType as typeof LOG_TYPE[number])) {
    conditions.push(eq(contractLogs.logType, logType as typeof LOG_TYPE[number]));
  }

  // Get logs with contract and member info
  const [result, [countResult]] = await Promise.all([
    db
      .select(CONTRACT_LOG_WITH_RELATIONS_SELECT)
      .from(contractLogs)
      .innerJoin(contracts, eq(contractLogs.contractId, contracts.id))
      .innerJoin(members, eq(contracts.memberId, members.id))
      .leftJoin(employees, eq(contractLogs.createdByEmployee, employees.id))
      .where(and(inArray(contracts.branchId, branchIds), ...conditions))
      .orderBy(desc(contractLogs.dateCreated))
      .limit(limit)
      .offset(offset),
    db
      .select(COUNT_SELECT)
      .from(contractLogs)
      .innerJoin(contracts, eq(contractLogs.contractId, contracts.id))
      .where(and(inArray(contracts.branchId, branchIds), ...conditions)),
  ]);

  const total = Number(countResult?.count || 0);

  return c.json({
    success: true,
    data: result.map(r => ({
      ...r.log,
      contract: r.contract,
      member: r.member,
      createdBy: r.createdBy,
    })),
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  });
});

// Get logs for a specific contract
app.get('/contract/:contractId', async (c) => {
  const contractId = c.req.param('contractId');
  const tenantId = c.get('tenantId')!;

  // Concurrently fetch branch IDs, logs, and verify contract tenant ownership
  const [branchIds, logs, [contract]] = await Promise.all([
    getTenantBranchIds(tenantId),
    db
      .select(CONTRACT_LOG_WITH_CREATOR_SELECT)
      .from(contractLogs)
      .leftJoin(employees, eq(contractLogs.createdByEmployee, employees.id))
      .where(eq(contractLogs.contractId, contractId))
      .orderBy(desc(contractLogs.dateCreated)),
    db
      .select(CONTRACT_BRANCH_ID_SELECT)
      .from(contracts)
      .where(eq(contracts.id, contractId))
      .limit(1),
  ]);

  if (!contract || !contract.branchId || !branchIds.includes(contract.branchId)) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  return c.json({
    success: true,
    data: logs.map(r => ({
      ...r.log,
      createdBy: r.createdBy,
    })),
  });
});

// Create contract log (usually created automatically by contract operations)
app.post('/', zValidator('json', createLogSchema), async (c) => {
  const tenantId = c.get('tenantId')!;
  const user = c.get('user')!;
  const data = c.req.valid('json');

  // Verify contract belongs to tenant
  const tenantBranchIds = await getTenantBranchIds(tenantId);
  if (tenantBranchIds.length === 0) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  const [contract] = await db
    .select(CONTRACT_ID_SELECT)
    .from(contracts)
    .where(and(eq(contracts.id, data.contractId), inArray(contracts.branchId, tenantBranchIds)))
    .limit(1);

  if (!contract) {
    return c.json({ success: false, error: '合約不存在' }, 404);
  }

  const [newLog] = await db.insert(contractLogs).values({
    contractId: data.contractId,
    logType: data.logType,
    startDate: data.startDate,
    endDate: data.endDate,
    daysAffected: data.days,
    reason: data.reason,
    originalMemberId: data.originalMemberId,
    targetMemberId: data.targetMemberId,
    createdByEmployee: user.employeeId,
    tenantId,
  }).returning(CONTRACT_LOG_RETURNING);

  return c.json({
    success: true,
    data: newLog,
  }, 201);
});

// Get single log
app.get('/:id', async (c) => {
  const id = c.req.param('id');
  const tenantId = c.get('tenantId')!;

  const [result] = await db
    .select(CONTRACT_LOG_WITH_RELATIONS_SELECT)
    .from(contractLogs)
    .innerJoin(contracts, eq(contractLogs.contractId, contracts.id))
    .innerJoin(members, eq(contracts.memberId, members.id))
    .innerJoin(branches, eq(contracts.branchId, branches.id))
    .leftJoin(employees, eq(contractLogs.createdByEmployee, employees.id))
    .where(and(eq(contractLogs.id, id), eq(branches.tenantId, tenantId)))
    .limit(1);

  if (!result) {
    return c.json({ success: false, error: '記錄不存在' }, 404);
  }

  return c.json({
    success: true,
    data: {
      ...result.log,
      contract: result.contract,
      member: result.member,
      createdBy: result.createdBy,
    },
  });
});

export default app;
