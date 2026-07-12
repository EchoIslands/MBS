/**
 * API 中间件
 * 包含：请求鉴权、统一错误处理、响应格式、日志记录
 */
import { type Request, type Response, type NextFunction } from 'express'
import jwt from 'jsonwebtoken'

// JWT 密钥
const JWT_SECRET = process.env.JWT_SECRET || 'mbs-secret-key-2024'

// 统一响应格式
export const successResponse = (
  res: Response,
  data: unknown,
  message: string = '操作成功'
) => {
  return res.json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  })
}

export const errorResponse = (
  res: Response,
  error: string,
  statusCode: number = 500
) => {
  return res.status(statusCode).json({
    success: false,
    error,
    timestamp: new Date().toISOString()
  })
}

// 错误处理中间件
export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  console.error('[Error]', err)
  
  if (err instanceof SyntaxError && 'body' in err) {
    return errorResponse(res, '请求体格式错误', 400)
  }
  
  if (err.name === 'JsonWebTokenError') {
    return errorResponse(res, 'Token 无效', 401)
  }
  
  if (err.name === 'TokenExpiredError') {
    return errorResponse(res, 'Token 已过期', 401)
  }
  
  if (err.code === 'ECONNREFUSED') {
    return errorResponse(res, '数据库连接失败', 503)
  }
  
  return errorResponse(res, err.message || '服务器内部错误')
}

// JWT 鉴权中间件
export const authenticate = (
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return errorResponse(res, '未登录，请先登录', 401)
    }
    const token = authHeader.substring(7)
    const decoded = jwt.verify(token, JWT_SECRET) as unknown
    (req as unknown).user = decoded
    next()
  } catch (err) {
    if ((err as unknown).name === 'JsonWebTokenError') {
      return errorResponse(res, 'Token 无效', 401)
    }
    if ((err as unknown).name === 'TokenExpiredError') {
      return errorResponse(res, 'Token 已过期，请重新登录', 401)
    }
    return errorResponse(res, '认证失败', 401)
  }
}

// 角色权限中间件
export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, _next: NextFunction) => {
    const user = (req as unknown).user
    if (!user) return errorResponse(res, '未登录', 401)
    if (!roles.includes(user.role)) return errorResponse(res, '权限不足', 403)
    next()
  }
}

// 日志中间件
export const logger = (
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  const startTime = Date.now()
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`)
  res.on('finish', () => {
    const duration = Date.now() - startTime
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} (${duration}ms)`)
  })
  next()
}

// CORS 中间件
export const cors = (
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
  if (req.method === 'OPTIONS') return res.status(200).end()
  next()
}

export default { successResponse, errorResponse, errorHandler, authenticate, requireRole, logger, cors }