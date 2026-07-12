import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'mbs-dev-secret-2024';

export interface AuthEmployee {
  id: string;
  shopId: string;
  name: string;
  role: string;
  phone: string;
}

// 扩展 Express Request 类型
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      employee?: AuthEmployee;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: '未登录，请先登录' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthEmployee;
    req.employee = decoded;
    next();
  } catch (err: unknown) {
    console.error('[middleware] JWT 验证失败:', err.message);
    res.status(401).json({ success: false, error: '登录已过期，请重新登录' });
  }
}