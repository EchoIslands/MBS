import { Router, Request, Response } from 'express';
import { mockCustomers } from '../_internal/mockData.js';
import { Customer, CustomerTag, MembershipLevel, CustomerProfile } from '../_internal/types.js';

const router = Router();

const generateId = () => Math.random().toString(36).substr(2, 9);

// 获取客户列表
router.get('/', (req: Request, res: Response) => {
  const { search, tag, level, page = '1', pageSize = '20', shopId } = req.query;

  let result = [...mockCustomers];

  // 搜索筛选（姓名或电话）
  if (search && typeof search === 'string') {
    const keyword = search.toLowerCase();
    result = result.filter(
      (c) =>
        c.name.toLowerCase().includes(keyword) ||
        c.phone.includes(keyword)
    );
  }

  // 标签筛选
  if (tag && typeof tag === 'string' && tag !== 'all') {
    result = result.filter((c) => c.tags.includes(tag as CustomerTag));
  }

  // 会员等级筛选
  if (level && typeof level === 'string' && level !== 'all') {
    result = result.filter((c) => c.membershipLevel === level);
  }

  // 店铺筛选（发型师角色：只看服务过的客户）
  if (shopId && typeof shopId === 'string') {
    result = result.filter((c) => c.servedByStylistIds?.includes(shopId));
  }

  // 计算距离上次到店天数
  result = result.map((c) => ({
    ...c,
    daysSinceLastVisit: c.lastVisitAt
      ? Math.floor((Date.now() - new Date(c.lastVisitAt).getTime()) / 86400000)
      : undefined,
  }));

  // 分页
  const pageNum = parseInt(page as string, 10);
  const pageSizeNum = parseInt(pageSize as string, 10);
  const total = result.length;
  const start = (pageNum - 1) * pageSizeNum;
  const end = start + pageSizeNum;
  const paginatedResult = result.slice(start, end);

  res.json({
    success: true,
    data: paginatedResult,
    pagination: {
      page: pageNum,
      pageSize: pageSizeNum,
      total,
      totalPages: Math.ceil(total / pageSizeNum),
    },
  });
});

// 获取单个客户详情
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const customer = mockCustomers.find((c) => c.id === id);

  if (!customer) {
    return res.status(404).json({ success: false, error: '客户不存在' });
  }

  // 计算距离上次到店天数
  const customerWithDays = {
    ...customer,
    daysSinceLastVisit: customer.lastVisitAt
      ? Math.floor((Date.now() - new Date(customer.lastVisitAt).getTime()) / 86400000)
      : undefined,
  };

  res.json({ success: true, data: customerWithDays });
});

// 创建新客户
router.post('/', (req: Request, res: Response) => {
  const {
    name,
    phone,
    gender,
    age,
    birthday,
    tags = [],
    membershipLevel = MembershipLevel.REGULAR,
    source,
    shopId,
  } = req.body;

  // 验证必填字段
  if (!name || !phone) {
    return res.status(400).json({ success: false, error: '姓名和电话为必填项' });
  }

  // 检查手机号是否已存在
  const existing = mockCustomers.find((c) => c.phone === phone);
  if (existing) {
    return res.status(400).json({ success: false, error: '该手机号已注册' });
  }

  const newCustomer: Customer = {
    id: generateId(),
    name,
    phone,
    gender,
    age,
    tags: tags || [],
    visitCount: 0,
    totalSpent: 0,
    membershipLevel: membershipLevel || MembershipLevel.REGULAR,
    balance: 0,
    points: 0,
    joinedAt: new Date(),
    birthday,
    preferences: [],
    isStockholder: false,
    source,
    servedByStylistIds: shopId ? [shopId] : [],
    daysSinceLastVisit: undefined,
    churnRisk: 'low',
  };

  // 添加到 mockCustomers（实际项目中应该写入数据库）
  (mockCustomers as any[]).push(newCustomer);

  res.status(201).json({ success: true, data: newCustomer });
});

// 更新客户信息
router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = mockCustomers.findIndex((c) => c.id === id);

  if (index === -1) {
    return res.status(404).json({ success: false, error: '客户不存在' });
  }

  const {
    name,
    phone,
    gender,
    age,
    birthday,
    tags,
    membershipLevel,
    balance,
    points,
    isStockholder,
    stockholderSince,
    referralBonusRate,
    referralEarnings,
    source,
    preferences,
  } = req.body;

  const existing = mockCustomers[index];

  // 如果更新手机号，检查是否与其他客户冲突
  if (phone && phone !== existing.phone) {
    const phoneExists = mockCustomers.find((c) => c.phone === phone && c.id !== id);
    if (phoneExists) {
      return res.status(400).json({ success: false, error: '该手机号已被其他客户使用' });
    }
  }

  const updated: Customer = {
    ...existing,
    ...(name && { name }),
    ...(phone && { phone }),
    ...(gender && { gender }),
    ...(age !== undefined && { age }),
    ...(birthday && { birthday }),
    ...(tags && { tags }),
    ...(membershipLevel && { membershipLevel }),
    ...(balance !== undefined && { balance }),
    ...(points !== undefined && { points }),
    ...(isStockholder !== undefined && { isStockholder }),
    ...(stockholderSince && { stockholderSince }),
    ...(referralBonusRate !== undefined && { referralBonusRate }),
    ...(referralEarnings !== undefined && { referralEarnings }),
    ...(source && { source }),
    ...(preferences && { preferences }),
  };

  mockCustomers[index] = updated;

  res.json({ success: true, data: updated });
});

// 删除客户
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = mockCustomers.findIndex((c) => c.id === id);

  if (index === -1) {
    return res.status(404).json({ success: false, error: '客户不存在' });
  }

  (mockCustomers as any[]).splice(index, 1);

  res.json({ success: true, message: '客户已删除' });
});

// ==================== 客户画像 API ====================

// 获取客户画像
router.get('/:customerId/profile', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const customer = mockCustomers.find((c) => c.id === customerId);

  if (!customer) {
    return res.status(404).json({ success: false, error: '客户不存在' });
  }

  res.json({
    success: true,
    data: customer.profile || null,
  });
});

// 创建客户画像
router.post('/:customerId/profile', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const customer = mockCustomers.find((c) => c.id === customerId);

  if (!customer) {
    return res.status(404).json({ success: false, error: '客户不存在' });
  }

  if (customer.profile) {
    return res.status(400).json({ success: false, error: '该客户已有画像，请使用更新接口' });
  }

  const {
    updatedBy,
    updatedByName,
    haircutStyles = [],
    hairColors = [],
    permColors = [],
    treatments = [],
    hairType,
    hairLength,
    visitFrequency,
    budgetRange,
    communicationStyle,
    extraServices = [],
    visitTimes = [],
    notes = '',
    allergies = '无',
    productsUsed = [],
  } = req.body;

  const profile: CustomerProfile = {
    id: generateId(),
    customerId,
    updatedBy: updatedBy || '',
    updatedByName: updatedByName || '技师',
    updatedAt: new Date(),
    haircutStyles,
    hairColors,
    permColors,
    treatments,
    hairType,
    hairLength,
    visitFrequency,
    budgetRange,
    communicationStyle,
    extraServices,
    visitTimes,
    notes,
    allergies,
    productsUsed,
    createdAt: new Date(),
  };

  customer.profile = profile;

  res.status(201).json({ success: true, data: profile });
});

// 更新客户画像
router.put('/:customerId/profile', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const customer = mockCustomers.find((c) => c.id === customerId);

  if (!customer) {
    return res.status(404).json({ success: false, error: '客户不存在' });
  }

  const existing = customer.profile;
  const now = new Date();

  const {
    updatedBy,
    updatedByName,
    haircutStyles,
    hairColors,
    permColors,
    treatments,
    hairType,
    hairLength,
    visitFrequency,
    budgetRange,
    communicationStyle,
    extraServices,
    visitTimes,
    notes,
    allergies,
    productsUsed,
  } = req.body;

  const updated: CustomerProfile = {
    id: existing?.id || generateId(),
    customerId,
    updatedBy: updatedBy || existing?.updatedBy || '',
    updatedByName: updatedByName || existing?.updatedByName || '技师',
    updatedAt: now,
    haircutStyles: haircutStyles !== undefined ? haircutStyles : existing?.haircutStyles || [],
    hairColors: hairColors !== undefined ? hairColors : existing?.hairColors || [],
    permColors: permColors !== undefined ? permColors : existing?.permColors || [],
    treatments: treatments !== undefined ? treatments : existing?.treatments || [],
    hairType: hairType || existing?.hairType,
    hairLength: hairLength || existing?.hairLength,
    visitFrequency: visitFrequency || existing?.visitFrequency,
    budgetRange: budgetRange || existing?.budgetRange,
    communicationStyle: communicationStyle || existing?.communicationStyle,
    extraServices: extraServices !== undefined ? extraServices : existing?.extraServices || [],
    visitTimes: visitTimes !== undefined ? visitTimes : existing?.visitTimes || [],
    notes: notes !== undefined ? notes : existing?.notes || '',
    allergies: allergies !== undefined ? allergies : existing?.allergies || '无',
    productsUsed: productsUsed !== undefined ? productsUsed : existing?.productsUsed || [],
    createdAt: existing?.createdAt || now,
  };

  customer.profile = updated;

  res.json({ success: true, data: updated });
});

export default router;
