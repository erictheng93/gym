/**
 * Authentication Middleware for Custom Endpoints
 * 为自定义端点注入accountability上下文
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');

/**
 * 创建认证中间件
 * @param {object} env - Directus环境变量
 * @param {object} database - Knex database instance
 * @returns {Function} Express中间件
 */
export function createAuthMiddleware(env, database) {
  const SECRET = env.SECRET || 'replace-with-secure-random-string';

  return async (req, res, next) => {
    try {
      // 从 Authorization header 获取令牌
      const authHeader = req.headers.authorization;

      // Auth logged('[AuthMiddleware] Processing request');
      // Auth logged('[AuthMiddleware] Auth header:', authHeader);
      // Auth logged('[AuthMiddleware] Has auth header:', !!authHeader);
      // Auth logged('[AuthMiddleware] Starts with Bearer:', authHeader?.startsWith('Bearer '));

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        // 没有令牌，设置为未认证状态
        req.accountability = {
          role: null,
          user: null,
          roles: [],
          admin: false,
          app: false,
          ip: req.ip,
          userAgent: req.headers['user-agent']
        };
        // Auth logged('[AuthMiddleware] No valid token found, set as anonymous');
        return next();
      }

      const token = authHeader.substring(7); // 移除 "Bearer "

      // 验证JWT令牌
      let payload;
      try {
        payload = jwt.verify(token, SECRET);
        // Auth logged('[AuthMiddleware] Token verified, user ID:', payload.id);
      } catch (jwtError) {
        // Error logged('[AuthMiddleware] JWT verification failed:', jwtError.message);
        req.accountability = {
          role: null,
          user: null,
          roles: [],
          admin: false,
          app: false,
          ip: req.ip,
          userAgent: req.headers['user-agent']
        };
        return next();
      }

      // 从数据库获取用户信息
      const userResult = await database('directus_users')
        .where('id', payload.id)
        .first();

      if (!userResult) {
        // Warning logged('[AuthMiddleware] User not found:', payload.id);
        req.accountability = {
          role: null,
          user: null,
          roles: [],
          admin: false,
          app: false,
          ip: req.ip,
          userAgent: req.headers['user-agent']
        };
        return next();
      }

      // 构建accountability对象
      req.accountability = {
        role: userResult.role,
        user: userResult.id,
        roles: userResult.role ? [userResult.role] : [],
        admin: false, // 根据payload或角色确定
        app: true,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      };

      // Auth logged('[AuthMiddleware] User authenticated:', userResult.id, 'Role:', userResult.role);
      next();
    } catch (error) {
      // Error logged('[AuthMiddleware] Error:', error.message, error.stack);
      // 令牌无效或过期，设置为未认证状态
      req.accountability = {
        role: null,
        user: null,
        roles: [],
        admin: false,
        app: false,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      };
      next();
    }
  };
}

export default createAuthMiddleware;
