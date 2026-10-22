import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authMiddleware } from './index.js';
import { customerIdentity } from './permissions.js';
import { CUSTOMER_COOKIE, verifyCustomerToken } from '../lib/tokens.js';
import { supabase } from '../db/index.js';

/** 预约写入和详情统一校验；公开列表只能返回无顾客标识的时段占用。 */
export async function bookingAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const bearer = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : '';
  const decoded = bearer ? jwt.decode(bearer) : null;
  const staffToken = decoded && typeof decoded === 'object' && decoded.kind === 'employee';
  const publicSlots = req.method === 'GET' && req.path === '/';
  if (publicSlots && !staffToken) { next(); return; }
  const authorizeResource = async () => {
    try {
      const shopId = req.employee?.shopId || req.customer?.shopId;
      if (req.path === '/') {
        if (req.method !== 'GET' && (req.body?.shopId !== shopId || (req.customer && req.body?.customerId !== req.customer.id))) {
          res.status(403).json({ success: false, error: '无权为其他顾客或门店预约' }); return;
        }
        if (req.employee && req.query.shopId && req.query.shopId !== shopId) { res.status(403).json({success:false,error:'无权访问其他门店预约'}); return; }
      } else if (req.path.startsWith('/customer/')) {
        // 后续专用接口继续校验本人凭证。
      } else {
        const id = decodeURIComponent(req.path.split('/')[1] || '');
        const { data, error } = await supabase.from('bookings').select('customer_id,shop_id').eq('id', id).eq('shop_id', shopId).maybeSingle();
        if (error) { res.status(503).json({ success: false, error: '预约归属校验暂不可用' }); return; }
        if (!data || (req.customer && data.customer_id !== req.customer.id)) { res.status(404).json({ success: false, error: '预约不存在或无权访问' }); return; }
        if (req.customer && req.method !== 'GET' && req.body?.customerId !== req.customer.id) { res.status(403).json({success:false,error:'只能操作本人预约'}); return; }
      }
      next();
    } catch { res.status(503).json({ success: false, error: '预约权限校验失败' }); }
  };
  if (staffToken) { await authMiddleware(req, res, () => { void authorizeResource(); }); return; }
  try {
    const cookie = String(req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(CUSTOMER_COOKIE + '='))?.slice(CUSTOMER_COOKIE.length + 1);
    const identity = verifyCustomerToken(bearer || cookie || '');
    req.params.bookingIdentityId = identity.id;
    await customerIdentity(req, res, () => { void authorizeResource(); }, 'bookingIdentityId');
  } catch { res.status(401).json({ success: false, error: '请先登录后操作预约' }); }
}
