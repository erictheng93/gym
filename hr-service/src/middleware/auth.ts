/**
 * Authentication Middleware
 */

import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../config/index.js'

export interface JwtPayload {
  userId: string
  employeeId: string
  branchId?: string
  isAdmin?: boolean
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

/**
 * JWT Authentication Middleware
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Missing or invalid authorization header'
    })
    return
  }

  const token = authHeader.substring(7)

  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload
    req.user = payload
    next()
  } catch (error) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token'
    })
  }
}

/**
 * Optional Authentication - allows anonymous access
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next()
    return
  }

  const token = authHeader.substring(7)

  try {
    const payload = jwt.verify(token, config.jwt.secret) as JwtPayload
    req.user = payload
  } catch {
    // Ignore invalid tokens for optional auth
  }

  next()
}

/**
 * API Key Authentication for service-to-service communication
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key']

  if (!apiKey || apiKey !== config.mainSystem.apiKey) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid API key'
    })
    return
  }

  next()
}

/**
 * Generate JWT Token
 */
export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn']
  })
}
