import { Router, Request, Response } from 'express';
import { supabase } from '../db/index.js';

const router = Router();

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
  createdAt: s.created_at,
});

// 获取店铺列表
router.get('/', async (_req: Request, res: Response) => {
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
router.get('/:id', async (req: Request, res: Response) => {
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
router.put('/:id', async (req: Request, res: Response) => {
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
      return res.status(500).json({ success: false, error: '更新店铺失败' });
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

export default router;
