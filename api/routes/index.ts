import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { supabase } from '../db/index.js';
import { authMiddleware, AuthEmployee } from '../middleware/index.js';
import { toCamelCase, toCamelCaseList, toSnakeCase } from '../utils/case.js';
import { mapCustomerBodyToDB, validateCustomerData } from '../utils/customerMapper.js';
import {
  calcDiscountedItemPrice,
  getEffectivePurchaseVIPLevel,
  getEffectiveStoredValueLevel,
} from '../../shared/lib/membership.js';
import { Customer, Coupon, CustomerCoupon, CouponType, CouponScope, ProductCategory } from '../../shared/types.js';

const mainRouter = Router();

// 数据库原始行通用类型：Supabase 返回的原始行字段类型在编译期无法确定，
// 映射层统一用 any 接收，具体业务类型在 fromDb 转换函数中再约束。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbRecord = Record<string, any>;

// ===================== auth =====================
const authRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'mbs-dev-secret-2024';

/**
 * POST /api/auth/login
 * 员工登录：手机号 + 密码 → 查 employees 表 → 签发 JWT
 */
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
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

    // 2. 验证密码（当前 password_hash 字段存的是明文 '123456'，直接用 === 比对）
    if (employee.password_hash !== password) {
      res.status(401).json({ success: false, error: '手机号或密码错误' });
      return;
    }

    // 3. 签发 JWT（有效期 7 天）
    const payload: AuthEmployee = {
      id: employee.id,
      shopId: employee.shop_id || '',
      name: employee.name,
      role: employee.role || 'stylist',
      phone: employee.phone || phone,
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

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

    console.log(`[auth] 员工 ${employee.name} (${employee.phone}) 登录成功`);
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

    res.json({ success: true, data: data || [] });
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

    const { name, phone, title, role: newRole, password, specialty, avatar, is_active } = req.body;

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
      password_hash: password,
      specialty: specialty || '',
      avatar: avatar || '',
      rating: 5.0,
      is_active: is_active !== false,
      created_at: new Date().toISOString(),
    };

    const { data, error } = await supabase.from('employees').insert(employeeData).select().single();

    if (error) {
      console.error('[employees] 创建失败:', error.message);
      res.status(500).json({ success: false, error: '创建员工失败' });
      return;
    }

    res.status(201).json({ success: true, data });
  } catch (err: unknown) {
    console.error('[employees] 创建异常:', (err as Error).message);
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
    const { name, phone, title, role: newRole, password, specialty, avatar, is_active } = req.body;

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
    if (password !== undefined) updateData.password_hash = password;
    if (specialty !== undefined) updateData.specialty = specialty;
    if (avatar !== undefined) updateData.avatar = avatar;
    if (is_active !== undefined) updateData.is_active = is_active;

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

    res.json({ success: true, data });
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
    if (password !== undefined) updateData.password_hash = password;

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

    res.json({ success: true, data });
  } catch (err: unknown) {
    console.error('[employees] 更新个人资料异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

mainRouter.use('/employees', employeesRouter);

// ===================== bookings =====================
// ==================== 股东权益自动发放（三方协同：与 shared/lib/membership.ts 计算逻辑一致）====================

interface StockholderBenefitConfig {
  enabled: boolean;
  serviceDiscountRate: number;
  productDiscountRate: number;
  cashbackRate: number;
  freeServicesPerMonth: number;
  priorityBooking: boolean;
  birthdayGift: string;
}

function getEffectiveStockholderConfig(stockholderConfig: Record<string, unknown>): StockholderBenefitConfig {
  if (stockholderConfig && typeof stockholderConfig === 'object') {
    const cfg = stockholderConfig as Record<string, unknown>;
    return {
      enabled: cfg.enabled === true,
      serviceDiscountRate: typeof cfg.serviceDiscountRate === 'number' ? cfg.serviceDiscountRate : 0.8,
      productDiscountRate: typeof cfg.productDiscountRate === 'number' ? cfg.productDiscountRate : 0.85,
      cashbackRate: typeof cfg.cashbackRate === 'number' ? cfg.cashbackRate : 0.05,
      freeServicesPerMonth: typeof cfg.freeServicesPerMonth === 'number' ? cfg.freeServicesPerMonth : 1,
      priorityBooking: !!cfg.priorityBooking,
      birthdayGift: typeof cfg.birthdayGift === 'string' ? cfg.birthdayGift : '生日当月免费护理一次',
    };
  }
  return {
    enabled: true,
    serviceDiscountRate: 0.8,
    productDiscountRate: 0.85,
    cashbackRate: 0.05,
    freeServicesPerMonth: 1,
    priorityBooking: true,
    birthdayGift: '生日当月免费护理一次',
  };
}

function calcStockholderCashback(totalAmount: number, isStockholder: boolean, stockholderConfig: Record<string, unknown>): number {
  if (!isStockholder) return 0;
  const config = getEffectiveStockholderConfig(stockholderConfig);
  if (!config.enabled || config.cashbackRate <= 0) return 0;
  return Math.round(totalAmount * config.cashbackRate * 100) / 100;
}

/**
 * 检查是否已针对该预约发放过股东返现（幂等性保护）
 */
async function hasCashbackGrantedForBooking(bookingId: string): Promise<boolean> {
  const { data } = await supabase
    .from('stockholder_benefit_records')
    .select('id')
    .eq('source_booking_id', bookingId)
    .eq('type', 'cashback')
    .limit(1);
  return !!(data && data.length > 0);
}

/**
 * 检查最近 1 分钟内是否有相同条件的返现记录（无预约关联时的幂等性保护）
 */
async function hasRecentCashback(shopId: string, customerId: string, amount: number): Promise<boolean> {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString();
  const { data } = await supabase
    .from('stockholder_benefit_records')
    .select('id')
    .eq('shop_id', shopId)
    .eq('customer_id', customerId)
    .eq('amount', amount)
    .eq('type', 'cashback')
    .gte('granted_at', oneMinuteAgo)
    .limit(1);
  return !!(data && data.length > 0);
}

/**
 * 预约完成/结算时自动发放股东权益
 * D专家建议：返现到可提现余额；免费服务按自然月重置
 */
async function grantStockholderBenefits(
  shopId: string,
  customerId: string,
  totalAmount: number,
  sourceBookingId: string | null
) {
  try {
    // 1. 查询店铺配置和客户信息
    const [{ data: shopData }, { data: customerData }] = await Promise.all([
      supabase.from('shops').select('stockholder_config').eq('id', shopId).single(),
      supabase.from('customers').select('is_stockholder, withdrawable_referral_amount').eq('id', customerId).single(),
    ]);

    if (!customerData?.is_stockholder) return;

    const config = getEffectiveStockholderConfig(shopData?.stockholder_config);
    if (!config.enabled) return;

    // 2. 计算返现金额
    const cashbackAmount = calcStockholderCashback(totalAmount, true, shopData?.stockholder_config);
    if (cashbackAmount <= 0) return;

    // 3. 幂等性保护
    if (sourceBookingId) {
      if (await hasCashbackGrantedForBooking(sourceBookingId)) {
        console.log(`[股东权益] 预约 ${sourceBookingId} 已发放过返现，跳过`);
        return;
      }
    } else {
      // 无预约关联时，检查最近 1 分钟内是否有相同金额返现（防止重复结算）
      if (await hasRecentCashback(shopId, customerId, cashbackAmount)) {
        console.log(`[股东权益] 最近已发放过相同金额返现，跳过`);
        return;
      }
    }

    // 4. 写入权益记录并更新余额
    const { error: insertError } = await supabase.from('stockholder_benefit_records').insert({
        id: `shr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        shop_id: shopId,
        customer_id: customerId,
        type: 'cashback',
        amount: cashbackAmount,
        source_booking_id: sourceBookingId,
        status: 'granted',
        granted_at: new Date().toISOString(),
      });

      if (insertError) {
        console.error('[股东权益] 写入返现记录失败:', insertError.message);
      } else {
        // 更新客户可提现余额
        const oldAmount = customerData.withdrawable_referral_amount || 0;
        const newAmount = Math.round((oldAmount + cashbackAmount) * 100) / 100;
        await supabase.from('customers').update({ withdrawable_referral_amount: newAmount }).eq('id', customerId);

        // 站内通知占位（后续可替换为微信模板消息或短信）
        console.log(
          `[股东权益通知占位] 客户 ${customerId} 获得消费返现 ${cashbackAmount} 元，已计入可提现余额`
        );
      }

    // 5. 免费服务使用记录（自然月重置，D专家建议）
    // 注意：当前未在预约数据中标记"是否使用免费服务"，此处预留框架。
    // 若后续支持"使用免费次数抵扣"，可在此扣除当月配额。
  } catch (err: unknown) {
    console.error('[股东权益] 自动发放异常:', (err as Error).message);
  }
}

/**
 * 处理推荐人自动升级股东并发放推荐奖励
 * 业务规则：被推荐人首次消费完成后，推荐人自动成为股东，并获得首次消费金额 × 10% 的奖励
 */
async function processReferralPromotion(
  shopId: string,
  referredCustomerId: string,
  firstSpentAmount: number,
  sourceBookingId: string | null
) {
  try {
    if (firstSpentAmount <= 0) return;

    // 1. 查询被推荐人的推荐记录（referral_records 正式表）
    const { data: referralRecords, error: _refError } = await supabase
      .from('referral_records')
      .select('*')
      .eq('shop_id', shopId)
      .eq('referred_id', referredCustomerId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);

    let referralRecord: unknown | null = referralRecords && referralRecords.length > 0 ? referralRecords[0] : null;

    // 2. 如果没找到正式推荐记录，尝试用 customers 表的 source/referrer 字段兜底
    if (!referralRecord) {
      // 先检查该被推荐人是否已有已确认的推荐记录（防止重复发放）
      const { data: confirmedRecords } = await supabase
        .from('referral_records')
        .select('id')
        .eq('shop_id', shopId)
        .eq('referred_id', referredCustomerId)
        .eq('status', 'confirmed')
        .limit(1);

      if (confirmedRecords && confirmedRecords.length > 0) {
        console.log(`[推荐转化] 被推荐人 ${referredCustomerId} 已有已确认推荐记录，跳过`);
        return;
      }

      const { data: referredCustomer } = await supabase
        .from('customers')
        .select('referrer_name, referrer_phone, is_referred')
        .eq('id', referredCustomerId)
        .eq('shop_id', shopId)
        .single();

      if (referredCustomer?.is_referred && referredCustomer.referrer_phone) {
        // 根据推荐人手机号找到推荐人
        const { data: referrerList } = await supabase
          .from('customers')
          .select('id, name, phone, referral_bonus_rate, is_stockholder, withdrawable_referral_amount')
          .eq('phone', referredCustomer.referrer_phone)
          .eq('shop_id', shopId)
          .limit(1);

        if (referrerList && referrerList.length > 0) {
          const referrer = referrerList[0];
          referralRecord = {
            id: `ref_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            shop_id: shopId,
            referrer_id: referrer.id,
            referrer_name: referrer.name,
            referred_id: referredCustomerId,
            referred_name: referredCustomer.referrer_name,
            referred_phone: referredCustomer.referrer_phone,
            bonus_amount: 0,
            status: 'pending',
            created_at: new Date().toISOString(),
          };
          // 创建一条推荐记录
          await supabase.from('referral_records').insert(referralRecord);
        }
      }
    }

    if (!referralRecord) return;

    const record = referralRecord as Record<string, unknown>;
    const referrerId = record.referrer_id as string;
    if (!referrerId) return;

    // 3. 幂等性保护：检查该推荐记录是否已处理过
    if (record.status !== 'pending') {
      console.log(`[推荐转化] 推荐记录 ${record.id} 已处理，跳过`);
      return;
    }

    // 4. 查询推荐人信息
    const { data: referrer } = await supabase
      .from('customers')
      .select('id, is_stockholder, withdrawable_referral_amount, referral_bonus_rate, referral_earnings')
      .eq('id', referrerId)
      .eq('shop_id', shopId)
      .single();

    if (!referrer) return;

    // 5. 计算推荐奖励金额：默认 10%，可被 referral_bonus_rate 覆盖
    const bonusRate = typeof referrer.referral_bonus_rate === 'number' && referrer.referral_bonus_rate > 0
      ? referrer.referral_bonus_rate
      : 0.10;
    const bonusAmount = Math.round(firstSpentAmount * bonusRate * 100) / 100;

    // 6. 自动升级推荐人为股东（如果还不是）
    const updatePayload: Record<string, unknown> = {
      withdrawable_referral_amount: Math.round(((referrer.withdrawable_referral_amount || 0) + bonusAmount) * 100) / 100,
      referral_earnings: Math.round(((referrer.referral_earnings || 0) + bonusAmount) * 100) / 100,
    };
    if (!referrer.is_stockholder) {
      updatePayload.is_stockholder = true;
      updatePayload.stockholder_since = new Date().toISOString();
      updatePayload.membership_level = 'stockholder';
    }

    await supabase.from('customers').update(updatePayload).eq('id', referrerId).eq('shop_id', shopId);

    // 7. 更新推荐记录状态
    await supabase
      .from('referral_records')
      .update({
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        bonus_amount: bonusAmount,
      })
      .eq('id', record.id)
      .eq('shop_id', shopId);

    // 8. 写入股东权益变动记录
    await supabase.from('stockholder_benefit_records').insert({
      id: `shr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      shop_id: shopId,
      customer_id: referrerId,
      type: 'referral_bonus',
      amount: bonusAmount,
      source_booking_id: sourceBookingId,
      status: 'granted',
      granted_at: new Date().toISOString(),
    });

    console.log(
      `[推荐转化] 推荐人 ${referrerId} 因被推荐人 ${referredCustomerId} 首次消费 ${firstSpentAmount} 元，获得奖励 ${bonusAmount} 元并已自动转为股东`
    );
  } catch (err: unknown) {
    console.error('[推荐转化] 自动处理异常:', (err as Error).message);
  }
}

const bookingsRouter = Router();

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
  serviceId: b.service_id,
  serviceName: b.service_name,
  price: b.price,
  scheduledTime: b.scheduled_time,
  queueNumber: b.queue_number,
  status: b.status,
  notes: b.notes,
  createdAt: b.created_at,
});

// 获取预约列表
bookingsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const shopId = String(req.query.shopId || 'shop1');
    const status = req.query.status as string | undefined;
    // 兼容小程序传入 date=YYYY-MM-DD 与 H5 传入 dateStart=YYYY-MM-DD
    const dateStart = (req.query.dateStart || req.query.date) as string | undefined;
    const page = String(req.query.page || '1');
    const pageSize = String(req.query.pageSize || '20');

    let query = supabase
      .from('bookings')
      .select('*', { count: 'exact' })
      .eq('shop_id', shopId)
      .order('scheduled_time', { ascending: true });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    if (dateStart) {
      const start = new Date(dateStart);
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      query = query.gte('scheduled_time', start.toISOString()).lt('scheduled_time', end.toISOString());
    }

    const pageNum = parseInt(page, 10);
    const size = parseInt(pageSize, 10);
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
bookingsRouter.get('/customer/:customerId', async (req: Request, res: Response) => {
  try {
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
      const isCustomerSelf = customerId && customerId === originalBooking.customer_id;
      if (!isCEO && !isCustomerService && !isCustomerSelf) {
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
      .select()
      .single();

    if (error) {
      console.error('[bookings] 更新预约状态失败:', error.message);
      return res.status(500).json({
        success: false,
        error: '更新预约状态失败',
      });
    }

    // 如果是完成服务，生成到店记录并更新客户消费数据
    if (status === 'completed') {
      const visitRecord = {
        id: `visit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        customer_id: originalBooking.customer_id,
        shop_id: originalBooking.shop_id,
        booking_id: originalBooking.id,
        stylist_id: originalBooking.stylist_id,
        stylist_name: originalBooking.stylist_name,
        service_ids: originalBooking.service_id ? [originalBooking.service_id] : [],
        service_names: originalBooking.service_name ? [originalBooking.service_name] : [],
        total_amount: originalBooking.price || 0,
        check_in_time: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };

      const { error: visitError } = await supabase
        .from('customer_visit_records')
        .insert(visitRecord);

      if (visitError) {
        console.error('[bookings] 创建到店记录失败:', visitError.message);
      }

      // 更新客户消费统计
      if (originalBooking.customer_id) {
        const { data: customer, error: custError } = await supabase
          .from('customers')
          .select('visit_count, total_spent')
          .eq('id', originalBooking.customer_id)
          .single();

        if (!custError && customer) {
          await supabase
            .from('customers')
            .update({
              visit_count: (customer.visit_count || 0) + 1,
              total_spent: (customer.total_spent || 0) + (originalBooking.price || 0),
              last_visit_at: new Date().toISOString(),
            })
            .eq('id', originalBooking.customer_id);
        }
      }

      // 自动发放股东权益（三方协同）
      if (originalBooking.customer_id) {
        await grantStockholderBenefits(
          originalBooking.shop_id,
          originalBooking.customer_id,
          originalBooking.price || 0,
          originalBooking.id
        );
        // 处理推荐人自动升级股东并发放推荐奖励
        await processReferralPromotion(
          originalBooking.shop_id,
          originalBooking.customer_id,
          originalBooking.price || 0,
          originalBooking.id
        );
      }
    }

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

// 顾客自主取消预约（无需员工登录，仅校验 customerId）
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

    if (!stylistId || !stylistName) {
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

    const { data, error } = await supabase
      .from('bookings')
      .update({ stylist_id: stylistId, stylist_name: stylistName })
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
      scheduledTimeDate = new Date(scheduledTime);
      if (isNaN(scheduledTimeDate.getTime())) {
        throw new Error('invalid date');
      }
    } catch (_e) {
      return res.status(400).json({
        success: false,
        error: '预约时间格式无效',
      });
    }

    // 自动补全客户信息：查 customers 表获取姓名和手机号
    let finalCustomerName = customerName;
    let finalCustomerPhone = '';
    if (!finalCustomerName || finalCustomerName === '顾客') {
      const { data: custData } = await supabase
        .from('customers')
        .select('name, phone')
        .eq('id', customerId)
        .maybeSingle();
      if (custData) {
        finalCustomerName = custData.name || finalCustomerName;
        finalCustomerPhone = custData.phone || '';
      }
    }

    // 自动补全服务信息：查 shops 表获取服务名称和价格，同时读取预约确认方式
    let finalServiceName = serviceName;
    let finalPrice = price;
    let bookingConfirmMode = 'auto';
    if (!finalServiceName || finalServiceName === '服务' || !finalPrice) {
      const { data: shopData } = await supabase
        .from('shops')
        .select('services, booking_confirm_mode')
        .eq('id', shopId)
        .maybeSingle();
      if (shopData?.services) {
        const services = shopData.services as Record<string, unknown>[];
        const svc = services.find((s: Record<string, unknown>) => s.id === serviceId);
        if (svc) {
          finalServiceName = svc.name || finalServiceName;
          finalPrice = svc.price || finalPrice;
        }
      }
      if (shopData?.booking_confirm_mode) {
        bookingConfirmMode = shopData.booking_confirm_mode;
      }
    }

    // 自动补全发型师姓名
    let finalStylistName = stylistName;
    if (stylistId && (!finalStylistName || finalStylistName === '')) {
      const { data: empData } = await supabase
        .from('employees')
        .select('name')
        .eq('id', stylistId)
        .maybeSingle();
      if (empData?.name) {
        finalStylistName = empData.name;
      }
    }

    // 按店铺 + 预约日期 + 同一时段 + 有效状态统计排队人数，用于生成更合理的排队号
    const scheduledDateStart = new Date(scheduledTimeDate);
    scheduledDateStart.setHours(0, 0, 0, 0);
    const scheduledDateEnd = new Date(scheduledDateStart);
    scheduledDateEnd.setDate(scheduledDateEnd.getDate() + 1);

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
        error: '创建预约失败: ' + error.message,
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

// ===================== customers =====================
const customersRouter = Router();

/**
 * POST /api/customers/login
 * 顾客公开登录：通过手机号查询客户，不需要 JWT
 */
customersRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { phone, name } = req.body || {};
    if (!phone) {
      res.status(400).json({ success: false, error: '手机号不能为空' });
      return;
    }

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('phone', phone)
      .maybeSingle();

    if (error) {
      console.error('[customers] 登录查询失败:', error.message);
      res.status(500).json({ success: false, error: '查询客户失败' });
      return;
    }

    if (!data) {
      // 陌生手机号自动注册为当前店铺新客户
      const displayName = name?.trim() || `顾客${phone.slice(-4)}`;
      const newCustomer = {
        id: `cust_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        shop_id: 'shop1',
        name: displayName,
        phone,
        membership_level: 'regular',
        purchase_vip_level: 'regular',
        stored_value_level: 'none',
        created_at: new Date().toISOString(),
      };

      const { data: inserted, error: insertError } = await supabase
        .from('customers')
        .insert(newCustomer)
        .select()
        .single();

      if (insertError) {
        console.error('[customers] 自动注册新客户失败:', insertError.message);
        res.status(500).json({ success: false, error: '客户不存在且自动注册失败' });
        return;
      }

      console.log(`[customers] 自动注册新客户: ${inserted.phone} (${inserted.id})`);
      res.json({ success: true, data: toCamelCase(inserted) });
      return;
    }

    // 已存在客户：如果本次填写了称呼且与现有不同，则更新
    const providedName = name?.trim();
    if (providedName && providedName !== data.name) {
      const { data: updated, error: updateError } = await supabase
        .from('customers')
        .update({ name: providedName })
        .eq('id', data.id)
        .select()
        .single();

      if (updateError) {
        console.error('[customers] 更新称呼失败:', updateError.message);
      } else {
        res.json({ success: true, data: toCamelCase(updated) });
        return;
      }
    }

    res.json({ success: true, data: toCamelCase(data) });
  } catch (err: unknown) {
    console.error('[customers] 登录异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * GET /api/customers/:id/public
 * 公开获取单个客户基本信息（顾客端小程序/H5使用，不含敏感字段）
 */
customersRouter.get('/:id/public', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data: customer, error } = await supabase
      .from('customers')
      .select('id, name, phone, membership_level, purchase_vip_level, stored_value_level, points, balance, stored_value_balance, total_spent, visit_count, last_visit_at, purchase_vip_expires_at, stored_value_expires_at, withdrawable_referral_amount, is_stockholder, referral_earnings, referral_bonus_rate')
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

    res.json({ success: true, data: toCamelCase(customer) });
  } catch (err: unknown) {
    console.error('[customers] 获取公开客户信息异常:', (err as Error).message);
    res.status(500).json({ success: false, error: '服务器错误' });
  }
});

/**
 * POST /api/customers/:id/recharge
 * 顾客端自助储值充值（小程序/H5）
 */
customersRouter.post('/:id/recharge', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { shopId, storedValueLevel } = req.body || {};

    if (!shopId) {
      return res.status(400).json({ success: false, error: '缺少店铺ID' });
    }
    if (!storedValueLevel) {
      return res.status(400).json({ success: false, error: '缺少储值档位' });
    }

    const planAmounts: Record<string, number> = {
      store_500: 500,
      store_1000: 1000,
      store_2000: 2000,
      store_5000: 5000,
    };
    const targetAmount = planAmounts[storedValueLevel];
    if (targetAmount === undefined) {
      return res.status(400).json({ success: false, error: '无效的储值档位' });
    }

    const { data: customer, error: fetchError } = await supabase
      .from('customers')
      .select('*')
      .eq('id', id)
      .eq('shop_id', shopId)
      .single();
    if (fetchError || !customer) {
      return res.status(404).json({ success: false, error: '客户不存在' });
    }

    const currentBalance = Number(customer.stored_value_balance || 0);
    const addAmount = Math.max(0, targetAmount - currentBalance);
    const newBalance = currentBalance + addAmount;
    const hadRecharged = customer.stored_value_level && customer.stored_value_level !== 'none';
    const now = new Date().toISOString();

    const { data: updatedCustomer, error: updateError } = await supabase
      .from('customers')
      .update({
        stored_value_level: storedValueLevel,
        stored_value_balance: newBalance,
        balance: newBalance,
        has_recharged: true,
        recharge_level: storedValueLevel,
        stored_value_expires_at: new Date(Date.now() + 2 * 365 * 86400000).toISOString(),
        is_member: true,
        membership_level: customer.is_stockholder ? 'stockholder' : 'premium',
        updated_at: now,
      })
      .eq('id', id)
      .eq('shop_id', shopId)
      .select()
      .single();
    if (updateError || !updatedCustomer) {
      console.error('[customers] 自助储值失败:', updateError?.message);
      return res.status(500).json({ success: false, error: '充值失败' });
    }

    if (addAmount > 0) {
      await supabase.from('stored_value_transactions').insert({
        id: `svtx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        customer_id: id,
        type: hadRecharged ? 'upgrade' : 'recharge',
        amount: addAmount,
        balance_after: newBalance,
        referral_portion: 0,
        note: hadRecharged ? `自助储值升级至 ${storedValueLevel}` : `自助开通 ${storedValueLevel}`,
        created_at: now,
        created_by: id,
        created_by_name: customer.name || '顾客',
      });
    }

    res.json({ success: true, data: toCamelCase(updatedCustomer) });
  } catch (err: unknown) {
    const message = (err as Error).message || String(err);
    console.error('[customers] 自助储值异常:', message);
    res.status(500).json({ success: false, error: '服务器错误', details: message });
  }
});

// 所有客户接口都需要登录
customersRouter.use(authMiddleware);

/**
 * GET /api/customers
 * 获取当前店铺的客户列表（含客户画像、到店记录）
 */
customersRouter.get('/', async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;

    if (!shopId) {
      res.status(400).json({ success: false, error: '当前员工未关联店铺' });
      return;
    }

    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[customers] 查询客户列表失败:', error.message);
      res.status(500).json({ success: false, error: '查询客户列表失败' });
      return;
    }

    const customers = toCamelCaseList(data || []);

    // 批量查询客户画像与到店记录，按 customer_id 聚合
    const customerIds = customers.map((c) => c.id).filter(Boolean);
    let profilesMap: Record<string, unknown> = {};
    let visitsMap: Record<string, unknown[]> = {};

    if (customerIds.length > 0) {
      const [{ data: profiles }, { data: visits }] = await Promise.all([
        supabase.from('customer_profiles').select('*').in('customer_id', customerIds),
        supabase
          .from('customer_visit_records')
          .select('*')
          .in('customer_id', customerIds)
          .order('check_in_time', { ascending: false }),
      ]);

      profilesMap = (profiles || []).reduce((acc, p) => {
        acc[p.customer_id as string] = toCamelCase(p) as DbRecord;
        return acc;
      }, {} as Record<string, DbRecord>);

      visitsMap = (visits || []).reduce((acc, v) => {
        const camel = toCamelCase(v) as DbRecord;
        if (!acc[camel.customerId as string]) acc[camel.customerId as string] = [];
        (acc[camel.customerId as string] as DbRecord[]).push(camel);
        return acc;
      }, {} as Record<string, DbRecord[]>);
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
customersRouter.post('/', async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;

    if (!shopId) {
      res.status(400).json({ success: false, error: '当前员工未关联店铺' });
      return;
    }

    const body = req.body || {};
    console.log('[customers] 收到请求体:', JSON.stringify(body));

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
customersRouter.put('/:id', async (req: Request, res: Response) => {
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

    // 如果前端传了 name/phone，则必须非空
    if (updateData.name !== undefined) {
      const validation = validateCustomerData(updateData);
      if ('error' in validation) {
        res.status(400).json({ success: false, error: validation.error });
        return;
      }
    }

    console.log('[customers] 准备更新:', id, JSON.stringify(updateData));

    const { data, error } = await supabase
      .from('customers')
      .update(updateData)
      .eq('id', id)
      .eq('shop_id', shopId)
      .select()
      .single();

    if (error) {
      console.error('[customers] 更新客户失败:', error.message);
      res.status(500).json({ success: false, error: '更新客户失败: ' + error.message });
      return;
    }

    if (!data) {
      res.status(404).json({ success: false, error: '客户不存在' });
      return;
    }

    console.log(`[customers] 客户 ${data.name} 更新成功`);
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
customersRouter.put('/:id/membership', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const shopId = req.employee!.shopId;
    const { purchaseVIPLevel, storedValueLevel } = req.body || {};

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

    const { data: updatedCustomer, error: updateError } = await supabase
      .from('customers')
      .update(updatePayload)
      .eq('id', id)
      .eq('shop_id', shopId)
      .select()
      .single();

    if (updateError) {
      console.error('[customers] 更新会员状态失败:', updateError.message);
      res.status(500).json({ success: false, error: '更新会员状态失败' });
      return;
    }

    // 创建储值流水
    if (storedValueTx) {
      const { error: txError } = await supabase.from('stored_value_transactions').insert(storedValueTx);
      if (txError) {
        console.error('[customers] 创建储值流水失败:', txError.message);
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

      if (benefitsToInsert.length > 0) {
        const { error: benefitError } = await supabase.from('member_benefit_records').insert(benefitsToInsert);
        if (benefitError) {
          console.error('[customers] 创建权益记录失败:', benefitError.message);
        }
      }
    }

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
 * DELETE /api/customers/:id
 * 删除客户
 */
customersRouter.delete('/:id', async (req: Request, res: Response) => {
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
customersRouter.get('/:id', async (req: Request, res: Response) => {
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
customersRouter.get('/:id/profile', async (req: Request, res: Response) => {
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
customersRouter.post('/:id/profile', async (req: Request, res: Response) => {
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
customersRouter.put('/:id/profile', async (req: Request, res: Response) => {
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
  const base = dateStr ? new Date(dateStr) : new Date();
  base.setHours(0, 0, 0, 0);
  const end = new Date(base);
  end.setDate(end.getDate() + 1);
  return { start: base.toISOString(), end: end.toISOString() };
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
const getQueueServiceDuration = async (shopId: string, serviceId: string): Promise<number> => {
  try {
    const { data } = await supabase
      .from('shops')
      .select('services')
      .eq('id', shopId)
      .maybeSingle();

    if (data?.services) {
      const services = data.services as Record<string, unknown>[];
      const svc = services.find((s: Record<string, unknown>) => s.id === serviceId);
      if (svc && typeof svc.duration === 'number' && svc.duration > 0) {
        return svc.duration;
      }
    }
  } catch (e) {
    console.error('[queues] 查询服务时长失败:', e);
    return DEFAULT_QUEUE_SERVICE_MINUTES;
  }};

// 获取店铺当天排队状态（按同一时段分组）
// GET /api/queues/:shopId?date=YYYY-MM-DD
queuesRouter.get('/:shopId', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
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
    const list = await Promise.all(
      (bookings || []).map(async (b: Record<string, unknown>) => {
        const duration = await getQueueServiceDuration(shopId, b.service_id as string);
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
        bookings: list,
        timeSlotMinutes: QUEUE_TIME_SLOT_MINUTES,
      },
    });
  } catch (error) {
    console.error('[queues] 获取排队信息失败:', error);
    res.status(500).json({ success: false, error: '获取排队信息失败' });
  }
});

// 店铺后台手动更新排队信息（叫号或调整预计等待）
// PUT /api/queues/:shopId
queuesRouter.put('/:shopId', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;
    const { currentNumber, estimatedWaitTime } = req.body || {};
    const { start, end } = getQueueDateRange(req.query.date as string | undefined);

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('shop_id', shopId)
      .in('status', ['pending', 'confirmed', 'serving'])
      .gte('scheduled_time', start)
      .lt('scheduled_time', end);

    if (error) {
      console.error('[queues] 查询预约失败:', error.message);
      return res.status(500).json({ success: false, error: '更新排队信息失败' });
    }

    const list = await Promise.all(
      (bookings || []).map(async (b: Record<string, unknown>) => {
        const duration = await getQueueServiceDuration(shopId, b.service_id as string);
        return {
          id: b.id,
          queueNumber: Number(b.queue_number) || 1,
          status: b.status,
          duration,
        };
      }),
    );

    const finalCurrentNumber = typeof currentNumber === 'number' ? currentNumber : 1;
    const finalEstimatedWaitTime =
      typeof estimatedWaitTime === 'number'
        ? estimatedWaitTime
        : list
            .filter((b) => b.queueNumber >= finalCurrentNumber && b.status !== 'serving')
            .slice(0, 3)
            .reduce((sum, b) => sum + b.duration, 0);

    res.json({
      success: true,
      data: {
        id: `queue_${shopId}_${start.slice(0, 10)}`,
        shopId,
        currentNumber: finalCurrentNumber,
        estimatedWaitTime: finalEstimatedWaitTime,
        bookings: list,
        timeSlotMinutes: QUEUE_TIME_SLOT_MINUTES,
      },
    });
  } catch (error) {
    console.error('[queues] 更新排队信息失败:', error);
    res.status(500).json({ success: false, error: '更新排队信息失败' });
  }
});

mainRouter.use('/queues', queuesRouter);

// ===================== reviews =====================
const reviewsRouter = Router();

const reviewFromDb = (r: Record<string, unknown>): unknown => ({
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
reviewsRouter.post('/', async (req: Request, res: Response) => {
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
        stylist_id: stylistId || null,
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
reviewsRouter.get('/booking/:bookingId', async (req: Request, res: Response) => {
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
reviewsRouter.get('/customer/:customerId', async (req: Request, res: Response) => {
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
reviewsRouter.get('/shop/:shopId', async (req: Request, res: Response) => {
  try {
    const { shopId } = req.params;

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
      data: (data || []).map(reviewFromDb),
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
reviewsRouter.put('/:id/reply', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reply, replyBy } = req.body;

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
reviewsRouter.put('/:id/hide', async (req: Request, res: Response) => {
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
  avatar: typeof s.avatar === 'string' && s.avatar.startsWith('data:')
    ? s.avatar.slice(0, MAX_BASE64_IMAGE_PREVIEW_LEN)
    : (s.avatar || ''),
  images: ((s.images as unknown[]) || []).map((url) =>
    typeof url === 'string' && url.startsWith('data:')
      ? url.slice(0, MAX_BASE64_IMAGE_PREVIEW_LEN)
      : url
  ),
  services: s.services || [],
  products: truncateProductImages(s.products as unknown[]) || [],
  openingHours: s.opening_hours || {},
  employees: s.employees || [],
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
shopsRouter.get('/:id', async (req: Request, res: Response) => {
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
      .select('id, name, phone, avatar, title, rating, specialty, role, is_active')
      .eq('shop_id', id)
      .eq('is_active', true);

    if (empError) {
      console.error('[shops] 查询员工失败:', empError.message);
    }

    res.json({
      success: true,
      data: {
        ...shopFromDb(data),
        employees: (employees || []).map((e: Record<string, unknown>) => ({
          id: e.id,
          name: e.name,
          phone: e.phone,
          avatar: typeof e.avatar === 'string' && e.avatar.startsWith('data:')
            ? e.avatar.slice(0, MAX_BASE64_IMAGE_PREVIEW_LEN)
            : e.avatar,
          title: e.title,
          rating: e.rating || 5,
          isActive: e.is_active !== false,
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
shopsRouter.put('/:id', async (req: Request, res: Response) => {
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
    if (avatar !== undefined) updatePayload.avatar = avatar;
    if (images !== undefined) updatePayload.images = images;
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

// 对 base64 图片进行截断，避免单个产品图片达数 MB 导致 API 响应/小程序 setData 过大
const MAX_BASE64_IMAGE_PREVIEW_LEN = 200;
const truncateProductImages = (products: unknown[]): unknown[] => {
  return (products || []).map((product) => {
    if (!product || typeof product !== 'object') return product;
    const p = product as Record<string, unknown>;
    const rawImages = p.images;
    if (!Array.isArray(rawImages)) return p;
    const images = rawImages.map((url) => {
      if (typeof url !== 'string') return url;
      if (url.startsWith('data:')) {
        return url.length > MAX_BASE64_IMAGE_PREVIEW_LEN
          ? url.slice(0, MAX_BASE64_IMAGE_PREVIEW_LEN)
          : url;
      }
      return url;
    });
    return { ...p, images };
  });
};

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
    const jsonbProducts = truncateProductImages((products || []).map(productFromDb));
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
    res.json({ success: true, data: truncateProductImages((data || []).map(productFromDb)) });
  } catch (error) {
    console.error('[shops] 获取商品异常:', error);
    res.status(500).json({ success: false, error: '获取商品失败' });
  }
});

shopsRouter.post('/:id/products', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const product = req.body || {};
    if (!product.name || !product.category || product.price === undefined) {
      return res.status(400).json({ success: false, error: '缺少必要字段' });
    }

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

shopsRouter.put('/:id/products/:productId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id, productId } = req.params;
    const updates = req.body || {};

    const dbUpdates = productToDb({ ...updates, updatedAt: new Date().toISOString() });
    // 防止误改 id/shop_id/created_at
    delete dbUpdates.id;
    delete dbUpdates.shop_id;
    delete dbUpdates.created_at;

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

shopsRouter.delete('/:id/products/:productId', authMiddleware, async (req: Request, res: Response) => {
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
shopsRouter.post('/:id/products/:productId/inventory', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id, productId } = req.params;
    const { stock, reason } = req.body || {};
    if (stock === undefined || stock === null || Number(stock) < 0) {
      return res.status(400).json({ success: false, error: '库存数量不能为负数' });
    }
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ success: false, error: '请填写调整原因' });
    }

    const { data: product, error: findError } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .eq('shop_id', id)
      .single();
    if (findError || !product) {
      return res.status(404).json({ success: false, error: '商品不存在' });
    }

    const newStock = Math.max(0, Number(stock));
    const oldStock = Number(product.stock || 0);
    const changeAmount = newStock - oldStock;

    const { data: updated, error: updateError } = await supabase
      .from('products')
      .update({ stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', productId)
      .eq('shop_id', id)
      .select()
      .single();
    if (updateError) {
      console.error('[shops] 调整库存失败:', updateError.message);
      return res.status(500).json({ success: false, error: '调整库存失败' });
    }

    const handler = (req as Request & { employee?: Record<string, unknown> }).employee;
    await insertInventoryLog({
      shopId: id,
      productId,
      productName: String(product.name || ''),
      changeAmount,
      stockAfter: newStock,
      type: 'manual_adjust',
      reason: String(reason).trim(),
      operatorId: handler ? String(handler.id) : undefined,
      operatorName: handler ? String(handler.name) : '店铺',
    });
    await syncShopProductsJsonb(id);

    res.json({ success: true, data: productFromDb(updated) });
  } catch (error) {
    console.error('[shops] 调整库存异常:', error);
    res.status(500).json({ success: false, error: '调整库存失败' });
  }
});

// 查询商品库存变动记录
shopsRouter.get('/:id/products/:productId/inventory-logs', authMiddleware, async (req: Request, res: Response) => {
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
couponsRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { shopId, ...rest } = req.body || {};
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
      end_at: rest.endAt || now,
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
      const now = new Date().toISOString();
      query = query.eq('is_active', true).lte('start_at', now).gte('end_at', now);
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
couponsRouter.post('/:id/claim', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { customerId, customerName, customerPhone } = req.body || {};
    if (!customerId) {
      return res.status(400).json({ success: false, error: '缺少顾客ID' });
    }

    const { data: coupon, error: couponError } = await supabase.from('coupons').select('*').eq('id', id).single();
    if (couponError || !coupon) {
      return res.status(404).json({ success: false, error: '优惠券不存在' });
    }
    if (!coupon.is_active) {
      return res.status(400).json({ success: false, error: '优惠券已停用' });
    }
    const now = new Date().toISOString();
    if (now < coupon.start_at || now > coupon.end_at) {
      return res.status(400).json({ success: false, error: '优惠券不在有效期内' });
    }
    if (Number(coupon.remaining_quantity) >= 0 && Number(coupon.remaining_quantity) <= 0) {
      return res.status(400).json({ success: false, error: '优惠券已领完' });
    }

    const limit = Number(coupon.per_customer_limit) || 1;
    const { count } = await supabase
      .from('customer_coupons')
      .select('*', { count: 'exact', head: true })
      .eq('coupon_id', id)
      .eq('customer_id', customerId);
    if ((count || 0) >= limit) {
      return res.status(400).json({ success: false, error: '您已达到领取上限' });
    }

    const customerCouponId = `cc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const { data: claimed, error: insertError } = await supabase
      .from('customer_coupons')
      .insert({
        id: customerCouponId,
        coupon_id: id,
        shop_id: coupon.shop_id,
        customer_id: customerId,
        customer_name: customerName || '',
        customer_phone: customerPhone || '',
        status: 'unused',
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    if (insertError) {
      console.error('[coupons] 领取优惠券失败:', insertError.message);
      return res.status(500).json({ success: false, error: '领取优惠券失败' });
    }

    if (Number(coupon.remaining_quantity) > 0) {
      await supabase
        .from('coupons')
        .update({ remaining_quantity: Number(coupon.remaining_quantity) - 1, updated_at: now })
        .eq('id', id);
    }

    res.json({ success: true, data: customerCouponFromDb(claimed) });
  } catch (error) {
    console.error('[coupons] 领取优惠券异常:', error);
    res.status(500).json({ success: false, error: '领取优惠券失败' });
  }
});

// 更新优惠券（启用/禁用、修改字段）
couponsRouter.put('/:id', authMiddleware, async (req: Request, res: Response) => {
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
    if (body.endAt !== undefined) payload.end_at = body.endAt;
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
couponsRouter.get('/customer/:customerId', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const { shopId, status } = req.query;
    let query = supabase.from('customer_coupons').select('*, coupons(*)').eq('customer_id', customerId);
    if (shopId) query = query.eq('shop_id', shopId);
    if (status) query = query.eq('status', status);
    const { data, error } = await query.order('created_at', { ascending: false });
    if (error) {
      return res.status(500).json({ success: false, error: '查询优惠券失败' });
    }
    res.json({ success: true, data: (data || []).map((cc: DbRecord) => ({
      ...customerCouponFromDb(cc),
      coupon: cc.coupons ? couponFromDb(cc.coupons as Record<string, unknown>) : undefined,
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

const productOrderItemFromDb = (i: DbRecord): Record<string, unknown> => {
  const image = typeof i.image === 'string' && i.image.startsWith('data:')
    ? i.image.slice(0, MAX_BASE64_IMAGE_PREVIEW_LEN)
    : i.image;
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
const rollbackProductOrderInventory = async (orderId: string, shopId: string, cancelReason?: string) => {
  const { data: items } = await supabase.from('product_order_items').select('*').eq('order_id', orderId);
  for (const item of items || []) {
    const { data: product } = await supabase.from('products').select('stock, sales, name').eq('id', item.product_id).single();
    if (product) {
      const quantity = Number(item.quantity || 1);
      const newStock = Math.max(0, Number(product.stock || 0) + quantity);
      const newSales = Math.max(0, Number(product.sales || 0) - quantity);
      await supabase
        .from('products')
        .update({
          stock: newStock,
          sales: newSales,
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.product_id);
      await insertInventoryLog({
        shopId,
        productId: String(item.product_id),
        productName: String(product.name || ''),
        changeAmount: quantity,
        stockAfter: newStock,
        type: 'cancel',
        orderId,
        reason: `订单取消回滚库存 ${cancelReason || '用户取消'}`,
      });
    }
  }
  await syncShopProductsJsonb(shopId);
};

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
productOrdersRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { shopId, customerId, items, paymentMethod, pickupName, pickupPhone, notes, customerCouponId } = req.body || {};

    if (!shopId || !customerId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: '缺少必要字段' });
    }

    if (!['balance', 'store_pickup'].includes(paymentMethod)) {
      return res.status(400).json({ success: false, error: '暂不支持的支付方式' });
    }

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
      const quantity = Math.max(1, Math.floor(Number(item.quantity || 1)));
      if (Number(product.stock || 0) < quantity) {
        return res.status(400).json({ success: false, error: `商品库存不足: ${product.name}` });
      }

      const originalPrice = Number(product.price || 0);
      // 应用与 H5/小程序一致的会员折扣（假发不参与折扣）
      const unitPrice = calcDiscountedItemPrice(originalPrice, purchaseLevel, storedLevel, product.category as ProductCategory | 'service');
      const itemTotal = Math.round(unitPrice * quantity * 100) / 100;
      const itemOriginalTotal = Math.round(originalPrice * quantity * 100) / 100;
      totalAmount += itemTotal;
      originalTotalAmount += itemOriginalTotal;

      const rawImage = product.images?.[0] || null;
      const image = typeof rawImage === 'string' && rawImage.startsWith('data:')
        ? rawImage.slice(0, MAX_BASE64_IMAGE_PREVIEW_LEN)
        : rawImage;
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
      if (now < String(coupon.startAt) || now > String(coupon.endAt)) {
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

    // 创建订单
    const { data: order, error: orderError } = await supabase
      .from('product_orders')
      .insert({
        id: orderId,
        shop_id: shopId,
        customer_id: customerId,
        customer_name: customer.name || '',
        customer_phone: customer.phone || '',
        order_no: orderNo,
        total_amount: totalAmount,
        discount_amount: discountAmount,
        payable_amount: payableAmount,
        status: paymentMethod === 'balance' ? 'paid' : 'pending',
        payment_method: paymentMethod,
        payment_status: paymentMethod === 'balance' ? 'paid' : 'pending',
        paid_at: paymentMethod === 'balance' ? new Date().toISOString() : null,
        pickup_code: pickupCode,
        pickup_name: pickupName || customer.name || '',
        pickup_phone: pickupPhone || customer.phone || '',
        notes: notes || '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (orderError) {
      console.error('[productOrders] 创建订单失败:', orderError.message);
      return res.status(500).json({ success: false, error: '创建订单失败' });
    }

    // 创建订单明细
    const orderItemsWithOrderId = orderItems.map((i) => ({ ...i, order_id: orderId }));
    const { error: itemsError } = await supabase.from('product_order_items').insert(orderItemsWithOrderId);
    if (itemsError) {
      console.error('[productOrders] 创建订单明细失败:', itemsError.message);
      // 回滚订单
      await supabase.from('product_orders').delete().eq('id', orderId);
      return res.status(500).json({ success: false, error: '创建订单明细失败' });
    }

    // 标记优惠券为已使用
    if (appliedCustomerCoupon && appliedCustomerCoupon.id) {
      const { error: couponUseError } = await supabase
        .from('customer_coupons')
        .update({
          status: 'used',
          used_at: new Date().toISOString(),
          order_id: orderId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', appliedCustomerCoupon.id)
        .eq('status', 'unused');
      if (couponUseError) {
        console.error('[productOrders] 标记优惠券已使用失败:', couponUseError.message);
        // 不影响订单本身，记录日志即可
      }
    }

    // 扣减库存并记录变动
    for (const item of items) {
      const product = productMap.get(item.productId);
      if (product) {
        const quantity = Number(item.quantity || 1);
        const oldStock = Number(product.stock || 0);
        const newStock = Math.max(0, oldStock - quantity);
        const newSales = Number(product.sales || 0) + quantity;
        await supabase
          .from('products')
          .update({ stock: newStock, sales: newSales, updated_at: new Date().toISOString() })
          .eq('id', product.id);
        await insertInventoryLog({
          shopId,
          productId: String(product.id),
          productName: String(product.name || ''),
          changeAmount: -quantity,
          stockAfter: newStock,
          type: 'sale',
          orderId,
          reason: `商品订单消费 ${orderNo}`,
        });
      }
    }

    // 余额支付：扣减余额并记录流水
    if (paymentMethod === 'balance') {
      const currentBalance = Number(customer.stored_value_balance || 0);
      const currentReferral = Number(customer.withdrawable_referral_amount || 0);
      const principal = Math.max(0, currentBalance - currentReferral);
      const usedPrincipal = Math.min(payableAmount, principal);
      const usedReferral = payableAmount - usedPrincipal;

      const newBalance = Math.round((currentBalance - payableAmount) * 100) / 100;
      const newReferral = Math.round((currentReferral - usedReferral) * 100) / 100;

      await supabase
        .from('customers')
        .update({ stored_value_balance: newBalance, balance: newBalance, withdrawable_referral_amount: newReferral })
        .eq('id', customerId)
        .eq('shop_id', shopId);

      await supabase.from('stored_value_transactions').insert({
        id: `svt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        customer_id: customerId,
        type: 'consume',
        amount: -payableAmount,
        balance_after: newBalance,
        principal_portion: -usedPrincipal,
        referral_portion: -usedReferral,
        order_id: orderId,
        note: `商品订单消费 ${orderNo}`,
        created_at: new Date().toISOString(),
        created_by: customerId,
        created_by_name: customer.name || '顾客',
      });
    }

    await syncShopProductsJsonb(shopId);

    res.status(201).json({
      success: true,
      data: {
        ...productOrderFromDb(order),
        items: orderItems.map((i) => productOrderItemFromDb({ ...i, order_id: orderId })),
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
productOrdersRouter.post('/:id/pay', async (req: Request, res: Response) => {
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

    const payableAmount = Number(order.payable_amount || 0);
    const shopId = order.shop_id;
    const orderNo = order.order_no;

    const updatePayload: Record<string, unknown> = {
      status: 'paid',
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (paymentMethod === 'balance') {
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('stored_value_balance, withdrawable_referral_amount, name')
        .eq('id', customerId)
        .eq('shop_id', shopId)
        .single();
      if (customerError || !customer) {
        return res.status(404).json({ success: false, error: '顾客不存在' });
      }

      const currentBalance = Number(customer.stored_value_balance || 0);
      const currentReferral = Number(customer.withdrawable_referral_amount || 0);
      if (currentBalance < payableAmount) {
        return res.status(400).json({ success: false, error: '储值余额不足' });
      }

      const principal = Math.max(0, currentBalance - currentReferral);
      const usedPrincipal = Math.min(payableAmount, principal);
      const usedReferral = payableAmount - usedPrincipal;
      const newBalance = Math.round((currentBalance - payableAmount) * 100) / 100;
      const newReferral = Math.round((currentReferral - usedReferral) * 100) / 100;

      await supabase
        .from('customers')
        .update({ stored_value_balance: newBalance, balance: newBalance, withdrawable_referral_amount: newReferral })
        .eq('id', customerId)
        .eq('shop_id', shopId);

      await supabase.from('stored_value_transactions').insert({
        id: `svt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        customer_id: customerId,
        type: 'consume',
        amount: -payableAmount,
        balance_after: newBalance,
        principal_portion: -usedPrincipal,
        referral_portion: -usedReferral,
        order_id: id,
        note: `商品订单消费 ${orderNo}`,
        created_at: new Date().toISOString(),
        created_by: customerId,
        created_by_name: customer.name || '顾客',
      });
    }

    // store_pickup 支付：到店自提付款，顾客确认后标记为已付款
    if (paymentMethod === 'store_pickup') {
      updatePayload.payment_method = 'store_pickup';
    }

    const { data: updatedOrder, error: updateError } = await supabase
      .from('product_orders')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();
    if (updateError) {
      return res.status(500).json({ success: false, error: '支付订单失败' });
    }

    res.json({ success: true, data: productOrderFromDb(updatedOrder) });
  } catch (error) {
    console.error('[productOrders] 支付订单异常:', error);
    res.status(500).json({ success: false, error: '支付订单失败' });
  }
});

// 顾客查看自己的商品订单列表
productOrdersRouter.get('/customer/:customerId', async (req: Request, res: Response) => {
  try {
    const { customerId } = req.params;
    const { shopId } = req.query;
    let query = supabase.from('product_orders').select('*').eq('customer_id', customerId);
    if (shopId) {
      query = query.eq('shop_id', shopId);
    }
    const { data: orders, error } = await query.order('created_at', { ascending: false });
    if (error) {
      return res.status(500).json({ success: false, error: '查询订单失败' });
    }

    const orderIds = (orders || []).map((o: Record<string, unknown>) => o.id);
    const { data: items } = await supabase.from('product_order_items').select('*').in('order_id', orderIds);
    const itemsByOrderId = new Map<string, Array<Record<string, unknown>>>();
    (items || []).forEach((i: Record<string, unknown>) => {
      const list = itemsByOrderId.get(i.order_id as string) || [];
      list.push(productOrderItemFromDb(i));
      itemsByOrderId.set(i.order_id as string, list);
    });

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
productOrdersRouter.get('/shop/:shopId', authMiddleware, async (req: Request, res: Response) => {
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
      const { data: items } = await supabase
        .from('product_order_items')
        .select('*')
        .in('order_id', orderIds);
      (items || []).forEach((i: Record<string, unknown>) => {
        const list = itemsByOrderId.get(i.order_id as string) || [];
        list.push(productOrderItemFromDb(i));
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
productOrdersRouter.put('/:id/status', authMiddleware, async (req: Request, res: Response) => {
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

    const updatePayload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'completed') {
      updatePayload.completed_at = new Date().toISOString();
    }
    if (status === 'cancelled') {
      updatePayload.cancelled_at = new Date().toISOString();
      updatePayload.cancel_reason = cancelReason || '店铺取消';
    }
    // 到店自提付款：标记为 paid 时记录付款时间
    if (status === 'paid' && existing.payment_method === 'store_pickup') {
      updatePayload.payment_status = 'paid';
      updatePayload.paid_at = new Date().toISOString();
    }

    const { data: order, error } = await supabase.from('product_orders').update(updatePayload).eq('id', id).select().single();
    if (error) {
      return res.status(500).json({ success: false, error: '更新订单失败' });
    }

    // 取消订单时回滚库存并记录变动
    if (status === 'cancelled') {
      await rollbackProductOrderInventory(id, existing.shop_id, cancelReason || '店铺取消');
    }

    res.json({ success: true, data: productOrderFromDb(order) });
  } catch (error) {
    console.error('[productOrders] 更新订单状态异常:', error);
    res.status(500).json({ success: false, error: '更新订单失败' });
  }
});

// 顾客自主取消待支付订单
productOrdersRouter.put('/:id/cancel', async (req: Request, res: Response) => {
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

    const updatePayload: Record<string, unknown> = {
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancel_reason: cancelReason || '用户取消',
      updated_at: new Date().toISOString(),
    };

    const { data: order, error } = await supabase.from('product_orders').update(updatePayload).eq('id', id).select().single();
    if (error) {
      return res.status(500).json({ success: false, error: '取消订单失败' });
    }

    // 回滚库存
    await rollbackProductOrderInventory(id, existing.shop_id, cancelReason || '用户取消');

    res.json({ success: true, data: productOrderFromDb(order) });
  } catch (error) {
    console.error('[productOrders] 顾客取消订单异常:', error);
    res.status(500).json({ success: false, error: '取消订单失败' });
  }
});

// 店铺核销自提码
productOrdersRouter.post('/:id/verify-pickup', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { pickupCode } = req.body || {};

    const { data: order, error: findError } = await supabase.from('product_orders').select('*').eq('id', id).single();
    if (findError || !order) {
      return res.status(404).json({ success: false, error: '订单不存在' });
    }

    if (order.pickup_code !== pickupCode) {
      return res.status(400).json({ success: false, error: '核销码错误' });
    }

    if (order.status === 'completed') {
      return res.status(400).json({ success: false, error: '订单已完成' });
    }

    // 余额支付订单：须为 paid/ready 方可核销
    // 到店自提付款订单：pending 即可核销（顾客到店付款并提货，一次性完成）
    const canVerify =
      ['paid', 'ready'].includes(order.status) ||
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

    const { data: updated, error } = await supabase.from('product_orders').update(updatePayload).eq('id', id).select().single();
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
productOrdersRouter.post('/:id/refund', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ success: false, error: '请填写退款原因' });
    }

    const { data: order, error: orderError } = await supabase
      .from('product_orders')
      .select('*')
      .eq('id', id)
      .single();
    if (orderError || !order) {
      return res.status(404).json({ success: false, error: '订单不存在' });
    }

    // 仅余额支付且未结束的订单可申请退款
    const eligibleStatuses = ['paid', 'preparing', 'ready'];
    if (!eligibleStatuses.includes(order.status)) {
      return res.status(400).json({ success: false, error: '当前订单状态不可申请退款' });
    }
    if (order.payment_method !== 'balance') {
      return res.status(400).json({ success: false, error: '仅余额支付订单支持退款' });
    }

    // 检查是否已有进行中的退款
    const { data: existingRefund } = await supabase
      .from('product_order_refunds')
      .select('id')
      .eq('order_id', id)
      .eq('status', 'pending')
      .maybeSingle();
    if (existingRefund) {
      return res.status(400).json({ success: false, error: '已存在待处理的退款申请' });
    }

    const refundId = `por_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const { data: refund, error } = await supabase
      .from('product_order_refunds')
      .insert({
        id: refundId,
        order_id: id,
        shop_id: order.shop_id,
        customer_id: order.customer_id,
        customer_name: order.customer_name || '',
        amount: Number(order.payable_amount || 0),
        reason: String(reason).trim(),
        status: 'pending',
        previous_status: order.status,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[productOrders] 创建退款申请失败:', error.message);
      return res.status(500).json({ success: false, error: '提交退款申请失败' });
    }

    // 将订单标记为退款中
    await supabase
      .from('product_orders')
      .update({ status: 'refunding', updated_at: new Date().toISOString() })
      .eq('id', id);

    res.json({ success: true, data: productOrderRefundFromDb(refund) });
  } catch (error) {
    console.error('[productOrders] 申请退款异常:', error);
    res.status(500).json({ success: false, error: '申请退款失败' });
  }
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
productOrdersRouter.put('/refunds/:id/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, rejectReason } = req.body || {};
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, error: '无效的处理状态' });
    }

    const { data: refund, error: refundError } = await supabase
      .from('product_order_refunds')
      .select('*')
      .eq('id', id)
      .single();
    if (refundError || !refund) {
      return res.status(404).json({ success: false, error: '退款申请不存在' });
    }
    if (refund.status !== 'pending') {
      return res.status(400).json({ success: false, error: '退款申请已处理' });
    }

    const { data: order } = await supabase
      .from('product_orders')
      .select('*')
      .eq('id', refund.order_id)
      .single();
    if (!order) {
      return res.status(404).json({ success: false, error: '订单不存在' });
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: now,
      handled_at: now,
    };
    if (status === 'rejected') {
      updatePayload.reject_reason = rejectReason || '店铺拒绝';
    }
    const handler = (req as Request & { employee?: Record<string, unknown> }).employee;
    if (handler) {
      updatePayload.handler_id = handler.id;
      updatePayload.handler_name = handler.name;
    }

    const { data: updatedRefund, error } = await supabase
      .from('product_order_refunds')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      return res.status(500).json({ success: false, error: '处理退款申请失败' });
    }

    let orderStatus = refund.previous_status;
    if (status === 'approved') {
      orderStatus = 'refunded';
      // 回滚库存并记录变动
      const { data: items } = await supabase
        .from('product_order_items')
        .select('*')
        .eq('order_id', refund.order_id);
      for (const item of items || []) {
        const { data: product } = await supabase
          .from('products')
          .select('stock, sales, name')
          .eq('id', item.product_id)
          .single();
        if (product) {
          const quantity = Number(item.quantity || 1);
          const newStock = Math.max(0, Number(product.stock || 0) + quantity);
          const newSales = Math.max(0, Number(product.sales || 0) - quantity);
          await supabase
            .from('products')
            .update({
              stock: newStock,
              sales: newSales,
              updated_at: now,
            })
            .eq('id', item.product_id);
          await insertInventoryLog({
            shopId: refund.shop_id,
            productId: String(item.product_id),
            productName: String(product.name || ''),
            changeAmount: quantity,
            stockAfter: newStock,
            type: 'refund',
            orderId: refund.order_id,
            reason: `订单退款回滚库存 ${order.order_no}`,
            operatorId: handler ? String(handler.id) : undefined,
            operatorName: handler ? String(handler.name) : '店铺',
          });
        }
      }

      // 退还余额（仅增加储值余额，不得影响可提现推荐金额）
      const { data: customer } = await supabase
        .from('customers')
        .select('stored_value_balance, balance')
        .eq('id', refund.customer_id)
        .eq('shop_id', refund.shop_id)
        .single();
      if (customer) {
        const refundAmount = Number(refund.amount || 0);
        const currentBalance = Number(customer.stored_value_balance || 0);
        const currentDisplayBalance = Number(customer.balance || currentBalance);
        const newBalance = Math.round((currentBalance + refundAmount) * 100) / 100;
        const newDisplayBalance = Math.round((currentDisplayBalance + refundAmount) * 100) / 100;
        await supabase
          .from('customers')
          .update({
            stored_value_balance: newBalance,
            balance: newDisplayBalance,
            updated_at: now,
          })
          .eq('id', refund.customer_id)
          .eq('shop_id', refund.shop_id);

        await supabase.from('stored_value_transactions').insert({
          id: `svt_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
          customer_id: refund.customer_id,
          type: 'refund',
          amount: refundAmount,
          balance_after: newBalance,
          principal_portion: refundAmount,
          referral_portion: 0,
          order_id: refund.order_id,
          note: `商品订单退款 ${order.order_no}`,
          created_at: now,
          created_by: handler ? handler.id : null,
          created_by_name: handler ? handler.name : '店铺',
        });
      }

      await syncShopProductsJsonb(refund.shop_id);
    }

    await supabase
      .from('product_orders')
      .update({ status: orderStatus, updated_at: now })
      .eq('id', refund.order_id);

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
productOrdersRouter.post('/:id/ship', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { role, shopId } = req.employee!;
    
    if (role !== 'ceo' && role !== 'shop_manager' && role !== 'customer_service') {
      return res.status(403).json({ success: false, error: '无权发货' });
    }

    const { company, no } = req.body;
    if (!company || !no) {
      return res.status(400).json({ success: false, error: '物流公司和运单号不能为空' });
    }

    // 查询订单
    const { data: existing, error: findError } = await supabase
      .from('product_orders')
      .select('*')
      .eq('id', id)
      .eq('shop_id', shopId)
      .single();

    if (findError) {
      console.error('[productOrders] 查询订单失败:', findError.message);
      return res.status(500).json({ success: false, error: '查询订单失败' });
    }

    if (!existing) {
      return res.status(404).json({ success: false, error: '订单不存在' });
    }

    // 只有待提货（ready）状态的订单可以发货
    if (existing.status !== 'ready' && existing.status !== 'paid' && existing.status !== 'preparing') {
      return res.status(400).json({ success: false, error: `当前订单状态（${existing.status}）不可发货` });
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      status: 'shipped',
      shipping_company: company,
      shipping_no: no,
      shipped_at: now,
      updated_at: now,
    };

    const { data: updated, error } = await supabase
      .from('product_orders')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[productOrders] 发货失败:', error.message);
      return res.status(500).json({ success: false, error: '发货失败' });
    }

    // 添加物流轨迹记录
    await supabase.from('shipment_tracking').insert({
      order_id: id,
      shipping_company: company,
      shipping_no: no,
      event_time: now,
      event_description: '订单已发货',
      location: '',
    });

    console.log(`[productOrders] 订单 ${id} 发货成功: ${company} ${no}`);
    res.json({ success: true, data: productOrderFromDb(updated) });
  } catch (error) {
    console.error('[productOrders] 发货异常:', error);
    res.status(500).json({ success: false, error: '发货失败' });
  }
});

/**
 * PUT /api/product-orders/:id/confirm
 * 顾客端确认收货
 */
productOrdersRouter.put('/:id/confirm', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { customerId } = req.body;

    if (!customerId) {
      return res.status(400).json({ success: false, error: '缺少顾客信息' });
    }

    // 查询订单
    const { data: existing, error: findError } = await supabase
      .from('product_orders')
      .select('*')
      .eq('id', id)
      .single();

    if (findError) {
      console.error('[productOrders] 查询订单失败:', findError.message);
      return res.status(500).json({ success: false, error: '查询订单失败' });
    }

    if (!existing) {
      return res.status(404).json({ success: false, error: '订单不存在' });
    }

    // 验证顾客权限
    if (existing.customer_id !== customerId) {
      return res.status(403).json({ success: false, error: '无权操作该订单' });
    }

    // 只有已发货状态可以确认收货
    if (existing.status !== 'shipped') {
      return res.status(400).json({ success: false, error: `当前订单状态（${existing.status}）不可确认收货` });
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from('product_orders')
      .update({
        status: 'completed',
        confirmed_at: now,
        completed_at: now,
        updated_at: now,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[productOrders] 确认收货失败:', error.message);
      return res.status(500).json({ success: false, error: '确认收货失败' });
    }

    // 添加物流轨迹记录
    await supabase.from('shipment_tracking').insert({
      order_id: id,
      shipping_company: existing.shipping_company,
      shipping_no: existing.shipping_no,
      event_time: now,
      event_description: '确认收货',
      location: '',
    });

    console.log(`[productOrders] 订单 ${id} 确认收货成功`);
    res.json({ success: true, data: productOrderFromDb(updated) });
  } catch (error) {
    console.error('[productOrders] 确认收货异常:', error);
    res.status(500).json({ success: false, error: '确认收货失败' });
  }
});

/**
 * GET /api/product-orders/:id/tracking
 * 查询物流轨迹
 */
productOrdersRouter.get('/:id/tracking', async (req: Request, res: Response) => {
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

const settlementFromDb = (s: Record<string, unknown>): Record<string, unknown> => ({
  id: s.id,
  shopId: s.shop_id,
  customerId: s.customer_id,
  customerName: s.customer_name,
  bookingId: s.booking_id,
  items: s.items || [],
  subtotal: Number(s.subtotal) || 0,
  discountDetail: s.discount_detail || {},
  discount: Number(s.discount) || 0,
  tax: Number(s.tax) || 0,
  total: Number(s.total) || 0,
  paymentMethod: s.payment_method,
  paymentStatus: s.payment_status,
  usedBenefitIds: s.used_benefit_ids || [],
  processedBy: s.processed_by,
  createdAt: s.created_at,
});

// 创建结算记录
settlementsRouter.post('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;
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
    } = req.body || {};

    if (!customerId || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: '缺少必要字段' });
    }

    const settlementId = id || `settle_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const { data: settlement, error: insertError } = await supabase
      .from('settlements')
      .insert({
        id: settlementId,
        shop_id: shopId,
        customer_id: customerId,
        customer_name: customerName || '',
        booking_id: bookingId || null,
        items: items,
        subtotal: subtotal || 0,
        discount_detail: discountDetail || {},
        discount: discount || 0,
        tax: tax || 0,
        total: total || 0,
        payment_method: paymentMethod || 'cash',
        payment_status: 'completed',
        used_benefit_ids: usedBenefitIds || [],
        processed_by: req.employee!.name,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) {
      console.error('[settlements] 创建结算记录失败:', insertError.message);
      return res.status(500).json({ success: false, error: '创建结算记录失败: ' + insertError.message });
    }

    // 更新客户消费统计
    const { data: customer } = await supabase
      .from('customers')
      .select('visit_count, total_spent, stored_value_balance, withdrawable_referral_amount, points')
      .eq('id', customerId)
      .eq('shop_id', shopId)
      .single();

    if (customer) {
      const newVisitCount = (customer.visit_count || 0) + 1;
      const newTotalSpent = Number(customer.total_spent || 0) + Number(total || 0);
      const earnedPoints = Math.round(Number(total || 0));
      const updatePayload: Record<string, unknown> = {
        visit_count: newVisitCount,
        total_spent: newTotalSpent,
        last_visit_at: new Date().toISOString(),
        points: (Number(customer.points) || 0) + earnedPoints,
      };

      // 储值支付：扣减余额
      if (paymentMethod === 'balance') {
        const currentBalance = Number(customer.stored_value_balance || 0);
        const currentReferral = Number(customer.withdrawable_referral_amount || 0);
        const principal = currentBalance - currentReferral;
        const usedPrincipal = Math.min(Number(total), principal);
        const usedReferral = Number(total) - usedPrincipal;

        updatePayload.stored_value_balance = Math.round((currentBalance - Number(total)) * 100) / 100;
        updatePayload.balance = updatePayload.stored_value_balance;
        if (usedReferral > 0) {
          updatePayload.withdrawable_referral_amount = Math.round((currentReferral - usedReferral) * 100) / 100;
        }
      }

      await supabase.from('customers').update(updatePayload).eq('id', customerId).eq('shop_id', shopId);
    }

    // 核销权益
    const benefits = usedBenefitIds || [];
    if (benefits.length > 0) {
      await supabase
        .from('member_benefit_records')
        .update({
          status: 'used',
          used_at: new Date().toISOString(),
          used_by: req.employee!.id,
          used_by_name: req.employee!.name,
          used_order_id: settlementId,
        })
        .in('id', benefits)
        .eq('customer_id', customerId);
    }

    // 创建到店记录
    const visitRecord = {
      id: `visit_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      customer_id: customerId,
      shop_id: shopId,
      booking_id: bookingId || null,
      stylist_id: null,
      stylist_name: req.employee!.name,
      service_ids: items.filter((i: Record<string, unknown>) => i.type === 'service').map((i: Record<string, unknown>) => i.id),
      service_names: items.filter((i: Record<string, unknown>) => i.type === 'service').map((i: Record<string, unknown>) => i.name),
      total_amount: total || 0,
      check_in_time: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    await supabase.from('customer_visit_records').insert(visitRecord);

    // 自动发放股东权益（三方协同）
    await grantStockholderBenefits(shopId, customerId, total || 0, bookingId || null);

    // 处理推荐人自动升级股东并发放推荐奖励
    await processReferralPromotion(shopId, customerId, total || 0, bookingId || null);

    res.status(201).json({ success: true, data: settlementFromDb(settlement) });
  } catch (error) {
    console.error('[settlements] 创建结算异常:', error);
    res.status(500).json({ success: false, error: '创建结算失败' });
  }
});

// 获取店铺结算列表
settlementsRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;
    const { data, error } = await supabase
      .from('settlements')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[settlements] 查询结算列表失败:', error.message);
      return res.status(500).json({ success: false, error: '查询结算列表失败' });
    }

    res.json({ success: true, data: (data || []).map(settlementFromDb) });
  } catch (error) {
    console.error('[settlements] 获取结算列表异常:', error);
    res.status(500).json({ success: false, error: '获取结算列表失败' });
  }
});

mainRouter.use('/settlements', settlementsRouter);

// ===================== financial =====================
const financialRouter = Router();

financialRouter.use(authMiddleware);

financialRouter.get('/report', async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;
    const dateRange = (req.query.dateRange as string) || 'month';

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const yearStart = new Date(today.getFullYear(), 0, 1);
    const quarterStart = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);

    let trendStart = monthStart;
    if (dateRange === 'week') trendStart = weekStart;
    if (dateRange === 'quarter') trendStart = quarterStart;
    if (dateRange === 'year') trendStart = yearStart;

    const { data: settlements, error } = await supabase
      .from('settlements')
      .select('*')
      .eq('shop_id', shopId)
      .eq('payment_status', 'completed')
      .gte('created_at', trendStart.toISOString());

    if (error) {
      console.error('[financial] 查询结算失败:', error.message);
      return res.status(500).json({ success: false, error: '查询财务数据失败' });
    }

    // 关联结算明细（ Supabase 不会自动返回关联表）
    const settlementIds = (settlements || []).map((s: Record<string, unknown>) => s.id).filter(Boolean) as string[];
    const { data: itemsData } = await supabase
      .from('settlement_items')
      .select('*')
      .in('settlement_id', settlementIds.length > 0 ? settlementIds : ['__none__']);
    const itemsBySettlement = new Map<string, unknown[]>();
    (itemsData || []).forEach((item: Record<string, unknown>) => {
      const sid = item.settlement_id as string;
      if (!itemsBySettlement.has(sid)) itemsBySettlement.set(sid, []);
      itemsBySettlement.get(sid)!.push(item);
    });

    const revenue = { today: 0, week: 0, month: 0, year: 0 };
    const services = { today: 0, week: 0, month: 0, year: 0 };
    const ticketSum = { today: 0, week: 0, month: 0, year: 0 };
    const ticketCount = { today: 0, week: 0, month: 0, year: 0 };

    const stylistMap: Record<
      string,
      { name: string; revenue: number; services: number; ratingSum: number; ratingCount: number }
    > = {};

    (settlements || []).forEach((s: Record<string, unknown>) => {
      const createdAt = new Date(s.created_at as string);
      const isToday = createdAt >= today;
      const isWeek = createdAt >= weekStart;
      const isMonth = createdAt >= monthStart;
      const isYear = createdAt >= yearStart;
      const total = Number(s.total) || 0;

      if (isToday) {
        revenue.today += total;
        ticketSum.today += total;
        ticketCount.today += 1;
      }
      if (isWeek) {
        revenue.week += total;
        ticketSum.week += total;
        ticketCount.week += 1;
      }
      if (isMonth) {
        revenue.month += total;
        ticketSum.month += total;
        ticketCount.month += 1;
      }
      if (isYear) {
        revenue.year += total;
        ticketSum.year += total;
        ticketCount.year += 1;
      }

      (itemsBySettlement.get(s.id as string) || []).forEach((item: Record<string, unknown>) => {
        const itemTotal = Number(item.total) || 0;
        const qty = Number(item.quantity) || 1;
        const empId = (item.employee_id || item.employeeId) as string;
        const empName = (item.employee_name || item.employeeName || '发型师') as string;

        if (empId) {
          if (!stylistMap[empId]) {
            stylistMap[empId] = { name: empName, revenue: 0, services: 0, ratingSum: 0, ratingCount: 0 };
          }
          if (isMonth) {
            stylistMap[empId].revenue += itemTotal;
            if (item.type === 'service' || item.type === undefined) {
              stylistMap[empId].services += qty;
            }
          }
        }

        if (isMonth && (item.type === 'service' || item.type === undefined)) {
          services.month += qty;
        }
        if (isYear && (item.type === 'service' || item.type === undefined)) {
          services.year += qty;
        }
        if (isWeek && (item.type === 'service' || item.type === undefined)) {
          services.week += qty;
        }
        if (isToday && (item.type === 'service' || item.type === undefined)) {
          services.today += qty;
        }
      });
    });

    const { data: reviews } = await supabase.from('reviews').select('*').eq('shop_id', shopId);
    (reviews || []).forEach((r: Record<string, unknown>) => {
      const stylistId = r.stylist_id as string;
      if (stylistId && stylistMap[stylistId]) {
        stylistMap[stylistId].ratingSum += Number(r.overall_score || r.rating || 0);
        stylistMap[stylistId].ratingCount += 1;
      }
    });

    const topStylists = Object.entries(stylistMap)
      .map(([id, info]) => ({
        id,
        name: info.name,
        revenue: Math.round(info.revenue * 100) / 100,
        services: info.services,
        rating:
          info.ratingCount > 0
            ? Math.round((info.ratingSum / info.ratingCount) * 10) / 10
            : 5,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const averageTicket = {
      today: ticketCount.today > 0 ? Math.round((ticketSum.today / ticketCount.today) * 100) / 100 : 0,
      week: ticketCount.week > 0 ? Math.round((ticketSum.week / ticketCount.week) * 100) / 100 : 0,
      month: ticketCount.month > 0 ? Math.round((ticketSum.month / ticketCount.month) * 100) / 100 : 0,
      year: ticketCount.year > 0 ? Math.round((ticketSum.year / ticketCount.year) * 100) / 100 : 0,
    };

    res.json({
      success: true,
      data: {
        revenue: {
          today: Math.round(revenue.today * 100) / 100,
          week: Math.round(revenue.week * 100) / 100,
          month: Math.round(revenue.month * 100) / 100,
          year: Math.round(revenue.year * 100) / 100,
        },
        services,
        averageTicket,
        topStylists,
      },
    });
  } catch (error) {
    console.error('[financial] 获取财务报表异常:', error);
    res.status(500).json({ success: false, error: '获取财务报表失败' });
  }
});

mainRouter.use('/financial', financialRouter);

// ===================== stylists =====================
const stylistsRouter = Router();

stylistsRouter.get('/performance', authMiddleware, async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const yearStart = new Date(today.getFullYear(), 0, 1);

    const [{ data: employees }, { data: settlements }, { data: reviews }] = await Promise.all([
      supabase.from('employees').select('*').eq('shop_id', shopId).eq('role', 'STYLIST').eq('is_active', true),
      supabase.from('settlements').select('*').eq('shop_id', shopId),
      supabase.from('reviews').select('*').eq('shop_id', shopId),
    ]);

    const performances = (employees || []).map((emp: Record<string, unknown>) => {
      const stylistId = emp.id;

      const revenue = { today: 0, week: 0, month: 0, year: 0 };
      const services = { total: 0, byType: {} as Record<string, number> };

      (settlements || []).forEach((s: Record<string, unknown>) => {
        const createdAt = new Date(s.created_at as string);
        const isToday = createdAt >= today;
        const isWeek = createdAt >= weekStart;
        const isMonth = createdAt >= monthStart;
        const isYear = createdAt >= yearStart;

        ((s.items as Record<string, unknown>[]) || []).forEach((item: Record<string, unknown>) => {
          if (item.employeeId !== stylistId) return;
          const itemTotal = Number(item.total) || 0;
          const qty = Number(item.quantity) || 1;

          if (isToday) revenue.today += itemTotal;
          if (isWeek) revenue.week += itemTotal;
          if (isMonth) revenue.month += itemTotal;
          if (isYear) revenue.year += itemTotal;

          if (item.type === 'service') {
            services.total += qty;
            const name = (item.name || '其他') as string;
            services.byType[name] = (services.byType[name] || 0) + qty;
          }
        });
      });

      const stylistReviews = (reviews || []).filter((r: Record<string, unknown>) => r.stylist_id === stylistId);
      const avgRating =
        stylistReviews.length > 0
          ? stylistReviews.reduce((sum, r) => sum + (Number(r.rating) || 0), 0) / stylistReviews.length
          : 0;

      const estimatedCommission = Math.round(revenue.month * 0.15 * 100) / 100;

      return {
        stylistId,
        stylistName: emp.name,
        title: emp.title || '发型师',
        averageRating: Math.round(avgRating * 10) / 10,
        revenue: {
          today: Math.round(revenue.today * 100) / 100,
          week: Math.round(revenue.week * 100) / 100,
          month: Math.round(revenue.month * 100) / 100,
          year: Math.round(revenue.year * 100) / 100,
        },
        services: {
          total: services.total,
          byType: services.byType,
        },
        estimatedCommission,
      };
    });

    res.json({ success: true, data: performances });
  } catch (error) {
    console.error('[stylists] 获取业绩异常:', error);
    res.status(500).json({ success: false, error: '获取发型师业绩失败' });
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

referralsRouter.use(authMiddleware);

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

// 获取店铺推荐记录
referralsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;
    const { data, error } = await supabase
      .from('referral_records')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      // 表未创建或结构异常时不阻塞会员管理页面，返回空数组并记录日志
      console.error('[referrals] 查询推荐记录失败:', error.message);
      return res.json({ success: true, data: [] });
    }

    res.json({ success: true, data: (data || []).map(referralFromDb) });
  } catch (error) {
    console.error('[referrals] 获取推荐记录异常:', error);
    res.json({ success: true, data: [] });
  }
});

mainRouter.use('/referrals', referralsRouter);

// ===================== satisfaction surveys =====================
const surveysRouter = Router();

surveysRouter.use(authMiddleware);

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

refundsRouter.use(authMiddleware);

const refundFromDb = (r: Record<string, unknown>): unknown => ({
  id: r.id,
  shopId: r.shop_id,
  bookingId: r.booking_id,
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
    const shopId = req.employee!.shopId;
    const { bookingId, customerId, customerName, amount, reason } = req.body || {};

    if (!bookingId || !customerId || amount === undefined) {
      return res.status(400).json({ success: false, error: '缺少必要字段' });
    }

    const id = `refund_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const { data, error } = await supabase
      .from('refund_requests')
      .insert({
        id,
        shop_id: shopId,
        booking_id: bookingId,
        customer_id: customerId,
        customer_name: customerName || '顾客',
        amount: Number(amount),
        reason: reason || '',
        status: 'pending',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[refunds] 创建退款申请失败:', error.message);
      return res.status(500).json({ success: false, error: '创建退款申请失败' });
    }

    res.status(201).json({ success: true, data: refundFromDb(data) });
  } catch (error) {
    console.error('[refunds] 创建退款申请异常:', error);
    res.status(500).json({ success: false, error: '创建退款申请失败' });
  }
});

// 处理退款申请
refundsRouter.put('/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, rejectReason, refundMethod } = req.body || {};

    if (!status || !['approved', 'rejected', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, error: '无效的状态值' });
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
      .select()
      .single();

    if (error) {
      console.error('[refunds] 更新退款申请失败:', error.message);
      return res.status(500).json({ success: false, error: '更新退款申请失败' });
    }

    res.json({ success: true, data: refundFromDb(data) });
  } catch (error) {
    console.error('[refunds] 更新退款申请异常:', error);
    res.status(500).json({ success: false, error: '更新退款申请失败' });
  }
});

mainRouter.use('/refunds', refundsRouter);

// ===================== withdrawals =====================
const withdrawalsRouter = Router();

const withdrawalFromDb = (w: Record<string, unknown>): unknown => ({
  id: w.id,
  shopId: w.shop_id,
  customerId: w.customer_id,
  customerName: w.customer_name || '顾客',
  customerPhone: w.customer_phone || '',
  amount: Number(w.amount) || 0,
  channel: w.channel || 'wechat',
  status: w.status,
  rejectReason: w.reject_reason,
  paidAt: w.paid_at,
  paidBy: w.paid_by,
  transactionId: w.transaction_id,
  createdAt: w.created_at,
  updatedAt: w.updated_at,
});

// 获取店铺提现申请列表
withdrawalsRouter.get('/', authMiddleware, async (req: Request, res: Response) => {
  try {
    const shopId = req.employee!.shopId;
    if (!shopId) {
      return res.status(400).json({ success: false, error: '缺少店铺ID' });
    }

    const { data, error } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[withdrawals] 查询提现申请失败:', error.message, error.code, error.details);
      const isTableMissing = error.code === '42P01' || /withdrawal_requests/.test(error.message || '');
      return res.status(500).json({
        success: false,
        error: isTableMissing
          ? '提现申请表 withdrawal_requests 不存在，请先在 Supabase 执行 schema_complete.sql'
          : `查询提现申请失败: ${error.message}`,
      });
    }

    res.json({ success: true, data: (data || []).map(withdrawalFromDb) });
  } catch (error) {
    console.error('[withdrawals] 获取提现申请异常:', error);
    res.status(500).json({ success: false, error: '获取提现申请失败' });
  }
});

// 顾客创建提现申请（无需员工登录，但校验顾客身份）
withdrawalsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { shopId, customerId, customerName, customerPhone, amount, channel } = req.body || {};

    if (!shopId || !customerId || amount === undefined || amount <= 0) {
      return res.status(400).json({ success: false, error: '缺少必要字段或金额无效' });
    }

    // 校验顾客身份和可提现余额
    const { data: customer, error: custError } = await supabase
      .from('customers')
      .select('shop_id, withdrawable_referral_amount, name, phone')
      .eq('id', customerId)
      .eq('shop_id', shopId)
      .single();

    if (custError || !customer) {
      return res.status(404).json({ success: false, error: '客户不存在' });
    }

    if (Number(customer.withdrawable_referral_amount || 0) < Number(amount)) {
      return res.status(400).json({ success: false, error: '可提现余额不足' });
    }

    const id = `wd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // 如果是消费抵扣，直接扣减余额并标记为已完成
    if (channel === 'consume') {
      const { data, error } = await supabase
        .from('withdrawal_requests')
        .insert({
          id,
          shop_id: shopId,
          customer_id: customerId,
          customer_name: customerName || customer.name || '顾客',
          customer_phone: customerPhone || customer.phone || '',
          amount: Number(amount),
          channel: 'consume',
          status: 'paid',
          paid_at: new Date().toISOString(),
          paid_by: 'system',
          transaction_id: `consume_${Date.now()}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('[withdrawals] 创建抵扣记录失败:', error.message);
        return res.status(500).json({ success: false, error: '创建抵扣记录失败' });
      }

      // 扣减可提现余额
      const newWithdrawable = Math.round((Number(customer.withdrawable_referral_amount || 0) - Number(amount)) * 100) / 100;
      await supabase
        .from('customers')
        .update({ withdrawable_referral_amount: newWithdrawable })
        .eq('id', customerId)
        .eq('shop_id', shopId);

      return res.status(201).json({ success: true, data: withdrawalFromDb(data) });
    }

    // 微信提现：创建待审核记录，并冻结可提现余额
    const { data, error } = await supabase
      .from('withdrawal_requests')
      .insert({
        id,
        shop_id: shopId,
        customer_id: customerId,
        customer_name: customerName || customer.name || '顾客',
        customer_phone: customerPhone || customer.phone || '',
        amount: Number(amount),
        channel: 'wechat',
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('[withdrawals] 创建提现申请失败:', error.message);
      return res.status(500).json({ success: false, error: '创建提现申请失败' });
    }

    // 冻结可提现余额（与前端展示保持一致）
    const newWithdrawable = Math.round((Number(customer.withdrawable_referral_amount || 0) - Number(amount)) * 100) / 100;
    await supabase
      .from('customers')
      .update({ withdrawable_referral_amount: newWithdrawable })
      .eq('id', customerId)
      .eq('shop_id', shopId);

    res.status(201).json({ success: true, data: withdrawalFromDb(data) });
  } catch (error) {
    console.error('[withdrawals] 创建提现申请异常:', error);
    res.status(500).json({ success: false, error: '创建提现申请失败' });
  }
});

// 处理提现申请（审核/拒绝/标记已打款）
withdrawalsRouter.put('/:id/status', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, rejectReason } = req.body || {};

    if (!status || !['approved', 'rejected', 'paid'].includes(status)) {
      return res.status(400).json({ success: false, error: '无效的状态值' });
    }

    const { data: existing, error: findError } = await supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('id', id)
      .single();

    if (findError || !existing) {
      return res.status(404).json({ success: false, error: '提现申请不存在' });
    }

    if (existing.status !== 'pending' && existing.status !== 'approved') {
      return res.status(400).json({ success: false, error: '该提现申请已处理' });
    }

    const updatePayload: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'rejected' && rejectReason) {
      updatePayload.reject_reason = rejectReason;
    }
    if (status === 'paid') {
      updatePayload.paid_at = new Date().toISOString();
      updatePayload.paid_by = req.employee!.id;
    }

    const { data, error } = await supabase
      .from('withdrawal_requests')
      .update(updatePayload)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[withdrawals] 更新提现申请失败:', error.message);
      return res.status(500).json({ success: false, error: '更新提现申请失败' });
    }

    // 余额处理：微信提现在创建 pending 时已冻结余额
    // rejected：回退余额；paid：确认完成（不再二次扣减）；approved：无需操作
    if (existing.channel === 'wechat' && status === 'rejected') {
      const { data: customer } = await supabase
        .from('customers')
        .select('withdrawable_referral_amount')
        .eq('id', existing.customer_id)
        .eq('shop_id', existing.shop_id)
        .single();

      if (customer) {
        const current = Number(customer.withdrawable_referral_amount || 0);
        await supabase
          .from('customers')
          .update({ withdrawable_referral_amount: Math.round((current + Number(existing.amount)) * 100) / 100 })
          .eq('id', existing.customer_id)
          .eq('shop_id', existing.shop_id);
      }
    }

    res.json({ success: true, data: withdrawalFromDb(data) });
  } catch (error) {
    console.error('[withdrawals] 处理提现申请异常:', error);
    res.status(500).json({ success: false, error: '处理提现申请失败' });
  }
});

mainRouter.use('/withdrawals', withdrawalsRouter);

// ===================== owner dashboard =====================
const ownerRouter = Router();

ownerRouter.use(authMiddleware);

ownerRouter.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const employee = req.employee!;
    if (!['ceo', 'shop_owner'].includes(employee.role)) {
      return res.status(403).json({ success: false, error: '无权访问老板视图' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const yearStart = new Date(today.getFullYear(), 0, 1);

    const [{ data: shops }, { data: settlements }, { data: bookings }, { data: reviews }] = await Promise.all([
      supabase.from('shops').select('*').eq('is_active', true),
      supabase.from('settlements').select('*'),
      supabase.from('bookings').select('*'),
      supabase.from('reviews').select('*'),
    ]);

    const totalRevenue = { today: 0, week: 0, month: 0, year: 0 };
    const totalServices = { today: 0, week: 0, month: 0, year: 0 };
    const totalCustomers = { today: 0, week: 0, month: 0, year: 0 };

    const shopStatsMap: Record<
      string,
      { shopName: string; revenue: number; services: number; customers: Set<string>; employees: number }
    > = {};

    (shops || []).forEach((s: Record<string, unknown>) => {
      shopStatsMap[s.id as string] = {
        shopName: s.name as string,
        revenue: 0,
        services: 0,
        customers: new Set(),
        employees: ((s.employees as Record<string, unknown>[]) || []).filter((e: Record<string, unknown>) => e.is_active !== false).length,
      };
    });

    const customerPeriodSet = { today: new Set<string>(), week: new Set<string>(), month: new Set<string>(), year: new Set<string>() };

    (settlements || []).forEach((s: Record<string, unknown>) => {
      const createdAt = new Date(s.created_at as string);
      const isToday = createdAt >= today;
      const isWeek = createdAt >= weekStart;
      const isMonth = createdAt >= monthStart;
      const isYear = createdAt >= yearStart;
      const total = Number(s.total) || 0;
      const shopId = s.shop_id as string;

      if (isToday) totalRevenue.today += total;
      if (isWeek) totalRevenue.week += total;
      if (isMonth) totalRevenue.month += total;
      if (isYear) totalRevenue.year += total;

      if (shopStatsMap[shopId]) {
        if (isMonth) shopStatsMap[shopId].revenue += total;
      }

      ((s.items as Record<string, unknown>[]) || []).forEach((item: Record<string, unknown>) => {
        const qty = Number(item.quantity) || 1;
        if (isMonth && (item.type === 'service' || item.type === undefined)) {
          totalServices.month += qty;
          if (shopStatsMap[shopId]) shopStatsMap[shopId].services += qty;
        }
        if (isYear && (item.type === 'service' || item.type === undefined)) {
          totalServices.year += qty;
        }
        if (isWeek && (item.type === 'service' || item.type === undefined)) {
          totalServices.week += qty;
        }
        if (isToday && (item.type === 'service' || item.type === undefined)) {
          totalServices.today += qty;
        }
      });
    });

    (bookings || []).forEach((b: Record<string, unknown>) => {
      const scheduledAt = new Date(b.scheduled_time as string);
      const customerId = b.customer_id as string;
      if (!customerId) return;
      if (scheduledAt >= today) customerPeriodSet.today.add(customerId);
      if (scheduledAt >= weekStart) customerPeriodSet.week.add(customerId);
      if (scheduledAt >= monthStart) {
        customerPeriodSet.month.add(customerId);
        if (shopStatsMap[b.shop_id as string]) shopStatsMap[b.shop_id as string].customers.add(customerId);
      }
      if (scheduledAt >= yearStart) customerPeriodSet.year.add(customerId);
    });

    totalCustomers.today = customerPeriodSet.today.size;
    totalCustomers.week = customerPeriodSet.week.size;
    totalCustomers.month = customerPeriodSet.month.size;
    totalCustomers.year = customerPeriodSet.year.size;

    const stylistMap: Record<
      string,
      { name: string; shopId: string; shopName: string; revenue: number; services: number; ratingSum: number; ratingCount: number }
    > = {};

    (settlements || []).forEach((s: Record<string, unknown>) => {
      const createdAt = new Date(s.created_at as string);
      if (createdAt < monthStart) return;
      ((s.items as Record<string, unknown>[]) || []).forEach((item: Record<string, unknown>) => {
        const empId = (item.employee_id || item.employeeId) as string;
        const empName = (item.employee_name || item.employeeName || '发型师') as string;
        const shopId = s.shop_id as string;
        if (!empId) return;
        if (!stylistMap[empId]) {
          stylistMap[empId] = {
            name: empName,
            shopId,
            shopName: shopStatsMap[shopId]?.shopName || '店铺',
            revenue: 0,
            services: 0,
            ratingSum: 0,
            ratingCount: 0,
          };
        }
        stylistMap[empId].revenue += Number(item.total) || 0;
        if (item.type === 'service' || item.type === undefined) {
          stylistMap[empId].services += Number(item.quantity) || 1;
        }
      });
    });

    (reviews || []).forEach((r: Record<string, unknown>) => {
      const stylistId = r.stylist_id as string;
      if (stylistId && stylistMap[stylistId]) {
        stylistMap[stylistId].ratingSum += Number(r.overall_score || r.rating || 0);
        stylistMap[stylistId].ratingCount += 1;
      }
    });

    const topStylists = Object.entries(stylistMap)
      .map(([id, info]) => ({
        id,
        name: info.name,
        shopId: info.shopId,
        shopName: info.shopName,
        revenue: Math.round(info.revenue * 100) / 100,
        services: info.services,
        rating: info.ratingCount > 0 ? Math.round((info.ratingSum / info.ratingCount) * 10) / 10 : 5,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    res.json({
      success: true,
      data: {
        totalRevenue: {
          today: Math.round(totalRevenue.today * 100) / 100,
          week: Math.round(totalRevenue.week * 100) / 100,
          month: Math.round(totalRevenue.month * 100) / 100,
          year: Math.round(totalRevenue.year * 100) / 100,
        },
        totalServices,
        totalCustomers,
        shopStats: Object.entries(shopStatsMap).map(([shopId, info]) => ({
          shopId,
          shopName: info.shopName,
          revenue: Math.round(info.revenue * 100) / 100,
          services: info.services,
          customers: info.customers.size,
          employees: info.employees,
        })),
        topStylists,
      },
    });
  } catch (error) {
    console.error('[owner] 获取老板视图异常:', error);
    res.status(500).json({ success: false, error: '获取老板视图失败' });
  }
});

mainRouter.use('/owner', ownerRouter);

export default mainRouter;
