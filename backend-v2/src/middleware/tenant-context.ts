import { MiddlewareHandler } from 'hono';

export type TenantVariables = {
  tenantId: string | null;
  branchId: string | null;
};

export const tenantMiddleware: MiddlewareHandler = async (c, next) => {
  const user = c.get('user');

  if (user?.tenantId) {
    c.set('tenantId', user.tenantId);
  } else {
    c.set('tenantId', null);
  }

  const branchId = c.req.header('X-Branch-Id') ?? c.req.query('branch_id') ?? null;
  c.set('branchId', branchId);

  return next();
};

export const requireTenant: MiddlewareHandler = async (c, next) => {
  const tenantId = c.get('tenantId');

  if (!tenantId) {
    return c.json({ success: false, error: '無法識別租戶' }, 400);
  }

  return next();
};
