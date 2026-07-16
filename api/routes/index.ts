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
  } catch (err: unknown) {
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
  } catch (err: unknown) {
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

const bookingFromDb = (b: unknown): unknown => ({
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
        const services = shopData.services as unknown[];
        const svc = services.find((s: unknown) => s.id === serviceId);
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
        acc[p.customer_id] = toCamelCase(p);
        return acc;
      }, {} as Record<string, unknown>);

      visitsMap = (visits || []).reduce((acc, v) => {
        const camel = toCamelCase(v);
        if (!acc[camel.customerId]) acc[camel.customerId] = [];
        acc[camel.customerId].push(camel);
        return acc;
      }, {} as Record<string, unknown[]>);
    }

    const enriched = customers.map((c) => ({
      ...c,
      profile: profilesMap[c.id] || null,
      visitRecords: visitsMap[c.id] || [],
    }));

    res.json({ success: true, data: enriched });
  } catch (err: unknown) {
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
  } catch (err: unknown) {
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
  } catch (err: unknown) {
    console.error('[customers] 更新客户异常:', err.message);
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

    const updatePayload: unknown = {};
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
    let storedValueTx: unknown = null;
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
    console.error('[customers] 更新会员状态异常:', err.message);
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
  } catch (err: unknown) {
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
  } catch (err: unknown) {
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
      const services = data.services as unknown[];
      const svc = services.find((s: unknown) => s.id === serviceId);
      if (svc && typeof svc.duration === 'number' && svc.duration > 0) {
        return svc.duration;
      }
    }
  } catch (_e) {
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
      (bookings || []).map(async (b: unknown) => {
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
        (b: unknown) => getQueueTimeSlotStart(new Date(b.scheduled_time)).getTime() === currentSlotStart.getTime(),
      );
      const maxCompleted =
        completedInCurrentSlot.length > 0
          ? Math.max(...completedInCurrentSlot.map((b: unknown) => b.queue_number || 0))
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
      (bookings || []).map(async (b: unknown) => {
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

const reviewFromDb = (r: unknown): unknown => ({
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

    const scores = (reviewStats || []).map((r: unknown) => Number(r.overall_score)).filter((s: number) => !isNaN(s));
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

const shopFromDb = (s: unknown): unknown => ({
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
  products: s.products || [],
  openingHours: s.opening_hours || {},
  employees: s.employees || [],
  bookingConfirmMode: s.booking_confirm_mode || 'auto',
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
        employees: (employees || []).map((e: unknown) => ({
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

    const updatePayload: unknown = {
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

// 商品管理（店铺 products JSONB 字段）
shopsRouter.get('/:id/products', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { data, error } = await supabase.from('shops').select('products').eq('id', id).single();
    if (error) {
      console.error('[shops] 查询商品失败:', error.message);
      return res.status(500).json({ success: false, error: '查询商品失败' });
    }
    res.json({ success: true, data: data?.products || [] });
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

    const { data: shop, error: fetchError } = await supabase.from('shops').select('products').eq('id', id).single();
    if (fetchError) {
      console.error('[shops] 查询店铺商品失败:', fetchError.message);
      return res.status(500).json({ success: false, error: '查询店铺失败' });
    }

    const newProduct = {
      ...product,
      id: product.id || `prod_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      shopId: id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const products = [...(shop?.products || []), newProduct];

    const { error: updateError } = await supabase.from('shops').update({ products, updated_at: new Date().toISOString() }).eq('id', id);
    if (updateError) {
      console.error('[shops] 添加商品失败:', updateError.message);
      return res.status(500).json({ success: false, error: '添加商品失败' });
    }

    res.status(201).json({ success: true, data: newProduct });
  } catch (error) {
    console.error('[shops] 添加商品异常:', error);
    res.status(500).json({ success: false, error: '添加商品失败' });
  }
});

shopsRouter.put('/:id/products/:productId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id, productId } = req.params;
    const updates = req.body || {};

    const { data: shop, error: fetchError } = await supabase.from('shops').select('products').eq('id', id).single();
    if (fetchError) {
      console.error('[shops] 查询店铺商品失败:', fetchError.message);
      return res.status(500).json({ success: false, error: '查询店铺失败' });
    }

    const products = (shop?.products || []).map((p: unknown) =>
      p.id === productId ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
    );

    const { error: updateError } = await supabase.from('shops').update({ products, updated_at: new Date().toISOString() }).eq('id', id);
    if (updateError) {
      console.error('[shops] 更新商品失败:', updateError.message);
      return res.status(500).json({ success: false, error: '更新商品失败' });
    }

    const updated = products.find((p: unknown) => p.id === productId);
    res.json({ success: true, data: updated });
  } catch (error) {
    console.error('[shops] 更新商品异常:', error);
    res.status(500).json({ success: false, error: '更新商品失败' });
  }
});

shopsRouter.delete('/:id/products/:productId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { id, productId } = req.params;
    const { data: shop, error: fetchError } = await supabase.from('shops').select('products').eq('id', id).single();
    if (fetchError) {
      console.error('[shops] 查询店铺商品失败:', fetchError.message);
      return res.status(500).json({ success: false, error: '查询店铺失败' });
    }

    const products = (shop?.products || []).filter((p: unknown) => p.id !== productId);
    const { error: updateError } = await supabase.from('shops').update({ products, updated_at: new Date().toISOString() }).eq('id', id);
    if (updateError) {
      console.error('[shops] 删除商品失败:', updateError.message);
      return res.status(500).json({ success: false, error: '删除商品失败' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[shops] 删除商品异常:', error);
    res.status(500).json({ success: false, error: '删除商品失败' });
  }
});

mainRouter.use('/shops', shopsRouter);

// ===================== settlements =====================
const settlementsRouter = Router();

const settlementFromDb = (s: unknown): unknown => ({
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
      const updatePayload: unknown = {
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
      service_ids: items.filter((i: unknown) => i.type === 'service').map((i: unknown) => i.id),
      service_names: items.filter((i: unknown) => i.type === 'service').map((i: unknown) => i.name),
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
    const settlementIds = (settlements || []).map((s: unknown) => s.id).filter(Boolean) as string[];
    const { data: itemsData } = await supabase
      .from('settlement_items')
      .select('*')
      .in('settlement_id', settlementIds.length > 0 ? settlementIds : ['__none__']);
    const itemsBySettlement = new Map<string, unknown[]>();
    (itemsData || []).forEach((item: unknown) => {
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

    (settlements || []).forEach((s: unknown) => {
      const createdAt = new Date(s.created_at);
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

      (itemsBySettlement.get(s.id) || []).forEach((item: unknown) => {
        const itemTotal = Number(item.total) || 0;
        const qty = Number(item.quantity) || 1;
        const empId = item.employee_id || item.employeeId;
        const empName = item.employee_name || item.employeeName || '发型师';

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
    (reviews || []).forEach((r: unknown) => {
      if (r.stylist_id && stylistMap[r.stylist_id]) {
        stylistMap[r.stylist_id].ratingSum += Number(r.overall_score || r.rating || 0);
        stylistMap[r.stylist_id].ratingCount += 1;
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

    const performances = (employees || []).map((emp: unknown) => {
      const stylistId = emp.id;

      const revenue = { today: 0, week: 0, month: 0, year: 0 };
      const services = { total: 0, byType: {} as Record<string, number> };

      (settlements || []).forEach((s: unknown) => {
        const createdAt = new Date(s.created_at);
        const isToday = createdAt >= today;
        const isWeek = createdAt >= weekStart;
        const isMonth = createdAt >= monthStart;
        const isYear = createdAt >= yearStart;

        (s.items || []).forEach((item: unknown) => {
          if (item.employeeId !== stylistId) return;
          const itemTotal = Number(item.total) || 0;
          const qty = Number(item.quantity) || 1;

          if (isToday) revenue.today += itemTotal;
          if (isWeek) revenue.week += itemTotal;
          if (isMonth) revenue.month += itemTotal;
          if (isYear) revenue.year += itemTotal;

          if (item.type === 'service') {
            services.total += qty;
            const name = item.name || '其他';
            services.byType[name] = (services.byType[name] || 0) + qty;
          }
        });
      });

      const stylistReviews = (reviews || []).filter((r: unknown) => r.stylist_id === stylistId);
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

const benefitFromDb = (b: unknown): unknown => ({
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

const referralFromDb = (r: unknown): unknown => ({
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

const surveyFromDb = (s: unknown): unknown => ({
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

const refundFromDb = (r: unknown): unknown => ({
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

    const updatePayload: unknown = { status };
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

    (shops || []).forEach((s: unknown) => {
      shopStatsMap[s.id] = {
        shopName: s.name,
        revenue: 0,
        services: 0,
        customers: new Set(),
        employees: (s.employees || []).filter((e: unknown) => e.is_active !== false).length,
      };
    });

    const customerPeriodSet = { today: new Set<string>(), week: new Set<string>(), month: new Set<string>(), year: new Set<string>() };

    (settlements || []).forEach((s: unknown) => {
      const createdAt = new Date(s.created_at);
      const isToday = createdAt >= today;
      const isWeek = createdAt >= weekStart;
      const isMonth = createdAt >= monthStart;
      const isYear = createdAt >= yearStart;
      const total = Number(s.total) || 0;
      const shopId = s.shop_id;

      if (isToday) totalRevenue.today += total;
      if (isWeek) totalRevenue.week += total;
      if (isMonth) totalRevenue.month += total;
      if (isYear) totalRevenue.year += total;

      if (shopStatsMap[shopId]) {
        if (isMonth) shopStatsMap[shopId].revenue += total;
      }

      (s.items || []).forEach((item: unknown) => {
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

    (bookings || []).forEach((b: unknown) => {
      const scheduledAt = new Date(b.scheduled_time);
      const customerId = b.customer_id;
      if (!customerId) return;
      if (scheduledAt >= today) customerPeriodSet.today.add(customerId);
      if (scheduledAt >= weekStart) customerPeriodSet.week.add(customerId);
      if (scheduledAt >= monthStart) {
        customerPeriodSet.month.add(customerId);
        if (shopStatsMap[b.shop_id]) shopStatsMap[b.shop_id].customers.add(customerId);
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

    (settlements || []).forEach((s: unknown) => {
      const createdAt = new Date(s.created_at);
      if (createdAt < monthStart) return;
      (s.items || []).forEach((item: unknown) => {
        const empId = item.employee_id || item.employeeId;
        const empName = item.employee_name || item.employeeName || '发型师';
        if (!empId) return;
        if (!stylistMap[empId]) {
          stylistMap[empId] = {
            name: empName,
            shopId: s.shop_id,
            shopName: shopStatsMap[s.shop_id]?.shopName || '店铺',
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

    (reviews || []).forEach((r: unknown) => {
      if (r.stylist_id && stylistMap[r.stylist_id]) {
        stylistMap[r.stylist_id].ratingSum += Number(r.overall_score || r.rating || 0);
        stylistMap[r.stylist_id].ratingCount += 1;
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
