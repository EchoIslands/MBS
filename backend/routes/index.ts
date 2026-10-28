import { recoverWechatPayment, activeWechatOrder, ledgerPaymentId, recoveryDependencies } from '../services/paymentRecovery.js';
import customerPaymentOrdersRouter from './customerPaymentOrders.js';
import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID, createHash } from 'crypto';
import { beginCustomerAuthAttempt, finishCustomerAuthAttempt, isCustomerVerified, FIRST_USE_MESSAGE, CUSTOMER_AUTH_UNAVAILABLE, type CustomerAuthAttempt } from '../lib/customerSecurity.js';
import { supabase } from '../db/index.js';
import { authMiddleware, AuthEmployee } from '../middleware/index.js';
import { operationError } from '../lib/rpcErrors.js';
import {businessDayRange,businessDate} from '../lib/businessTime.js';
import {imageReference,sendStoredImage,restoreImageReference} from '../lib/imageData.js';
import {startsDuringOpening} from '../../shared/lib/bookingHours.js';
import { bookingAccess } from '../middleware/bookingAccess.js';
import { customerSession, resourceAccess, ownRecord, optionalStaff, shopContext } from '../middleware/resourceAccess.js';
import { toCamelCase, toCamelCaseList, toSnakeCase } from '../utils/case.js';
import { mapCustomerBodyToDB, validateCustomerData, isValidPhone, CUSTOMER_ACCOUNT_FIELDS, customerValuesEqual } from '../utils/customerMapper.js';
import {
  calcDiscountedItemPrice,
  getEffectivePurchaseVIPLevel,
  getEffectiveStoredValueLevel,
} from '../../shared/lib/membership.js';
import { Customer, Coupon, CustomerCoupon, CouponType, CouponScope, ProductCategory, PurchaseVIPPlan, StoredValuePlan, SpecialVIPConfig, PurchaseVIPLevel, StoredValueLevel } from '../../shared/types.js';
import { handleWechatCallback } from '../services/paymentService.js';
import { recordWechatReceipt } from '../services/settlementReceipt.js';
import { compareSettlements } from '../../shared/lib/settlementDisplay.js';
import { buildFinancialReport } from '../../shared/lib/financialReport.js';
import { buildOwnerDashboard, buildStylistPerformances } from '../../shared/lib/dashboardStats.js';
import type { Settlement } from '../../shared/types.js';
import QRCode from 'qrcode';
import { priceSettlement } from '../lib/settlementPricing.js';
import { hashPassword, verifyPassword, isPasswordHash, passwordVersion } from '../lib/password.js';
import { getJwtSecret, signCustomerToken, CUSTOMER_COOKIE, CUSTOMER_SESSION_SECONDS } from '../lib/tokens.js';
import { hashCustomerPassword, verifyCustomerPassword, isCustomerPassword } from '../lib/customerPassword.js';
import { requirePermission, requireOwnShop, scopeCustomerQuery, requireCustomerScope, personalCustomerAccess, customerIdentity } from '../middleware/permissions.js';

const mainRouter = Router();
mainRouter.use('/customer-payment-orders', customerPaymentOrdersRouter);
const canonicalJson = (value: unknown): string => JSON.stringify(value, (_key, item) =>
  item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

// 数据库原始行通用类型：Supabase 返回的原始行字段类型在编译期无法确定，
// 映射层统一用 any 接收，具体业务类型在 fromDb 转换函数中再约束。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbRecord = Record<string, any>;

// ===================== auth =====================
const authRouter = Router();
getJwtSecret(); // 生产密钥配置不合格时拒绝启动

/**
 * POST /api/auth/login
 * 员工登录：手机号 + 密码 → 查 employees 表 → 签发 JWT
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body;

    if (typeof phone !== 'string' || typeof password !== 'string' || !phone || !password) {
      res.status(400).json({ success: false, error: '手机号和密码不能为空' });
      return;
    }

    // 1. 查 employees 表
    const { data: employees, error: queryError } = await supabase
      .from('employees')
      .select('*')
      .eq('phone', phone)
      .eq('is_active', true);

    if (queryError) {
      console.error('[auth] 查询员工失败:', queryError.message);
      res.status(500).json({ success: false, error: '服务器错误' });
      return;
    }

    if (!employees || employees.length === 0) {
      res.status(401).json({ success: false, error: '手机号或密码错误' });
      return;
    }

    const employee = employees[0];

    // 成功校验旧密码后平滑迁移为哈希。
    if (!(await verifyPassword(password, employee.password_hash))) {
      res.status(401).json({ success: false, error: '手机号或密码错误' });
      return;
    }

    if (!isPasswordHash(employee.password_hash)) {
      // 条件更新防止并发改密被旧登录覆盖；兼容旧密码不强制修改原密码。
      const migratedHash = await hashPassword(password, true);
      const { data: migrated, error: migrationError } = await supabase.from('employees')
        .update({ password_hash: migratedHash }).eq('id', employee.id)
        .eq('password_hash', employee.password_hash).eq('is_active', true).select('password_hash').maybeSingle();
      if (migrationError) return res.status(503).json({ success: false, error: '密码安全升级暂未完成，请稍后重试' });
      if (migrated) employee.password_hash = migrated.password_hash;
      else {
        const { data: latest, error } = await supabase.from('employees').select('password_hash, is_active').eq('id', employee.id).maybeSingle();
        if (error || !latest?.is_active || !(await verifyPassword(password, latest.password_hash))) {
          return res.status(401).json({ success: false, error: '账号状态或密码已变更，请重新登录' });
        }
        employee.password_hash = latest.password_hash;
      }
    }

    // 3. 签发 JWT（有效期 7 天）
    const payload: AuthEmployee = {
      id: employee.id,
      shopId: employee.shop_id || '',
      name: employee.name,
      role: employee.role || 'stylist',
      phone: employee.phone || phone,
    };

    const token = jwt.sign({ ...payload, kind: 'employee', passwordVersion: passwordVersion(employee.password_hash) }, getJwtSecret(), { algorithm: 'HS256', audience: 'employee', issuer: 'mbs', expiresIn: '7d' });

    const user = {
      id: employee.id,
      name: employee.name,
      phone: employee.phone,
      avatar: employee.avatar || '',
      title: employee.title || '',
      role: employee.role || 'stylist',
      shopId: employee.shop_id || '',
      specialty: employee.specialty || '',
      rating: Number(employee.rating) || 5.0,
    };

    console.log('[auth] 员工登录成功');
    res.json({ success: true, data: { token, user } });
  } catch (err: unknown) {
    console.error('[auth] 登录异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * GET /api/auth/me
 * 获取当前登录用户信息（需要认证）
 */
authRouter.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { data: employee, error } = await supabase
      .from('employees')
      .select('*')
      .eq('id', req.employee!.id)
      .single();

    if (error || !employee) {
      console.error('[auth] 查询当前用户失败:', error?.message);
      res.status(404).json({ success: false, error: '用户不存在' });
      return;
    }

    const user = {
      id: employee.id,
      name: employee.name,
      phone: employee.phone,
      avatar: employee.avatar || '',
      title: employee.title || '',
      role: employee.role || 'stylist',
      shopId: employee.shop_id || '',
      specialty: employee.specialty || '',
      rating: Number(employee.rating) || 5.0,
    };

    res.json({ success: true, data: user });
  } catch (err: unknown) {
    console.error('[auth] 获取当前用户异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * POST /api/auth/verify
 * 验证 Token 是否有效（需要认证）
 */
authRouter.post('/verify', authMiddleware, (req: Request, res: Response) => {
  res.json({ success: true, valid: true, employee: req.employee });
});

mainRouter.use('/auth', authRouter);

// ===================== employees =====================
const employeesRouter = Router();

// 生成员工 ID
const generateEmployeeId = () => `emp_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

// 角色层级：用于权限判断
const ROLE_PRIORITY: Record<string, number> = {
  ceo: 100,
  shop_manager: 80,
  customer_service: 60,
  cashier: 60,
  stylist: 40,
};

// 获取员工列表
employeesRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { role, shopId } = req.employee!;
    if (role !== 'ceo' && role !== 'shop_manager') {
      res.status(403).json({ success: false, error: '无权查看员工列表' });
      return;
    }

    const { data, error } = await supabase
      .from('employees')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[employees] 查询失败:', error.message);
      res.status(500).json({ success: false, error: '查询员工失败' });
      return;
    }

    res.json({ success: true, data: (data || []).map(({ password_hash: _password, ...employee }) => employee) });
  } catch (err: unknown) {
    console.error('[employees] 查询异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 创建员工
employeesRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { role, shopId } = req.employee!;
    if (role !== 'ceo' && role !== 'shop_manager') {
      res.status(403).json({ success: false, error: '无权添加员工' });
      return;
    }

    const { name, phone, title, role: newRole, password, specialty, avatar, is_active, is_gold_stylist, isGoldStylist } = req.body;

    if (!name || !phone || !newRole || !password) {
      res.status(400).json({ success: false, error: '姓名、手机号、角色、密码为必填项' });
      return;
    }

    const validRoles = ['ceo', 'shop_manager', 'customer_service', 'cashier', 'stylist'];
    if (!validRoles.includes(newRole)) {
      res.status(400).json({ success: false, error: '无效的角色' });
      return;
    }

    // 店长只能添加技师
    if (role === 'shop_manager' && newRole !== 'stylist') {
      res.status(403).json({ success: false, error: '店长只能添加技师' });
      return;
    }

    // 店长不能操作同级或上级的角色
    if (role === 'shop_manager' && ROLE_PRIORITY[newRole] >= ROLE_PRIORITY[role]) {
      res.status(403).json({ success: false, error: '店长只能添加技师' });
      return;
    }

    // 检查手机号是否已存在
    const { data: existing, error: _checkError } = await supabase
      .from('employees')
      .select('id')
      .eq('phone', phone)
      .single();

    if (existing) {
      res.status(400).json({ success: false, error: '该手机号已存在' });
      return;
    }

    const id = generateEmployeeId();
    const employeeData = {
      id,
      shop_id: shopId,
      name,
      phone,
      title: title || '',
      role: newRole,
      password_hash: await hashPassword(password),
      specialty: specialty || '',
      avatar: avatar || '',
      rating: 5.0,
      is_active: is_active !== false,
      is_gold_stylist: (isGoldStylist ?? is_gold_stylist) === true,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('employees').insert(employeeData).select().single();

    if (error) {
      console.error('[employees] 创建失败:', error.message);
      res.status(500).json({ success: false, error: '创建员工失败' });
      return;
    }

    res.status(201).json({ success: true, data: data ? Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'password_hash')) : data });
  } catch (err: unknown) {
    console.error('[employees] 创建异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 员工自助修改个人资料（头像、姓名、职位、专长、密码）
employeesRouter.put('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id: currentId, shopId } = req.employee!;
    const { name, phone, title, specialty, avatar, password } = req.body || {};

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (title !== undefined) updateData.title = title;
    if (specialty !== undefined) updateData.specialty = specialty;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (password !== undefined) updateData.password_hash = await hashPassword(password);

    const { data, error } = await supabase
      .from('employees')
      .update(updateData)
      .eq('id', currentId)
      .eq('shop_id', shopId)
      .select()
      .single();

    if (error) {
      console.error('[employees] 更新个人资料失败:', error.message);
      res.status(500).json({ success: false, error: '更新个人资料失败' });
      return;
    }

    res.json({ success: true, data: data ? Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'password_hash')) : data });
  } catch (err: unknown) {
    console.error('[employees] 更新个人资料异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 更新员工
employeesRouter.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { role, shopId, id: currentId } = req.employee!;
    if (role !== 'ceo' && role !== 'shop_manager') {
      res.status(403).json({ success: false, error: '无权更新员工' });
      return;
    }

    const { id } = req.params;
    const { name, phone, title, role: newRole, password, specialty, avatar, is_active, isActive, is_gold_stylist, isGoldStylist } = req.body;

    // 不能修改自己以外的 CEO（CEO 可以，店长不行）
    if (id !== currentId) {
      const { data: target } = await supabase.from('employees').select('role').eq('id', id).single();
      if (target?.role === 'ceo' && role !== 'ceo') {
        res.status(403).json({ success: false, error: '无权修改 CEO 信息' });
        return;
      }
      if (target?.role === 'shop_manager' && role === 'shop_manager') {
        res.status(403).json({ success: false, error: '店长不能修改其他店长' });
        return;
      }
    }

    // 店长不能把人改成非技师角色
    if (role === 'shop_manager' && newRole && newRole !== 'stylist') {
      res.status(403).json({ success: false, error: '店长只能设置技师角色' });
      return;
    }

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (title !== undefined) updateData.title = title;
    if (newRole !== undefined) updateData.role = newRole;
    if (password !== undefined) updateData.password_hash = await hashPassword(password);
    if (specialty !== undefined) updateData.specialty = specialty;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (isGoldStylist !== undefined || is_gold_stylist !== undefined) updateData.is_gold_stylist = (isGoldStylist ?? is_gold_stylist) === true;
    const nextIsActive = is_active !== undefined ? is_active : isActive;
    if (nextIsActive !== undefined) updateData.is_active = nextIsActive;

    const { data, error } = await supabase
      .from('employees')
      .update(updateData)
      .eq('id', id)
      .eq('shop_id', shopId)
      .select()
      .single();

    if (error) {
      console.error('[employees] 更新失败:', error.message);
      res.status(500).json({ success: false, error: '更新员工失败' });
      return;
    }

    res.json({ success: true, data: data ? Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'password_hash')) : data });
  } catch (err: unknown) {
    console.error('[employees] 更新异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

// 删除员工
employeesRouter.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { role, shopId, id: currentId } = req.employee!;
    if (role !== 'ceo' && role !== 'shop_manager') {
      res.status(403).json({ success: false, error: '无权删除员工' });
      return;
    }

    const { id } = req.params;

    if (id === currentId) {
      res.status(400).json({ success: false, error: '不能删除自己' });
      return;
    }

    const { data: target } = await supabase.from('employees').select('role').eq('id', id).single();
    if (target?.role === 'ceo') {
      res.status(403).json({ success: false, error: '不能删除 CEO' });
      return;
    }
    if (target?.role === 'shop_manager' && role === 'shop_manager') {
      res.status(403).json({ success: false, error: '店长不能删除其他店长' });
      return;
    }

    const { error } = await supabase.from('employees').delete().eq('id', id).eq('shop_id', shopId);

    if (error) {
      console.error('[employees] 删除失败:', error.message);
      res.status(500).json({ success: false, error: '删除员工失败' });
      return;
    }

    res.json({ success: true, message: '删除成功' });
  } catch (err: unknown) {
    console.error('[employees] 删除异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

mainRouter.use('/employees', employeesRouter);

// ===================== bookings =====================
// 结算奖励在036触发器内与结算同事务提交；不在响应后异步更新余额。
const bookingsRouter = Router();
bookingsRouter.use(bookingAccess);

const generateBookingId = () => `book_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

// 时段长度（分钟），用于排队号分组
const BOOKING_TIME_SLOT_MINUTES = 30;

// 获取预约时间所在时段的起始时间
const getBookingTimeSlotStart = (date: Date, slotMinutes: number = BOOKING_TIME_SLOT_MINUTES) => {
  const d = new Date(date);
  const slotStart = Math.floor(d.getMinutes() / slotMinutes) * slotMinutes;
  d.setMinutes(slotStart, 0, 0);
  d.setMilliseconds(0);
  return d;
};

const bookingFromDb = (b: Record<string, unknown>): Record<string, unknown> => ({
  id: b.id,
  shopId: b.shop_id,
  customerId: b.customer_id,
  customerName: b.customer_name,
  customerPhone: b.customer_phone,
  stylistId: b.stylist_id,
  stylistName: b.stylist_name,
  // 兼容前端历史字段名 barberId / barberName
  barberId: b.stylist_id,
  barberName: b.stylist_name,
  serviceId: b.service_id,
  serviceName: b.service_name,
  price: b.price,
  scheduledTime: b.scheduled_time,
  scheduledEndTime: b.scheduled_end_time,
  actualStartTime: b.actual_start_time,
  actualEndTime: b.actual_end_time,
  packageId: b.package_id,
  queueNumber: b.queue_number,
  status: b.status,
  notes: b.notes,
  createdAt: b.created_at,
  delayState: b.delay_state,
  delayReason: b.delay_reason,
  delayExpectedEnd: b.delay_expected_end,
  delayCreatedAt: b.delay_created_at,
});

// 惰性过期：将超过 4 小时未处理的延时预约标记为 no_response（读取时批量处理，每次最多 100 条，避免频繁写库）
const expireDelayNoResponse = async (): Promise<void> => {
  try {
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    const { data: expired } = await supabase
      .from('bookings')
      .select('id')
      .eq('delay_state', 'needs_action')
      .lt('delay_created_at', fourHoursAgo)
      .limit(100);
    const ids = (expired || []).map((r) => r.id as string);
    if (ids.length > 0) {
      await supabase.from('bookings').update({ delay_state: 'no_response' }).in('id', ids);
    }
  } catch (err) {
    console.error('[bookings] 延时惰性过期失败:', (err as Error).message);
  }
};

// 获取预约列表
bookingsRouter.get('/', async (req: Request, res: Response) => {
  try {
    if (req.employee) await expireDelayNoResponse();
    const shopId = req.employee?.shopId || String(req.query.shopId || 'shop1');
    const status = req.query.status as string | undefined;
    // 兼容小程序传入 date=YYYY-MM-DD 与 H5 传入 dateStart=YYYY-MM-DD
    const dateStart = (req.query.dateStart || req.query.date) as string | undefined;
    const page = String(req.query.page || '1');
    const pageSize = String(req.query.pageSize || '1000');

    let query = supabase
      .from('bookings')
      .select('*', { count: 'exact' })
      .eq('shop_id', shopId)
      .order('scheduled_time', { ascending: true });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (dateStart) {
      const range=businessDayRange(dateStart.slice(0,10));
      if(!range) return res.status(400).json({success:false,error:'预约日期格式不正确'});
      const {start,end}=range;
      query = query.gte('scheduled_time', start.toISOString()).lt('scheduled_time', end.toISOString());
    }

    const pageNum = parseInt(page, 10);
    const size = parseInt(pageSize, 10);
    if(!Number.isInteger(pageNum) || pageNum<1 || !Number.isInteger(size) || size<1 || size>1000) return res.status(400).json({success:false,error:'分页参数不正确，每页允许1至1000条'});
    const offset = (pageNum - 1) * size;

    query = query.range(offset, offset + size - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[bookings] 查询预约列表失败:', error.message);
      return res.status(500).json({
        success: false,
        error: '获取预约列表失败',
        details: error.message,
      });
    }

    const {data: slotShop,error: slotShopError} = req.employee ? {data:null,error:null} : await supabase.from('shops').select('services').eq('id',shopId).maybeSingle();
    if (slotShopError) return res.status(503).json({success:false,error:'档期服务时长暂不可用'});
    const bookings = (data || []).map(b => req.employee ? bookingFromDb(b) : {
      scheduledTime: b.scheduled_time, scheduledEndTime: b.scheduled_end_time,
      actualStartTime: b.actual_start_time, actualEndTime: b.actual_end_time,
      stylistId: b.stylist_id, barberId: b.stylist_id, serviceId: b.service_id, status: b.status,
      duration: Math.max(1, Number((slotShop?.services || []).find((service:any) => String(service.id)===String(b.service_id))?.duration) || 30),
    });
    const total = count || 0;
    const totalPages = Math.ceil(total / size);

    res.json({
      success: true,
      data: bookings,
      pagination: {
        page: pageNum,
        pageSize: size,
        total,
        totalPages,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : '';
    console.error('[bookings] 获取预约列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取预约列表失败',
      details: message,
      stack,
    });
  }
});

// 获取某个客户的所有预约
bookingsRouter.get('/customer/:customerId', (req, res, next) => personalCustomerAccess(req, res, next, 'customerId'), async (req: Request, res: Response) => {
  try {
    await expireDelayNoResponse();
    const { customerId } = req.params;
    const page = String(req.query.page || '1');
    const pageSize = String(req.query.pageSize || '50');

    const pageNum = parseInt(page, 10);
    const size = parseInt(pageSize, 10);
    const offset = (pageNum - 1) * size;

    const { data, error, count } = await supabase
      .from('bookings')
      .select('*', { count: 'exact' })
      .eq('customer_id', customerId)
      .order('scheduled_time', { ascending: true })
      .range(offset, offset + size - 1);

    if (error) {
      console.error('[bookings] 查询客户预约失败:', error.message);
      return res.status(500).json({
        success: false,
        error: '查询客户预约失败',
      });
    }

    const bookings = (data || []).map(bookingFromDb);
    const total = count || 0;
    const totalPages = Math.ceil(total / size);

    res.json({
      success: true,
      data: bookings,
      pagination: {
        page: pageNum,
        pageSize: size,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error('[bookings] 获取客户预约失败:', error);
    res.status(500).json({
      success: false,
      error: '获取客户预约失败',
    });
  }
});

// 获取单条预约
bookingsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[bookings] 查询预约失败:', error.message);
      return res.status(500).json({
        success: false,
        error: '查询预约失败',
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: '预约不存在',
      });
    }

    res.json({
      success: true,
      data: bookingFromDb(data),
    });
  } catch (error) {
    console.error('[bookings] 获取预约失败:', error);
    res.status(500).json({
      success: false,
      error: '获取预约失败',
    });
  }
});

// 更新预约状态（需登录）
bookingsRouter.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, customerId } = req.body;
    const employee = req.employee;

    if (!status || !['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: '无效的状态值',
      });
    }

    // 获取原预约信息
    const { data: originalBooking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('[bookings] 查询预约失败:', fetchError.message);
      return res.status(500).json({
        success: false,
        error: '查询预约失败',
      });
    }

    if (!originalBooking) {
      return res.status(404).json({
        success: false,
        error: '预约不存在',
      });
    }

    // 权限校验
    const isCEO = employee?.role === 'ceo';
    const isManager = employee?.role === 'shop_manager';
    const isCustomerService = employee?.role === 'customer_service';
    const isTargetStylist =
      employee?.role === 'stylist' && originalBooking.stylist_id === employee.id;

    if (status === 'completed') {
      if (!isCEO && !isTargetStylist) {
        return res.status(403).json({ success: false, error: '只有对应发型师或 CEO 可标记服务完成' });
      }
    } else if (status === 'cancelled') {
      if (!isCEO && !isCustomerService && !isManager) {
        return res.status(403).json({ success: false, error: '无权取消该预约' });
      }
    } else {
      // pending / confirmed 状态调整，店长/客服/对应发型师可操作
      if (!isCEO && !isManager && !isCustomerService && !isTargetStylist) {
        return res.status(403).json({ success: false, error: '无权更新该预约状态' });
      }
    }

    // 更新状态
    const { data, error } = await supabase
      .from('bookings')
      .update({ status })
      .eq('id', id)
      .eq('shop_id', req.employee!.shopId)
      .eq('status', originalBooking.status)
      .select()
      .single();

    if (error) {
      console.error('[bookings] 更新预约状态失败:', error.message);
      return res.status(500).json({
        success: false,
        error: '更新预约状态失败',
      });
    }

    // 服务完成只改变服务状态；消费统计、到店记录和次卡统一在结算事务入账。

    res.json({
      success: true,
      data: bookingFromDb(data),
    });
  } catch (error) {
    console.error('[bookings] 更新预约状态失败:', error);
    res.status(500).json({
      success: false,
      error: '更新预约状态失败',
    });
  }
});


// 更新预约关联的次卡（预约时选择/切换/取消使用哪张次卡）
bookingsRouter.put('/:id/package', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { packageId } = req.body;
    const employee = req.employee;

    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('[bookings] 查询预约失败:', fetchError.message);
      return res.status(500).json({ success: false, error: '查询预约失败' });
    }
    if (!booking) {
      return res.status(404).json({ success: false, error: '预约不存在' });
    }

    const isCEO = employee?.role === 'ceo';
    const isManager = employee?.role === 'shop_manager';
    const isCustomerService = employee?.role === 'customer_service';
    const isTargetStylist = employee?.role === 'stylist' && booking.stylist_id === employee.id;
    if (!isCEO && !isManager && !isCustomerService && !isTargetStylist) {
      return res.status(403).json({ success: false, error: '无权修改该预约的次卡' });
    }

    if (packageId) {
      const { data: pkg, error: pkgError } = await supabase
        .from('customer_packages')
        .select('*')
        .eq('id', packageId)
        .single();
      if (pkgError || !pkg) {
        return res.status(404).json({ success: false, error: '次卡不存在' });
      }
      if (pkg.customer_id !== booking.customer_id || pkg.service_id !== booking.service_id || pkg.shop_id !== booking.shop_id) {
        return res.status(400).json({ success: false, error: '次卡与预约不匹配' });
      }
      if (pkg.status !== 'active' || (pkg.used_times as number) >= (pkg.total_times as number)) {
        return res.status(400).json({ success: false, error: '次卡不可用' });
      }
    }

    const { data, error } = await supabase
      .from('bookings')
      .update({ package_id: packageId || null, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[bookings] 更新次卡关联失败:', error.message);
      return res.status(500).json({ success: false, error: '更新次卡关联失败' });
    }

    res.json({ success: true, data: bookingFromDb(data) });
  } catch (err) {
    console.error('[bookings] 更新次卡关联异常:', err);
    res.status(500).json({ success: false, error: '更新次卡关联失败' });
  }
});

// 顾客自主取消：路由统一中间件已验证本人会话及预约归属。
bookingsRouter.put('/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { customerId } = req.body;

    if (!customerId) {
      return res.status(400).json({ success: false, error: '缺少顾客信息' });
    }

    const { data: originalBooking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('[bookings] 查询预约失败:', fetchError.message);
      return res.status(500).json({ success: false, error: '查询预约失败' });
    }

    if (!originalBooking) {
      return res.status(404).json({ success: false, error: '预约不存在' });
    }

    if (originalBooking.customer_id !== customerId) {
      return res.status(403).json({ success: false, error: '无权取消该预约' });
    }

    if (originalBooking.status === 'cancelled') {
      return res.status(400).json({ success: false, error: '预约已取消' });
    }

    if (originalBooking.status === 'completed') {
      return res.status(400).json({ success: false, error: '已完成的服务无法取消' });
    }

    const { data, error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[bookings] 取消预约失败:', error.message);
      return res.status(500).json({ success: false, error: '取消预约失败' });
    }

    res.json({
      success: true,
      data: bookingFromDb(data),
    });
  } catch (error) {
    console.error('[bookings] 取消预约异常:', (error as Error).message);
    res.status(500).json({ success: false, error: '取消预约失败' });
  }
});

// 调配预约发型师（仅店长/CEO，需登录）
bookingsRouter.put('/:id/barber', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { stylistId, stylistName } = req.body;
    const employee = req.employee!;

    if (!stylistId) {
      return res.status(400).json({ success: false, error: '缺少发型师信息' });
    }

    if (employee.role !== 'ceo' && employee.role !== 'shop_manager') {
      return res.status(403).json({ success: false, error: '无权调配发型师' });
    }

    const { data: originalBooking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('[bookings] 查询预约失败:', fetchError.message);
      return res.status(500).json({ success: false, error: '查询预约失败' });
    }

    if (!originalBooking) {
      return res.status(404).json({ success: false, error: '预约不存在' });
    }

    const { data: stylist, error: stylistError } = await supabase.from('employees').select('name').eq('id', stylistId).eq('shop_id', employee.shopId).eq('is_active', true).maybeSingle();
    if (stylistError) return res.status(503).json({ success: false, error: '设计师信息暂不可用' });
    if (!stylist) return res.status(400).json({ success: false, error: '设计师不属于本店有效员工' });
    const { data, error } = await supabase
      .from('bookings')
      .update({ stylist_id: stylistId, stylist_name: stylist.name })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[bookings] 调配发型师失败:', error.message);
      return res.status(500).json({ success: false, error: '调配发型师失败' });
    }

    res.json({ success: true, data: bookingFromDb(data) });
  } catch (error) {
    console.error('[bookings] 调配发型师异常:', error);
    res.status(500).json({ success: false, error: '调配发型师失败' });
  }
});

// 辅助函数：前端 <input type="datetime-local"> 返回的是无时区本地时间字符串，
// 需要按 Asia/Shanghai（UTC+8）解析，避免 Node.js 默认按 UTC 处理导致显示偏移 8 小时。
const parseLocalDateTime = (input: string): Date => {
  if (!input) return new Date(NaN);
  const normalized = input.trim();
  // 如果字符串已经带时区，直接交给原生 Date 解析
  if (/[Zz]|[+-]\d{2}:\d{2}$/.test(normalized)) {
    return new Date(normalized);
  }
  // 否则补 +08:00 按北京时间解析
  return new Date(`${normalized}+08:00`);
};

// 修改预约时间（客服/店长/CEO/对应发型师）
bookingsRouter.put('/:id/schedule', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { scheduledTime, customEndTime, ignoreConflict } = req.body;
    const employee = req.employee!;

    if (!scheduledTime) {
      return res.status(400).json({ success: false, error: '缺少预约时间' });
    }

    const startTime = parseLocalDateTime(scheduledTime);
    if (isNaN(startTime.getTime())) {
      return res.status(400).json({ success: false, error: '预约时间格式无效' });
    }

    let endTime: Date | null = null;
    if (customEndTime) {
      endTime = parseLocalDateTime(customEndTime);
      if (isNaN(endTime.getTime())) {
        return res.status(400).json({ success: false, error: '结束时间格式无效' });
      }
      if (endTime.getTime() <= startTime.getTime()) {
        return res.status(400).json({ success: false, error: '结束时间必须晚于开始时间' });
      }
    }

    // 获取原预约
    const { data: originalBooking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('[bookings] 查询预约失败:', fetchError.message);
      return res.status(500).json({ success: false, error: '查询预约失败' });
    }
    if (!originalBooking) {
      return res.status(404).json({ success: false, error: '预约不存在' });
    }

    // 权限校验
    const isCEO = employee.role === 'ceo';
    const isManager = employee.role === 'shop_manager';
    const isCustomerService = employee.role === 'customer_service';
    const isTargetStylist =
      employee.role === 'stylist' && originalBooking.stylist_id === employee.id;

    if (!isCEO && !isManager && !isCustomerService && !isTargetStylist) {
      return res.status(403).json({ success: false, error: '无权修改该预约时间' });
    }

    const targetStylistId = originalBooking.stylist_id;

    // 计算新的预约结束时间：优先使用自定义结束时间，否则按原服务时长推算
    let finalEndTime: Date | null = endTime;
    if (!finalEndTime && originalBooking.scheduled_time && originalBooking.scheduled_end_time) {
      const originalStart = new Date(originalBooking.scheduled_time as string);
      const originalEnd = new Date(originalBooking.scheduled_end_time as string);
      if (originalEnd.getTime() > originalStart.getTime()) {
        const duration = originalEnd.getTime() - originalStart.getTime();
        finalEndTime = new Date(startTime.getTime() + duration);
      }
    }
    // 仍无结束时间时按默认服务时长 1 小时推算
    if (!finalEndTime) {
      finalEndTime = new Date(startTime.getTime() + 60 * 60 * 1000);
    }

    // 冲突检查：同一发型师在新预约时间段内是否有其他非取消预约
    if (targetStylistId) {
      const conflictStart = startTime.toISOString();
      const conflictEnd = finalEndTime.toISOString();

      const { data: conflicts, error: conflictError } = await supabase
        .from('bookings')
        .select('*')
        .eq('stylist_id', targetStylistId)
        .neq('status', 'cancelled')
        .neq('id', id)
        .lt('scheduled_time', conflictEnd)
        .gt('scheduled_end_time', conflictStart);

      if (conflictError) {
        console.error('[bookings] 冲突检查失败:', conflictError.message);
      } else if (conflicts && conflicts.length > 0) {
        if (!ignoreConflict) {
          return res.status(409).json({
            success: false,
            error: '该时间段与发型师其他预约冲突',
            data: conflicts.map(bookingFromDb),
          });
        }
      }
    }

    const updatePayload: Record<string, unknown> = {
      scheduled_time: startTime.toISOString(),
      scheduled_end_time: finalEndTime.toISOString(),
    };

    const { data, error } = await supabase
      .from('bookings')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[bookings] 修改预约时间失败:', error.message);
      return res.status(500).json({ success: false, error: '修改预约时间失败' });
    }

    res.json({ success: true, data: bookingFromDb(data) });
  } catch (error) {
    console.error('[bookings] 修改预约时间异常:', error);
    res.status(500).json({ success: false, error: '修改预约时间失败' });
  }
});

// 发型师临时延时：识别同一发型师的后续受影响预约并标记为待顾客处理
bookingsRouter.post('/:id/delay', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { extraMinutes, reason } = req.body;
    const employee = req.employee!;

    const extra = Number(extraMinutes);
    if (!Number.isFinite(extra) || extra <= 0) {
      return res.status(400).json({ success: false, error: '请填写有效的延时时长（分钟）' });
    }

    const { data: originalBooking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !originalBooking) {
      return res.status(404).json({ success: false, error: '预约不存在' });
    }

    if (!originalBooking.stylist_id) {
      return res.status(400).json({ success: false, error: '该预约尚未指定发型师，无法延时' });
    }

    // 权限与改期一致：ceo/shop_manager/customer_service/该发型师本人
    const isCEO = employee.role === 'ceo';
    const isManager = employee.role === 'shop_manager';
    const isCustomerService = employee.role === 'customer_service';
    const isTargetStylist = employee.role === 'stylist' && originalBooking.stylist_id === employee.id;
    if (!isCEO && !isManager && !isCustomerService && !isTargetStylist) {
      return res.status(403).json({ success: false, error: '无权对该预约进行延时操作' });
    }

    // 计算延时后预计结束时间：优先使用已有结束时间，否则按 60 分钟默认服务时长推算
    const baseEnd = originalBooking.scheduled_end_time
      ? new Date(originalBooking.scheduled_end_time)
      : originalBooking.scheduled_time
        ? new Date(new Date(originalBooking.scheduled_time).getTime() + 60 * 60 * 1000)
        : null;
    if (!baseEnd || isNaN(baseEnd.getTime())) {
      return res.status(400).json({ success: false, error: '预约时间信息不完整，无法计算延时' });
    }
    const expectedEnd = new Date(baseEnd.getTime() + extra * 60 * 1000);
    const nowIso = new Date().toISOString();

    // 更新本预约结束时间，保持后续档期一致
    await supabase.from('bookings').update({ scheduled_end_time: expectedEnd.toISOString() }).eq('id', id);

    const delayReason = reason || `发型师临时延时约 ${extra} 分钟`;

    // 查询受影响后续预约：同发型师、未取消、开始时间落在 [now, expectedEnd)
    const { data: affected, error: affError } = await supabase
      .from('bookings')
      .select('*')
      .eq('stylist_id', originalBooking.stylist_id)
      .in('status', ['pending', 'confirmed'])
      .neq('id', id)
      .gte('scheduled_time', nowIso)
      .lt('scheduled_time', expectedEnd.toISOString());

    if (affError) {
      console.error('[bookings] 查询受影响预约失败:', affError.message);
    }

    const affectedList = affected || [];
    if (affectedList.length > 0) {
      const ids = affectedList.map((b) => b.id as string);
      const { error: updError } = await supabase
        .from('bookings')
        .update({
          delay_state: 'needs_action',
          delay_reason: delayReason,
          delay_expected_end: expectedEnd.toISOString(),
          delay_created_at: nowIso,
        })
        .in('id', ids);
      if (updError) {
        console.error('[bookings] 标记受影响预约失败:', updError.message);
      }
    }

    res.json({
      success: true,
      data: {
        expectedEnd: expectedEnd.toISOString(),
        affected: affectedList.map((b) =>
          bookingFromDb({
            ...b,
            delay_state: 'needs_action',
            delay_reason: delayReason,
            delay_expected_end: expectedEnd.toISOString(),
            delay_created_at: nowIso,
          })
        ),
      },
    });
  } catch (error) {
    console.error('[bookings] 延时操作异常:', error);
    res.status(500).json({ success: false, error: '延时操作失败' });
  }
});

// 顾客处理延时通知：v1 仅支持改时间
bookingsRouter.put('/:id/delay-respond', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { customerId, action, scheduledTime } = req.body;

    if (!customerId || !action) {
      return res.status(400).json({ success: false, error: '参数不完整' });
    }

    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !booking) {
      return res.status(404).json({ success: false, error: '预约不存在' });
    }

    // 仅顾客本人可操作
    if (booking.customer_id !== customerId) {
      return res.status(403).json({ success: false, error: '无权操作该预约' });
    }

    if (booking.delay_state !== 'needs_action') {
      return res.status(409).json({ success: false, error: '该预约已不在待处理状态' });
    }

    if (action !== 'reschedule') {
      return res.status(400).json({ success: false, error: '暂不支持的响应类型' });
    }

    if (!scheduledTime) {
      return res.status(400).json({ success: false, error: '缺少预约时间' });
    }

    const startTime = parseLocalDateTime(scheduledTime);
    if (isNaN(startTime.getTime())) {
      return res.status(400).json({ success: false, error: '预约时间格式无效' });
    }

    // 复用原有服务时长推算结束时间
    let finalEndTime: Date | null = null;
    if (booking.scheduled_time && booking.scheduled_end_time) {
      const os = new Date(booking.scheduled_time);
      const oe = new Date(booking.scheduled_end_time);
      if (oe.getTime() > os.getTime()) {
        const duration = oe.getTime() - os.getTime();
        finalEndTime = new Date(startTime.getTime() + duration);
      }
    }
    if (!finalEndTime) {
      finalEndTime = new Date(startTime.getTime() + 60 * 60 * 1000);
    }

    // 冲突检查：同一发型师在新时间段内是否有其他非取消预约
    if (booking.stylist_id) {
      const { data: conflicts, error: conflictError } = await supabase
        .from('bookings')
        .select('*')
        .eq('stylist_id', booking.stylist_id)
        .neq('status', 'cancelled')
        .neq('id', id)
        .lt('scheduled_time', finalEndTime.toISOString())
        .gt('scheduled_end_time', startTime.toISOString());

      if (!conflictError && conflicts && conflicts.length > 0) {
        return res.status(409).json({ success: false, error: '该时间段与发型师其他预约冲突，请换一个时间' });
      }
    }

    const { data: updated, error: updError } = await supabase
      .from('bookings')
      .update({
        scheduled_time: startTime.toISOString(),
        scheduled_end_time: finalEndTime.toISOString(),
        delay_state: 'rescheduled',
      })
      .eq('id', id)
      .select()
      .single();

    if (updError) {
      return res.status(500).json({ success: false, error: '修改预约时间失败' });
    }

    res.json({ success: true, data: bookingFromDb(updated) });
  } catch (error) {
    console.error('[bookings] 处理延时通知异常:', error);
    res.status(500).json({ success: false, error: '处理失败' });
  }
});

// 记录/修改实际服务时间（发型师/客服/店长/CEO）
bookingsRouter.put('/:id/service-time', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { actualStartTime, actualEndTime } = req.body;
    const employee = req.employee!;

    if (!actualStartTime && !actualEndTime) {
      return res.status(400).json({ success: false, error: '至少提供一个实际服务时间' });
    }

    const startTime = actualStartTime ? parseLocalDateTime(actualStartTime) : null;
    const endTime = actualEndTime ? parseLocalDateTime(actualEndTime) : null;

    if (startTime && isNaN(startTime.getTime())) {
      return res.status(400).json({ success: false, error: '实际开始时间格式无效' });
    }
    if (endTime && isNaN(endTime.getTime())) {
      return res.status(400).json({ success: false, error: '实际结束时间格式无效' });
    }
    if (startTime && endTime && endTime.getTime() <= startTime.getTime()) {
      return res.status(400).json({ success: false, error: '结束时间必须晚于开始时间' });
    }

    // 获取原预约
    const { data: originalBooking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) {
      console.error('[bookings] 查询预约失败:', fetchError.message);
      return res.status(500).json({ success: false, error: '查询预约失败' });
    }
    if (!originalBooking) {
      return res.status(404).json({ success: false, error: '预约不存在' });
    }

    // 权限校验
    const isCEO = employee.role === 'ceo';
    const isManager = employee.role === 'shop_manager';
    const isCustomerService = employee.role === 'customer_service';
    const isTargetStylist =
      employee.role === 'stylist' && originalBooking.stylist_id === employee.id;

    if (!isCEO && !isManager && !isCustomerService && !isTargetStylist) {
      return res.status(403).json({ success: false, error: '无权修改该预约服务时间' });
    }

    const updatePayload: Record<string, unknown> = {};
    if (startTime) updatePayload.actual_start_time = startTime.toISOString();
    if (endTime) updatePayload.actual_end_time = endTime.toISOString();

    // 如果填写了结束时间且原状态不是已完成，可顺便标记完成（可选，由前端通过 status 控制更明确）
    // 这里不自动改状态，保持单一职责

    const { data, error } = await supabase
      .from('bookings')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[bookings] 更新实际服务时间失败:', error.message);
      return res.status(500).json({ success: false, error: '更新实际服务时间失败' });
    }

    res.json({ success: true, data: bookingFromDb(data) });
  } catch (error) {
    console.error('[bookings] 更新实际服务时间异常:', error);
    res.status(500).json({ success: false, error: '更新实际服务时间失败' });
  }
});

// 创建预约
bookingsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { shopId, customerId, serviceId, scheduledTime, notes, customerName, stylistId, stylistName, serviceName, price } = req.body;

    if (!shopId || !customerId || !serviceId || !scheduledTime) {
      return res.status(400).json({
        success: false,
        error: '缺少必要字段',
      });
    }

    let scheduledTimeDate: Date;
    try {
      scheduledTimeDate = parseLocalDateTime(scheduledTime);
      if (isNaN(scheduledTimeDate.getTime())) {
        throw new Error('invalid date');
      }
    } catch (_e) {
      return res.status(400).json({
        success: false,
        error: '预约时间格式无效',
      });
    }

    // 始终读取实际目录及确认规则，不能被客户端的显示字段绕过。
    const [customerResult, shopResult, stylistResult] = await Promise.all([
      supabase.from('customers').select('name, phone').eq('id', customerId).eq('shop_id', shopId).maybeSingle(),
      supabase.from('shops').select('services, booking_confirm_mode, opening_hours, is_active').eq('id', shopId).maybeSingle(),
      stylistId ? supabase.from('employees').select('name').eq('id', stylistId).eq('shop_id', shopId).eq('is_active', true).maybeSingle() : Promise.resolve({ data: null, error: null }),
    ]);
    if (customerResult.error || shopResult.error || stylistResult.error) return res.status(503).json({ success: false, error: '预约基础信息暂不可用' });
    const service = (shopResult.data?.services || []).find((s: any) => String(s.id) === String(serviceId) && s.isActive !== false);
    if (!customerResult.data || !service || (stylistId && !stylistResult.data)) return res.status(400).json({ success: false, error: '顾客、服务或设计师不属于本店有效目录' });
    if(shopResult.data?.is_active===false || !startsDuringOpening(scheduledTimeDate,shopResult.data?.opening_hours)) return res.status(400).json({success:false,error:'预约开始时间不在门店设置的营业时间内，请重新选择'});
    const finalCustomerName = customerResult.data.name;
    const finalCustomerPhone = customerResult.data.phone;
    const finalServiceName = service.name;
    const finalPrice = Number(service.price);
    if (!Number.isFinite(finalPrice) || finalPrice < 0) return res.status(400).json({ success: false, error: '服务价格无效' });
    const bookingConfirmMode = shopResult.data?.booking_confirm_mode || 'auto';
    const finalStylistName = stylistResult.data?.name || '';

    // 按店铺 + 预约日期 + 同一时段 + 有效状态统计排队人数，用于生成更合理的排队号
    const {start:scheduledDateStart,end:scheduledDateEnd}=businessDayRange(businessDate(scheduledTimeDate))!;

    const slotStart = getBookingTimeSlotStart(scheduledTimeDate);
    const slotEnd = new Date(slotStart);
    slotEnd.setMinutes(slotEnd.getMinutes() + BOOKING_TIME_SLOT_MINUTES);

    const { count, error: countError } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .in('status', ['pending', 'confirmed'])
      .gte('scheduled_time', slotStart.toISOString())
      .lt('scheduled_time', slotEnd.toISOString());

    if (countError) {
      console.error('[bookings] 查询预约数失败:', countError.message);
    }

    const newBooking = {
      id: generateBookingId(),
      shop_id: shopId,
      customer_id: customerId,
      customer_name: finalCustomerName || '顾客',
      customer_phone: finalCustomerPhone || '',
      stylist_id: stylistId || null,
      stylist_name: finalStylistName || '',
      service_id: serviceId,
      service_name: finalServiceName || '服务',
      price: finalPrice || 0,
      scheduled_time: scheduledTimeDate.toISOString(),
      queue_number: (count || 0) + 1,
      status: bookingConfirmMode === 'manual' ? 'pending' : 'confirmed',
      notes: notes || '',
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('bookings')
      .insert(newBooking)
      .select()
      .single();

    if (error) {
      console.error('[bookings] 创建预约失败:', error.message);
      return res.status(500).json({
        success: false,
        error: error.message?.includes('BOOKING_SLOT_TAKEN') ? '该设计师的时段已被预约，请刷新预约列表或选择其他时间' : '预约未确认成功，请查看我的预约后再操作',
      });
    }

    res.status(201).json({
      success: true,
      data: bookingFromDb(data),
    });
  } catch (error) {
    console.error('[bookings] 创建预约失败:', error);
    res.status(500).json({
      success: false,
      error: '创建预约失败',
    });
  }
});

mainRouter.use('/bookings', bookingsRouter);

// ===================== customer packages（次卡套餐）====================
const customerPackagesRouter = Router();
customerPackagesRouter.use(authMiddleware, shopContext);

const packageFromDb = (p: Record<string, unknown>): Record<string, unknown> => ({
  id: p.id,
  shopId: p.shop_id,
  customerId: p.customer_id,
  name: p.name,
  serviceId: p.service_id,
  totalTimes: p.total_times,
  usedTimes: p.used_times,
  price: p.price,
  expiresAt: p.expires_at,
  allowHolidayUse: p.allow_holiday_use,
  status: p.status,
  orderId: p.order_id,
  source: p.source,
  activityType: p.activity_type,
  createdAt: p.created_at,
  updatedAt: p.updated_at,
});

const packageLogFromDb = (l: Record<string, unknown>): Record<string, unknown> => ({
  id: l.id,
  packageId: l.package_id,
  bookingId: l.booking_id,
  customerId: l.customer_id,
  shopId: l.shop_id,
  usedAt: l.used_at,
  usedBy: l.used_by,
  note: l.note,
});

const membershipEnrollmentFromDb = (m: DbRecord): Record<string, unknown> => ({
  id: m.id,
  shopId: m.shop_id,
  customerId: m.customer_id,
  level: m.level,
  source: m.source,
  activityType: m.activity_type,
  packageId: m.package_id,
  enrolledAt: m.enrolled_at,
  expiresAt: m.expires_at,
  status: m.status,
  revokedAt: m.revoked_at,
  revokedBy: m.revoked_by,
  revokedByName: m.revoked_by_name,
  note: m.note,
  createdAt: m.created_at,
  updatedAt: m.updated_at,
});

/**
 * 查找店铺内「设计师洗剪吹」服务（钻石会员赠送的 58 元剪发服务）。
 * 优先精确匹配名称，其次匹配「名称含『剪』且价格 = 58」。
 */
async function findDiamondHaircutService(shopId: string): Promise<{ id: string; name: string } | null> {
  try {
    const { data,error } = await supabase.from('shops').select('services').eq('id', shopId).single();
    if(error) throw new Error('店铺服务配置查询失败');
    const services = (data?.services as Array<Record<string, unknown>>) || [];
    let svc = services.find((s) => String(s.name || '').trim() === '设计师洗剪吹');
    if (!svc) {
      svc = services.find((s) => Number(s.price) === 58 && /剪/.test(String(s.name || '')));
    }
    if (!svc || !svc.id) return null;
    return { id: String(svc.id), name: String(svc.name) };
  } catch (err) {
    console.error('[membership] 查找58剪发服务失败:', err instanceof Error ? err.message : err);
    throw new Error('店铺服务配置查询失败，请重试');
  }
}

// 查询次卡列表（店铺端查全部，顾客端按 customer_id）
customerPackagesRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { customerId, shopId, status } = req.query;
    const employee = req.employee!;
    const targetShopId = (shopId as string) || employee.shopId;

    let query = supabase.from('customer_packages').select('*').eq('shop_id', targetShopId);

    if (customerId) {
      query = query.eq('customer_id', customerId as string);
    }
    if (status) {
      query = query.eq('status', status as string);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('[customer-packages] 查询失败:', error.message);
      return res.status(500).json({ success: false, error: '查询次卡失败' });
    }

    res.json({ success: true, data: (data || []).map(packageFromDb) });
  } catch (err) {
    console.error('[customer-packages] 查询异常:', err);
    res.status(500).json({ success: false, error: '查询次卡失败' });
  }
});

// 查询单个次卡详情
customerPackagesRouter.get('/:id', ownRecord('customer_packages'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase.from('customer_packages').select('*').eq('id', id).single();

    if (error) {
      console.error('[customer-packages] 查询详情失败:', error.message);
      return res.status(500).json({ success: false, error: '查询次卡详情失败' });
    }
    if (!data) {
      return res.status(404).json({ success: false, error: '次卡不存在' });
    }

    res.json({ success: true, data: packageFromDb(data) });
  } catch (err) {
    console.error('[customer-packages] 查询详情异常:', err);
    res.status(500).json({ success: false, error: '查询次卡详情失败' });
  }
});

// 创建次卡（店铺端手动开卡）
customerPackagesRouter.post('/', requirePermission('shop:edit'), async (req: Request, res: Response) => {
  try {
    const {
      customerId,
      name,
      serviceId,
      totalTimes,
      price,
      expiresAt,
      allowHolidayUse,
      activityType,
    } = req.body;
    const employee = req.employee!;

    if (!customerId || !serviceId || !totalTimes || !expiresAt) {
      return res.status(400).json({ success: false, error: '缺少必要字段' });
    }

    const { data: owner, error: ownerError } = await supabase.from('customers').select('id')
      .eq('id', customerId).eq('shop_id', employee.shopId).maybeSingle();
    if (ownerError) return res.status(503).json({ success: false, error: '顾客归属校验暂不可用' });
    if (!owner) return res.status(404).json({ success: false, error: '顾客不存在或不属于本店' });
    if (!Number.isInteger(Number(totalTimes)) || Number(totalTimes) <= 0 || !Number.isFinite(Number(price || 0)) || Number(price || 0) < 0 || Number.isNaN(new Date(expiresAt).getTime())) {
      return res.status(400).json({ success: false, error: '次卡次数、金额或有效期不正确' });
    }

    const packageData: Record<string, unknown> = {
      shop_id: employee.shopId,
      customer_id: customerId,
      name: name || '次卡套餐',
      service_id: serviceId,
      total_times: Number(totalTimes),
      used_times: 0,
      price: price || 0,
      expires_at: parseLocalDateTime(expiresAt).toISOString(),
      allow_holiday_use: allowHolidayUse !== false,
      status: 'active',
      source: 'shop',
      activity_type: activityType || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const {data:created,error}=await supabase.rpc('create_customer_package_atomic',{p_package:packageData,p_shop_id:employee.shopId});
    if(error || !created?.[0]) return operationError(res,error || {},'开卡未完成，请刷新后核对');
    const data=created[0];

    res.status(201).json({ success: true, data: packageFromDb(data) });
  } catch (err) {
    console.error('[customer-packages] 创建异常:', err);
    res.status(500).json({ success: false, error: '创建次卡失败' });
  }
});

// 更新次卡（手动调整次数/有效期/状态）
customerPackagesRouter.put('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { totalTimes, usedTimes, expiresAt, allowHolidayUse, status, serviceId, name, price } = req.body;
    const employee = req.employee!;

    if (employee.role !== 'ceo' && employee.role !== 'shop_manager') {
      return res.status(403).json({ success: false, error: '无权调整次卡' });
    }

    const {data:current,error:currentError}=await supabase.from('customer_packages').select('id,total_times,used_times,reserved_times').eq('id',id).eq('shop_id',employee.shopId).single();
    if(currentError || !current) return res.status(404).json({success:false,error:'次卡不存在或无权访问'});
    const nextTotal=Number(totalTimes ?? current.total_times),nextUsed=Number(usedTimes ?? current.used_times);
    if(!Number.isInteger(nextTotal) || !Number.isInteger(nextUsed) || nextTotal<=0 || nextUsed<0 || nextUsed>nextTotal || (price!==undefined && (!Number.isFinite(Number(price)) || Number(price)<0)) || (status && !['active','expired','used_up'].includes(status))) return res.status(400).json({success:false,error:'次卡次数、金额或状态不正确'});
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (totalTimes !== undefined) updateData.total_times = Number(totalTimes);
    if (usedTimes !== undefined) updateData.used_times = Number(usedTimes);
    if (expiresAt) updateData.expires_at = parseLocalDateTime(expiresAt).toISOString();
    if (allowHolidayUse !== undefined) updateData.allow_holiday_use = allowHolidayUse;
    if (status) updateData.status = status;
    if (serviceId) updateData.service_id = serviceId;
    if (name) updateData.name = name;
    if (price !== undefined) updateData.price = Number(price);

    const { data, error } = await supabase
      .from('customer_packages')
      .update(updateData)
      .eq('id', id)
      .eq('shop_id', employee.shopId).eq('reserved_times', 0).eq('used_times',current.used_times).eq('total_times',current.total_times)
      .select()
      .single();

    if (error) {
      console.error('[customer-packages] 更新失败:', error.message);
      return res.status(500).json({ success: false, error: '更新次卡失败' });
    }

    res.json({ success: true, data: packageFromDb(data) });
  } catch (err) {
    console.error('[customer-packages] 更新异常:', err);
    res.status(500).json({ success: false, error: '更新次卡失败' });
  }
});

// 作废次卡
customerPackagesRouter.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const employee = req.employee!;

    if (employee.role !== 'ceo' && employee.role !== 'shop_manager') {
      return res.status(403).json({ success: false, error: '无权作废次卡' });
    }

    const { data: voided, error } = await supabase
      .from('customer_packages')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('shop_id', employee.shopId).eq('reserved_times',0).select('id').maybeSingle();

    if (error || !voided) {
      console.error('[customer-packages] 作废失败:', error?.message || '次卡正在被待支付结算占用');
      return res.status(500).json({ success: false, error: '作废次卡失败' });
    }

    res.json({ success: true, message: '次卡已作废' });
  } catch (err) {
    console.error('[customer-packages] 作废异常:', err);
    res.status(500).json({ success: false, error: '作废次卡失败' });
  }
});

// 核销 1 次（内部调用，也可供店铺端手动核销）
customerPackagesRouter.post('/:id/consume', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { bookingId, note } = req.body;
    const employee = req.employee!;

    const { data, error } = await supabase.rpc('consume_customer_package_atomic', {
      p_package_id: id, p_shop_id: employee.shopId, p_employee_id: employee.id,
      p_booking_id: bookingId || null, p_note: note || '',
    });
    if (error) return res.status(error.code === 'PGRST202' ? 503 : 409).json({ success: false, error: error.code === 'PGRST202' ? '请先执行 027 交易原子性迁移' : '次卡不可用或核销未完成，未扣减次数' });
    const updatedPkg = data?.[0];
    if (!updatedPkg) return res.status(503).json({ success: false, error: '核销结果不可用' });
    res.json({ success: true, data: packageFromDb(updatedPkg) });
  } catch (err) {
    console.error('[customer-packages] 核销异常:', err);
    res.status(500).json({ success: false, error: '核销失败' });
  }
});

// 查询次卡核销记录
customerPackagesRouter.get('/:id/logs', ownRecord('customer_packages'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase
      .from('package_usage_logs')
      .select('*')
      .eq('package_id', id)
      .order('used_at', { ascending: false });

    if (error) {
      console.error('[customer-packages] 查询核销记录失败:', error.message);
      return res.status(500).json({ success: false, error: '查询核销记录失败' });
    }

    res.json({ success: true, data: (data || []).map(packageLogFromDb) });
  } catch (err) {
    console.error('[customer-packages] 查询核销记录异常:', err);
    res.status(500).json({ success: false, error: '查询核销记录失败' });
  }
});

// 查询顾客某服务的可用次卡（顾客端/店铺端预约时调用）
customerPackagesRouter.get('/available/:customerId/:serviceId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { customerId, serviceId } = req.params;
    const { shopId } = req.query;
    const employee = req.employee!;
    const targetShopId = (shopId as string) || employee.shopId;

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('customer_packages')
      .select('*')
      .eq('shop_id', targetShopId)
      .eq('customer_id', customerId)
      .eq('service_id', serviceId)
      .eq('status', 'active')
      .gt('expires_at', now)
      .order('expires_at', { ascending: true });

    if (error) {
      console.error('[customer-packages] 查询可用次卡失败:', error.message);
      return res.status(500).json({ success: false, error: '查询可用次卡失败' });
    }

    // 过滤掉已用完的（防御性）
    const available = (data || []).filter((p: Record<string, unknown>) => (p.used_times as number) < (p.total_times as number));

    res.json({ success: true, data: available.map(packageFromDb) });
  } catch (err) {
    console.error('[customer-packages] 查询可用次卡异常:', err);
    res.status(500).json({ success: false, error: '查询可用次卡失败' });
  }
});

mainRouter.use('/customer-packages', customerPackagesRouter);

// ===================== customers =====================
const customersRouter = Router();
// 本人展示白名单：不返回证件、微信标识、员工备注及客户画像。
const CUSTOMER_SELF_FIELDS = 'id, shop_id, name, phone, avatar, membership_level, purchase_vip_level, stored_value_level, points, balance, stored_value_balance, total_spent, visit_count, last_visit_at, purchase_vip_expires_at, stored_value_expires_at, withdrawable_referral_amount, is_stockholder, referral_earnings, referral_bonus_rate';

/**
 * POST /api/customers/login
 * 顾客登录：手机号 + 自设六位数字密码
 */
customersRouter.post('/login', async (req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  const { phone, password, setupPassword } = req.body || {};
  if (typeof phone !== 'string' || !/^1[3-9]\d{9}$/.test(phone.trim())) return res.status(400).json({ success: false, error: '请输入正确的手机号' });
  const normalizedPhone = phone.trim();
  // Vercel overwrites its own forwarding header; do not trust arbitrary X-Forwarded-For.
  const platformIp = process.env.VERCEL === '1' ? req.headers['x-vercel-forwarded-for'] : undefined;
  const loginIp = typeof platformIp === 'string' && platformIp.trim() ? platformIp.split(',')[0].trim() : req.ip || 'unknown';
  let attempt: CustomerAuthAttempt | undefined;
  try {
    const decision = await beginCustomerAuthAttempt(loginIp);
    if (decision.allowed === false) {
      res.setHeader('Retry-After', decision.retryAfterSeconds);
      return res.status(429).json({ success: false, ...decision });
    }
    attempt = decision.attempt;
    const { data: customers, error } = await supabase.from('customers')
      .select(`${CUSTOMER_SELF_FIELDS}, password_hash, is_weak_password`).eq('phone', normalizedPhone).limit(2);
    if (error) return res.status(503).json({ success: false, error: '身份验证暂不可用' });
    if (!customers?.length) {
      await finishCustomerAuthAttempt(attempt, 'failure'); attempt = undefined;
      return res.status(401).json({ success: false, error: '手机号或密码错误；如首次使用，请联系门店核实手机号' });
    }
    if (customers.length !== 1) return res.status(409).json({ success: false, error: '该手机号关联多个客户档案，请联系门店处理' });
    const customer = customers[0];
    let passwordHash = customer.password_hash;
    if (!passwordHash) {
      if (!setupPassword) return res.json({ success: true, setupRequired: true });
      if (!isCustomerPassword(password)) return res.status(400).json({ success: false, error: '请设置六位数字密码' });
      passwordHash = await hashCustomerPassword(password);
      const { data: saved, error: saveError } = await supabase.from('customers').update({ password_hash: passwordHash, identity_verified: false, identity_verified_at: null, identity_verified_by: null })
        .eq('id', customer.id).eq('shop_id', customer.shop_id).is('password_hash', null).select('id').maybeSingle();
      if (saveError) return res.status(503).json({ success: false, error: '密码设置失败，请重试' });
      if (!saved) return res.status(409).json({ success: false, error: '密码状态已更新，请重新登录' });
    } else {
      if (!isCustomerPassword(password)) return res.status(400).json({ success: false, error: '请输入六位数字密码' });
      if (!(await verifyCustomerPassword(password, passwordHash))) {
        await finishCustomerAuthAttempt(attempt, 'failure'); attempt = undefined;
        return res.status(401).json({ success: false, error: '手机号或密码错误' });
      }
    }
    await finishCustomerAuthAttempt(attempt, 'success'); attempt = undefined;
    const { password_hash: _passwordHash, is_weak_password: weakPassword, ...safeCustomer } = customer;
    const mustChangePassword = weakPassword === true;
    const verifiedCustomer = mustChangePassword ? { id: customer.id, shop_id: customer.shop_id, must_change_password: true, identity_verified: false } : { ...safeCustomer, must_change_password: false, identity_verified: await isCustomerVerified(customer.id, customer.shop_id) };
    const token = signCustomerToken(customer.id, customer.shop_id, passwordHash, mustChangePassword);
    res.cookie(CUSTOMER_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' || process.env.VERCEL === '1', sameSite: 'strict', path: '/api', maxAge: CUSTOMER_SESSION_SECONDS * 1000 });
    return res.json({ success: true, data: toCamelCase(verifiedCustomer), ...(req.body?.client === 'mini' ? { token } : {}) });
  } catch (error) {
    return res.status(503).json({ success: false, error: error instanceof Error && error.message === CUSTOMER_AUTH_UNAVAILABLE ? CUSTOMER_AUTH_UNAVAILABLE : '身份验证暂不可用' });
  } finally {
    if (attempt) await finishCustomerAuthAttempt(attempt, 'cancelled').catch(() => {});
  }
});
// 受限会话仅能恢复状态、改密和退出；所有业务路径仍走默认本人中间件。
customersRouter.post('/:id/password/change', (req, res, next) => { void customerIdentity(req, res, next, 'id', true); }, async (req: Request, res: Response) => {
  const { currentPassword, newPassword, confirmPassword } = req.body || {};
  if (!isCustomerPassword(currentPassword) || !isCustomerPassword(newPassword) || newPassword !== confirmPassword || newPassword === '123456' || newPassword === currentPassword) {
    return res.status(400).json({ success: false, error: '请输入原密码，并设置不同于原密码及 123456 的六位数字密码，两次输入须一致' });
  }
  const platformIp = process.env.VERCEL === '1' ? req.headers['x-vercel-forwarded-for'] : undefined;
  const ip = typeof platformIp === 'string' && platformIp.trim() ? platformIp.split(',')[0].trim() : req.ip || 'unknown';
  let attempt: CustomerAuthAttempt | undefined;
  try {
    const decision = await beginCustomerAuthAttempt(ip);
    if (decision.allowed === false) {
      res.setHeader('Retry-After', decision.retryAfterSeconds);
      return res.status(429).json({ success: false, ...decision });
    }
    attempt = decision.attempt;
    const { data: customer, error } = await supabase.from('customers').select('id, shop_id, password_hash')
      .eq('id', req.customer!.id).eq('shop_id', req.customer!.shopId).maybeSingle();
    if (error) return res.status(503).json({ success: false, error: '改密服务暂不可用' });
    if (!customer || passwordVersion(customer.password_hash) !== req.customer!.passwordVersion) return res.status(401).json({ success: false, error: '会话已失效，请重新登录' });
    if (!(await verifyCustomerPassword(currentPassword, customer.password_hash))) {
      await finishCustomerAuthAttempt(attempt, 'failure'); attempt = undefined;
      return res.status(400).json({ success: false, error: '原密码错误' });
    }
    const hash = await hashCustomerPassword(newPassword);
    await finishCustomerAuthAttempt(attempt, 'success'); attempt = undefined;
    // 比较旧哈希，防止并发改密覆盖员工重置；不修改任何身份核实字段。
    const { data: saved, error: saveError } = await supabase.from('customers').update({ password_hash: hash, is_weak_password: false })
      .eq('id', customer.id).eq('shop_id', customer.shop_id).eq('password_hash', customer.password_hash).select('id').maybeSingle();
    if (saveError) return res.status(503).json({ success: false, error: '密码保存失败，请重试' });
    if (!saved) return res.status(409).json({ success: false, error: '密码已被更新，请重新登录' });
    const token = signCustomerToken(customer.id, customer.shop_id, hash);
    res.cookie(CUSTOMER_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production' || process.env.VERCEL === '1', sameSite: 'strict', path: '/api', maxAge: CUSTOMER_SESSION_SECONDS * 1000 });
    return res.json({ success: true, data: { id: customer.id, shopId: customer.shop_id, mustChangePassword: false }, ...(req.body?.client === 'mini' ? { token } : {}) });
  } catch (error) {
    return res.status(503).json({ success: false, error: error instanceof Error && error.message === CUSTOMER_AUTH_UNAVAILABLE ? CUSTOMER_AUTH_UNAVAILABLE : '改密服务暂不可用' });
  } finally {
    if (attempt) await finishCustomerAuthAttempt(attempt, 'cancelled').catch(() => {});
  }
});
customersRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(CUSTOMER_COOKIE, { httpOnly: true, sameSite: 'strict', path: '/api' });
  res.json({ success: true });
});


/**
 * GET /api/customers/:id/public
 * 获取本人账户信息：必须持本人会话，接口路径为旧版本兼容保留
 */
customersRouter.get('/:id/public', (req, res, next) => { void customerIdentity(req, res, next, 'id', true); }, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (req.customer?.mustChangePassword) {
      return res.json({ success: true, data: { id, shopId: req.customer.shopId, mustChangePassword: true, identityVerified: false } });
    }

    const { data: customer, error } = await supabase
      .from('customers')
      .select(CUSTOMER_SELF_FIELDS)
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('[customers] 查询公开客户信息失败:', error.message);
      res.status(500).json({ success: false, error: '查询客户信息失败' });
      return;
    }

    if (!customer) {
      res.status(404).json({ success: false, error: '客户不存在' });
      return;
    }

    res.json({ success: true, data: { ...toCamelCase(customer), mustChangePassword: false, identityVerified: await isCustomerVerified(customer.id, customer.shop_id) } });
  } catch (err: unknown) {
    console.error('[customers] 获取公开客户信息异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * GET /api/customers/:id/packages
 * 获取本人同店次卡：必须持本人会话
 */
customersRouter.get('/:id/benefits',personalCustomerAccess,async(req:Request,res:Response)=>{
  try {
    const {data,error}=await supabase.from('member_benefit_records').select('*').eq('customer_id',req.customer!.id).eq('shop_id',req.customer!.shopId).eq('status','available').or('expires_at.is.null,expires_at.gte.'+new Date().toISOString()).order('granted_at',{ascending:false});
    if(error) return res.status(503).json({success:false,error:'权益加载失败'});
    return res.json({success:true,data:(data || []).map(benefitFromDb)});
  } catch {return res.status(503).json({success:false,error:'权益加载失败'});}
});

customersRouter.get('/:id/packages', personalCustomerAccess, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('customer_packages')
      .select('*')
      .eq('customer_id', id)
      .eq('shop_id', req.customer!.shopId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[customers] 查询顾客次卡失败:', error.message);
      res.status(500).json({ success: false, error: '查询次卡失败' });
      return;
    }

    res.json({ success: true, data: (data || []).map(packageFromDb) });
  } catch (err: unknown) {
    console.error('[customers] 查询顾客次卡异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * POST /api/customers/:id/recharge
 * 顾客端自助储值充值（小程序/H5）
 */
customersRouter.post('/:id/recharge', (_req: Request, res: Response) => {
  res.status(403).json({ success: false, code: 'SELF_SERVICE_RECHARGE_DISABLED', error: '线上自助充值暂未开放，请联系门店办理，已有余额可正常使用' });
});

// 所有客户接口都需要登录
customersRouter.use(authMiddleware);
customersRouter.post('/:id/identity/verify', requirePermission('customer:read'), requireCustomerScope, async (req: Request, res: Response) => {
  try {
    const { error } = await supabase.from('customers').update({ identity_verified: true, identity_verified_at: new Date().toISOString(), identity_verified_by: req.employee!.id })
      .eq('id', req.params.id).eq('shop_id', req.employee!.shopId);
    if (error) return res.status(503).json({ success: false, error: '核实状态暂无法保存，请先执行 026 身份与限流迁移' });
    return res.json({ success: true });
  } catch { return res.status(503).json({ success: false, error: '核实状态保存失败' }); }
});

customersRouter.post('/:id/password/reset', requirePermission('customer:credential'), requireCustomerScope, async (req: Request, res: Response) => {
  try {
    const { data: customer, error } = await supabase.from('customers').select('id, phone, shop_id').eq('id', req.params.id).eq('shop_id', req.employee!.shopId).maybeSingle();
    if (error) return res.status(503).json({ success: false, error: '客户信息暂不可用' });
    if (!customer || !/^1[3-9]\d{9}$/.test(customer.phone || '')) return res.status(404).json({ success: false, error: '未找到有效客户手机号' });
    const passwordHash = await hashCustomerPassword(customer.phone.slice(-6));
    const { error: updateError } = await supabase.from('customers').update({ password_hash: passwordHash, is_weak_password: true }).eq('id', customer.id).eq('shop_id', customer.shop_id);
    if (updateError) return res.status(503).json({ success: false, error: '密码重置失败' });
    res.setHeader('Cache-Control', 'no-store');
    return res.json({ success: true, data: { reset: true } });
  } catch { return res.status(503).json({ success: false, error: '密码重置失败' }); }
});

/**
 * GET /api/customers
 * 获取当前店铺的客户列表（含客户画像、到店记录）
 */
customersRouter.get('/', requirePermission('customer:read'), async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;

    if (!shopId) {
      res.status(400).json({ success: false, error: '当前员工未关联店铺' });
      return;
    }

    // Explicit pages prevent PostgREST's row cap from silently hiding customers/visits.
    // Every query retains employee scope; enrichment failure cannot masquerade as empty history.
    const rows: DbRecord[] = [];
    const readPages = async (query: () => {
      range: (start: number, end: number) => PromiseLike<{data: DbRecord[] | null; error: unknown}>;
    }): Promise<DbRecord[]> => {
      const all: DbRecord[] = [];
      for (let page = 0; page < 200; page++) {
        const {data,error} = await query().range(page * 500, page * 500 + 499);
        if (error || !Array.isArray(data)) throw new Error('客户及到店资料同步失败，请刷新重试');
        all.push(...data);
        if (data.length < 500) return all;
      }
      throw new Error('客户资料超过单次同步上限，请联系项目维护人员');
    };
    rows.push(...await readPages(() => scopeCustomerQuery(supabase.from('customers').select('*'), req)
      .order('created_at', {ascending:false}).order('id', {ascending:false})));
    const customers = toCamelCaseList(rows);
    // Directory views only need customer fields. Full profile and visit history remain
    // available from this route by default and from GET /:id on demand.
    if (req.query.summary === '1') {
      res.json({ success: true, data: customers });
      return;
    }
    const customerIds = customers.map(c => String(c.id || '')).filter(Boolean);
    const profilesMap: Record<string, unknown> = {};
    const visitsMap: Record<string, DbRecord[]> = {};
    // Bound URL size and database concurrency while reading independent customer batches.
    const batches: string[][] = [];
    for (let offset = 0; offset < customerIds.length; offset += 100) batches.push(customerIds.slice(offset, offset + 100));
    for (let offset = 0; offset < batches.length; offset += 3) {
      const enrichedBatches = await Promise.all(batches.slice(offset, offset + 3).map(async ids => Promise.all([
        readPages(() => supabase.from('customer_profiles').select('*').in('customer_id',ids).order('id',{ascending:true})),
        readPages(() => supabase.from('customer_visit_records').select('*').in('customer_id',ids).order('check_in_time',{ascending:false}).order('id',{ascending:false})),
      ])));
      for (const [profiles, visits] of enrichedBatches) {
        for (const profile of profiles) profilesMap[profile.customer_id as string] = toCamelCase(profile);
        for (const visit of visits) {
          const camel = toCamelCase(visit);
          (visitsMap[camel.customerId as string] ||= []).push(camel);
        }
      }
    }

    const enriched = customers.map((c) => ({
      ...c,
      profile: profilesMap[c.id as string] || null,
      visitRecords: visitsMap[c.id as string] || [],
    }));

    res.json({ success: true, data: enriched });
  } catch (err: unknown) {
    console.error('[customers] 获取客户列表异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * POST /api/customers
 * 创建新客户
 */
customersRouter.post('/', requirePermission('customer:create'), async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;

    if (!shopId) {
      res.status(400).json({ success: false, error: '当前员工未关联店铺' });
      return;
    }

    const body = req.body || {};


    const insertData = mapCustomerBodyToDB(body);
    const validation = validateCustomerData(insertData);
    if ('error' in validation) {
      res.status(400).json({ success: false, error: validation.error });
      return;
    }

    const customerId = body.id || `cust_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const { data, error } = await supabase
      .from('customers')
      .insert({
        id: customerId,
        shop_id: shopId,
        ...insertData,
      })
      .select()
      .single();

    if (error) {
      console.error('[customers] 创建客户失败:', error.message);
      res.status(500).json({ success: false, error: '创建客户失败: ' + error.message });
      return;
    }

    console.log(`[customers] 客户创建成功 id=${data.id}`);
    res.json({ success: true, data: toCamelCase(data) });
  } catch (err: unknown) {
    console.error('[customers] 创建客户异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * PUT /api/customers/:id
 * 更新客户信息
 */
customersRouter.put('/:id', requirePermission('customer:edit'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const shopId = req.employee!.shopId;

    const body = req.body || {};

    // 使用字段白名单映射工具，统一过滤非法 key、处理日期/数组字段
    const updateData = mapCustomerBodyToDB(body);
    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ success: false, error: '请求体为空或无有效字段' });
      return;
    }

    // 单独校验手机号格式（只改手机号时也要拦截 10 位等非法号码）
    if (updateData.phone !== undefined && !isValidPhone(updateData.phone)) {
      res.status(400).json({ success: false, error: '手机号格式不正确，请输入 11 位手机号' });
      return;
    }

    if (updateData.name !== undefined && (typeof updateData.name !== 'string' || !updateData.name.trim())) {
      return res.status(400).json({success:false,error:'客户姓名不能为空'});
    }
    const {data:current,error:loadError}=await supabase.from('customers').select('*').eq('id',id).eq('shop_id',shopId).maybeSingle();
    if(loadError) return res.status(503).json({success:false,error:'客户资料暂不可用'});
    if(!current) return res.status(404).json({success:false,error:'客户不存在'});
    const expected=mapCustomerBodyToDB(body._expected && typeof body._expected==='object' ? body._expected : {});
    const accountChanges:string[]=[];
    for(const [field,value] of Object.entries(updateData)) {
      if(customerValuesEqual(field,value,current[field])) { delete updateData[field]; continue; }
      const hasExpected=Object.prototype.hasOwnProperty.call(expected,field);
      if((CUSTOMER_ACCOUNT_FIELDS.has(field) && !hasExpected) || (hasExpected && !customerValuesEqual(field,expected[field],current[field]))) {
        return res.status(409).json({success:false,error:'客户资料已变化，请刷新后重新核对修改'});
      }
      if(CUSTOMER_ACCOUNT_FIELDS.has(field) && (typeof current[field]==='number' || ['balance','stored_value_balance','withdrawable_referral_amount','withdrawable_amount','referral_earnings','total_spent','points','visit_count','total_saved','shared_fund','total_shared_fund','referral_consumption','referral_bonus_rate'].includes(field))) {
        if(typeof value!=='number' || !Number.isFinite(value) || value<0) return res.status(400).json({success:false,error:'金额和统计数值必须是非负数'});
      }
      if (hasExpected) accountChanges.push(field);
    }
    const balanceCandidate = Object.prototype.hasOwnProperty.call(updateData,'stored_value_balance') ? updateData.stored_value_balance : updateData.balance;
    if (Object.prototype.hasOwnProperty.call(updateData,'stored_value_balance') && Object.prototype.hasOwnProperty.call(updateData,'balance') &&
      canonicalJson(updateData.stored_value_balance ?? null) !== canonicalJson(updateData.balance ?? null)) {
      return res.status(400).json({success:false,error:'储值余额字段不一致，请只提交一个余额值或保持两者相同'});
    }
    const balanceChanged = (Object.prototype.hasOwnProperty.call(updateData,'stored_value_balance') || Object.prototype.hasOwnProperty.call(updateData,'balance')) &&
      canonicalJson(balanceCandidate ?? null) !== canonicalJson(current.stored_value_balance ?? null);
    if (balanceChanged && Object.keys(updateData).some(field => !['balance','stored_value_balance'].includes(field) && !customerValuesEqual(field,updateData[field],current[field]))) {
      return res.status(400).json({success:false,error:'余额调整请单独保存，其他资料请另一次修改'});
    }
    if (balanceChanged) {
      const expectedBalance = Number(current.stored_value_balance ?? 0);
      const newBalance = Number(balanceCandidate);
      if (!Number.isFinite(expectedBalance) || !Number.isFinite(newBalance) || newBalance < 0) {
        return res.status(400).json({success:false,error:'储值余额必须是非负数字'});
      }
      const {data:adjusted,error:adjustError}=await supabase.rpc('adjust_customer_balance_atomic',{
        p_customer_id:id,p_shop_id:shopId,p_expected_balance:expectedBalance,p_new_balance:newBalance,
        p_employee_id:req.employee!.id,p_employee_name:req.employee!.name,
        p_note:typeof body.balanceAdjustmentNote==='string' && body.balanceAdjustmentNote.trim() ? body.balanceAdjustmentNote.trim() : '店铺端人工余额调整',
      });
      if(adjustError || !adjusted?.[0]) return operationError(res,adjustError || {},'储值余额调整失败，请刷新后重试');
      delete updateData.stored_value_balance; delete updateData.balance;
      const balanceFields = new Set(['stored_value_balance','balance']);
      for (let i=accountChanges.length-1;i>=0;i--) if (balanceFields.has(accountChanges[i])) accountChanges.splice(i,1);
    }
    if(!Object.keys(updateData).length) return res.json({success:true,data:toCamelCase(balanceChanged ? (await supabase.from('customers').select('*').eq('id',id).eq('shop_id',shopId).single()).data || current : current)});
    let update=supabase.from('customers').update(updateData).eq('id',id).eq('shop_id',shopId);
    for(const field of accountChanges) {
      const oldValue=Array.isArray(current[field]) ? '{'+(current[field] as unknown[]).map(value=>'"'+String(value).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"').join(',')+'}' : current[field];
      update=oldValue==null ? update.is(field,null) : update.eq(field,oldValue);
    }
    const {data,error}=await update.select().maybeSingle();

    if (error) {
      console.error('[customers] 更新客户失败:', error.message);
      res.status(500).json({ success: false, error: '更新客户失败，请检查手机号是否重复并重试' });
      return;
    }

    if (!data) {
      res.status(409).json({ success: false, error: '客户资料已变化，请刷新后重新核对修改' });
      return;
    }

    console.log('[customers] 客户资料更新成功');
    res.json({ success: true, data: toCamelCase(data) });
  } catch (err: unknown) {
    console.error('[customers] 更新客户异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * PUT /api/customers/:id/membership
 * 更新客户会员状态（VIP/储值升级），同步创建权益和流水
 */
customersRouter.put('/:id/membership', requirePermission('customer:edit'), requireCustomerScope, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const shopId = req.employee!.shopId;
    const { purchaseVIPLevel, storedValueLevel } = req.body || {};
    if ((!purchaseVIPLevel && !storedValueLevel) || (purchaseVIPLevel && !['regular','bronze','silver','gold','diamond'].includes(purchaseVIPLevel)) || (storedValueLevel && !['none','store_500','store_1000','store_2000','store_5000'].includes(storedValueLevel))) return res.status(400).json({success:false,error:'请选择有效的会员或储值档位'});

    const { data: customer, error: fetchError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .eq('shop_id', shopId)
      .single();

    if (fetchError || !customer) {
      console.error('[customers] 查询客户失败:', fetchError?.message);
      res.status(404).json({ success: false, error: '客户不存在或无权访问' });
      return;
    }

    const updatePayload: Record<string, unknown> = {};
    const now = new Date().toISOString();

    // 购买型 VIP 升级/续费
    let vipAddAmount = 0;
    if (purchaseVIPLevel && typeof purchaseVIPLevel === 'string') {
      const vipPrices: Record<string, number> = {
        regular: 0,
        bronze: 29,
        silver: 59,
        gold: 79,
        diamond: 99,
      };
      updatePayload.purchase_vip_level = purchaseVIPLevel;
      // 续费逻辑：当前未过期则延长一年，否则从当前时间起一年
      const currentExpiry = customer.purchase_vip_expires_at
        ? new Date(customer.purchase_vip_expires_at).getTime()
        : 0;
      const baseTime = currentExpiry > Date.now() ? currentExpiry : Date.now();
      updatePayload.purchase_vip_expires_at = new Date(baseTime + 365 * 86400000).toISOString();
      // 计算补差金额（目标价格 - 当前已付价格）
      const currentVIPPrice = vipPrices[customer.purchase_vip_level || 'regular'] || 0;
      vipAddAmount = Math.max(0, (vipPrices[purchaseVIPLevel] || 0) - currentVIPPrice);
    }

    // 储值会员升级/办理
    let storedValueTx: Record<string, unknown> | null = null;
    let storedAddAmount = 0;
    if (storedValueLevel && typeof storedValueLevel === 'string') {
      const planAmounts: Record<string, number> = {
        none: 0,
        store_500: 500,
        store_1000: 1000,
        store_2000: 2000,
        store_5000: 5000,
      };
      const newAmount = planAmounts[storedValueLevel] || 0;
      // 基于当前储值余额计算实际需补金额，而非仅按档位差
      const currentBalance = Number(customer.stored_value_balance || 0);
      storedAddAmount = Math.max(0, newAmount - currentBalance);
      const newBalance = currentBalance + storedAddAmount;
      const hadRecharged = customer.stored_value_level && customer.stored_value_level !== 'none';

      updatePayload.stored_value_level = storedValueLevel;
      updatePayload.stored_value_balance = newBalance;
      updatePayload.balance = newBalance;
      updatePayload.has_recharged = storedValueLevel !== 'none';
      updatePayload.recharge_level = storedValueLevel;
      updatePayload.stored_value_expires_at = new Date(Date.now() + 2 * 365 * 86400000).toISOString();

      if (storedAddAmount > 0) {
        storedValueTx = {
          id: `svtx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          customer_id: id,
          type: hadRecharged ? 'upgrade' : 'recharge',
          amount: storedAddAmount,
          balance_after: newBalance,
          referral_portion: 0,
          note: hadRecharged ? `储值升级至 ${storedValueLevel}` : `开通 ${storedValueLevel}`,
          created_at: now,
          created_by: req.employee!.id,
        };
      }
    }

    // 同步更新兼容字段
    const isMember =
      (updatePayload.purchase_vip_level || customer.purchase_vip_level) !== 'regular' ||
      (updatePayload.stored_value_level || customer.stored_value_level) !== 'none';
    updatePayload.is_member = isMember;
    if (customer.is_stockholder) {
      updatePayload.membership_level = 'stockholder';
    } else if (isMember) {
      updatePayload.membership_level = 'premium';
    } else {
      updatePayload.membership_level = 'regular';
    }

    let enrollment: Record<string,unknown> | null=null;
    let giftPackage: Record<string,unknown> | null=null;
    let benefits: Record<string,unknown>[]=[];
    if (purchaseVIPLevel && purchaseVIPLevel !== 'regular') {
      enrollment={id:'enr_'+randomUUID(),level:purchaseVIPLevel,source:'manual',enrolled_at:now,expires_at:updatePayload.purchase_vip_expires_at,note:'店铺端办理 '+purchaseVIPLevel+' 会员'};
      if (purchaseVIPLevel==='diamond' && customer.purchase_vip_level!=='diamond') {
        const service=await findDiamondHaircutService(shopId);
        if(service) giftPackage={id:'pkg_'+randomUUID(),name:'钻石会员赠送·'+service.name+'3次',service_id:service.id,total_times:3,expires_at:new Date(Date.now()+365*86400000).toISOString()};
      }
    }

    // 根据购买型 VIP 等级发放权益（每次升级时发放）
    if (purchaseVIPLevel && purchaseVIPLevel !== 'regular') {
      const benefitConfigs: Array<{ type: string; name: string; description: string }> = [];
      if (purchaseVIPLevel === 'bronze') {
        benefitConfigs.push({ type: 'shampoo', name: '洗发水', description: '普卡 VIP 权益' });
      } else if (purchaseVIPLevel === 'silver') {
        benefitConfigs.push({ type: 'shampoo', name: '洗发水', description: '银卡 VIP 权益' });
        benefitConfigs.push({ type: 'conditioner', name: '护发素', description: '银卡 VIP 权益' });
        benefitConfigs.push({ type: 'drink', name: '饮品', description: '银卡 VIP 权益' });
      } else if (purchaseVIPLevel === 'gold') {
        benefitConfigs.push({ type: 'shampoo', name: '洗发水', description: '金卡 VIP 权益' });
        benefitConfigs.push({ type: 'conditioner', name: '护发素', description: '金卡 VIP 权益' });
        benefitConfigs.push({ type: 'drink', name: '饮品', description: '金卡 VIP 权益' });
        benefitConfigs.push({ type: 'redo', name: '不满意重做', description: '金卡 VIP 权益' });
      } else if (purchaseVIPLevel === 'diamond') {
        benefitConfigs.push({ type: 'shampoo', name: '洗发水', description: '钻石 VIP 权益' });
        benefitConfigs.push({ type: 'conditioner', name: '护发素', description: '钻石 VIP 权益' });
        benefitConfigs.push({ type: 'drink', name: '饮品', description: '钻石 VIP 权益' });
        benefitConfigs.push({ type: 'redo', name: '不满意重做', description: '钻石 VIP 权益' });
        benefitConfigs.push({ type: 'free_haircut', name: '免费剪发一次', description: '钻石 VIP 权益' });
      }

      const expiryDays: Record<string, number> = {
        shampoo: 90,
        conditioner: 90,
        drink: 365,
        redo: 7,
        free_haircut: 365,
      };

      const benefitsToInsert = benefitConfigs.map((b) => ({
        id: `benefit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        shop_id: shopId,
        customer_id: id,
        type: b.type,
        name: b.name,
        description: b.description,
        status: 'available',
        granted_at: now,
        granted_by: req.employee!.id,
        expires_at: new Date(Date.now() + (expiryDays[b.type] || 365) * 86400000).toISOString(),
      }));

      benefits=benefitsToInsert;
    }
    // 比较读到的资金/会员快照；有并发扣款或变更则整笔拒绝，要求刷新。
    const expected=Object.fromEntries(['balance','stored_value_balance','purchase_vip_level','purchase_vip_expires_at','stored_value_level','stored_value_expires_at','is_stockholder'].map(key=>[key,customer[key] ?? null]));
    const {data:result,error:membershipError}=await supabase.rpc('apply_membership_atomic',{
      p_customer_id:id,p_shop_id:shopId,p_expected:expected,p_patch:updatePayload,
      p_enrollment:enrollment,p_transaction:storedValueTx,p_benefits:benefits,p_package:giftPackage,
    });
    if(membershipError || !result?.[0]) return operationError(res,membershipError || {},'会员办理未完成，请刷新后核对再操作');
    const updatedCustomer=result[0];

    res.json({
      success: true,
      data: {
        customer: toCamelCase(updatedCustomer),
        vipAddAmount,
        storedAddAmount,
      },
    });
  } catch (err: unknown) {
    console.error('[customers] 更新会员状态异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * GET /api/customers/:id/membership-enrollments
 * 查询顾客的会员入会记录（入会时间 / 次数 / 状态）
 */
customersRouter.get('/:id/membership-enrollments', requirePermission('customer:read'), requireCustomerScope, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const shopId = req.employee!.shopId;

    const { data, error } = await supabase
      .from('membership_enrollments')
      .select('*')
      .eq('customer_id', id)
      .eq('shop_id', shopId)
      .order('enrolled_at', { ascending: false });

    if (error) {
      console.error('[customers] 查询入会记录失败:', error.message);
      res.status(500).json({ success: false, error: '查询入会记录失败' });
      return;
    }

    res.json({ success: true, data: (data || []).map((m) => membershipEnrollmentFromDb(m as DbRecord)) });
  } catch (err: unknown) {
    console.error('[customers] 查询入会记录异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * POST /api/customers/:id/membership/revoke
 * 撤销会员（仅 CEO / 客服）：降为普通用户，标记入会记录为已撤销；储值余额、股东身份、次卡剩余次数均不受影响
 */
customersRouter.post('/:id/membership/revoke', requirePermission('customer:edit'), requireCustomerScope, async(req: Request,res: Response)=>{
  try {
    const {enrollmentId,note}=req.body || {};
    const {data,error}=await supabase.rpc('revoke_membership_atomic',{p_customer_id:req.params.id,p_shop_id:req.employee!.shopId,p_enrollment_id:enrollmentId || null,p_employee_id:req.employee!.id,p_employee_name:req.employee!.name,p_note:typeof note==='string'?note:''});
    if(error || !data?.customer) return operationError(res,error || {},'撤销会员未完成，请刷新核对');
    return res.json({success:true,data:{customer:toCamelCase(data.customer),enrollment:membershipEnrollmentFromDb(data.enrollment)}});
  } catch {return res.status(503).json({success:false,error:'撤销会员暂不可用'});}
});

/**
 * DELETE /api/customers/:id
 * 删除客户
 */
customersRouter.delete('/:id', requirePermission('customer:delete'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const shopId = req.employee!.shopId;

    const { error } = await supabase
      .from('customers')
      .delete()
      .eq('id', id)
      .eq('shop_id', shopId);

    if (error) {
      console.error('[customers] 删除客户失败:', error.message);
      res.status(500).json({ success: false, error: '删除客户失败' });
      return;
    }

    console.log(`[customers] 客户 ${id} 删除成功`);
    res.json({ success: true });
  } catch (err: unknown) {
    console.error('[customers] 删除客户异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * GET /api/customers/:id
 * 获取单个客户详情（含画像、到店记录）
 */
customersRouter.get('/:id', requirePermission('customer:read'), requireCustomerScope, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const shopId = req.employee!.shopId;

    const { data: customer, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .eq('shop_id', shopId)
      .single();

    if (error) {
      console.error('[customers] 查询客户详情失败:', error.message);
      res.status(500).json({ success: false, error: '查询客户详情失败' });
      return;
    }

    if (!customer) {
      res.status(404).json({ success: false, error: '客户不存在' });
      return;
    }

    const camelCustomer = toCamelCase(customer);

    const [{ data: profiles }, { data: visits }] = await Promise.all([
      supabase.from('customer_profiles').select('*').eq('customer_id', id),
      supabase
        .from('customer_visit_records')
        .select('*')
        .eq('customer_id', id)
        .order('check_in_time', { ascending: false }),
    ]);

    res.json({
      success: true,
      data: {
        ...camelCustomer,
        profile: profiles && profiles.length > 0 ? toCamelCase(profiles[0]) : null,
        visitRecords: (visits || []).map(toCamelCase),
      },
    });
  } catch (err: unknown) {
    console.error('[customers] 获取客户详情异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * GET /api/customers/:id/profile
 * 获取客户画像
 */
customersRouter.get('/:id/profile', requirePermission('customer:read'), requireCustomerScope, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const shopId = req.employee!.shopId;

    // 校验客户归属
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id')
      .eq('id', id)
      .eq('shop_id', shopId)
      .single();

    if (customerError || !customer) {
      res.status(404).json({ success: false, error: '客户不存在或无权访问' });
      return;
    }

    const { data, error } = await supabase
      .from('customer_profiles')
      .select('*')
      .eq('customer_id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[customers] 查询客户画像失败:', error.message);
      res.status(500).json({ success: false, error: '查询客户画像失败' });
      return;
    }

    res.json({ success: true, data: data ? toCamelCase(data) : null });
  } catch (err: unknown) {
    console.error('[customers] 获取客户画像异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * POST /api/customers/:id/profile
 * 创建客户画像
 */
customersRouter.post('/:id/profile', requirePermission('customer:edit'), requireCustomerScope, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const shopId = req.employee!.shopId;

    // 校验客户归属
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id')
      .eq('id', id)
      .eq('shop_id', shopId)
      .single();

    if (customerError || !customer) {
      res.status(404).json({ success: false, error: '客户不存在或无权访问' });
      return;
    }

    const profileId = `profile_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const snakeBody = toSnakeCase(req.body || {});
    const insertData: Record<string, unknown> = {
      id: profileId,
      customer_id: id,
    };

    for (const [key, value] of Object.entries(snakeBody)) {
      if (key === 'id' || key === 'customer_id') continue;
      if (value === undefined) continue;
      insertData[key] = value;
    }

    const { data, error } = await supabase
      .from('customer_profiles')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[customers] 创建客户画像失败:', error.message);
      res.status(500).json({ success: false, error: '创建客户画像失败: ' + error.message });
      return;
    }

    res.json({ success: true, data: toCamelCase(data) });
  } catch (err: unknown) {
    console.error('[customers] 创建客户画像异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * PUT /api/customers/:id/profile
 * 更新客户画像（不存在则创建）
 */
customersRouter.put('/:id/profile', requirePermission('customer:edit'), requireCustomerScope, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const shopId = req.employee!.shopId;

    // 校验客户归属
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id')
      .eq('id', id)
      .eq('shop_id', shopId)
      .single();

    if (customerError || !customer) {
      res.status(404).json({ success: false, error: '客户不存在或无权访问' });
      return;
    }

    const snakeBody = toSnakeCase(req.body || {});
    const upsertData: Record<string, unknown> = { customer_id: id };

    for (const [key, value] of Object.entries(snakeBody)) {
      if (key === 'id' || key === 'customer_id') continue;
      if (value === undefined) continue;
      upsertData[key] = value;
    }

    const { data: existing } = await supabase
      .from('customer_profiles')
      .select('id')
      .eq('customer_id', id)
      .maybeSingle();

    let result;
    if (existing) {
      result = await supabase
        .from('customer_profiles')
        .update(upsertData)
        .eq('customer_id', id)
        .select()
        .single();
    } else {
      const profileId = `profile_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      result = await supabase
        .from('customer_profiles')
        .insert({ id: profileId, ...upsertData })
        .select()
        .single();
    }

    if (result.error) {
      console.error('[customers] 更新客户画像失败:', result.error.message);
      res.status(500).json({ success: false, error: '更新客户画像失败: ' + result.error.message });
      return;
    }

    res.json({ success: true, data: toCamelCase(result.data) });
  } catch (err: unknown) {
    console.error('[customers] 更新客户画像异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

mainRouter.use('/customers', customersRouter);

// ===================== queues =====================
const queuesRouter = Router();

// 时段长度（分钟）
const QUEUE_TIME_SLOT_MINUTES = 30;

// 辅助：计算某一天的 00:00 和次日 00:00
const getQueueDateRange = (dateStr?: string) => {
  const day=dateStr || new Date(Date.now()+8*3600_000).toISOString().slice(0,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('日期格式不正确');
  const base=new Date(day+'T00:00:00+08:00');
  if(!Number.isFinite(base.getTime()) || new Date(base.getTime()+8*3600_000).toISOString().slice(0,10)!==day) throw new Error('日期不存在');
  return {start:base.toISOString(),end:new Date(base.getTime()+86400_000).toISOString()};
};

// 获取预约时间所在时段的起始时间
const getQueueTimeSlotStart = (date: Date, slotMinutes: number = QUEUE_TIME_SLOT_MINUTES) => {
  const d = new Date(date);
  const slotStart = Math.floor(d.getMinutes() / slotMinutes) * slotMinutes;
  d.setMinutes(slotStart, 0, 0);
  d.setMilliseconds(0);
  return d;
};

// 默认服务时长（分钟）
const DEFAULT_QUEUE_SERVICE_MINUTES = 30;

// 从店铺服务列表中查询服务时长
const getQueueDurations = async (shopId:string):Promise<Map<string,number>> => {
  const {data,error}=await supabase.from('shops').select('services').eq('id',shopId).maybeSingle();
  if(error) throw new Error('服务配置暂不可用');
  return new Map((data?.services || []).map((service:Record<string,unknown>)=>[String(service.id),Number(service.duration)>0?Number(service.duration):DEFAULT_QUEUE_SERVICE_MINUTES]));
};

// 获取店铺当天排队状态（按同一时段分组）
// GET /api/queues/:shopId?date=YYYY-MM-DD
queuesRouter.get('/:shopId', optionalStaff, async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    if (req.employee && req.employee.shopId !== shopId) return res.status(403).json({ success: false, error: '无权访问其他店铺队列' });
    const { start, end } = getQueueDateRange(req.query.date as string | undefined);

    // 拉取当天店铺所有有效预约
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('shop_id', shopId)
      .in('status', ['pending', 'confirmed', 'serving'])
      .gte('scheduled_time', start)
      .lt('scheduled_time', end)
      .order('scheduled_time', { ascending: true })
      .order('queue_number', { ascending: true });

    if (error) {
      console.error('[queues] 查询预约失败:', error.message);
      return res.status(500).json({ success: false, error: '查询排队信息失败' });
    }

    // 为每个 booking 补充服务时长
    const durations=await getQueueDurations(shopId);
    const list = await Promise.all(
      (bookings || []).map(async (b: Record<string, unknown>) => {
        const duration = durations.get(String(b.service_id)) || DEFAULT_QUEUE_SERVICE_MINUTES;
        return {
          id: b.id,
          shopId: b.shop_id,
          customerId: b.customer_id,
          customerName: b.customer_name,
          stylistId: b.stylist_id,
          stylistName: b.stylist_name,
          serviceId: b.service_id,
          serviceName: b.service_name,
          scheduledTime: b.scheduled_time as string,
          queueNumber: Number(b.queue_number) || 1,
          status: b.status,
          notes: b.notes,
          duration,
        };
      }),
    );

    // 当前叫到第几号：按每个时段独立计算
    // 优先找本时段内 serving 的最小编号；否则找本时段内已完成的 max + 1；没有则 1
    const now = new Date();
    const currentSlotStart = getQueueTimeSlotStart(now);

    const servingBookings = list.filter(
      (b) => getQueueTimeSlotStart(new Date(b.scheduledTime)).getTime() === currentSlotStart.getTime() && b.status === 'serving',
    );

    let currentNumber = 1;
    if (servingBookings.length > 0) {
      currentNumber = Math.min(...servingBookings.map((b) => b.queueNumber));
    } else {
      const { data: completed, error: completedError } = await supabase
        .from('bookings')
        .select('queue_number, scheduled_time')
        .eq('shop_id', shopId)
        .eq('status', 'completed')
        .gte('scheduled_time', start)
        .lt('scheduled_time', end);

      if (completedError) {
        console.error('[queues] 查询已完成预约失败:', completedError.message);
      }

      const completedInCurrentSlot = (completed || []).filter(
        (b: Record<string, unknown>) => getQueueTimeSlotStart(new Date(b.scheduled_time as string)).getTime() === currentSlotStart.getTime(),
      );
      const maxCompleted =
        completedInCurrentSlot.length > 0
          ? Math.max(...completedInCurrentSlot.map((b: Record<string, unknown>) => Number(b.queue_number) || 0))
          : 0;
      currentNumber = maxCompleted + 1;
    }

    // 预计等待时间：当前时段内，排在当前叫号之后的未服务预约的服务时长之和
    // （当前叫号本身即将开始服务，不应再计入等待）
    const currentSlotBookings = list.filter(
      (b) => getQueueTimeSlotStart(new Date(b.scheduledTime)).getTime() === currentSlotStart.getTime(),
    );
    const aheadBookings = currentSlotBookings.filter(
      (b) => b.queueNumber > currentNumber && b.status !== 'serving',
    );
    const estimatedWaitTime = aheadBookings
      .slice(0, 3)
      .reduce((sum, b) => sum + b.duration, 0);

    res.json({
      success: true,
      data: {
        id: `queue_${shopId}_${start.slice(0, 10)}`,
        shopId,
        currentNumber,
        estimatedWaitTime,
        bookings: req.employee ? list : list.map(({ id: _id, customerId: _customerId, customerName: _name, notes: _notes, ...slot }) => slot),
        timeSlotMinutes: QUEUE_TIME_SLOT_MINUTES,
      },
    });
  } catch (error) {
    console.error('[queues] 获取排队信息失败:', error);
    const message=error instanceof Error?error.message:'';
    const invalidDate=message.startsWith('日期');
    res.status(invalidDate?400:503).json({ success: false, error: invalidDate?message:'获取排队信息失败' });
  }
});

// 旧接口没有持久化任何叫号状态，未被业务页面调用；拒绝伪成功。
queuesRouter.put('/:shopId',authMiddleware,requireOwnShop('shopId'),(_req:Request,res:Response)=>{
  return res.status(501).json({success:false,error:'手动叫号尚未接入，请在预约管理中更新实际服务状态'});
});

mainRouter.use('/queues', queuesRouter);

// ===================== reviews =====================
const reviewsRouter = Router();

const reviewFromDb = (r: Record<string, unknown>): Record<string, unknown> => ({
  id: r.id,
  shopId: r.shop_id,
  customerId: r.customer_id,
  bookingId: r.booking_id,
  stylistId: r.stylist_id,
  serviceScore: r.service_score,
  stylistScore: r.stylist_score,
  overallScore: r.overall_score,
  serviceComment: r.service_comment || '',
  stylistComment: r.stylist_comment || '',
  comment: r.comment || '',
  isAwareOfMembershipBenefits: Boolean(r.is_aware_of_membership_benefits),
  customerName: r.customer_name || '顾客',
  createdAt: r.created_at,
  reply: r.reply,
  replyBy: r.reply_by,
  replyAt: r.reply_at,
  isHidden: r.is_hidden,
});

// 创建评价
reviewsRouter.post('/', customerSession, async (req: Request, res: Response) => {
  try {
    const {
      shopId,
      customerId,
      bookingId,
      stylistId,
      serviceScore,
      stylistScore,
      serviceComment,
      stylistComment,
      isAwareOfMembershipBenefits,
      comment,
    } = req.body;

    if (!shopId || !customerId || !bookingId) {
      return res.status(400).json({
        success: false,
        error: '缺少必要参数：shopId、customerId、bookingId',
      });
    }

    const { data: booking, error: bookingError } = await supabase.from('bookings')
      .select('id,shop_id,customer_id,stylist_id,status').eq('id', bookingId)
      .eq('shop_id', req.customer!.shopId).eq('customer_id', req.customer!.id).maybeSingle();
    if (bookingError) return res.status(503).json({ success: false, error: '预约校验暂不可用' });
    if (!booking) return res.status(404).json({ success: false, error: '预约不存在或无权评价' });
    if (booking.status !== 'completed') return res.status(409).json({ success: false, error: '服务完成后方可评价' });
    if (![serviceScore, stylistScore].every(score => typeof score === 'number' && Number.isFinite(score) && score >= 1 && score <= 5)) {
      return res.status(400).json({ success: false, error: '评分须为1至5分' });
    }

    // 防止同一预约重复评价
    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('booking_id', bookingId)
      .maybeSingle();
    if (existing) {
      return res.status(409).json({
        success: false,
        error: '该预约已经评价过，请勿重复提交',
      });
    }

    // 计算综合评分
    const overallScore =
      Math.round(((Number(serviceScore || 5) + Number(stylistScore || 5)) / 2) * 10) / 10;

    // 查询顾客姓名
    let customerName = '顾客';
    const { data: customer } = await supabase
      .from('customers')
      .select('name')
      .eq('id', customerId)
      .single();
    if (customer?.name) {
      customerName = customer.name;
    }

    const { data, error } = await supabase
      .from('reviews')
      .insert({
        id: randomUUID(),
        shop_id: shopId,
        customer_id: customerId,
        booking_id: bookingId,
        type: 'shop',
        stylist_id: booking.stylist_id || null,
        service_score: Number(serviceScore || 5),
        skill_score: Number(stylistScore || 5),
        stylist_score: Number(stylistScore || 5),
        overall_score: overallScore,
        service_comment: serviceComment || '',
        stylist_comment: stylistComment || '',
        comment: comment || '',
        is_aware_of_membership_benefits: Boolean(isAwareOfMembershipBenefits),
        customer_name: customerName,
      })
      .select()
      .single();

    if (error) {
      console.error('[reviews] 创建评价失败:', error.message);
      return res.status(500).json({
        success: false,
        error: `创建评价失败: ${error.message}`,
      });
    }

    // 更新店铺平均评分
    const { data: reviewStats } = await supabase
      .from('reviews')
      .select('overall_score')
      .eq('shop_id', shopId);

    const scores = (reviewStats || []).map((r: Record<string, unknown>) => Number(r.overall_score)).filter((s: number) => !isNaN(s));
    const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 5;

    await supabase
      .from('shops')
      .update({
        rating: Math.round(avgScore * 10) / 10,
        review_count: scores.length,
      })
      .eq('id', shopId);

    res.status(201).json({
      success: true,
      data: reviewFromDb(data),
    });
  } catch (error) {
    console.error('[reviews] 创建评价异常:', error);
    res.status(500).json({
      success: false,
      error: '创建评价失败',
    });
  }
});

// 根据预约ID查询评价
reviewsRouter.get('/booking/:bookingId', resourceAccess('bookings', 'bookingId', true), async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.params;
    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[reviews] 查询预约评价失败:', error.message);
      return res.status(500).json({
        success: false,
        error: `查询预约评价失败: ${error.message}`,
      });
    }

    res.json({
      success: true,
      data: data ? reviewFromDb(data) : null,
    });
  } catch (error) {
    console.error('[reviews] 查询预约评价异常:', error);
    res.status(500).json({
      success: false,
      error: '查询预约评价失败',
    });
  }
});

// 获取顾客评价列表
reviewsRouter.get('/customer/:customerId', (req, res, next) => personalCustomerAccess(req, res, next, 'customerId'), async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;

    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[reviews] 查询顾客评价失败:', error.message);
      return res.status(500).json({
        success: false,
        error: '查询顾客评价失败',
      });
    }

    res.json({
      success: true,
      data: (data || []).map(reviewFromDb),
    });
  } catch (error) {
    console.error('[reviews] 获取顾客评价异常:', error);
    res.status(500).json({
      success: false,
      error: '获取顾客评价失败',
    });
  }
});

// 获取店铺评价列表
reviewsRouter.get('/shop/:shopId', optionalStaff, async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    if (req.employee && req.employee.shopId !== shopId) return res.status(403).json({ success: false, error: '无权访问其他店铺评价' });

    const { data, error } = await supabase
      .from('reviews')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[reviews] 查询评价失败:', error.message);
      return res.status(500).json({
        success: false,
        error: '查询评价失败',
      });
    }

    res.json({
      success: true,
      data: req.employee ? (data || []).map(reviewFromDb) : (data || []).filter(r => !r.is_hidden).map(r => {
        const review = reviewFromDb(r);
        for (const key of ['customerId', 'bookingId', 'replyBy']) delete review[key];
        review.customerName = r.customer_name ? String(r.customer_name).slice(0, 1) + '**' : '顾客';
        return review;
      }),
    });
  } catch (error) {
    console.error('[reviews] 获取评价异常:', error);
    res.status(500).json({
      success: false,
      error: '获取评价失败',
    });
  }
});

// 回复评价
reviewsRouter.put('/:id/reply', authMiddleware, requirePermission('review:manage'), ownRecord('reviews'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reply } = req.body;
    const replyBy = req.employee!.name;

    if (!reply || !replyBy) {
      return res.status(400).json({
        success: false,
        error: '缺少回复内容或回复人',
      });
    }

    const { data, error } = await supabase
      .from('reviews')
      .update({
        reply,
        reply_by: replyBy,
        reply_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[reviews] 回复评价失败:', error.message);
      return res.status(500).json({
        success: false,
        error: `回复评价失败: ${error.message}`,
      });
    }

    res.json({
      success: true,
      data: reviewFromDb(data),
    });
  } catch (error) {
    console.error('[reviews] 回复评价异常:', error);
    res.status(500).json({
      success: false,
      error: '回复评价失败',
    });
  }
});

// 隐藏/显示评价
reviewsRouter.put('/:id/hide', authMiddleware, requirePermission('review:manage'), ownRecord('reviews'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isHidden } = req.body;

    const { data, error } = await supabase
      .from('reviews')
      .update({ is_hidden: Boolean(isHidden) })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[reviews] 更新评价显示状态失败:', error.message);
      return res.status(500).json({
        success: false,
        error: `更新评价显示状态失败: ${error.message}`,
      });
    }

    res.json({
      success: true,
      data: reviewFromDb(data),
    });
  } catch (error) {
    console.error('[reviews] 更新评价显示状态异常:', error);
    res.status(500).json({
      success: false,
      error: '更新评价显示状态失败',
    });
  }
});

mainRouter.use('/reviews', reviewsRouter);

// ===================== shops =====================
const shopsRouter = Router();
shopsRouter.get('/:id/media/:image',async(req:Request,res:Response)=>{
  const {data,error}=await supabase.from('shops').select('avatar,images').eq('id',req.params.id).maybeSingle();
  if(error) return res.status(503).end();
  const value=req.params.image==='avatar'?data?.avatar:Array.isArray(data?.images)?data.images[Number(req.params.image)]:null;
  return sendStoredImage(res,value);
});
shopsRouter.get('/:id/products/:productId/images/:image',async(req:Request,res:Response)=>{
  const {data,error}=await supabase.from('products').select('images').eq('id',req.params.productId).eq('shop_id',req.params.id).maybeSingle();
  if(error) return res.status(503).end();
  return sendStoredImage(res,Array.isArray(data?.images)?data.images[Number(req.params.image)]:null);
});
shopsRouter.get('/:id/employees/:employeeId/avatar',async(req:Request,res:Response)=>{
  const {data,error}=await supabase.from('employees').select('avatar').eq('id',req.params.employeeId).eq('shop_id',req.params.id).eq('is_active',true).maybeSingle();
  if(error) return res.status(503).end();
  return sendStoredImage(res,data?.avatar);
});

// 计算两点之间的直线距离（公里）
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const shopFromDb = (s: Record<string, unknown>): Record<string, unknown> => ({
  id: s.id,
  name: s.name,
  description: s.description || '',
  address: s.address || '',
  phone: s.phone || '',
  latitude: s.latitude || 0,
  longitude: s.longitude || 0,
  level: s.level || 'good',
  isActive: s.is_active !== false,
  avatar: imageReference(s.avatar || '', '/api/shops/'+encodeURIComponent(String(s.id))+'/media/avatar'),
  images: ((s.images as unknown[]) || []).map((url,index)=>imageReference(url,'/api/shops/'+encodeURIComponent(String(s.id))+'/media/'+index)),
  services: s.services || [],
  products: productImageReferences(s.products as unknown[],String(s.id)),
  openingHours: s.opening_hours || {},
  employees: Array.isArray(s.employees) ? s.employees.map((raw) => { const e=raw as DbRecord; return {id:e.id,name:e.name,avatar:imageReference(e.avatar,'/api/shops/'+encodeURIComponent(String(s.id))+'/employees/'+encodeURIComponent(String(e.id))+'/avatar'),title:e.title,role:e.role,rating:e.rating,specialty:e.specialty,isGoldStylist:e.isGoldStylist ?? e.is_gold_stylist,isActive:e.isActive ?? e.is_active}; }) : [],
  bookingConfirmMode: s.booking_confirm_mode || 'auto',
  stockholderConfig: s.stockholder_config || null,
  rating: s.rating || 5,
  reviewCount: s.review_count || 0,
  createdAt: s.created_at,
  updatedAt: s.updated_at,
});

// 获取店铺列表
shopsRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('shops')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[shops] 查询店铺列表失败:', error.message);
      return res.status(500).json({
        success: false,
        error: '查询店铺列表失败',
      });
    }

    res.json({
      success: true,
      data: (data || []).map(shopFromDb),
    });
  } catch (error) {
    console.error('[shops] 获取店铺列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取店铺列表失败',
    });
  }
});

// 获取单条店铺
shopsRouter.get('/:id', optionalStaff, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('shops')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      console.error('[shops] 查询店铺失败:', error.message);
      return res.status(500).json({
        success: false,
        error: '查询店铺失败',
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        error: '店铺不存在',
      });
    }

    // 同时查询该店铺的员工，补充到返回数据中
    const { data: employees, error: empError } = await supabase
      .from('employees')
      .select('id, name, phone, avatar, title, rating, specialty, role, is_active, is_gold_stylist')
      .eq('shop_id', id)
      .eq('is_active', true);

    if (empError) {
      console.error('[shops] 查询员工失败:', empError.message);
    }

    const shop = shopFromDb(data) as Record<string, unknown>;

    // 根据用户坐标计算到店铺的直线距离
    const { lat, lon } = req.query;
    const userLat = lat ? parseFloat(lat as string) : undefined;
    const userLon = lon ? parseFloat(lon as string) : undefined;
    if (
      userLat !== undefined &&
      userLon !== undefined &&
      typeof shop.latitude === 'number' &&
      typeof shop.longitude === 'number'
    ) {
      shop.distance = calculateDistance(userLat, userLon, shop.latitude, shop.longitude);
    }

    res.json({
      success: true,
      data: {
        ...shop,
        employees: (employees || []).map((e: Record<string, unknown>) => ({
          id: e.id,
          name: e.name,
          ...(req.employee?.shopId === id ? {phone:e.phone} : {}),
          avatar: imageReference(e.avatar,'/api/shops/'+encodeURIComponent(id)+'/employees/'+encodeURIComponent(String(e.id))+'/avatar'),
          title: e.title,
          role: e.role,
          rating: e.rating || 5,
          isActive: e.is_active !== false,
          isGoldStylist: e.is_gold_stylist === true,
          specialty: e.specialty,
        })),
      },
    });
  } catch (error) {
    console.error('[shops] 获取店铺失败:', error);
    res.status(500).json({
      success: false,
      error: '获取店铺失败',
    });
  }
});

// 更新店铺信息
shopsRouter.put('/:id', authMiddleware, requirePermission('shop:edit'), requireOwnShop(), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      description,
      address,
      phone,
      latitude,
      longitude,
      avatar,
      images,
      services,
      employees,
      openingHours,
      bookingConfirmMode,
      stockholderConfig,
      isActive,
    } = req.body || {};

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updatePayload.name = name;
    if (description !== undefined) updatePayload.description = description;
    if (address !== undefined) updatePayload.address = address;
    if (phone !== undefined) updatePayload.phone = phone;
    if (latitude !== undefined) updatePayload.latitude = latitude;
    if (longitude !== undefined) updatePayload.longitude = longitude;
    if (avatar !== undefined || images !== undefined) {
      const {data:original,error:originalError}=await supabase.from('shops').select('avatar,images').eq('id',id).maybeSingle();
      if(originalError || !original) return res.status(503).json({success:false,error:'原图片读取失败，请稍后保存'});
      const prefix='/api/shops/'+encodeURIComponent(id)+'/media/';
      if(avatar!==undefined) updatePayload.avatar=restoreImageReference(avatar,original.avatar,prefix+'avatar');
      if(images!==undefined) updatePayload.images=Array.isArray(images)?images.map(value=>{
        const index=typeof value==='string'&&value.startsWith(prefix)?Number(value.slice(prefix.length)):NaN;
        return Number.isInteger(index)&&Array.isArray(original.images)?original.images[index]:value;
      }):images;
    }
    if (services !== undefined) updatePayload.services = services;
    if (employees !== undefined) updatePayload.employees = employees;
    if (openingHours !== undefined) updatePayload.opening_hours = openingHours;
    if (bookingConfirmMode !== undefined) updatePayload.booking_confirm_mode = bookingConfirmMode;
    if (stockholderConfig !== undefined) updatePayload.stockholder_config = stockholderConfig;
    if (isActive !== undefined) updatePayload.is_active = isActive;

    const { data, error } = await supabase
      .from('shops')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[shops] 更新店铺失败:', error.message);
      return res.status(500).json({ success: false, error: `更新店铺失败: ${error.message}` });
    }

    res.json({
      success: true,
      data: shopFromDb(data),
    });
  } catch (error) {
    console.error('[shops] 更新店铺失败:', error);
    res.status(500).json({ success: false, error: '更新店铺失败' });
  }
});

// 商品管理（已迁移到 products 独立表，同时同步 shops.products JSONB 保持兼容）

// 数据库 product 行 → 前端 Product 对象格式
const productFromDb = (p: Record<string, unknown>): Record<string, unknown> => ({
  id: p.id,
  shopId: p.shop_id,
  name: p.name,
  category: p.category,
  price: Number(p.price) || 0,
  originalPrice: p.original_price ? Number(p.original_price) : undefined,
  description: p.description || '',
  images: p.images || [],
  stock: Number(p.stock) || 0,
  lowStockThreshold: Number(p.low_stock_threshold) || 10,
  sales: Number(p.sales) || 0,
  isActive: p.is_active !== false,
  isRecommended: p.is_recommended === true,
  sortOrder: Number(p.sort_order) || 0,
  rating: Number(p.rating) || 5,
  reviewCount: Number(p.review_count) || 0,
  tags: p.tags || [],
  createdAt: p.created_at,
  updatedAt: p.updated_at,
});

// JSON内只返回图片地址；图片路由按需提供完整数据。
const productImageReferences = (products: unknown[],shopId:string): unknown[] => (products || []).map(product=>{
  if(!product || typeof product!=='object') return product;
  const p=product as DbRecord;
  return {...p,images:Array.isArray(p.images)?p.images.map((image:unknown,index:number)=>imageReference(image,'/api/shops/'+encodeURIComponent(shopId)+'/products/'+encodeURIComponent(String(p.id))+'/images/'+index)):[]};
});

// 前端 Product 对象 → 数据库 products 表字段
const productToDb = (p: Record<string, unknown>): Record<string, unknown> => ({
  id: p.id,
  shop_id: p.shopId,
  name: p.name,
  category: p.category,
  price: p.price,
  original_price: p.originalPrice,
  description: p.description,
  images: p.images,
  stock: p.stock,
  low_stock_threshold: p.lowStockThreshold,
  sales: p.sales,
  is_active: p.isActive,
  is_recommended: p.isRecommended,
  sort_order: p.sortOrder,
  rating: p.rating,
  review_count: p.reviewCount,
  tags: p.tags,
  created_at: p.createdAt,
  updated_at: p.updatedAt || new Date().toISOString(),
});

// 数据库 product_inventory_logs 行 → 前端 ProductInventoryLog 对象
const productInventoryLogFromDb = (r: Record<string, unknown>): Record<string, unknown> => ({
  id: r.id,
  shopId: r.shop_id,
  productId: r.product_id,
  productName: r.product_name,
  changeAmount: Number(r.change_amount) || 0,
  stockAfter: Number(r.stock_after) || 0,
  type: r.type,
  orderId: r.order_id,
  reason: r.reason || '',
  operatorId: r.operator_id,
  operatorName: r.operator_name,
  createdAt: r.created_at,
});

// 写入库存变动记录
const insertInventoryLog = async (payload: {
  shopId: string;
  productId: string;
  productName: string;
  changeAmount: number;
  stockAfter: number;
  type: 'sale' | 'refund' | 'manual_adjust' | 'init' | 'cancel';
  orderId?: string;
  reason?: string;
  operatorId?: string;
  operatorName?: string;
}) => {
  const id = `pil_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  await supabase.from('product_inventory_logs').insert({
    id,
    shop_id: payload.shopId,
    product_id: payload.productId,
    product_name: payload.productName,
    change_amount: payload.changeAmount,
    stock_after: payload.stockAfter,
    type: payload.type,
    order_id: payload.orderId || null,
    reason: payload.reason || '',
    operator_id: payload.operatorId || null,
    operator_name: payload.operatorName || '',
    created_at: new Date().toISOString(),
  });
};

// 将 products 表数据同步回 shops.products JSONB（保持现有 H5/小程序读取 shop.products 的兼容性）
const syncShopProductsJsonb = async (shopId: string) => {
  try {
    const { data: products } = await supabase.from('products').select('*').eq('shop_id', shopId).order('created_at', { ascending: false });
    // 兼容缓存必须保存完整原值，不能把展示层的缩略内容写回数据库。
    const jsonbProducts = (products || []).map(productFromDb);
    await supabase.from('shops').update({ products: jsonbProducts, updated_at: new Date().toISOString() }).eq('id', shopId);
  } catch (err) {
    console.error('[shops] 同步 shops.products JSONB 失败:', err);
  }
};

shopsRouter.get('/:id/products', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { recommended } = req.query;
    let query = supabase.from('products').select('*').eq('shop_id', id);
    if (recommended === 'true') {
      query = query.eq('is_recommended', true).eq('is_active', true);
    }
    const { data, error } = await query
      .order('is_recommended', { ascending: false })
      .order('sort_order', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[shops] 查询商品失败:', error.message);
      return res.status(500).json({ success: false, error: '查询商品失败' });
    }
    res.json({ success: true, data: productImageReferences((data || []).map(productFromDb),id) });
  } catch (error) {
    console.error('[shops] 获取商品异常:', error);
    res.status(500).json({ success: false, error: '获取商品失败' });
  }
});

shopsRouter.post('/:id/products', authMiddleware, requirePermission('shop:edit'), requireOwnShop(), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const product = req.body || {};
    if (!product.name || !product.category || product.price === undefined) {
      return res.status(400).json({ success: false, error: '缺少必要字段' });
    }

    if(!Number.isFinite(Number(product.price)) || Number(product.price)<0 || !Number.isSafeInteger(Number(product.stock ?? 0)) || Number(product.stock ?? 0)<0) return res.status(400).json({success:false,error:'价格须非负，库存须为非负整数'});
    const newProduct = {
      ...product,
      id: product.id || `prod_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      shopId: id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const { data, error: insertError } = await supabase.from('products').insert(productToDb(newProduct)).select().single();
    if (insertError) {
      console.error('[shops] 添加商品失败:', insertError.message);
      return res.status(500).json({ success: false, error: '添加商品失败' });
    }

    await syncShopProductsJsonb(id);

    res.status(201).json({ success: true, data: productFromDb(data) });
  } catch (error) {
    console.error('[shops] 添加商品异常:', error);
    res.status(500).json({ success: false, error: '添加商品失败' });
  }
});

shopsRouter.put('/:id/products/:productId', authMiddleware, requirePermission('shop:edit'), requireOwnShop(), async (req: Request, res: Response) => {
  try {
    const { id, productId } = req.params;
    const updates = req.body || {};

    if(updates.price!==undefined && (!Number.isFinite(Number(updates.price)) || Number(updates.price)<0)) return res.status(400).json({success:false,error:'商品价格不正确'});
    // 库存只走有事务与流水的库存调整入口，避免旧编辑表单覆盖并发售出数量。
    const dbUpdates = productToDb({ ...updates, updatedAt: new Date().toISOString() });
    // 防止误改 id/shop_id/created_at
    delete dbUpdates.id;
    delete dbUpdates.shop_id;
    delete dbUpdates.created_at;
    delete dbUpdates.stock;
    delete dbUpdates.sales;
    if(Array.isArray(dbUpdates.images)) {
      const {data:original,error:originalError}=await supabase.from('products').select('images').eq('id',productId).eq('shop_id',id).maybeSingle();
      if(originalError || !original) return res.status(503).json({success:false,error:'原商品图片读取失败，请稍后保存'});
      const prefix='/api/shops/'+encodeURIComponent(id)+'/products/'+encodeURIComponent(productId)+'/images/';
      dbUpdates.images=dbUpdates.images.map((value:unknown)=>{
        const index=typeof value==='string'&&value.startsWith(prefix)?Number(value.slice(prefix.length)):NaN;
        return Number.isInteger(index)&&Array.isArray(original.images)?original.images[index]:value;
      });
    }

    const { data, error: updateError } = await supabase
      .from('products')
      .update(dbUpdates)
      .eq('id', productId)
      .eq('shop_id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[shops] 更新商品失败:', updateError.message);
      return res.status(500).json({ success: false, error: '更新商品失败' });
    }

    await syncShopProductsJsonb(id);

    res.json({ success: true, data: productFromDb(data) });
  } catch (error) {
    console.error('[shops] 更新商品异常:', error);
    res.status(500).json({ success: false, error: '更新商品失败' });
  }
});

shopsRouter.delete('/:id/products/:productId', authMiddleware, requirePermission('shop:edit'), requireOwnShop(), async (req: Request, res: Response) => {
  try {
    const { id, productId } = req.params;

    const { error: deleteError } = await supabase.from('products').delete().eq('id', productId).eq('shop_id', id);
    if (deleteError) {
      console.error('[shops] 删除商品失败:', deleteError.message);
      return res.status(500).json({ success: false, error: '删除商品失败' });
    }

    await syncShopProductsJsonb(id);

    res.json({ success: true });
  } catch (error) {
    console.error('[shops] 删除商品异常:', error);
    res.status(500).json({ success: false, error: '删除商品失败' });
  }
});

// 店铺手动调整商品库存
shopsRouter.post('/:id/products/:productId/inventory',authMiddleware,requirePermission('shop:edit'),requireOwnShop(),async(req: Request,res: Response)=>{
  try {
    const stock=req.body?.stock,reason=String(req.body?.reason || '').trim();
    if(!Number.isSafeInteger(stock) || stock<0 || !reason) return res.status(400).json({success:false,error:'库存须为非负整数，并填写调整原因'});
    const {data,error}=await supabase.rpc('adjust_product_inventory_atomic',{
      p_product_id:req.params.productId,p_shop_id:req.employee!.shopId,p_stock:stock,p_reason:reason,
      p_employee_id:req.employee!.id,p_employee_name:req.employee!.name,
    });
    if(error) return operationError(res,error,'调整库存失败');
    if(!data?.[0]) return res.status(503).json({success:false,error:'库存结果未确认，请刷新核对'});
    await syncShopProductsJsonb(req.employee!.shopId);
    res.json({success:true,data:productFromDb(data[0])});
  } catch {res.status(503).json({success:false,error:'调整库存暂不可用'});}
});

// 查询商品库存变动记录
shopsRouter.get('/:id/products/:productId/inventory-logs', authMiddleware, requirePermission('shop:edit'), requireOwnShop(), async (req: Request, res: Response) => {
  try {
    const { id, productId } = req.params;
    const { data: logs, error } = await supabase
      .from('product_inventory_logs')
      .select('*')
      .eq('shop_id', id)
      .eq('product_id', productId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[shops] 查询库存记录失败:', error.message);
      return res.status(500).json({ success: false, error: '查询库存记录失败' });
    }
    res.json({ success: true, data: (logs || []).map(productInventoryLogFromDb) });
  } catch (error) {
    console.error('[shops] 查询库存记录异常:', error);
    res.status(500).json({ success: false, error: '查询库存记录失败' });
  }
});

// 优惠券相关转换
const couponFromDb = (c: DbRecord): Coupon => ({
  id: c.id,
  shopId: c.shop_id,
  name: c.name,
  type: c.type,
  value: Number(c.value) || 0,
  minOrderAmount: c.min_order_amount ? Number(c.min_order_amount) : undefined,
  maxDiscountAmount: c.max_discount_amount ? Number(c.max_discount_amount) : undefined,
  applicableScope: c.applicable_scope || 'all',
  applicableProductIds: c.applicable_product_ids || [],
  totalQuantity: Number(c.total_quantity ?? -1),
  remainingQuantity: Number(c.remaining_quantity ?? -1),
  perCustomerLimit: Number(c.per_customer_limit) || 1,
  startAt: c.start_at,
  endAt: c.end_at,
  isActive: c.is_active !== false,
  createdAt: c.created_at,
  updatedAt: c.updated_at,
});

const customerCouponFromDb = (cc: DbRecord): CustomerCoupon => ({
  id: cc.id,
  couponId: cc.coupon_id,
  shopId: cc.shop_id,
  customerId: cc.customer_id,
  customerName: cc.customer_name,
  customerPhone: cc.customer_phone,
  status: cc.status,
  usedAt: cc.used_at,
  orderId: cc.order_id,
  createdAt: cc.created_at,
  updatedAt: cc.updated_at,
});

// 优惠券路由
const couponsRouter = Router();

// 店铺创建优惠券
couponsRouter.post('/', authMiddleware, requirePermission('shop:edit'), async (req: Request, res: Response) => {
  try {
    const { shopId, ...rest } = req.body || {};
    if (shopId !== req.employee!.shopId) return res.status(403).json({ success: false, error: '无权操作其他店铺优惠券' });
    if (!shopId || !rest.name || rest.value === undefined) {
      return res.status(400).json({ success: false, error: '缺少必要字段' });
    }
    const id = `cpn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const now = new Date().toISOString();
    const payload = {
      id,
      shop_id: shopId,
      name: rest.name,
      type: rest.type || 'fixed_amount',
      value: Number(rest.value) || 0,
      min_order_amount: rest.minOrderAmount ?? 0,
      max_discount_amount: rest.maxDiscountAmount ?? null,
      applicable_scope: rest.applicableScope || 'all',
      applicable_product_ids: rest.applicableProductIds || [],
      total_quantity: rest.totalQuantity ?? -1,
      remaining_quantity: rest.remainingQuantity ?? rest.totalQuantity ?? -1,
      per_customer_limit: rest.perCustomerLimit ?? 1,
      start_at: rest.startAt || now,
      end_at: rest.endAt || null,
      is_active: rest.isActive !== false,
      created_at: now,
      updated_at: now,
    };
    const { data, error } = await supabase.from('coupons').insert(payload).select().single();
    if (error) {
      console.error('[coupons] 创建优惠券失败:', error.message);
      return res.status(500).json({ success: false, error: '创建优惠券失败' });
    }
    res.status(201).json({ success: true, data: couponFromDb(data) });
  } catch (error) {
    console.error('[coupons] 创建优惠券异常:', error);
    res.status(500).json({ success: false, error: '创建优惠券失败' });
  }
});

// 查询店铺优惠券列表
couponsRouter.get('/shop/:shopId', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const { active } = req.query;
    let query = supabase.from('coupons').select('*').eq('shop_id', shopId);
    if (active === 'true') {
      query = query.eq('is_active', true);
    }
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      return res.status(500).json({ success: false, error: '查询优惠券失败' });
    }
    res.json({ success: true, data: (data || []).map(couponFromDb) });
  } catch (error) {
    console.error('[coupons] 查询优惠券异常:', error);
    res.status(500).json({ success: false, error: '查询优惠券失败' });
  }
});

// 顾客领取优惠券
couponsRouter.post('/:id/claim', customerSession, async (req: Request, res: Response) => {
  try {
    const {data,error}=await supabase.rpc('claim_coupon_atomic',{
      p_coupon_id:req.params.id,p_customer_id:req.customer!.id,p_shop_id:req.customer!.shopId,p_referral_id:null,
    });
    if(error) return operationError(res,error,'领取优惠券失败，请稍后重试');
    if(!data?.[0]) return res.status(503).json({success:false,error:'领券结果未确认，请刷新后核对'});
    res.json({success:true,data:customerCouponFromDb(data[0])});
  } catch {res.status(503).json({success:false,error:'领取优惠券暂不可用'});}
});

// 更新优惠券（启用/禁用、修改字段）
couponsRouter.put('/:id', authMiddleware, requirePermission('shop:edit'), ownRecord('coupons'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = { updated_at: now };
    if (body.name !== undefined) payload.name = body.name;
    if (body.type !== undefined) payload.type = body.type;
    if (body.value !== undefined) payload.value = Number(body.value) || 0;
    if (body.minOrderAmount !== undefined) payload.min_order_amount = body.minOrderAmount ?? 0;
    if (body.maxDiscountAmount !== undefined) payload.max_discount_amount = body.maxDiscountAmount ?? null;
    if (body.applicableScope !== undefined) payload.applicable_scope = body.applicableScope || 'all';
    if (body.applicableProductIds !== undefined) payload.applicable_product_ids = body.applicableProductIds || [];
    if (body.totalQuantity !== undefined) payload.total_quantity = body.totalQuantity ?? -1;
    if (body.remainingQuantity !== undefined) payload.remaining_quantity = body.remainingQuantity ?? body.totalQuantity ?? -1;
    if (body.perCustomerLimit !== undefined) payload.per_customer_limit = body.perCustomerLimit ?? 1;
    if (body.startAt !== undefined) payload.start_at = body.startAt;
    if (body.endAt !== undefined) payload.end_at = body.endAt || null;
    if (body.isActive !== undefined) payload.is_active = body.isActive !== false;

    const { data, error } = await supabase.from('coupons').update(payload).eq('id', id).select().single();
    if (error) {
      console.error('[coupons] 更新优惠券失败:', error.message);
      return res.status(500).json({ success: false, error: '更新优惠券失败' });
    }
    if (!data) {
      return res.status(404).json({ success: false, error: '优惠券不存在' });
    }
    res.json({ success: true, data: couponFromDb(data) });
  } catch (error) {
    console.error('[coupons] 更新优惠券异常:', error);
    res.status(500).json({ success: false, error: '更新优惠券失败' });
  }
});

// 查询顾客优惠券
couponsRouter.get('/customer/:customerId', (req, res, next) => personalCustomerAccess(req, res, next, 'customerId'), async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const { shopId, status } = req.query;
    let query = supabase.from('customer_coupons').select('*').eq('customer_id', customerId);
    if (shopId) query = query.eq('shop_id', shopId);
    if (status) query = query.eq('status', status);
    const { data: customerCoupons, error } = await query.order('created_at', { ascending: false });
    if (error) {
      console.error('[coupons] 查询顾客优惠券失败:', error.message);
      return res.status(500).json({ success: false, error: '查询优惠券失败' });
    }

    // 手动查询关联的优惠券信息（兼容无 foreign key 关系的数据库）
    const couponIds = [...new Set((customerCoupons || []).map((cc: DbRecord) => cc.coupon_id).filter(Boolean))];
    const couponsMap = new Map<string, DbRecord>();
    if (couponIds.length > 0) {
      const { data: coupons, error: couponsError } = await supabase
        .from('coupons')
        .select('*')
        .in('id', couponIds);
      if (couponsError) {
        console.error('[coupons] 查询关联优惠券失败:', couponsError.message);
      } else {
        (coupons || []).forEach((c: DbRecord) => couponsMap.set(c.id, c));
      }
    }

    res.json({ success: true, data: (customerCoupons || []).map((cc: DbRecord) => ({
      ...customerCouponFromDb(cc),
      coupon: cc.coupon_id && couponsMap.has(cc.coupon_id) ? couponFromDb(couponsMap.get(cc.coupon_id)) : undefined,
    })) });
  } catch (error) {
    console.error('[coupons] 查询顾客优惠券异常:', error);
    res.status(500).json({ success: false, error: '查询优惠券失败' });
  }
});

mainRouter.use('/coupons', couponsRouter);

mainRouter.use('/shops', shopsRouter);

// ===================== product orders =====================
const productOrdersRouter = Router();

const productOrderFromDb = (o: DbRecord): Record<string, unknown> => ({
  id: o.id,
  shopId: o.shop_id,
  customerId: o.customer_id,
  customerName: o.customer_name,
  customerPhone: o.customer_phone,
  orderNo: o.order_no,
  totalAmount: Number(o.total_amount) || 0,
  discountAmount: Number(o.discount_amount) || 0,
  payableAmount: Number(o.payable_amount) || 0,
  status: o.status,
  paymentMethod: o.payment_method,
  paymentStatus: o.payment_status,
  paidAt: o.paid_at,
  pickupCode: o.pickup_code,
  pickupName: o.pickup_name,
  pickupPhone: o.pickup_phone,
  notes: o.notes,
  cancelledAt: o.cancelled_at,
  cancelReason: o.cancel_reason,
  completedAt: o.completed_at,
  createdAt: o.created_at,
  updatedAt: o.updated_at,
  // 发货相关字段
  shippingCompany: o.shipping_company || '',
  shippingNo: o.shipping_no || '',
  shippedAt: o.shipped_at || null,
  confirmedAt: o.confirmed_at || null,
  trackingInfo: o.tracking_info || [],
});

const productOrderItemFromDb = (i: DbRecord, shopId?:string): Record<string, unknown> => {
  const image = typeof i.image==='string' && i.image.startsWith('data:') && shopId ? '/api/shops/'+encodeURIComponent(shopId)+'/products/'+encodeURIComponent(String(i.product_id))+'/images/0' : i.image;
  return {
    id: i.id,
    orderId: i.order_id,
    productId: i.product_id,
    name: i.name,
    image,
    price: Number(i.price) || 0,
    originalPrice: i.original_price ? Number(i.original_price) : undefined,
    quantity: Number(i.quantity) || 1,
    totalAmount: Number(i.total_amount) || 0,
    category: i.category,
  };
};

// 取消订单时回滚库存并记录变动
// 生成订单号：PO + 年月日 + 4位随机
const generateOrderNo = () => {
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const randomStr = Math.floor(1000 + Math.random() * 9000);
  return `PO${dateStr}${randomStr}`;
};

// 生成到店自提核销码：6 位数字
const generatePickupCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// 计算优惠券优惠金额（基于会员折扣后的金额）
const calcCouponDiscount = (coupon: Coupon, baseAmount: number): number => {
  if (baseAmount <= 0) return 0;
  let discount = 0;
  if (coupon.type === 'fixed_amount') {
    discount = Math.min(coupon.value, baseAmount);
  } else if (coupon.type === 'percentage') {
    // 前端约定：value 为折数，如 8.8 表示 8.8 折（减免 12%）
    const ratio = Math.max(0, Math.min(10, coupon.value / 10));
    discount = baseAmount * (1 - ratio);
  } else if (coupon.type === 'buy_x_get_y') {
    // MVP 阶段买赠券暂不在商品订单使用
    return 0;
  }
  if (coupon.maxDiscountAmount && coupon.maxDiscountAmount > 0) {
    discount = Math.min(discount, coupon.maxDiscountAmount);
  }
  return Math.round(discount * 100) / 100;
};

// 顾客创建商品订单（MVP：支持余额支付和到店自提付款，支持优惠券抵扣）
productOrdersRouter.post('/', (req, res, next) => { req.params.customerIdentityId = req.body?.customerId; personalCustomerAccess(req, res, next, 'customerIdentityId'); }, async (req: Request, res: Response) => {
  try {
    const { shopId, customerId, items, paymentMethod, pickupName, pickupPhone, notes, customerCouponId } = req.body || {};

    if (!shopId || !customerId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: '缺少必要字段' });
    }

    if (!['balance', 'store_pickup'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, error: '暂不支持的支付方式' });
    }

    if (paymentMethod === 'balance' && !(await isCustomerVerified(customerId, shopId))) return res.status(403).json({ success: false, code: 'CUSTOMER_IDENTITY_UNVERIFIED', error: FIRST_USE_MESSAGE });

    // 获取顾客信息（含会员等级，用于计算商品折扣）
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select(
        'id, shop_id, name, phone, stored_value_balance, withdrawable_referral_amount, purchase_vip_level, stored_value_level, purchase_vip_expires_at, stored_value_expires_at'
      )
      .eq('id', customerId)
      .eq('shop_id', shopId)
      .single();

    if (customerError || !customer) {
      return res.status(404).json({ success: false, error: '顾客不存在' });
    }

    // 获取商品信息并校验库存
    const productIds = items.map((i: Record<string, unknown>) => i.productId);
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('*')
      .in('id', productIds)
      .eq('shop_id', shopId);

    if (productsError || !products) {
      return res.status(500).json({ success: false, error: '查询商品失败' });
    }

    // 计算顾客有效会员等级，确保前后端折扣价一致
    const customerForDiscount = {
      purchaseVIPLevel: customer.purchase_vip_level || 'regular',
      storedValueLevel: customer.stored_value_level || 'none',
      purchaseVIPExpiresAt: customer.purchase_vip_expires_at,
      storedValueExpiresAt: customer.stored_value_expires_at,
    } as Customer;
    const purchaseLevel = getEffectivePurchaseVIPLevel(customerForDiscount);
    const storedLevel = getEffectiveStoredValueLevel(customerForDiscount);

    const productMap = new Map(products.map((p: Record<string, unknown>) => [p.id, p]));
    let totalAmount = 0;
    let originalTotalAmount = 0;
    const orderItems: Array<Record<string, unknown>> = [];

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) {
        return res.status(400).json({ success: false, error: `商品不存在: ${item.productId}` });
      }
      if (!product.is_active) {
        return res.status(400).json({ success: false, error: `商品已下架: ${product.name}` });
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 100) return res.status(400).json({ success: false, error: '商品数量不正确' });
      const quantity = item.quantity;
      if (Number(product.stock || 0) < quantity) {
        return res.status(400).json({ success: false, error: `商品库存不足: ${product.name}` });
      }

      const originalPrice = Number(product.price || 0);
      // 应用与 H5/小程序一致的会员折扣（假发不参与折扣）
      const unitPrice = calcDiscountedItemPrice(
        originalPrice,
        purchaseLevel,
        storedLevel,
        product.category as ProductCategory | 'service'
      );
      const itemTotal = Math.round(unitPrice * quantity * 100) / 100;
      const itemOriginalTotal = Math.round(originalPrice * quantity * 100) / 100;
      totalAmount += itemTotal;
      originalTotalAmount += itemOriginalTotal;

      const rawImage = product.images?.[0] || null;
      const image=imageReference(rawImage,'/api/shops/'+encodeURIComponent(shopId)+'/products/'+encodeURIComponent(String(product.id))+'/images/0');
      orderItems.push({
        product_id: product.id,
        name: product.name,
        image,
        price: unitPrice,
        original_price: product.original_price,
        quantity,
        total_amount: itemTotal,
        category: product.category,
      });
    }

    totalAmount = Math.round(totalAmount * 100) / 100;
    originalTotalAmount = Math.round(originalTotalAmount * 100) / 100;

    // 校验并应用优惠券
    let couponDiscount = 0;
    let appliedCustomerCoupon: CustomerCoupon | null = null;
    let appliedCoupon: Coupon | null = null;

    if (customerCouponId) {
      const { data: cc, error: ccError } = await supabase
        .from('customer_coupons')
        .select('*, coupons(*)')
        .eq('id', customerCouponId)
        .eq('customer_id', customerId)
        .eq('shop_id', shopId)
        .single();

      if (ccError || !cc) {
        return res.status(400).json({ success: false, error: '优惠券不存在或不属于当前顾客' });
      }

      const rawCoupon = (cc.coupons || {}) as Record<string, unknown>;
      const coupon = couponFromDb(rawCoupon);

      if (cc.status !== 'unused') {
        return res.status(400).json({ success: false, error: '优惠券已使用或已失效' });
      }

      const now = new Date().toISOString();
      if (now < String(coupon.startAt) || (coupon.endAt && now > String(coupon.endAt))) {
        return res.status(400).json({ success: false, error: '优惠券不在有效期内' });
      }
      if (!coupon.isActive) {
        return res.status(400).json({ success: false, error: '优惠券已停用' });
      }
      if (coupon.type === 'buy_x_get_y') {
        return res.status(400).json({ success: false, error: '买赠券暂不支持在商品订单使用' });
      }

      const minOrderAmount = coupon.minOrderAmount || 0;
      if (totalAmount < minOrderAmount) {
        return res.status(400).json({ success: false, error: `订单金额未满 ${minOrderAmount.toFixed(2)} 元，无法使用该优惠券` });
      }

      let discountBase = totalAmount;
      if (coupon.applicableScope === 'service') {
        return res.status(400).json({ success: false, error: '该优惠券仅限服务类项目，不能用于商品订单' });
      }
      if (coupon.applicableScope === 'product') {
        const applicableIds = coupon.applicableProductIds || [];
        if (!Array.isArray(applicableIds) || applicableIds.length === 0) {
          return res.status(400).json({ success: false, error: '优惠券适用范围为空' });
        }
        let applicableTotal = 0;
        for (const item of items) {
          if (applicableIds.includes(item.productId)) {
            const product = productMap.get(item.productId);
            if (product) {
              const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)));
              const unitPrice = calcDiscountedItemPrice(
                Number(product.price || 0),
                purchaseLevel,
                storedLevel,
                product.category as ProductCategory | 'service'
              );
              applicableTotal += unitPrice * quantity;
            }
          }
        }
        if (applicableTotal <= 0) {
          return res.status(400).json({ success: false, error: '优惠券不适用当前商品' });
        }
        discountBase = Math.round(applicableTotal * 100) / 100;
      }

      couponDiscount = calcCouponDiscount(coupon, discountBase);
      if (couponDiscount <= 0) {
        return res.status(400).json({ success: false, error: '优惠券无可用优惠金额' });
      }

      appliedCustomerCoupon = cc;
      appliedCoupon = coupon;
    }

    couponDiscount = Math.round(couponDiscount * 100) / 100;
    const payableAmount = Math.round((totalAmount - couponDiscount) * 100) / 100;
    const discountAmount = Math.round((originalTotalAmount - payableAmount) * 100) / 100;

    // 余额支付：立即扣减库存和余额
    if (paymentMethod === 'balance') {
      const balance = Number(customer.stored_value_balance || 0);
      if (balance < payableAmount) {
        return res.status(400).json({ success: false, error: '储值余额不足' });
      }
    }

    const orderId = `po_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const orderNo = generateOrderNo();
    const pickupCode = generatePickupCode();

    const { data: createdOrders, error: orderError } = await supabase.rpc('create_product_order_atomic', {
      p_order: {
        id: orderId, shop_id: shopId, customer_id: customerId, customer_name: customer.name || '', customer_phone: customer.phone || '',
        order_no: orderNo, total_amount: totalAmount, discount_amount: discountAmount, payable_amount: payableAmount,
        payment_method: paymentMethod, pickup_code: pickupCode, pickup_name: pickupName || customer.name || '',
        pickup_phone: pickupPhone || customer.phone || '', notes: notes || '',
      }, p_items: orderItems, p_coupon_id: appliedCustomerCoupon?.id || null,
    });
    if (orderError) return res.status(orderError.code === 'PGRST202' ? 503 : 409).json({ success: false, error: orderError.code === 'PGRST202' ? '请先执行 028 商城交易迁移' : '订单未创建：余额、库存或优惠券状态已变化' });
    const order = createdOrders?.[0];
    if (!order) return res.status(503).json({ success: false, error: '订单结果暂不可用' });
    await syncShopProductsJsonb(shopId);

    res.status(201).json({
      success: true,
      data: {
        ...productOrderFromDb(order),
        items: orderItems.map((i) => productOrderItemFromDb({ ...i, order_id: orderId },shopId)),
        couponDiscount,
        customerCouponId: appliedCustomerCoupon?.id || undefined,
        couponName: appliedCoupon?.name || undefined,
      },
    });
  } catch (error) {
    console.error('[productOrders] 创建订单异常:', error);
    res.status(500).json({ success: false, error: '创建订单失败' });
  }
});

// 顾客继续支付待支付订单
productOrdersRouter.post('/:id/pay', (req, res, next) => { req.params.customerIdentityId = req.body?.customerId; personalCustomerAccess(req, res, next, 'customerIdentityId'); }, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { customerId, paymentMethod } = req.body || {};

    if (!customerId) {
      return res.status(400).json({ success: false, error: '缺少顾客ID' });
    }
    if (!['balance', 'store_pickup'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, error: '暂不支持的支付方式' });
    }

    const { data: order, error: orderError } = await supabase
      .from('product_orders')
      .select('*')
      .eq('id', id)
      .single();
    if (orderError || !order) {
      return res.status(404).json({ success: false, error: '订单不存在' });
    }
    if (order.customer_id !== customerId) {
      return res.status(403).json({ success: false, error: '无权操作该订单' });
    }
    if (order.status !== 'pending') {
      return res.status(400).json({ success: false, error: '订单不是待支付状态' });
    }

    if (paymentMethod === 'store_pickup') return res.status(400).json({ success: false, error: '到店付款请由门店确认收款，顾客端不能自行标记已付' });
    if (!(await isCustomerVerified(customerId, order.shop_id))) return res.status(403).json({ success: false, code: 'CUSTOMER_IDENTITY_UNVERIFIED', error: FIRST_USE_MESSAGE });
    const { data, error: paymentError } = await supabase.rpc('pay_product_order_atomic', { p_order_id: id, p_customer_id: customerId });
    if (paymentError) return res.status(paymentError.code === 'PGRST202' ? 503 : 409).json({ success: false, error: paymentError.code === 'PGRST202' ? '请先执行 028 商城交易迁移' : '支付未完成，请核对余额和订单状态' });
    const updatedOrder = data?.[0];
    if (!updatedOrder) return res.status(503).json({ success: false, error: '支付结果暂不可用' });
    res.json({ success: true, data: productOrderFromDb(updatedOrder) });
  } catch (error) {
    console.error('[productOrders] 支付订单异常:', error);
    res.status(500).json({ success: false, error: '支付订单失败' });
  }
});

// 顾客查看自己的商品订单列表
productOrdersRouter.get('/customer/:customerId', (req, res, next) => personalCustomerAccess(req, res, next, 'customerId'), async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const { shopId } = req.query;
    const ownShopId = req.customer!.shopId;
    if (shopId && shopId !== ownShopId) return res.status(403).json({success:false,error:'无权访问其他店铺数据'});
    const query = supabase.from('product_orders').select('*').eq('customer_id', customerId).eq('shop_id', ownShopId);
    const { data: orders, error } = await query.order('created_at', { ascending: false });
    if (error) {
      return res.status(500).json({ success: false, error: '查询订单失败' });
    }

    const orderIds = (orders || []).map((o: Record<string, unknown>) => o.id);
    const itemsByOrderId = new Map<string, Array<Record<string, unknown>>>();
    if (orderIds.length) {
      const { data: items, error: itemsError } = await supabase.from('product_order_items').select('*').in('order_id', orderIds);
      if (itemsError) return res.status(503).json({success:false,error:'订单明细暂不可用，请重试'});
      (items || []).forEach((i: Record<string, unknown>) => {
        const list = itemsByOrderId.get(i.order_id as string) || [];
        list.push(productOrderItemFromDb(i,ownShopId));
        itemsByOrderId.set(i.order_id as string, list);
      });
    }

    res.json({
      success: true,
      data: (orders || []).map((o: Record<string, unknown>) => ({
        ...productOrderFromDb(o),
        items: itemsByOrderId.get(o.id as string) || [],
      })),
    });
  } catch (error) {
    console.error('[productOrders] 查询顾客订单异常:', error);
    res.status(500).json({ success: false, error: '查询订单失败' });
  }
});

// 店铺查看商品订单列表（支持状态筛选、订单号/手机号搜索、分页）
productOrdersRouter.get('/shop/:shopId', authMiddleware, requirePermission('product:fulfill'), requireOwnShop('shopId'), async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const { status, keyword, page = '1', pageSize = '10' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const pageSizeNum = Math.min(100, Math.max(1, parseInt(pageSize as string, 10) || 10));

    let query = supabase
      .from('product_orders')
      .select('*', { count: 'exact' })
      .eq('shop_id', shopId);

    if (status) {
      const statuses = (status as string).split(',').filter(Boolean);
      if (statuses.length === 1) {
        query = query.eq('status', statuses[0]);
      } else if (statuses.length > 1) {
        query = query.in('status', statuses);
      }
    }

    if (keyword) {
      const k = String(keyword).trim();
      if (k) {
        query = query.or(`order_no.ilike.%${k}%,customer_phone.ilike.%${k}%`);
      }
    }

    const from = (pageNum - 1) * pageSizeNum;
    const to = from + pageSizeNum - 1;
    const { data: orders, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      console.error('[productOrders] 查询店铺订单失败:', error.message);
      return res.status(500).json({ success: false, error: '查询订单失败' });
    }

    const orderIds = (orders || []).map((o: Record<string, unknown>) => o.id);
    const itemsByOrderId = new Map<string, Array<Record<string, unknown>>>();
    if (orderIds.length > 0) {
      const { data: items, error: itemsError } = await supabase
        .from('product_order_items')
        .select('*')
        .in('order_id', orderIds);
      if (itemsError) return res.status(503).json({success:false,error:'订单明细暂不可用，请重试'});
      (items || []).forEach((i: Record<string, unknown>) => {
        const list = itemsByOrderId.get(i.order_id as string) || [];
        list.push(productOrderItemFromDb(i,req.employee!.shopId));
        itemsByOrderId.set(i.order_id as string, list);
      });
    }

    res.json({
      success: true,
      data: {
        list: (orders || []).map((o: Record<string, unknown>) => ({
          ...productOrderFromDb(o),
          items: itemsByOrderId.get(o.id as string) || [],
        })),
        total: count || 0,
        page: pageNum,
        pageSize: pageSizeNum,
      },
    });
  } catch (error) {
    console.error('[productOrders] 查询店铺订单异常:', error);
    res.status(500).json({ success: false, error: '查询订单失败' });
  }
});

// 店铺更新订单状态（备货/可提货/完成/取消）
productOrdersRouter.put('/:id/status', authMiddleware, requirePermission('product:fulfill'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, cancelReason } = req.body || {};
    const validStatuses = ['pending', 'paid', 'preparing', 'ready', 'completed', 'cancelled', 'refunded'];
    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ success: false, error: '无效的订单状态' });
    }

    const { data: existing, error: findError } = await supabase.from('product_orders').select('*').eq('id', id).single();
    if (findError || !existing) {
      return res.status(404).json({ success: false, error: '订单不存在' });
    }

    // 状态机校验：防止已完成/已取消/已退款的订单被再次操作
    if (['completed', 'cancelled', 'refunded'].includes(existing.status)) {
      return res.status(400).json({ success: false, error: '订单已结束，无法变更状态' });
    }
    // 已支付订单不允许直接取消（需走退款流程），避免顾客钱款损失
    if (status === 'cancelled' && existing.status !== 'pending') {
      return res.status(400).json({ success: false, error: '仅待支付订单可直接取消' });
    }

    if (existing.shop_id !== req.employee!.shopId) return res.status(404).json({ success:false,error:'订单不存在' });
    if (status === 'refunded') return res.status(400).json({ success:false,error:'退款请使用退款审批流程' });
    if (status === 'cancelled') {
      const {data,error}=await supabase.rpc('cancel_product_order_atomic',{p_order_id:id,p_customer_id:existing.customer_id,p_shop_id:req.employee!.shopId,p_reason:cancelReason || '店铺取消'});
      if(error || !data?.[0]) return res.status(409).json({success:false,error:'取消未完成，请核对订单状态和 028 迁移'});
      return res.json({success:true,data:productOrderFromDb(data[0])});
    }
    const transitions: Record<string,string[]> = {pending:['paid'],paid:['preparing','ready','completed'],preparing:['ready','completed'],ready:['completed']};
    if (!(transitions[existing.status] || []).includes(status)) return res.status(409).json({success:false,error:'订单状态已变化或不允许此操作，请刷新订单'});
    if (status === 'paid' && existing.payment_method !== 'store_pickup') return res.status(409).json({success:false,error:'请使用付款接口完成支付'});
    if (status !== 'paid' && existing.payment_status !== 'paid') return res.status(409).json({success:false,error:'请先确认订单付款'});
    if (existing.payment_method === 'balance' && existing.payment_status !== 'paid') return res.status(409).json({success:false,error:'余额订单需先由交易接口完成付款'});
    const updatePayload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'completed') {
      updatePayload.completed_at = new Date().toISOString();
    }

    // 到店自提付款：标记为 paid 时记录付款时间
    if (status === 'paid' && existing.payment_method === 'store_pickup') {
      updatePayload.payment_status = 'paid';
      updatePayload.paid_at = new Date().toISOString();
    }

    const { data: order, error } = await supabase.from('product_orders').update(updatePayload).eq('id', id).eq('status',existing.status).eq('payment_status',existing.payment_status).select().single();
    if (error) {
      return res.status(500).json({ success: false, error: '更新订单失败' });
    }



    res.json({ success: true, data: productOrderFromDb(order) });
  } catch (error) {
    console.error('[productOrders] 更新订单状态异常:', error);
    res.status(500).json({ success: false, error: '更新订单失败' });
  }
});

// 顾客自主取消待支付订单
productOrdersRouter.put('/:id/cancel', (req,res,next) => { req.params.customerIdentityId=req.body?.customerId; personalCustomerAccess(req,res,next,'customerIdentityId'); }, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { customerId, cancelReason } = req.body || {};
    if (!customerId) {
      return res.status(400).json({ success: false, error: '缺少顾客ID' });
    }

    const { data: existing, error: findError } = await supabase.from('product_orders').select('*').eq('id', id).single();
    if (findError || !existing) {
      return res.status(404).json({ success: false, error: '订单不存在' });
    }

    if (existing.customer_id !== customerId) {
      return res.status(403).json({ success: false, error: '无权操作该订单' });
    }

    if (existing.status !== 'pending') {
      return res.status(400).json({ success: false, error: '仅待支付订单可取消' });
    }

    const { data, error } = await supabase.rpc('cancel_product_order_atomic', { p_order_id:id,p_customer_id:customerId,p_shop_id:existing.shop_id,p_reason:cancelReason || '用户取消' });
    if (error || !data?.[0]) return res.status(409).json({ success: false,error:'取消未完成，请核对订单状态和 028 迁移' });
    const order=data[0];
    res.json({ success: true, data: productOrderFromDb(order) });
  } catch (error) {
    console.error('[productOrders] 顾客取消订单异常:', error);
    res.status(500).json({ success: false, error: '取消订单失败' });
  }
});

// 店铺核销自提码
productOrdersRouter.post('/:id/verify-pickup', authMiddleware, requirePermission('product:fulfill'), ownRecord('product_orders'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { pickupCode } = req.body || {};

    const { data: order, error: findError } = await supabase.from('product_orders').select('*').eq('id', id).single();
    if (findError || !order) {
      return res.status(404).json({ success: false, error: '订单不存在' });
    }

    if (typeof pickupCode !== 'string' || !pickupCode || order.pickup_code !== pickupCode) {
      return res.status(400).json({ success: false, error: '核销码错误' });
    }

    if (order.status === 'completed') {
      return res.status(400).json({ success: false, error: '订单已完成' });
    }

    // 余额支付订单：须为 paid/ready 方可核销
    // 到店自提付款订单：pending 即可核销（顾客到店付款并提货，一次性完成）
    const canVerify =
      (['paid', 'preparing', 'ready'].includes(order.status) && order.payment_status === 'paid') ||
      (order.status === 'pending' && order.payment_method === 'store_pickup');
    if (!canVerify) {
      return res.status(400).json({ success: false, error: '订单未付款或不可核销' });
    }

    // 到店自提付款：核销时同时标记为已付款和完成
    const updatePayload: Record<string, unknown> = {
      status: 'completed',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (order.payment_method === 'store_pickup' && order.payment_status !== 'paid') {
      updatePayload.payment_status = 'paid';
      updatePayload.paid_at = new Date().toISOString();
    }

    const { data: updated, error } = await supabase.from('product_orders').update(updatePayload).eq('id', id).eq('shop_id',req.employee!.shopId).eq('status',order.status).eq('payment_status',order.payment_status).select().single();
    if (error) {
      return res.status(500).json({ success: false, error: '核销失败' });
    }

    res.json({ success: true, data: productOrderFromDb(updated) });
  } catch (error) {
    console.error('[productOrders] 核销异常:', error);
    res.status(500).json({ success: false, error: '核销失败' });
  }
});

const productOrderRefundFromDb = (r: DbRecord): Record<string, unknown> => ({
  id: r.id,
  orderId: r.order_id,
  orderNo: r.order_no || r.product_orders?.order_no,
  shopId: r.shop_id,
  customerId: r.customer_id,
  customerName: r.customer_name,
  amount: Number(r.amount) || 0,
  reason: r.reason,
  status: r.status,
  previousStatus: r.previous_status,
  rejectReason: r.reject_reason,
  handlerId: r.handler_id,
  handlerName: r.handler_name,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  handledAt: r.handled_at,
});

// 顾客申请商品订单退款
productOrdersRouter.post('/:id/refund',resourceAccess('product_orders','id'),async(req: Request,res: Response)=>{
  try {
    const reason=String(req.body?.reason || '').trim();
    if(!reason) return res.status(400).json({success:false,error:'请填写退款原因'});
    const {data,error}=await supabase.rpc('request_product_refund_atomic',{
      p_order_id:req.params.id,p_customer_id:req.customer!.id,p_shop_id:req.customer!.shopId,p_reason:reason,
    });
    if(error) return operationError(res,error,'提交退款申请失败');
    if(!data?.[0]) return res.status(503).json({success:false,error:'退款结果未确认，请刷新核对'});
    res.json({success:true,data:productOrderRefundFromDb(data[0])});
  } catch {res.status(503).json({success:false,error:'提交退款申请暂不可用'});}
});

// 店铺查看商品订单退款申请列表
productOrdersRouter.get('/refunds/shop/:shopId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const { status } = req.query;
    let query = supabase
      .from('product_order_refunds')
      .select('*, product_orders!inner(order_no)')
      .eq('shop_id', shopId);
    if (status) {
      query = query.eq('status', status);
    }
    const { data: refunds, error } = await query.order('created_at', { ascending: false });
    if (error) {
      console.error('[productOrders] 查询退款申请失败:', error.message);
      return res.status(500).json({ success: false, error: '查询退款申请失败' });
    }
    res.json({
      success: true,
      data: (refunds || []).map((r: DbRecord) => productOrderRefundFromDb(r)),
    });
  } catch (error) {
    console.error('[productOrders] 查询退款申请异常:', error);
    res.status(500).json({ success: false, error: '查询退款申请失败' });
  }
});

// 店铺处理商品订单退款申请
productOrdersRouter.put('/refunds/:id/status', authMiddleware, requirePermission('financial:read'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, rejectReason } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: '无效的处理状态' });
    }

    const employee = req.employee!;
    const { data, error } = await supabase.rpc('handle_product_refund_atomic', {
      p_refund_id: id, p_shop_id: employee.shopId, p_status: status, p_employee_id: employee.id,
      p_employee_name: employee.name, p_reason: rejectReason || '',
    });
    if (error || !data?.[0]) return res.status(error?.code === 'PGRST202' ? 503 : 409).json({ success: false, error: '退款未完成：请核对订单、同店权限和 028 迁移状态' });
    const updatedRefund=data[0];
    res.json({ success: true, data: productOrderRefundFromDb(updatedRefund) });
  } catch (error) {
    console.error('[productOrders] 处理退款异常:', error);
    res.status(500).json({ success: false, error: '处理退款申请失败' });
  }
});

/**
 * POST /api/product-orders/:id/ship
 * 店铺端发货：填写物流公司和运单号
 */
productOrdersRouter.post('/:id/ship', authMiddleware, requirePermission('product:fulfill'), async (req: Request, res: Response) => {
  try {
    const {company,no}=req.body || {};
    if(typeof company!=='string' || typeof no!=='string' || !company.trim() || !no.trim() || company.length>100 || no.length>100) return res.status(400).json({success:false,error:'请填写有效的物流公司和运单号'});
    const {data,error}=await supabase.rpc('ship_product_order_atomic',{p_order_id:req.params.id,p_shop_id:req.employee!.shopId,p_company:company.trim(),p_no:no.trim()});
    if(error || !data?.[0]) return operationError(res,error || {},'发货未完成，请刷新订单核对');
    return res.json({success:true,data:productOrderFromDb(data[0])});
  } catch {return res.status(503).json({success:false,error:'发货暂不可用'});}
});

/**
 * PUT /api/product-orders/:id/confirm
 * 顾客端确认收货
 */
productOrdersRouter.put('/:id/confirm',resourceAccess('product_orders','id'),async(req: Request,res: Response)=>{
  try {
    const {data,error}=await supabase.rpc('confirm_product_receipt_atomic',{
      p_order_id:req.params.id,p_customer_id:req.customer!.id,p_shop_id:req.customer!.shopId,
    });
    if(error) return operationError(res,error,'确认收货失败');
    if(!data?.[0]) return res.status(503).json({success:false,error:'收货结果未确认，请刷新核对'});
    res.json({success:true,data:productOrderFromDb(data[0])});
  } catch {res.status(503).json({success:false,error:'确认收货暂不可用'});}
});

/**
 * GET /api/product-orders/:id/tracking
 * 查询物流轨迹
 */
productOrdersRouter.get('/:id/tracking', resourceAccess('product_orders', 'id', true), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 查询物流轨迹
    const { data: tracking, error } = await supabase
      .from('shipment_tracking')
      .select('*')
      .eq('order_id', id)
      .order('event_time', { ascending: false });

    if (error) {
      console.error('[productOrders] 查询物流失败:', error.message);
      return res.status(500).json({ success: false, error: '查询物流失败' });
    }

    res.json({
      success: true,
      data: (tracking || []).map(t => ({
        id: t.id,
        orderId: t.order_id,
        shippingCompany: t.shipping_company,
        shippingNo: t.shipping_no,
        eventTime: t.event_time,
        eventDescription: t.event_description,
        location: t.location,
      })),
    });
  } catch (error) {
    console.error('[productOrders] 查询物流异常:', error);
    res.status(500).json({ success: false, error: '查询物流失败' });
  }
});

mainRouter.use('/product-orders', productOrdersRouter);

// ===================== settlements =====================
const settlementsRouter = Router();

const settlementFromDb = (s: Record<string, unknown>, payment?: Record<string, unknown>): Record<string, unknown> => {
  const verified = payment?.status === 'paid' && payment?.paid_at_source === 'wechat_success_time';
  const matches = !payment || (payment.customer_id === s.customer_id && Number(payment.amount) === Number(s.total));
  return {
    id:s.id, shopId:s.shop_id, customerId:s.customer_id, customerName:s.customer_name || '', bookingId:s.booking_id,
    items:s.items || [], customerPackageId:s.customer_package_id || undefined, subtotal:Number(s.subtotal) || 0,
    discountDetail:s.discount_detail || {}, discount:Number(s.discount) || 0, tax:Number(s.tax) || 0, total:Number(s.total) || 0,
    paymentMethod:s.payment_method, paymentStatus:s.payment_status, usedBenefitIds:s.used_benefit_ids || [],
    processedBy:s.processed_by, createdAt:s.created_at,
    paymentId:matches ? payment?.id : undefined, gatewayOrderNo:matches ? (payment?.gateway_order_no || payment?.id) : undefined, paymentAmount:matches && payment ? Number(payment.amount) : undefined,
    paymentCreatedAt:matches ? payment?.created_at : undefined,
    paidAt:matches && verified ? payment?.paid_at : undefined, paidAtSource:matches && verified ? 'wechat_success_time' : undefined,
    paymentRecordedAt:matches && !verified ? payment?.paid_at : undefined,
    manualPaidAt:s.manual_paid_at,
    manualPaidRecordedAt:s.manual_paid_recorded_at,
    manualPaidRecordedBy:s.manual_paid_recorded_by,
    transactionId:matches ? payment?.transaction_id : undefined, paymentRecordStatus:matches ? payment?.status : undefined,
    paymentReviewRequired:!matches || Boolean(payment?.multiple) || (payment?.status==='paid' && s.payment_status!=='completed'),
    legacyPaymentReviewRequired:s.payment_status==='pending' && s.server_priced!==true,
  };
};

const attachSettlementPayments = async (shopId:string, settlements:Record<string, unknown>[]) => {
  const ids=settlements.map(s=>String(s.id));
  const result=new Map<string,Record<string,unknown>>();
  // Bound the URL size and page every query so Supabase's default row cap cannot hide old orders.
  for(let offset=0;offset<ids.length;offset+=100) {
    for(let page=0;;page++) {
      const {data,error}=await supabase.from('payments')
        .select('id,settlement_id,customer_id,amount,status,transaction_id,paid_at,paid_at_source,created_at')
        .eq('shop_id',shopId).in('settlement_id',ids.slice(offset,offset+100))
        .order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*500,page*500+499);
      if(error) {console.error('[settlements] 支付明细查询失败 code=%s',error.code || 'UNKNOWN');throw new Error('支付明细暂无法读取，请刷新重试并检查037迁移');}
      const attempts=new Map<string,string>();
      for(let offset=0;offset<(data || []).length;offset+=100) {
        const {data:active,error:attemptError}=await supabase.from('wechat_payment_attempts').select('payment_id,gateway_order_no').eq('state','active').in('payment_id',(data || []).slice(offset,offset+100).map(p=>p.id));
        if(attemptError) throw new Error('支付尝试记录暂不可读，请检查038迁移');
        for(const a of active || []) attempts.set(a.payment_id,a.gateway_order_no);
      }
      for(const payment of (data || []) as Record<string,unknown>[]) {
        payment.gateway_order_no=attempts.get(String(payment.id)) || payment.id;
        const key=String(payment.settlement_id); const current=result.get(key);
        if(!current) result.set(key,payment);
        else {
          const score=(p:Record<string,unknown>)=>p.status==='paid' ? (p.paid_at_source==='wechat_success_time'?2:1):0;
          const selected=score(payment)>score(current) ? payment : current;
          result.set(key,{...selected,multiple:true});
        }
      }
      if((data || []).length<500) break;
    }
  }
  return result;
};

/** Shared, fully paginated settlement snapshot for financial and operational dashboards. */
async function loadCompletedSettlementRecords(shopId: string): Promise<Settlement[]> {
  const settlements: DbRecord[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await supabase.from('settlements').select('*')
      .eq('shop_id', shopId).eq('payment_status', 'completed')
      .order('id', { ascending: true }).range(page * 500, page * 500 + 499);
    if (error) throw new Error('结算数据读取失败');
    settlements.push(...(data || []));
    if ((data || []).length < 500) break;
  }
  const legacy = settlements.filter(s => !Array.isArray(s.items) || !s.items.length);
  const itemsBySettlement = new Map<string, DbRecord[]>();
  for (let offset = 0; offset < legacy.length; offset += 100) {
    for (let page = 0; ; page++) {
      const { data, error } = await supabase.from('settlement_items').select('*')
        .in('settlement_id', legacy.slice(offset, offset + 100).map(s => s.id))
        .order('id', { ascending: true }).range(page * 500, page * 500 + 499);
      if (error) throw new Error('结算项目读取失败');
      for (const item of data || []) {
        const items = itemsBySettlement.get(item.settlement_id) || [];
        items.push(item); itemsBySettlement.set(item.settlement_id, items);
      }
      if ((data || []).length < 500) break;
    }
  }
  const payments = await attachSettlementPayments(shopId, settlements);
  return settlements.map(s => {
    const dto = settlementFromDb(s, payments.get(String(s.id)));
    dto.items = (Array.isArray(s.items) && s.items.length ? s.items : itemsBySettlement.get(String(s.id)) || []).map((i: DbRecord) => ({
      ...i, id: i.id, type: i.type || 'service', name: i.name || i.service_name || '服务',
      employeeId: i.employeeId || i.employee_id, employeeName: i.employeeName || i.employee_name,
      quantity: Number(i.quantity ?? 1), total: Number(i.total ?? 0),
    }));
    return dto as unknown as Settlement;
  });
}

/**
 * 结算支付成功后的核心后续操作：更新客户消费统计、核销权益、创建到店记录。
 * 微信/支付宝等异步支付在确认收款后调用；现金/余额支付在创建结算时直接调用。
 */
async function processSettlementAfterPayment(params: {
  shopId: string;
  customerId: string;
  settlementId: string;
  bookingId: string | null;
  total: number;
  paymentMethod: string;
  usedBenefitIds: string[];
  processedByEmployee: AuthEmployee;
  manualPaidAt?: string | null;
  logStep?: (step: string) => void;
}): Promise<void> {
  const {
    shopId,
    customerId,
    settlementId,
    bookingId,
    total,
    paymentMethod,
    usedBenefitIds,
    processedByEmployee,
    manualPaidAt,
    logStep,
  } = params;

  const { data: latest, error: lookupError } = await supabase.from('settlements').select('customer_package_id').eq('id', settlementId).eq('shop_id', shopId).single();
  if (lookupError) throw new Error('请先执行 027 交易原子性迁移');
  const { error } = await supabase.rpc('finalize_settlement_with_manual_time_atomic', {
    p_settlement_id: settlementId, p_shop_id: shopId,
    p_employee_id: processedByEmployee.id, p_employee_name: processedByEmployee.name,
    p_booking_id: bookingId, p_package_id: latest?.customer_package_id || null, p_package_note: '结算核销',
    p_manual_paid_at: manualPaidAt || null,
  });
  if (error) throw new Error(error.code === 'PGRST202' ? '请先执行 027 交易原子性迁移' : '交易未完成：余额、次卡或权益状态已变化，请核对');
  if (logStep) logStep('数据库原子提交完成');

  if(logStep) logStep('结算及权益已原子提交');
}

// 创建结算记录
settlementsRouter.post('/', authMiddleware, (req, res, next) => {
  if (Array.isArray(req.body?.items) && req.body.items.some((item: Record<string, unknown>) => item?.priceOverride !== undefined)) return requirePermission('settlement:override')(req, res, next);
  next();
}, async (req: Request, res: Response) => {
  const startTime = Date.now();
  const logStep = (step: string) => console.log(`[settlements] ${step}: +${Date.now() - startTime}ms`);

  try {
    const shopId = req.employee!.shopId;
    const employee = req.employee!;
    const {
      id,
      customerId,
      customerName,
      bookingId,
      items,
      subtotal,
      discountDetail,
      discount,
      tax,
      total,
      paymentMethod,
      usedBenefitIds,
      paymentStatus,
    } = req.body || {};

    if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: '缺少必要字段' });
    }

    const method = paymentMethod || 'cash';
    if (!['cash','balance','card','wechat','alipay'].includes(method)) return res.status(400).json({ success: false, error: '不支持的支付方式' });
    if (method === 'alipay') return res.status(400).json({ success: false, error: '支付宝网关尚未接入，请使用其他支付方式' });
    let manualPaidAt: string | undefined;
    if (method === 'cash' || method === 'card') {
      if (req.body?.manualPaidAt !== undefined) {
        const raw = req.body.manualPaidAt;
        const hasZone = typeof raw === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/i.test(raw);
        const parsed = hasZone ? new Date(raw) : new Date(NaN);
        if (!Number.isFinite(parsed.getTime()) || parsed.getTime() > Date.now() + 5 * 60_000) {
          return res.status(400).json({ success:false,error:'登记的付款发生时间无效或晚于当前时间' });
        }
        manualPaidAt = parsed.toISOString();
      }
    } else if (req.body?.manualPaidAt !== undefined) {
      return res.status(400).json({ success:false,error:'只有现金或银行卡收款可以登记付款发生时间' });
    }
    const settlementId = id || 'settle_' + randomUUID();
    const requestKey = createHash('sha256').update(canonicalJson(req.body)).digest('hex');
    if (id) {
      const { data: existing, error: existingError } = await supabase.from('settlements').select('*').eq('id', id).eq('shop_id', shopId).maybeSingle();
      if (existingError) return res.status(503).json({ success: false, error: '结算状态暂不可用，请稍后使用原单号重试' });
      if (existing?.payment_status === 'completed') {
        if (existing.customer_id !== customerId || existing.checkout_request_key !== requestKey) return res.status(409).json({ success: false, error: '此结算单已完成，请勿更改后重复收款' });
        return res.json({ success: true, data: settlementFromDb(existing) });
      }
      // A response may have been lost after the atomic mapping committed. Resume
      // the exact original request before consulting today's catalogue/discounts.
      if (existing?.checkout_payment_started && existing.payment_method === 'wechat') {
        if (existing.customer_id !== customerId || existing.checkout_request_key !== requestKey) {
          return res.status(409).json({ success:false,error:'原单已发起支付，请恢复原支付，不能修改后重新收款' });
        }
        const payment = await recoverWechatPayment(id,shopId,employee.id,employee.name);
        if (payment.status === 'paid') {
          const {data:completed,error:readError}=await supabase.from('settlements').select('*').eq('id',id).eq('shop_id',shopId).single();
          if(readError || !completed || completed.payment_status !== 'completed') return res.status(503).json({success:false,error:'微信已收款，原单暂不可读取，请刷新核对，勿重新收款'});
          return res.json({success:true,data:settlementFromDb(completed)});
        }
        return res.json({success:true,data:{settlement:settlementFromDb(existing),payment}});
      }
    }
    const priced = await priceSettlement(shopId, req.body);
    const amount = priced.total;
    const isAsyncPayment = (method === 'wechat' || method === 'alipay') && amount > 0;
    const isDraft = paymentStatus === 'pending';
    // 本入口仅接受已认证的本店员工：门店收银不以顾客核实/改密状态为前提。
    // 顾客自助资产支付的身份限制保留在独立顾客支付入口中。
    const atomicWechat = !isDraft && isAsyncPayment;
    const { data: created, error: insertError } = await supabase.rpc(atomicWechat ? 'create_wechat_settlement_atomic' : 'create_settlement_with_manual_time_atomic', {
      p_settlement: { id: settlementId, checkout_request_key: requestKey, start_payment: !isDraft && isAsyncPayment, shop_id: shopId, customer_id: customerId, customer_name: priced.customerName,
        booking_id: bookingId || null, ...priced, items: priced.items, discount_detail: priced.discountDetail,
        payment_method: method, payment_status: 'pending', used_benefit_ids: usedBenefitIds || [], processed_by: employee.name,
        customer_package_id: req.body.customerPackageId || null, manual_paid_at: manualPaidAt || null },
      p_employee_id: employee.id, p_employee_name: employee.name,
      ...(atomicWechat ? {p_payment_id:randomUUID().replace(/-/g,'')} : {p_complete:!isDraft && !isAsyncPayment,p_manual_paid_at:manualPaidAt || null}),
    });
    if (insertError) {
      const reason = String(insertError.message || '');
      const message = reason.includes('PAYMENT_ORDER_EXISTS') || reason.includes('BOOKING_PAYMENT_IN_PROGRESS') ? '此预约已有支付订单，请从待支付列表确认原订单，勿重复收款'
        : reason.includes('BOOKING_ALREADY_SETTLED') ? '此预约已结算，请刷新预约列表'
        : reason.includes('BOOKING_CANCELLED') ? '此预约已取消，不能结算'
        : reason.includes('OWNER_MISMATCH') ? '预约、顾客或门店不匹配，请重新打开正确订单'
        : insertError.code === 'PGRST202' ? '结算函数不可用，请先核对039、040数据库迁移'
        : '结算未完成：余额、次卡或权益状态已变化；原草稿已保留';
      console.error('[settlements] 原子提交失败', insertError.code || 'UNKNOWN');
      return res.status(insertError.code === 'PGRST202' ? 503 : 409).json({ success: false, error: message });
    }
    const settlement = atomicWechat ? created?.settlement : created?.[0];
    if (!settlement) return res.status(503).json({ success: false, error: '结算结果暂不可用' });
    logStep('结算记录创建成功');

    // 草稿/待结算：不生成支付、不执行业务闭环，直接返回
    if (isDraft) {
      return res.status(201).json({ success: true, data: settlementFromDb(settlement) });
    }

    // 微信支付：金额大于 0 时创建 payment 记录并返回支付参数；金额为 0（纯核销）直接走后续完成
    if (isAsyncPayment) {
      // 040 has already committed both the settlement and its only mapping.
      // A gateway timeout retains that mapping for reconciliation/retry.
      const paymentResult = await recoverWechatPayment(settlementId,shopId,employee.id,employee.name,created.paymentCreated === true);
      if (paymentResult.status === 'paid') {
        const {data:completed,error:readError}=await supabase.from('settlements').select('*').eq('id',settlementId).eq('shop_id',shopId).single();
        if(readError || !completed || completed.payment_status !== 'completed') return res.status(503).json({success:false,error:'微信已收款，原单暂不可读取，请刷新核对，勿重新收款'});
        return res.json({success:true,data:settlementFromDb(completed)});
      }
      logStep('微信支付参数已生成');
      return res.status(201).json({
        success: true,
        data: {
          settlement: settlementFromDb(settlement),
          payment: paymentResult,
        },
      });
    }

    // 核心业务已在 create_settlement_atomic 同事务完成。
    res.status(201).json({ success: true, data: settlementFromDb(settlement) });
  } catch (error) {
    console.error('[settlements] 创建结算异常:', error);
    const message = error instanceof Error ? error.message : String(error);
    res.status(400).json({ success: false, error: `创建结算失败: ${message}` });
  }
});

// 微信收款仅信任已验签的网关凭据；现金/银行卡由授权员工登记。
settlementsRouter.post('/:id/confirm-payment', authMiddleware, async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;
    const employee = req.employee!;
    const { id } = req.params;

    const { data: settlement, error: findError } = await supabase
      .from('settlements')
      .select('*')
      .eq('id', id)
      .eq('shop_id', shopId)
      .single();

    if (findError || !settlement) {
      return res.status(404).json({ success: false, error: '结算记录不存在' });
    }

    if (Number(settlement.total)>0 && settlement.payment_method==='wechat') {
      const {data:payment,error:paymentError}=await supabase.from('payments').select('*').eq('settlement_id',id).eq('shop_id',shopId).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(paymentError) return res.status(503).json({success:false,error:'支付记录暂不可查询，请勿重新收款'});
      if(!payment || payment.customer_id!==settlement.customer_id || Number(payment.amount)!==Number(settlement.total)) {
        return res.status(409).json({success:false,error:'支付映射或金额不匹配，请核对原单，勿重新收款'});
      }
      const hasVerifiedReceipt=settlement.payment_status==='completed' && payment.status==='paid' && payment.paid_at_source==='wechat_success_time';
      if(hasVerifiedReceipt && req.body?.recheckWechat !== true) {
        return res.json({success:true,data:settlementFromDb(settlement,payment)});
      }
      const gatewayOrderNo=await activeWechatOrder(String(payment.id));
      const gateway=await recoveryDependencies.query(gatewayOrderNo);
      if(gateway.status!=='paid' || gateway.amount!==Number(settlement.total) || !gateway.transactionId || !gateway.paidAt) {
        return res.status(409).json({success:false,error:'微信尚未返回可核对的成功订单及支付时间：'+(gateway.message || '请稍后重试')});
      }
      // 已有可信凭据只复核，不重复登记；不一致时保留原记录并要求人工核对。
      if(hasVerifiedReceipt) {
        if(payment.transaction_id!==gateway.transactionId || Date.parse(payment.paid_at)!==Date.parse(gateway.paidAt)) {
          return res.status(409).json({success:false,error:'微信返回的交易号或支付时间与已登记凭据不一致，请核对原单；原记录已保留'});
        }
        return res.json({success:true,data:settlementFromDb(settlement,payment)});
      }
      const completed=await recordWechatReceipt({paymentId:gatewayOrderNo,amount:gateway.amount,transactionId:gateway.transactionId,paidAt:gateway.paidAt},shopId,employee.id,employee.name);
      return res.json({success:true,data:settlementFromDb(completed,{...payment,status:'paid',paid_at:gateway.paidAt,paid_at_source:'wechat_success_time',transaction_id:gateway.transactionId})});
    }
    if(settlement.payment_method==='alipay' && Number(settlement.total)>0) return res.status(409).json({success:false,error:'支付宝网关尚未接入，不能手动标记为已付款'});
    if(settlement.payment_status==='completed') return res.json({success:true,data:settlementFromDb(settlement)});
    if(settlement.payment_status!=='pending') return res.status(400).json({success:false,error:'该结算记录不在待支付状态'});
    if (req.body?.manualPaidAt !== undefined && settlement.payment_method !== 'cash' && settlement.payment_method !== 'card') {
      return res.status(400).json({success:false,error:'只有现金或银行卡收款可以登记付款发生时间'});
    }
    const manualPaidAt = settlement.payment_method === 'cash' || settlement.payment_method === 'card' ? req.body?.manualPaidAt : undefined;
    if (manualPaidAt !== undefined) {
      const hasZone = typeof manualPaidAt === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/i.test(manualPaidAt);
      const parsed = hasZone ? new Date(manualPaidAt) : new Date(NaN);
      if (!Number.isFinite(parsed.getTime()) || parsed.getTime() > Date.now() + 5 * 60_000) return res.status(400).json({success:false,error:'登记的付款发生时间无效或晚于当前时间'});
    }
    await processSettlementAfterPayment({shopId,customerId:settlement.customer_id as string,settlementId:id,
      bookingId:(settlement.booking_id as string)||null,total:Number(settlement.total)||0,paymentMethod:String(settlement.payment_method),
      usedBenefitIds:(settlement.used_benefit_ids as string[])||[],processedByEmployee:employee,manualPaidAt:manualPaidAt || null});
    const {data:completed,error:completedError}=await supabase.from('settlements').select('*').eq('id',id).eq('shop_id',shopId).single();
    if(completedError || !completed) return res.status(503).json({success:false,error:'已提交收款但暂时无法读取结算结果，请刷新并核对原单'});
    return res.json({success:true,data:settlementFromDb(completed)});
  } catch (error) {
    console.error('[settlements] 确认收款异常:', error);
    res.status(500).json({ success: false, error: '确认收款失败' });
  }
});

// 重新生成支付二维码（顾客未扫码/二维码过期时继续使用）
settlementsRouter.post('/:id/retry-payment', authMiddleware, async (req:Request,res:Response) => {
  try {
    const e=req.employee!;
    const result=await recoverWechatPayment(req.params.id,e.shopId,e.id,e.name);
    res.json({success:true,data:result});
  } catch(error) {
    res.status(409).json({success:false,error:error instanceof Error?error.message:'原支付核对未完成，请稍后重试'});
  }
});

// 删除待支付/失败的结算记录
settlementsRouter.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;
    const { id } = req.params;

    const { data: settlement, error: findError } = await supabase
      .from('settlements')
      .select('payment_status')
      .eq('id', id)
      .eq('shop_id', shopId)
      .single();

    if (findError || !settlement) {
      return res.status(404).json({ success: false, error: '结算记录不存在' });
    }

    if (!['pending', 'failed'].includes(settlement.payment_status as string)) {
      return res.status(400).json({ success: false, error: '仅允许删除待支付或支付失败的结算记录' });
    }

    const { error: deleteError } = await supabase.rpc('delete_settlement_draft_atomic', { p_settlement_id: id, p_shop_id: shopId });
    if (deleteError) {
      // 不输出数据库 detail/客户行，仅记录数据库错误代码用于内部定位。
      console.error('[settlements] 删除草稿 RPC 失败 code=%s', deleteError.code || 'UNKNOWN');
      const message = String(deleteError.message || '');
      const reason = deleteError.code === 'PGRST202'
        ? { status: 503, code: 'DRAFT_RPC_MISSING', error: '草稿删除功能未就绪，请联系管理员检查交易迁移与结构缓存' }
        : message.includes('PAYMENT_ORDER_EXISTS')
        ? { status: 409, code: 'DRAFT_HAS_PAYMENT', error: '原结算已生成支付订单，不能删除后重新开单；请先核对该订单的收款状态' }
        : message.includes('NOT_A_DELETABLE_DRAFT')
        ? { status: 409, code: 'DRAFT_STATE_CHANGED', error: '原结算状态已变化，请刷新未完成结算列表后核对，勿重复结算' }
        : deleteError.code === '42501'
        ? { status: 503, code: 'DRAFT_PERMISSION_DENIED', error: '后端没有草稿删除权限，请联系管理员检查数据库授权' }
        : deleteError.code === '23503'
        ? { status: 409, code: 'DRAFT_HAS_REFERENCES', error: '原结算仍有关联记录，不能删除；请联系管理员核对关联单据' }
        : { status: 409, code: 'DRAFT_DELETE_FAILED', error: '草稿删除失败，尚未创建新结算；请联系管理员查看函数日志' };
      return res.status(reason.status).json({ success: false, code: reason.code, error: reason.error });
    }
    res.json({ success: true, data: { id } });
  } catch (error) {
    console.error('[settlements] 删除结算记录异常:', error);
    res.status(500).json({ success: false, error: '删除结算记录失败' });
  }
});

// 查询结算支付状态
settlementsRouter.post('/:id/release-unstarted-payment', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase.rpc('release_stale_settlement_payment_claim', {
      p_settlement_id: req.params.id, p_shop_id: req.employee!.shopId,
    });
    if (error) {
      const exists = String(error.message || '').includes('PAYMENT_RECORD_EXISTS');
      const statusChanged = String(error.message || '').includes('SETTLEMENT_NOT_RECOVERABLE');
      return res.status(exists || statusChanged ? 409 : 503).json({ success: false,
        error: exists ? '原单存在支付记录，必须先核对，不能重新生成二维码'
          : statusChanged ? '原单状态已变化，请刷新列表后核对' : '历史支付认领恢复功能未就绪，请检查 032 数据库迁移' });
    }
    return res.json({ success: true, data: { released: data === true } });
  } catch {
    return res.status(503).json({ success: false, error: '历史支付认领恢复失败，请勿重新开单收款' });
  }
});

settlementsRouter.get('/:id/payment-status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;
    const { id } = req.params;

    const { data: settlement, error } = await supabase
      .from('settlements')
      .select('*')
      .eq('id', id)
      .eq('shop_id', shopId)
      .single();

    if (error || !settlement) {
      return res.status(404).json({ success: false, error: '结算记录不存在' });
    }

    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .select('id, status, transaction_id, prepay_id, paid_at, code_url, amount')
      .eq('settlement_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentError) return res.status(503).json({ success: false, error: '原支付记录暂无法查询，尚不能判断是否可继续结算，请稍后重试' });
    // Stored URLs may be expired or of unknown age. Recover through the gateway before display.
    const recoveryState = settlement.payment_status === 'completed' ? 'completed'
      : settlement.server_priced !== true ? 'legacy_review'
      : payment ? 'payment_needs_review'
      : settlement.checkout_payment_started ? 'initialization_started' : 'editable';
    res.json({success:true,data:{
      settlementStatus:settlement.payment_status,recoveryState,settlement:settlementFromDb(settlement),
      payment:payment?{paymentId:payment.id,status:payment.status,amount:Number(payment.amount)}:null,
    }});

  } catch (error) {
    console.error('[settlements] 查询支付状态异常:', error);
    res.status(500).json({ success: false, error: '查询支付状态失败' });
  }
});

// 获取店铺结算列表
settlementsRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;
    const rows:Record<string,unknown>[]=[];
    for(let page=0;;page++) {
      let query=supabase.from('settlements').select('*').eq('shop_id',shopId);
      if(req.query.pending==='1') query=query.eq('payment_status','pending');
      const {data,error}=await query.order('created_at',{ascending:false}).order('id',{ascending:false}).range(page*500,page*500+499);
      if(error) return res.status(503).json({success:false,error:'结算列表暂不可读取，请刷新重试'});
      rows.push(...(data || []));
      if((data || []).length<500) break;
    }
    const payments=await attachSettlementPayments(shopId,rows);
    const result=rows.map(s=>settlementFromDb(s,payments.get(String(s.id))));
    result.sort((a,b)=>compareSettlements(a as unknown as Settlement,b as unknown as Settlement));
    res.json({success:true,data:result});
  } catch (error) {
    console.error('[settlements] 获取结算列表异常:', error);
    res.status(500).json({ success: false, error: '获取结算列表失败' });
  }
});

// 获取单条结算详情（用于继续未完成的结算）
settlementsRouter.get('/:id', authMiddleware, async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .eq('id', id)
      .eq('shop_id', shopId)
      .single();

    if (error || !data) {
      return res.status(404).json({ success: false, error: '结算记录不存在' });
    }

    const paymentBySettlement = await attachSettlementPayments(shopId, [data as Record<string, unknown>]);
    res.json({ success: true, data: settlementFromDb(data, paymentBySettlement.get(String(data.id))) });
  } catch (error) {
    console.error('[settlements] 获取结算详情异常:', error);
    res.status(500).json({ success: false, error: '获取结算详情失败' });
  }
});

mainRouter.use('/settlements', settlementsRouter);

// Read scoped rows without the REST default row cap; never return a partial dashboard.
async function loadDashboardRows(table: string, columns: string, shopId: string): Promise<DbRecord[]> {
  const rows: DbRecord[] = [];
  for (let page = 0; ; page++) {
    const {data,error} = await supabase.from(table).select(columns).eq('shop_id', shopId)
      .order('id', {ascending:true}).range(page * 500, page * 500 + 499);
    if (error) throw new Error('经营数据读取失败');
    rows.push(...(data || []));
    if ((data || []).length < 500) return rows;
  }
}
async function loadDashboardReviews(shopId: string) {
  const rows = await loadDashboardRows('reviews', 'id,stylist_id,overall_score,rating', shopId);
  return rows.filter(r => (r.overall_score != null || r.rating != null) && Number.isFinite(Number(r.overall_score ?? r.rating)))
    .map(r => ({stylistId:r.stylist_id as string,score:Number(r.overall_score ?? r.rating)}));
}

// ===================== financial =====================
const financialRouter = Router();

financialRouter.use(authMiddleware, requirePermission('financial:read'));

financialRouter.get('/report', async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;
    const records = await loadCompletedSettlementRecords(shopId);
    const report=buildFinancialReport(records);
    const ratings=new Map<string,{sum:number;count:number}>();
    for (let page=0;;page++) {
      const {data,error}=await supabase.from('reviews').select('id,stylist_id,overall_score,rating')
        .eq('shop_id',shopId).order('id',{ascending:true}).range(page*500,page*500+499);
      if(error) throw new Error('评价数据读取失败');
      for(const r of data || []) {
        if(r.overall_score == null && r.rating == null) continue;
        const score=Number(r.overall_score ?? r.rating);
        if(!Number.isFinite(score)) continue;
        const rating=ratings.get(r.stylist_id) || {sum:0,count:0};
        rating.sum+=score;rating.count++;ratings.set(r.stylist_id,rating);
      }
      if((data || []).length<500) break;
    }
    report.topStylists.forEach(s=>{
      const r=ratings.get(s.id);
      if(r?.count) s.rating=Math.round(r.sum/r.count*10)/10;
    });
    res.json({success:true,data:report});
  } catch {
    res.status(503).json({success:false,error:'财务报表数据读取不完整，请重试；持续失败请检查037迁移与数据库连接'});
  }
});

mainRouter.use('/financial', financialRouter);

// ===================== stylists =====================
const stylistsRouter = Router();

stylistsRouter.get('/performance', authMiddleware, async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;
    const [employees, records, reviews] = await Promise.all([
      loadDashboardRows('employees', 'id,name,title,role,is_active', shopId),
      loadCompletedSettlementRecords(shopId), loadDashboardReviews(shopId),
    ]);
    const eligible = employees.filter(emp => ['stylist', 'STYLIST'].includes(emp.role) && emp.is_active === true &&
      (req.employee!.role !== 'stylist' || emp.id === req.employee!.id));
    // 只返回汇总，禁止向发型师返回全店原始交易。
    res.json({ success: true, data: buildStylistPerformances(records, eligible.map(e => ({ id:e.id, name:e.name, title:e.title })), reviews) });
  } catch {
    res.status(503).json({ success: false, error: '发型师业绩数据读取不完整，请重试并检查支付迁移与数据库连接' });
  }
});

mainRouter.use('/stylists', stylistsRouter);

// ===================== member_benefits =====================
const memberBenefitsRouter = Router();

const benefitFromDb = (b: Record<string, unknown>): Record<string, unknown> => ({
  id: b.id,
  customerId: b.customer_id,
  shopId: b.shop_id,
  type: b.type,
  name: b.name,
  description: b.description || '',
  status: b.status,
  grantedAt: b.granted_at,
  grantedBy: b.granted_by,
  usedAt: b.used_at,
  usedBy: b.used_by,
  usedOrderId: b.used_order_id,
  expiresAt: b.expires_at,
});

// 获取客户可用权益
memberBenefitsRouter.get('/customer/:customerId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;
    const { customerId } = req.params;

    const { data, error } = await supabase
      .from('member_benefit_records')
      .select('*')
      .eq('shop_id', shopId)
      .eq('customer_id', customerId)
      .eq('status', 'available')
      .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
      .order('granted_at', { ascending: false });

    if (error) {
      console.error('[member_benefits] 查询权益失败:', error.message);
      return res.status(500).json({ success: false, error: '查询权益失败' });
    }

    res.json({ success: true, data: (data || []).map(benefitFromDb) });
  } catch (error) {
    console.error('[member_benefits] 获取权益异常:', error);
    res.status(500).json({ success: false, error: '获取权益失败' });
  }
});

mainRouter.use('/member-benefits', memberBenefitsRouter);

// ===================== referrals =====================
const referralsRouter = Router();

const referralFromDb = (r: Record<string, unknown>): unknown => ({
  id: r.id,
  referrerId: r.referrer_id,
  referrerName: r.referrer_name,
  referredId: r.referred_id,
  referredName: r.referred_name,
  referredPhone: r.referred_phone,
  bonusAmount: Number(r.bonus_amount) || 0,
  status: r.status,
  createdAt: r.created_at,
  confirmedAt: r.confirmed_at,
});

// 判断顾客是否为会员（不限会员级别，储值/购买/VIP/股东均可）
function isCustomerMember(c: Record<string, unknown>): boolean {
  return Boolean(
    c.is_stockholder ||
      (c.membership_level && c.membership_level !== 'regular') ||
      (c.purchase_vip_level && c.purchase_vip_level !== 'regular') ||
      (c.stored_value_level && c.stored_value_level !== 'none')
  );
}

// 确保店铺存在默认邀请优惠券（新人扫码领取）
async function ensureDefaultReferralCoupon(shopId: string): Promise<Record<string, unknown> | null> {
  try {
    const { data: existing } = await supabase
      .from('coupons')
      .select('*')
      .eq('shop_id', shopId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1);

    if (existing && existing.length > 0) return existing[0];

    const now = new Date();
    const coupon = {
      id: `coupon_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      shop_id: shopId,
      name: '新人体验券',
      type: 'fixed_amount',
      value: 20,
      min_order_amount: 100,
      max_discount_amount: 20,
      applicable_scope: 'all',
      applicable_product_ids: [],
      total_quantity: -1,
      remaining_quantity: -1,
      per_customer_limit: 1,
      start_at: now.toISOString(),
      end_at: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      is_active: true,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    const { data, error } = await supabase.from('coupons').insert(coupon).select().single();
    if (error) {
      console.error('[referrals] 创建默认优惠券失败:', error.message);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[referrals] ensureDefaultReferralCoupon 异常:', (err as Error).message);
    return null;
  }
}

// 获取店铺推荐记录（员工后台）
referralsRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;
    const { data, error } = await supabase
      .from('referral_records')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[referrals] 查询推荐记录失败:',error.code || 'UNKNOWN');
      return res.status(503).json({success:false,error:'推荐记录加载失败，请稍后重试'});
    }

    res.json({ success: true, data: (data || []).map(referralFromDb) });
  } catch (error) {
    console.error('[referrals] 获取推荐记录异常:', error);
    res.status(503).json({ success: false, error:'推荐记录加载失败，请稍后重试' });
  }
});

// 顾客生成邀请二维码（小程序端）
referralsRouter.post('/invite', customerSession, async (req: Request, res: Response) => {
  try {
    const { shopId = 'shop1', customerId } = req.body || {};
    if (!customerId) {
      return res.status(400).json({ success: false, error: '缺少 customerId' });
    }

    // 验证顾客身份及会员资格
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .select('id, name, phone, membership_level, purchase_vip_level, stored_value_level, is_stockholder')
      .eq('id', customerId)
      .eq('shop_id', shopId)
      .single();

    if (customerError || !customer) {
      return res.status(404).json({ success: false, error: '顾客不存在' });
    }

    if (!isCustomerMember(customer)) {
      return res.status(403).json({ success: false, error: '只有会员才能生成邀请码' });
    }

    // 确保存在默认新人优惠券
    const coupon = await ensureDefaultReferralCoupon(shopId);
    const couponId = coupon ? coupon.id : null;

    // 创建推荐记录
    const referralId = `ref_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const baseUrl = process.env.H5_BASE_URL || `https://www.hsxx8888.cn`;
    const inviteUrl = `${baseUrl}/invite?ref=${referralId}`;

    const { error: insertError } = await supabase.from('referral_records').insert({
      id: referralId,
      shop_id: shopId,
      referrer_id: customerId,
      referrer_name: customer.name || '会员',
      status: 'pending',
      coupon_id: couponId,
      created_at: new Date().toISOString(),
    });

    if (insertError) {
      console.error('[referrals] 创建推荐记录失败:', insertError.message);
      return res.status(500).json({ success: false, error: `创建邀请记录失败: ${insertError.message}` });
    }

    // 生成二维码图片（Data URL）
    const qrCodeDataUrl = await QRCode.toDataURL(inviteUrl, {
      width: 280,
      margin: 2,
      color: { dark: '#1a1a2e', light: '#ffffff' },
    });

    res.json({
      success: true,
      data: {
        referralId,
        inviteUrl,
        qrCodeDataUrl,
        referrerName: customer.name || '会员',
      },
    });
  } catch (error) {
    console.error('[referrals] 生成邀请二维码异常:', error);
    res.status(500).json({ success: false, error: `生成邀请二维码失败: ${(error as Error).message}` });
  }
});

// 查询邀请码信息（公开，H5/小程序扫码落地页）
referralsRouter.get('/check-code', async (req: Request, res: Response) => {
  try {
    const { ref } = req.query;
    if (!ref || typeof ref !== 'string') {
      return res.status(400).json({ success: false, error: '缺少邀请码' });
    }

    const { data: record, error } = await supabase
      .from('referral_records')
      .select('id, referrer_id, referrer_name, coupon_id, status, referred_id, shop_id')
      .eq('id', ref)
      .single();

    if (error || !record) {
      return res.status(404).json({ success: false, error: '邀请码无效或已过期' });
    }

    if (record.status === 'confirmed') {
      return res.status(400).json({ success: false, error: '该邀请已完成' });
    }

    let couponInfo = null;
    if (record.coupon_id) {
      const { data: coupon } = await supabase
        .from('coupons')
        .select('id, name, type, value, min_order_amount, start_at, end_at')
        .eq('id', record.coupon_id)
        .single();
      couponInfo = coupon;
    }

    // 邀请新人券统一显示领取后 30 天内有效
    const validDays = 30;

    res.json({
      success: true,
      data: {
        referralId: record.id,
        referrerName: record.referrer_name || '会员',
        shopId: record.shop_id,
        coupon: couponInfo
          ? {
              id: couponInfo.id,
              name: couponInfo.name,
              type: couponInfo.type,
              value: Number(couponInfo.value) || 0,
              minOrderAmount: Number(couponInfo.min_order_amount) || 0,
              validDays,
            }
          : null,
        alreadyClaimed: !!record.referred_id,
      },
    });
  } catch (error) {
    console.error('[referrals] 查询邀请码异常:', error);
    res.status(500).json({ success: false, error: '查询邀请码失败' });
  }
});

// 扫码领取优惠券并绑定推荐关系（公开）
referralsRouter.post('/claim',customerSession,async(req: Request,res: Response)=>{
  try {
    const ref=String(req.body?.ref || '');
    const {data:record,error:recordError}=await supabase.from('referral_records').select('id,shop_id,coupon_id').eq('id',ref).eq('shop_id',req.customer!.shopId).maybeSingle();
    if(recordError) return res.status(503).json({success:false,error:'邀请信息暂不可用'});
    if(!record) return res.status(404).json({success:false,error:'邀请码无效或不属于本店'});
    const {data:customer,error:customerError}=await supabase.from('customers').select('id,phone').eq('id',req.customer!.id).eq('shop_id',req.customer!.shopId).maybeSingle();
    if(customerError) return res.status(503).json({success:false,error:'顾客信息暂不可用'});
    if(!customer || (req.body?.phone && String(req.body.phone).trim()!==customer.phone)) return res.status(403).json({success:false,error:'请使用本人登录手机号领取'});
    const coupon=record.coupon_id ? {id:record.coupon_id} : await ensureDefaultReferralCoupon(req.customer!.shopId);
    if(!coupon) return res.status(503).json({success:false,error:'优惠券配置暂不可用'});
    const {data,error}=await supabase.rpc('claim_coupon_atomic',{
      p_coupon_id:coupon.id,p_customer_id:req.customer!.id,p_shop_id:req.customer!.shopId,p_referral_id:ref,
    });
    if(error) return operationError(res,error,'领取邀请券失败');
    const row=data?.[0];
    if(!row) return res.status(409).json({success:false,error:'邀请已领取，请在我的优惠券中核对'});
    res.json({success:true,data:{customerId:row.customer_id,couponId:row.id,couponName:row.coupon_name,type:row.type,value:Number(row.value),minOrderAmount:Number(row.min_order_amount || 0),validEnd:row.valid_end}});
  } catch {res.status(503).json({success:false,error:'领取邀请券暂不可用'});}
});

mainRouter.use('/referrals', referralsRouter);

// ===================== VIP 权益自定义配置 =====================
const vipConfigsRouter = Router();

// 转换数据库记录为前端 PurchaseVIPPlan
const purchasePlanFromDb = (r: DbRecord): PurchaseVIPPlan => {
  const value = (r.config_value as Record<string, unknown>) || {};
  return {
    level: value.level as PurchaseVIPLevel,
    name: String(value.name || ''),
    price: Number(value.price) || 0,
    period: String(value.period || '1年'),
    discount: Number(value.discount) ?? 1,
    pointsRate: Number(value.pointsRate) ?? 1,
    benefits: Array.isArray(value.benefits) ? (value.benefits as string[]) : [],
    color: String(value.color || 'gray'),
  };
};

// 转换数据库记录为前端 StoredValuePlan
const storedPlanFromDb = (r: DbRecord): StoredValuePlan => {
  const value = (r.config_value as Record<string, unknown>) || {};
  return {
    level: value.level as StoredValueLevel,
    name: String(value.name || ''),
    amount: Number(value.amount) || 0,
    discount: Number(value.discount) ?? 1,
    pointsRate: Number(value.pointsRate) ?? 1,
    benefits: Array.isArray(value.benefits) ? (value.benefits as string[]) : [],
    color: String(value.color || 'gray'),
  };
};

// 转换数据库记录为前端 SpecialVIPConfig
const specialConfigFromDb = (r: DbRecord): SpecialVIPConfig => {
  const value = (r.config_value as Record<string, unknown>) || {};
  return {
    key: String(r.config_key || value.key || ''),
    name: String(value.name || ''),
    description: value.description !== undefined ? String(value.description) : undefined,
    discount: value.discount !== undefined ? Number(value.discount) : undefined,
    pointsRate: value.pointsRate !== undefined ? Number(value.pointsRate) : undefined,
    benefits: Array.isArray(value.benefits) ? (value.benefits as string[]) : undefined,
    color: value.color !== undefined ? String(value.color) : undefined,
    createdAt: r.created_at ? new Date(r.created_at as string) : undefined,
    updatedAt: r.updated_at ? new Date(r.updated_at as string) : undefined,
  };
};

vipConfigsRouter.use(authMiddleware, shopContext);
vipConfigsRouter.use((req,res,next) => {
  if (req.method === 'GET') { next(); return; }
  requirePermission('vip:edit')(req,res,next);
});

// GET /vip-configs/purchase?shopId=xxx
vipConfigsRouter.get('/purchase', async (req: Request, res: Response) => {
  try {
    const shopId = req.query.shopId as string;
    if (!shopId) return res.status(400).json({ success: false, error: '缺少 shopId' });
    const { data, error } = await supabase
      .from('shop_vip_configs')
      .select('*')
      .eq('shop_id', shopId)
      .eq('config_type', 'purchase');
    if (error) {
      console.error('[vip-configs] 查询购买型 VIP 配置失败:', error.message);
      return res.status(500).json({ success: false, error: '查询配置失败' });
    }
    res.json({ success: true, data: (data || []).map(purchasePlanFromDb) });
  } catch (err) {
    console.error('[vip-configs] 查询购买型 VIP 配置异常:', err);
    res.status(500).json({ success: false, error: '查询配置失败' });
  }
});

// PUT /vip-configs/purchase
vipConfigsRouter.put('/purchase', async (req: Request, res: Response) => {
  try {
    const { shopId, plans } = req.body || {};
    if (!shopId || !Array.isArray(plans)) {
      return res.status(400).json({ success: false, error: '缺少 shopId 或 plans' });
    }
    const now = new Date().toISOString();
    const rows = plans.map((p: PurchaseVIPPlan) => ({
      id: `${shopId}_purchase_${p.level}`,
      shop_id: shopId,
      config_type: 'purchase',
      config_key: p.level,
      config_value: { ...p },
      created_at: now,
      updated_at: now,
    }));
    const { error } = await supabase.from('shop_vip_configs').upsert(rows, { onConflict: 'shop_id,config_type,config_key' });
    if (error) {
      console.error('[vip-configs] 保存购买型 VIP 配置失败:', error.message);
      return res.status(500).json({ success: false, error: '保存配置失败' });
    }
    res.json({ success: true, data: plans });
  } catch (err) {
    console.error('[vip-configs] 保存购买型 VIP 配置异常:', err);
    res.status(500).json({ success: false, error: '保存配置失败' });
  }
});

// GET /vip-configs/stored?shopId=xxx
vipConfigsRouter.get('/stored', async (req: Request, res: Response) => {
  try {
    const shopId = req.query.shopId as string;
    if (!shopId) return res.status(400).json({ success: false, error: '缺少 shopId' });
    const { data, error } = await supabase
      .from('shop_vip_configs')
      .select('*')
      .eq('shop_id', shopId)
      .eq('config_type', 'stored');
    if (error) {
      console.error('[vip-configs] 查询储值会员配置失败:', error.message);
      return res.status(500).json({ success: false, error: '查询配置失败' });
    }
    res.json({ success: true, data: (data || []).map(storedPlanFromDb) });
  } catch (err) {
    console.error('[vip-configs] 查询储值会员配置异常:', err);
    res.status(500).json({ success: false, error: '查询配置失败' });
  }
});

// PUT /vip-configs/stored
vipConfigsRouter.put('/stored', async (req: Request, res: Response) => {
  try {
    const { shopId, plans } = req.body || {};
    if (!shopId || !Array.isArray(plans)) {
      return res.status(400).json({ success: false, error: '缺少 shopId 或 plans' });
    }
    const now = new Date().toISOString();
    const rows = plans.map((p: StoredValuePlan) => ({
      id: `${shopId}_stored_${p.level}`,
      shop_id: shopId,
      config_type: 'stored',
      config_key: p.level,
      config_value: { ...p },
      created_at: now,
      updated_at: now,
    }));
    const { error } = await supabase.from('shop_vip_configs').upsert(rows, { onConflict: 'shop_id,config_type,config_key' });
    if (error) {
      console.error('[vip-configs] 保存储值会员配置失败:', error.message);
      return res.status(500).json({ success: false, error: '保存配置失败' });
    }
    res.json({ success: true, data: plans });
  } catch (err) {
    console.error('[vip-configs] 保存储值会员配置异常:', err);
    res.status(500).json({ success: false, error: '保存配置失败' });
  }
});

// GET /vip-configs/special?shopId=xxx
vipConfigsRouter.get('/special', async (req: Request, res: Response) => {
  try {
    const shopId = req.query.shopId as string;
    if (!shopId) return res.status(400).json({ success: false, error: '缺少 shopId' });
    const { data, error } = await supabase
      .from('shop_vip_configs')
      .select('*')
      .eq('shop_id', shopId)
      .eq('config_type', 'special')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[vip-configs] 查询特殊 VIP 配置失败:', error.message);
      return res.status(500).json({ success: false, error: '查询配置失败' });
    }
    res.json({ success: true, data: (data || []).map(specialConfigFromDb) });
  } catch (err) {
    console.error('[vip-configs] 查询特殊 VIP 配置异常:', err);
    res.status(500).json({ success: false, error: '查询配置失败' });
  }
});

// PUT /vip-configs/special
vipConfigsRouter.put('/special', async (req: Request, res: Response) => {
  try {
    const { shopId, config } = req.body || {};
    if (!shopId || !config || !config.key) {
      return res.status(400).json({ success: false, error: '缺少 shopId 或 config.key' });
    }
    const now = new Date().toISOString();
    const id = `${shopId}_special_${config.key}`;
    const { error } = await supabase.from('shop_vip_configs').upsert({
      id,
      shop_id: shopId,
      config_type: 'special',
      config_key: config.key,
      config_value: { ...config },
      created_at: now,
      updated_at: now,
    }, { onConflict: 'shop_id,config_type,config_key' });
    if (error) {
      console.error('[vip-configs] 保存特殊 VIP 配置失败:', error.message);
      return res.status(500).json({ success: false, error: '保存配置失败' });
    }
    const { data } = await supabase
      .from('shop_vip_configs')
      .select('*')
      .eq('shop_id', shopId)
      .eq('config_type', 'special')
      .order('created_at', { ascending: false });
    res.json({ success: true, data: (data || []).map(specialConfigFromDb) });
  } catch (err) {
    console.error('[vip-configs] 保存特殊 VIP 配置异常:', err);
    res.status(500).json({ success: false, error: '保存配置失败' });
  }
});

// DELETE /vip-configs/special/:key
vipConfigsRouter.delete('/special/:key', async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const shopId = req.query.shopId as string;
    if (!shopId) return res.status(400).json({ success: false, error: '缺少 shopId' });
    const { error } = await supabase
      .from('shop_vip_configs')
      .delete()
      .eq('shop_id', shopId)
      .eq('config_type', 'special')
      .eq('config_key', key);
    if (error) {
      console.error('[vip-configs] 删除特殊 VIP 配置失败:', error.message);
      return res.status(500).json({ success: false, error: '删除配置失败' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[vip-configs] 删除特殊 VIP 配置异常:', err);
    res.status(500).json({ success: false, error: '删除配置失败' });
  }
});

mainRouter.use('/vip-configs', vipConfigsRouter);

// ===================== satisfaction surveys =====================
const surveysRouter = Router();

surveysRouter.use(authMiddleware, shopContext, requirePermission('survey:manage'));

const surveyFromDb = (s: Record<string, unknown>): Record<string, unknown> => ({
  id: s.id,
  shopId: s.shop_id,
  bookingId: s.booking_id,
  customerId: s.customer_id,
  customerName: s.customer_name || '顾客',
  rating: Number(s.rating) || 5,
  recommended: Boolean(s.recommended),
  comment: s.comment || '',
  createdAt: s.created_at,
});

// 获取店铺满意度回访列表
surveysRouter.get('/', async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;
    const { data, error } = await supabase
      .from('satisfaction_surveys')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[surveys] 查询回访记录失败:', error.message);
      return res.status(500).json({ success: false, error: '查询回访记录失败' });
    }

    res.json({ success: true, data: (data || []).map(surveyFromDb) });
  } catch (error) {
    console.error('[surveys] 获取回访记录异常:', error);
    res.status(500).json({ success: false, error: '获取回访记录失败' });
  }
});

// 创建满意度回访
surveysRouter.post('/', async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;
    const { bookingId, customerId, customerName, rating, recommended, comment } = req.body || {};

    if (!bookingId || !customerId || !rating) {
      return res.status(400).json({ success: false, error: '缺少必要字段' });
    }

    if (!Number.isInteger(Number(rating)) || Number(rating)<1 || Number(rating)>5) return res.status(400).json({success:false,error:'评分须为1至5的整数'});
    const {data:surveyBooking,error:surveyBookingError}=await supabase.from('bookings').select('id,customer_id,customer_name').eq('id',bookingId).eq('shop_id',shopId).eq('customer_id',customerId).single();
    if(surveyBookingError || !surveyBooking) return res.status(404).json({success:false,error:'预约不存在或无权访问'});
    const id = `survey_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const { data, error } = await supabase
      .from('satisfaction_surveys')
      .insert({
        id,
        shop_id: shopId,
        booking_id: bookingId,
        customer_id: customerId,
        customer_name: customerName || '顾客',
        rating: Number(rating),
        recommended: Boolean(recommended),
        comment: comment || '',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[surveys] 创建回访记录失败:', error.message);
      return res.status(500).json({ success: false, error: '创建回访记录失败' });
    }

    res.status(201).json({ success: true, data: surveyFromDb(data) });
  } catch (error) {
    console.error('[surveys] 创建回访记录异常:', error);
    res.status(500).json({ success: false, error: '创建回访记录失败' });
  }
});

mainRouter.use('/satisfaction-surveys', surveysRouter);

// ===================== refunds =====================
const refundsRouter = Router();

refundsRouter.get('/customer/:customerId/candidates',(req,res,next)=>personalCustomerAccess(req,res,next,'customerId'),async(req: Request,res: Response)=>{
  try {
    const candidates: Record<string,unknown>[]=[];
    let after='';
    for (;;) {
      const {data,error}=await supabase.rpc('get_service_refund_candidates',{p_customer_id:req.customer!.id,p_shop_id:req.customer!.shopId,p_after_id:after});
      if(error) return operationError(res,error,'可退款结算单读取失败，请重新加载');
      if(!Array.isArray(data) || data.length>100 || data.some(r=>typeof r.settlement_id!=='string' || r.settlement_id<=after)) {
        return res.status(503).json({success:false,error:'可退款结算单返回异常，请重新加载'});
      }
      candidates.push(...data.map(r=>({settlementId:r.settlement_id,bookingId:r.booking_id || undefined,
        amount:Number(r.amount),paymentMethod:r.payment_method,createdAt:r.created_at,serviceName:r.service_name})));
      if(data.length<100) break;
      const next=data[data.length-1].settlement_id;
      if(next<=after) return res.status(503).json({success:false,error:'可退款结算单分页异常，请重新加载'});
      after=next;
    }
    return res.json({success:true,data:candidates});
  } catch { return res.status(503).json({success:false,error:'可退款结算单读取失败，请重新加载'}); }
});

function refundApplication(body: Record<string,unknown> | undefined) {
  const {settlementId,bookingId,reason}=body || {};
  if(typeof reason!=='string' || !reason.trim() || reason.length>2000) return null;
  if(settlementId!==undefined) {
    if(typeof settlementId!=='string' || !settlementId.trim() || bookingId!==undefined) return null;
    return {rpc:'request_settlement_refund_atomic',args:{p_settlement_id:settlementId},reason:reason.trim()};
  }
  if(typeof bookingId!=='string' || !bookingId.trim()) return null;
  return {rpc:'request_service_refund_atomic',args:{p_booking_id:bookingId},reason:reason.trim()};
}

// 顾客只登记本人已付服务退款申请；审批记录不等于实际退款到账。
refundsRouter.get('/customer/:customerId',(req,res,next)=>personalCustomerAccess(req,res,next,'customerId'),async(req: Request,res: Response)=>{
  const {data,error}=await supabase.from('refund_requests').select('*').eq('customer_id',req.customer!.id).eq('shop_id',req.customer!.shopId).order('created_at',{ascending:false});
  if(error) return res.status(503).json({success:false,error:'退款记录加载失败'});
  return res.json({success:true,data:(data || []).map(refundFromDb)});
});
refundsRouter.post('/customer/:customerId',(req,res,next)=>personalCustomerAccess(req,res,next,'customerId'),async(req: Request,res: Response)=>{
  const application=refundApplication(req.body);
  if(!application) return res.status(400).json({success:false,error:'请选择一笔已付款服务结算并填写退款原因（最多2000字）'});
  const {data,error}=await supabase.rpc(application.rpc,{p_customer_id:req.customer!.id,p_shop_id:req.customer!.shopId,...application.args,p_reason:application.reason});
  if(error || !data?.[0]) return operationError(res,error || {},'退款申请未提交，请稍后重试');
  return res.status(201).json({success:true,data:refundFromDb(data[0])});
});

refundsRouter.use(authMiddleware, shopContext, requirePermission('shop:edit'));

const refundFromDb = (r: Record<string, unknown>): unknown => ({
  id: r.id,
  shopId: r.shop_id,
  bookingId: r.booking_id,
  settlementId: r.settlement_id,
  customerId: r.customer_id,
  customerName: r.customer_name || '顾客',
  amount: Number(r.amount) || 0,
  reason: r.reason || '',
  status: r.status,
  refundMethod: r.refund_method,
  processedBy: r.processed_by,
  processedByName: r.processed_by_name,
  processedAt: r.processed_at,
  rejectReason: r.reject_reason,
  refundReceiptRef: r.refund_receipt_ref,
  refundReceiptAmount: r.refund_receipt_amount == null ? undefined : Number(r.refund_receipt_amount),
  refundReceiptAt: r.refund_receipt_at,
  refundReceiptRecordedBy: r.refund_receipt_recorded_by,
  refundReceiptRecordedByName: r.refund_receipt_recorded_by_name,
  createdAt: r.created_at,
});

// 获取店铺退款申请列表
refundsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;
    const { data, error } = await supabase
      .from('refund_requests')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[refunds] 查询退款申请失败:', error.message);
      return res.status(500).json({ success: false, error: '查询退款申请失败' });
    }

    res.json({ success: true, data: (data || []).map(refundFromDb) });
  } catch (error) {
    console.error('[refunds] 获取退款申请异常:', error);
    res.status(500).json({ success: false, error: '获取退款申请失败' });
  }
});

// 创建退款申请
refundsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const {customerId}=req.body || {};
    const application=refundApplication(req.body);
    if(!application || typeof customerId!=='string' || !customerId.trim()) return res.status(400).json({success:false,error:'请选择顾客已付款服务结算并填写退款原因（最多2000字）'});
    const {data,error}=await supabase.rpc(application.rpc,{p_customer_id:customerId,p_shop_id:req.employee!.shopId,...application.args,p_reason:application.reason});
    if(error || !data?.[0]) return operationError(res,error || {},'退款申请未提交，请稍后重试');
    return res.status(201).json({success:true,data:refundFromDb(data[0])});
  } catch {return res.status(503).json({success:false,error:'退款申请未提交，请稍后重试'});}
});

// 处理退款申请
refundsRouter.put('/:id/status', ownRecord('refund_requests'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, rejectReason, refundMethod, receiptRef, receiptAmount, receiptAt } = req.body || {};

    if (!status || !['approved', 'rejected', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, error: '无效的状态值' });
    }

    if(refundMethod!==undefined && !['original','balance','bank'].includes(refundMethod)) return res.status(400).json({success:false,error:'无效的退款方式'});
    const {data:current,error:loadError}=await supabase.from('refund_requests').select('*').eq('id',id).eq('shop_id',req.employee!.shopId).maybeSingle();
    if(loadError) return res.status(503).json({success:false,error:'退款记录暂不可用'});
    if(!current) return res.status(404).json({success:false,error:'退款申请不存在'});
    if(current.status===status) return res.json({success:true,data:refundFromDb(current)});
    const allowed:Record<string,string[]>={pending:['approved','rejected','cancelled'],approved:['completed','cancelled']};
    if(!allowed[String(current.status)]?.includes(status)) return res.status(409).json({success:false,error:'退款状态已变化，请刷新后核对'});
    if(status==='rejected' && (typeof rejectReason!=='string' || !rejectReason.trim())) return res.status(400).json({success:false,error:'请填写拒绝原因'});

    if (status === 'completed') {
      const method = refundMethod || current.refund_method;
      const amount = Number(receiptAmount);
      if (!['original','balance','bank'].includes(method)) return res.status(400).json({success:false,error:'请先确认退款方式'});
      if (typeof receiptRef !== 'string' || !receiptRef.trim()) return res.status(400).json({success:false,error:'请填写实际退款回执编号'});
      if (!Number.isFinite(amount) || amount < 0) return res.status(400).json({success:false,error:'请填写有效的实际退款金额'});
      if (typeof receiptAt !== 'string' || !Number.isFinite(new Date(receiptAt).getTime())) return res.status(400).json({success:false,error:'请填写实际退款时间'});
      const {data,error}=await supabase.rpc('complete_service_refund_atomic',{
        p_refund_id:id,p_shop_id:req.employee!.shopId,p_employee_id:req.employee!.id,p_employee_name:req.employee!.name,
        p_refund_method:method,p_receipt_ref:receiptRef.trim(),p_receipt_amount:amount,p_receipt_at:new Date(receiptAt).toISOString(),
      });
      if(error || !data?.[0]) return operationError(res,error || {},'退款回执登记失败，请核对金额、编号和时间');
      return res.json({success:true,data:refundFromDb(data[0])});
    }

    const updatePayload: Record<string, unknown> = { status };
    if (status === 'rejected' && rejectReason) {
      updatePayload.reject_reason = rejectReason;
    }
    if (['approved', 'completed'].includes(status)) {
      updatePayload.refund_method = refundMethod || 'original';
      updatePayload.processed_by = req.employee!.id;
      updatePayload.processed_by_name = req.employee!.name;
      updatePayload.processed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('refund_requests')
      .update(updatePayload)
      .eq('id', id)
      .eq('shop_id', req.employee!.shopId)
      .eq('status',current.status)
      .select()
      .maybeSingle();

    if (error) {
      console.error('[refunds] 更新退款申请失败:', error.message);
      return res.status(500).json({ success: false, error: '更新退款申请失败' });
    }

    if(!data) return res.status(409).json({success:false,error:'退款状态已变化，请刷新后核对'});
    res.json({ success: true, data: refundFromDb(data) });
  } catch (error) {
    console.error('[refunds] 更新退款申请异常:', error);
    res.status(500).json({ success: false, error: '更新退款申请失败' });
  }
});

mainRouter.use('/refunds', refundsRouter);

// ===================== owner dashboard =====================
const ownerRouter = Router();

ownerRouter.use(authMiddleware);

ownerRouter.get('/dashboard', async (req: Request, res: Response) => {
  const employee = req.employee!;
  if (!['ceo', 'shop_owner'].includes(employee.role)) return res.status(403).json({ success: false, error: '无权访问老板视图' });
  try {
    const shopId = employee.shopId;
    const [shopResult, records, bookings, reviews, employees] = await Promise.all([
      supabase.from('shops').select('id,name').eq('id', shopId).eq('is_active', true).single(),
      loadCompletedSettlementRecords(shopId),
      loadDashboardRows('bookings', 'id,shop_id,customer_id,scheduled_time,status', shopId),
      loadDashboardReviews(shopId), loadDashboardRows('employees', 'id,is_active', shopId),
    ]);
    if (shopResult.error || !shopResult.data) throw new Error('店铺不可读');
    res.json({ success: true, data: buildOwnerDashboard(records, bookings.map(b => ({ shopId:b.shop_id, customerId:b.customer_id,
      scheduledTime:b.scheduled_time, status:b.status })), shopResult.data, employees.filter(e => e.is_active === true).length, reviews) });
  } catch {
    res.status(503).json({ success: false, error: '经营概览数据读取不完整，请重试并检查支付迁移与数据库连接' });
  }
});

mainRouter.use('/owner', ownerRouter);

// ===================== webhook: 微信支付回调 =====================
// 微信支付成功后会主动推送通知到此端点，不需要员工登录态。
mainRouter.post('/webhook/wechat-pay', async (req: Request, res: Response) => {
  try {
    const serial = req.headers['wechatpay-serial'] as string;
    const signature = req.headers['wechatpay-signature'] as string;
    const timestamp = req.headers['wechatpay-timestamp'] as string;
    const nonce = req.headers['wechatpay-nonce'] as string;
    const rawBody = (req as Request & { rawBody?: string }).rawBody || '';

    console.log('[wechatpay-webhook] 收到回调:', {
      serial,
      signature: signature ? `${signature.slice(0, 16)}...` : '',
      timestamp,
      nonce,
      hasRawBody: !!rawBody,
    });

    if (!rawBody) {
      console.error('[wechatpay-webhook] 缺少原始请求体，无法验签');
      return res.status(400).json({ code: 'FAIL', message: '缺少原始请求体' });
    }

    const result = await handleWechatCallback({
      rawBody,
      parsedBody: req.body || {},
      serial,
      signature,
      timestamp,
      nonce,
    });

    if (!result.success) {
      console.error('[wechatpay-webhook] 处理失败:', result.message);
      return res.status(400).json({ code: 'FAIL', message: result.message });
    }

    // Only the authenticated gateway receipt supplies transaction ID, amount and success_time.
    if(result.paymentId && result.transactionId) {
      if(!result.paidAt || result.amount===undefined) return res.status(400).json({code:'FAIL',message:'支付成功时间缺失'});
      const {data:payment,error}=await supabase.from('payments').select('shop_id').eq('id',await ledgerPaymentId(result.paymentId)).single();
      if(error || !payment?.shop_id) return res.status(503).json({code:'FAIL',message:'支付映射暂不可用'});
      await recordWechatReceipt({paymentId:result.paymentId,transactionId:result.transactionId,amount:result.amount,paidAt:result.paidAt},String(payment.shop_id),'system_wechat','微信支付');
    }

    // 必须返回 200 和 {code: 'SUCCESS'}，否则微信会重试
    res.status(200).json({ code: 'SUCCESS', message: 'OK' });
  } catch (error) {
    console.error('[wechatpay-webhook] 回调异常:', error);
    res.status(500).json({ code: 'FAIL', message: '服务器处理异常' });
  }
});

export default mainRouter;
