import { Request, Response, NextFunction } from 'express';
import { supabase } from '../db/index.js';
import { UserRole } from '../../shared/types.js';
import {
  canViewCustomerManagement, canCreateCustomer, canEditCustomer, canDeleteCustomer,
  canViewFinancialReport, canViewShopSettings, getCustomerDataScope,
} from '../../shared/permissions.js';
import { CUSTOMER_COOKIE, verifyCustomerToken } from '../lib/tokens.js';
import { passwordVersion } from '../lib/password.js';

const policies = {
  'customer:read': canViewCustomerManagement,
  'customer:create': canCreateCustomer,
  'customer:edit': canEditCustomer,
  'customer:delete': canDeleteCustomer,
  'customer:credential': canEditCustomer,
  'financial:read': canViewFinancialReport,
  'shop:edit': canViewShopSettings,
  'settlement:override': (role: UserRole) => role === UserRole.CEO || role === UserRole.CASHIER,
};
export type Permission = keyof typeof policies;
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.employee) { res.status(401).json({ success: false, error: '请先登录' }); return; }
    if (!policies[permission](req.employee.role as UserRole)) {
      res.status(403).json({ success: false, error: '无权执行此操作' }); return;
    }
    next();
  };
}

export function requireOwnShop(param = 'id') {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.employee?.shopId || req.params[param] !== req.employee.shopId) {
      res.status(403).json({ success: false, error: '无权操作其他店铺' }); return;
    }
    next();
  };
}

export function scopeCustomerQuery<T extends { eq: Function; contains: Function }>(query: T, req: Request): T {
  let scoped = query.eq('shop_id', req.employee!.shopId);
  if (getCustomerDataScope(req.employee!.role as UserRole) === 'own') {
    scoped = scoped.contains('served_by_stylist_ids', [req.employee!.id]);
  }
  return scoped as T;
}

export const requireCustomerScope = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { data, error } = await scopeCustomerQuery(supabase.from('customers').select('id').eq('id', req.params.id), req).maybeSingle();
    if (error) { res.status(503).json({ success: false, error: '客户权限查询失败' }); return; }
    if (!data) { res.status(404).json({ success: false, error: '客户不存在或无权访问' }); return; }
    next();
  } catch { res.status(503).json({ success: false, error: '客户权限查询失败' }); }
};

/** 顾客凭证和员工凭证完全分开；客户 ID 只用于归属比较，不作为身份。 */
export async function customerIdentity(req: Request, res: Response, next: NextFunction, param = 'id', allowPasswordChange = false): Promise<void> {
  try {
    const cookies = String(req.headers.cookie || '').split(';').map((part) => part.trim());
    const cookie = cookies.find((part) => part.startsWith(`${CUSTOMER_COOKIE}=`))?.slice(CUSTOMER_COOKIE.length + 1);
    const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
    const token = bearer || cookie || '';
    const identity = verifyCustomerToken(token);
    if (req.params[param] !== identity.id) { res.status(403).json({ success: false, error: '仅可访问本人资料' }); return; }
    const { data, error } = await supabase.from('customers').select('id, shop_id, password_hash, is_weak_password').eq('id', identity.id).eq('shop_id', identity.shopId).maybeSingle();
    if (error) { res.status(503).json({ success: false, error: '身份验证暂不可用' }); return; }
    if (!data) { res.status(401).json({ success: false, error: '顾客会话已失效，请重新登录' }); return; }
    if (typeof data.password_hash !== 'string' || passwordVersion(data.password_hash) !== identity.passwordVersion) {
      res.status(401).json({ success: false, error: '顾客会话已失效，请重新登录' }); return;
    }
    identity.mustChangePassword = data.is_weak_password === true;
    if (identity.mustChangePassword && !allowPasswordChange) {
      res.status(403).json({ success: false, code: 'PASSWORD_CHANGE_REQUIRED', error: '为了账户安全，请修改密码' }); return;
    }
    req.customer = identity;
    res.setHeader('Cache-Control', 'no-store');
    next();
  } catch { res.status(401).json({ success: false, error: '请使用本人登录凭证重新登录' }); }
}

export function personalCustomerAccess(req: Request, res: Response, next: NextFunction, param = 'id'): void {
  // 本人查询接口不接受员工 token 代替本人凭证；员工走受限的管理接口。
  void customerIdentity(req, res, next, param);
}
