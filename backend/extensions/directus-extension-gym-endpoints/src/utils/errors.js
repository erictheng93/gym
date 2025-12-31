/**
 * Custom Error Classes
 * 自定義錯誤類別（不依賴 @directus/errors）
 */

/**
 * 基礎自定義錯誤類
 */
export class CustomError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = 'CustomError';
  }
}

/**
 * 無效請求載荷錯誤 (400)
 * @param {string} msg - 錯誤訊息
 * @returns {CustomError}
 */
export const InvalidPayloadError = (msg) =>
  new CustomError('INVALID_PAYLOAD', msg || 'Invalid request payload', 400);

/**
 * 未授權錯誤 (401)
 * @param {string} msg - 錯誤訊息
 * @returns {CustomError}
 */
export const UnauthorizedError = (msg) =>
  new CustomError('UNAUTHORIZED', msg || 'Authentication required', 401);

/**
 * 禁止訪問錯誤 (403)
 * @param {string} msg - 錯誤訊息
 * @returns {CustomError}
 */
export const ForbiddenError = (msg) =>
  new CustomError('FORBIDDEN', msg || 'Access denied', 403);

/**
 * 資源未找到錯誤 (404)
 * @param {string} msg - 錯誤訊息
 * @returns {CustomError}
 */
export const NotFoundError = (msg) =>
  new CustomError('NOT_FOUND', msg || 'Resource not found', 404);

/**
 * 請求過多錯誤 (429)
 * @param {string} msg - 錯誤訊息
 * @returns {CustomError}
 */
export const TooManyRequestsError = (msg) =>
  new CustomError('TOO_MANY_REQUESTS', msg || 'Rate limit exceeded', 429);

/**
 * 發送錯誤回應的通用處理函數
 * @param {object} res - Express response 對象
 * @param {Error} error - 錯誤對象
 */
export function sendErrorResponse(res, error) {
  const status = error.status || 500;
  res.status(status).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(error.code && { code: error.code }),
  });
}
