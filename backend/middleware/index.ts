import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../db/index.js';
import { getJwtSecret } from '../lib/tokens.js';
import { passwordVersion } from '../lib/password.js';

export interface AuthEmployee { id: string; shopId: string; name: string; role: string; phone: string; }
declare global {
  namespace Express {
    interface Request { employee?: AuthEmployee; customer?: { id: string; shopId: string; passwordVersion: string; mustChangePassword: boolean }; }
  }
}
export async function authMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) { res.status(401).json({ success: false, error: '未登录，请先登录' }); return; }
  let decoded: jwt.JwtPayload;
  try {
    const value = jwt.verify(header.slice(7), getJwtSecret(), { algorithms: ['HS256'], audience: 'employee', issuer: 'mbs' });
    if (typeof value === 'string' || value.kind !== 'employee' || typeof value.id !== 'string') throw new Error();
    decoded = value;
  } catch { res.status(401).json({ success: false, error: '登录已过期，请重新登录' }); return; }
  try {
    const { data: employee, error } = await supabase.from('employees')
      .select('id, shop_id, name, role, phone, is_active, password_hash').eq('id', decoded.id).maybeSingle();
    if (error) { res.status(503).json({ success: false, error: '身份验证暂不可用' }); return; }
    if (!employee || employee.is_active !== true || !employee.shop_id ||
      decoded.passwordVersion !== passwordVersion(String(employee.password_hash || ''))) {
      res.status(401).json({ success: false, error: '账号或会话已失效，请重新登录' }); return;
    }
    req.employee = { id: employee.id, shopId: employee.shop_id, name: employee.name, role: employee.role, phone: employee.phone };
    res.setHeader('Cache-Control', 'no-store');
    next();
  } catch { res.status(503).json({ success: false, error: '身份验证暂不可用' }); }
}
