import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../db/index.js';
import { CUSTOMER_COOKIE, verifyCustomerToken } from '../lib/tokens.js';
import { authMiddleware } from './index.js';
import { customerIdentity } from './permissions.js';

/** 只用 token 类型选择验证器；真正的签名、账号状态仍由验证器检查。 */
function hasStaffToken(req: Request): boolean {
  const value = jwt.decode(req.headers.authorization?.slice(7) || '');
  return !!value && typeof value === 'object' && value.kind === 'employee';
}

export function optionalStaff(req: Request, res: Response, next: NextFunction): void {
  if (hasStaffToken(req)) { void authMiddleware(req, res, next); return; }
  next();
}

/** 身份来自签名凭证，不依赖调用方额外传顾客ID。 */
export function customerSession(req: Request, res: Response, next: NextFunction): void {
  try {
    const cookie = String(req.headers.cookie || '').split(';').map(s => s.trim())
      .find(s => s.startsWith(CUSTOMER_COOKIE + '='))?.slice(CUSTOMER_COOKIE.length + 1);
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
    const identity = verifyCustomerToken(bearer || cookie || '');
    req.params.sessionCustomerId = identity.id;
    void customerIdentity(req, res, () => {
      if ((req.body?.customerId && req.body.customerId !== identity.id) ||
          (req.body?.shopId && req.body.shopId !== identity.shopId)) {
        res.status(403).json({ success: false, error: '仅可操作本人和所属门店的数据' }); return;
      }
      next();
    }, 'sessionCustomerId');
  } catch { res.status(401).json({ success: false, error: '请先登录' }); }
}

export function resourceAccess(table: 'bookings' | 'product_orders', param: string, allowStaff = false) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const check = async () => {
      try {
        const shopId = req.employee?.shopId || req.customer?.shopId;
        const { data, error } = await supabase.from(table).select('id,shop_id,customer_id')
          .eq('id', req.params[param]).eq('shop_id', shopId).maybeSingle();
        if (error) { res.status(503).json({ success: false, error: '数据归属校验暂不可用' }); return; }
        if (!data || (req.customer && data.customer_id !== req.customer.id)) {
          res.status(404).json({ success: false, error: '记录不存在或无权访问' }); return;
        }
        next();
      } catch { res.status(503).json({ success: false, error: '数据归属校验暂不可用' }); }
    };
    if (allowStaff && hasStaffToken(req)) void authMiddleware(req, res, () => { void check(); });
    else customerSession(req, res, () => { void check(); });
  };
}

export function ownRecord(table: string, param = 'id') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { data, error } = await supabase.from(table).select('id').eq('id', req.params[param])
        .eq('shop_id', req.employee!.shopId).maybeSingle();
      if (error) { res.status(503).json({ success: false, error: '门店归属校验暂不可用' }); return; }
      if (!data) { res.status(404).json({ success: false, error: '记录不存在或无权访问' }); return; }
      next();
    } catch { res.status(503).json({ success: false, error: '门店归属校验暂不可用' }); }
  };
}

export function shopContext(req: Request, res: Response, next: NextFunction): void {
  const shopId = req.employee!.shopId;
  if ((req.query.shopId && req.query.shopId !== shopId) || (req.body?.shopId && req.body.shopId !== shopId)) {
    res.status(403).json({ success: false, error: '无权访问其他店铺数据' }); return;
  }
  next();
}
