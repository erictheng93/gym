import { MiddlewareHandler } from 'hono';

export const apiLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  const logLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

  const logData = {
    method,
    path,
    status,
    duration: `${duration}ms`,
    timestamp: new Date().toISOString(),
  };

  if (logLevel === 'error') {
    console.error('[API]', JSON.stringify(logData));
  } else if (logLevel === 'warn') {
    console.warn('[API]', JSON.stringify(logData));
  } else {
    console.log('[API]', JSON.stringify(logData));
  }
};
