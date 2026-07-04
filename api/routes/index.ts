import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { supabase } from '../db/index.js';
import { authMiddleware, AuthEmployee } from '../middleware/index.js';
import { toCamelCase, toCamelCaseList, toSnakeCase } from '../utils/case.js';
import { mapCustomerBodyToDB, validateCustomerData } from '../utils/customerMapper.js';

const mainRouter = Router();

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
  } catch (err: any) {
    console.error('[auth] 登录异常:', err.message);
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
  } catch (err: any) {
    console.error('[auth] 获取当前用户异常:', err.message);
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

// ===================== bookings =====================
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

const bookingFromDb = (b: any): any => ({
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
    const dateStart = req.query.dateStart as string | undefined;
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
    console.error('[bookings] 获取预约列表失败:', error);
    res.status(500).json({
      success: false,
      error: '获取预约列表失败',
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

// 更新预约状态
bookingsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

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
    } catch (e) {
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
        const services = shopData.services as any[];
        const svc = services.find((s: any) => s.id === serviceId);
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
    let profilesMap: Record<string, any> = {};
    let visitsMap: Record<string, any[]> = {};

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
        acc[p.customer_id] = toCamelCase(p);
        return acc;
      }, {} as Record<string, any>);

      visitsMap = (visits || []).reduce((acc, v) => {
        const camel = toCamelCase(v);
        if (!acc[camel.customerId]) acc[camel.customerId] = [];
        acc[camel.customerId].push(camel);
        return acc;
      }, {} as Record<string, any[]>);
    }

    const enriched = customers.map((c) => ({
      ...c,
      profile: profilesMap[c.id] || null,
      visitRecords: visitsMap[c.id] || [],
    }));

    res.json({ success: true, data: enriched });
  } catch (err: any) {
    console.error('[customers] 获取客户列表异常:', err.message);
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
  } catch (err: any) {
    console.error('[customers] 创建客户异常:', err.message);
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
  } catch (err: any) {
    console.error('[customers] 更新客户异常:', err.message);
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
  } catch (err: any) {
    console.error('[customers] 删除客户异常:', err.message);
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
  } catch (err: any) {
    console.error('[customers] 获取客户详情异常:', err.message);
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
  } catch (err: any) {
    console.error('[customers] 获取客户画像异常:', err.message);
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
    const insertData: Record<string, any> = {
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
  } catch (err: any) {
    console.error('[customers] 创建客户画像异常:', err.message);
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
    const upsertData: Record<string, any> = { customer_id: id };

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
  } catch (err: any) {
    console.error('[customers] 更新客户画像异常:', err.message);
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
      const services = data.services as any[];
      const svc = services.find((s: any) => s.id === serviceId);
      if (svc && typeof svc.duration === 'number' && svc.duration > 0) {
        return svc.duration;
      }
    }
  } catch (e) {
    console.error('[queues] 查询服务时长失败:', e);
  }
  return DEFAULT_QUEUE_SERVICE_MINUTES;
};

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
      (bookings || []).map(async (b: any) => {
        const duration = await getQueueServiceDuration(shopId, b.service_id);
        return {
          id: b.id,
          shopId: b.shop_id,
          customerId: b.customer_id,
          customerName: b.customer_name,
          stylistId: b.stylist_id,
          stylistName: b.stylist_name,
          serviceId: b.service_id,
          serviceName: b.service_name,
          scheduledTime: b.scheduled_time,
          queueNumber: b.queue_number || 1,
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
        (b: any) => getQueueTimeSlotStart(new Date(b.scheduled_time)).getTime() === currentSlotStart.getTime(),
      );
      const maxCompleted =
        completedInCurrentSlot.length > 0
          ? Math.max(...completedInCurrentSlot.map((b: any) => b.queue_number || 0))
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
      (bookings || []).map(async (b: any) => {
        const duration = await getQueueServiceDuration(shopId, b.service_id);
        return {
          id: b.id,
          queueNumber: b.queue_number || 1,
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

const reviewFromDb = (r: any): any => ({
  id: r.id,
  shopId: r.shop_id,
  customerId: r.customer_id,
  bookingId: r.booking_id,
  stylistId: r.stylist_id,
  serviceScore: r.service_score,
  priceScore: r.price_score,
  skillScore: r.skill_score,
  overallScore: r.overall_score,
  comment: r.comment || '',
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
      priceScore,
      skillScore,
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
      Math.round(((Number(serviceScore || 5) + Number(priceScore || 5) + Number(skillScore || 5)) / 3) * 10) / 10;

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
        stylist_id: stylistId || null,
        service_score: Number(serviceScore || 5),
        price_score: Number(priceScore || 5),
        skill_score: Number(skillScore || 5),
        overall_score: overallScore,
        comment: comment || '',
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

    const scores = (reviewStats || []).map((r: any) => Number(r.overall_score)).filter((s: number) => !isNaN(s));
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

const shopFromDb = (s: any): any => ({
  id: s.id,
  name: s.name,
  description: s.description || '',
  address: s.address || '',
  phone: s.phone || '',
  latitude: s.latitude || 0,
  longitude: s.longitude || 0,
  level: s.level || 'good',
  isActive: s.is_active !== false,
  avatar: s.avatar || '',
  images: s.images || [],
  services: s.services || [],
  bookingConfirmMode: s.booking_confirm_mode || 'auto',
  rating: s.rating || 5,
  reviewCount: s.review_count || 0,
  createdAt: s.created_at,
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
        employees: (employees || []).map((e: any) => ({
          id: e.id,
          name: e.name,
          phone: e.phone,
          avatar: e.avatar,
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
      isActive,
    } = req.body || {};

    const updatePayload: any = {
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

mainRouter.use('/shops', shopsRouter);

// ===================== settlements =====================
const settlementsRouter = Router();

const settlementFromDb = (s: any): any => ({
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
      .select('visit_count, total_spent, stored_value_balance, withdrawable_referral_amount')
      .eq('id', customerId)
      .eq('shop_id', shopId)
      .single();

    if (customer) {
      const newVisitCount = (customer.visit_count || 0) + 1;
      const newTotalSpent = Number(customer.total_spent || 0) + Number(total || 0);
      const updatePayload: any = {
        visit_count: newVisitCount,
        total_spent: newTotalSpent,
        last_visit_at: new Date().toISOString(),
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
        .from('member_benefits')
        .update({
          status: 'used',
          used_at: new Date().toISOString(),
          used_by: req.employee!.id,
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
      service_ids: items.filter((i: any) => i.type === 'service').map((i: any) => i.id),
      service_names: items.filter((i: any) => i.type === 'service').map((i: any) => i.name),
      total_amount: total || 0,
      check_in_time: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    await supabase.from('customer_visit_records').insert(visitRecord);

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

// ===================== member_benefits =====================
const memberBenefitsRouter = Router();

const benefitFromDb = (b: any): any => ({
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
      .from('member_benefits')
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

export default mainRouter;
