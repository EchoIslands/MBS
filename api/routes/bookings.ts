import { Router, Request, Response } from 'express';
import { supabase } from '../db/index.js';

const router = Router();

const generateId = () => `book_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

// 时段长度（分钟），用于排队号分组
const TIME_SLOT_MINUTES = 30;

// 获取预约时间所在时段的起始时间
const getTimeSlotStart = (date: Date, slotMinutes: number = TIME_SLOT_MINUTES) => {
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
router.get('/', async (req: Request, res: Response) => {
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
router.get('/customer/:customerId', async (req: Request, res: Response) => {
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
router.get('/:id', async (req: Request, res: Response) => {
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
router.put('/:id', async (req: Request, res: Response) => {
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
router.post('/', async (req: Request, res: Response) => {
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

    // 自动补全服务信息：查 shops 表获取服务名称和价格
    let finalServiceName = serviceName;
    let finalPrice = price;
    if (!finalServiceName || finalServiceName === '服务' || !finalPrice) {
      const { data: shopData } = await supabase
        .from('shops')
        .select('services')
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

    const slotStart = getTimeSlotStart(scheduledTimeDate);
    const slotEnd = new Date(slotStart);
    slotEnd.setMinutes(slotEnd.getMinutes() + TIME_SLOT_MINUTES);

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
      id: generateId(),
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
      status: 'confirmed',
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

export default router;
