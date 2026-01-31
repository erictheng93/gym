import { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { lucia } from '../auth/lucia.js';
import type { User, Session } from 'lucia';

export type AuthVariables = {
  user: User | null;
  session: Session | null;
};

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const sessionId = getCookie(c, lucia.sessionCookieName) ?? null;

  if (!sessionId) {
    c.set('user', null);
    c.set('session', null);
    return next();
  }

  const { session, user } = await lucia.validateSession(sessionId);

  if (session && session.fresh) {
    const sessionCookie = lucia.createSessionCookie(session.id);
    c.header('Set-Cookie', sessionCookie.serialize());
  }

  if (!session) {
    const blankSessionCookie = lucia.createBlankSessionCookie();
    c.header('Set-Cookie', blankSessionCookie.serialize());
  }

  c.set('user', user);
  c.set('session', session);
  return next();
};

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const user = c.get('user');
  const session = c.get('session');

  if (!user || !session) {
    return c.json({ success: false, error: '未授權，請先登入' }, 401);
  }

  if (!user.isActive) {
    return c.json({ success: false, error: '帳號已停用' }, 403);
  }

  return next();
};

export const requireRole = (...roles: string[]): MiddlewareHandler => {
  return async (c, next) => {
    const user = c.get('user');

    if (!user) {
      return c.json({ success: false, error: '未授權' }, 401);
    }

    if (!roles.includes(user.role)) {
      return c.json({ success: false, error: '權限不足' }, 403);
    }

    return next();
  };
};
