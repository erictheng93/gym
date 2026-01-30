/**
 * Middleware exports
 */

export {
  authenticate,
  optionalAuth,
  apiKeyAuth,
  generateToken
} from './auth.js'

export type { JwtPayload } from './auth.js'

export {
  errorHandler,
  notFoundHandler,
  AppError,
  NotFoundError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError
} from './errorHandler.js'
