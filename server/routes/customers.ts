import { Router, Request, Response } from 'express';
import { mockCustomers } from '../_internal/mockData.js';
import { Customer, CustomerTag, MembershipLevel, CustomerProfile } from '../_internal/types.js';

const router = Router();

const generateId = () => Math.random().toString(36).substr(2, 9);

// 鑾峰彇瀹㈡埛鍒楄〃
router.get('/', (req: Request, res: Response) => {
  const { search, tag, level, page = '1', pageSize = '20', shopId } = req.query;

  let result = [...mockCustomers];

  // 鎼滅储绛涢€夛紙濮撳悕鎴栫數璇濓級
  if (search && typeof search === 'string') {
    const keyword = search.toLowerCase();
    result = result.filter(
      (c) =>
        c.name.toLowerCase().includes(keyword) ||
        c.phone.includes(keyword)
    );
  }

  // 鏍囩绛涢€?  if (tag && typeof tag === 'string' && tag !== 'all') {
    result = result.filter((c) => c.tags.includes(tag as CustomerTag));
  }

  // 浼氬憳绛夌骇绛涢€?  if (level && typeof level === 'string' && level !== 'all') {
    result = result.filter((c) => c.membershipLevel === level);
  }

  // 搴楅摵绛涢€夛紙鍙戝瀷甯堣鑹诧細鍙湅鏈嶅姟杩囩殑瀹㈡埛锛?  if (shopId && typeof shopId === 'string') {
    result = result.filter((c) => c.servedByStylistIds?.includes(shopId));
  }

  // 璁＄畻璺濈涓婃鍒板簵澶╂暟
  result = result.map((c) => ({
    ...c,
    daysSinceLastVisit: c.lastVisitAt
      ? Math.floor((Date.now() - new Date(c.lastVisitAt).getTime()) / 86400000)
      : undefined,
  }));

  // 鍒嗛〉
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

// 鑾峰彇鍗曚釜瀹㈡埛璇︽儏
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const customer = mockCustomers.find((c) => c.id === id);

  if (!customer) {
    return res.status(404).json({ success: false, error: '瀹㈡埛涓嶅瓨鍦? });
  }

  // 璁＄畻璺濈涓婃鍒板簵澶╂暟
  const customerWithDays = {
    ...customer,
    daysSinceLastVisit: customer.lastVisitAt
      ? Math.floor((Date.now() - new Date(customer.lastVisitAt).getTime()) / 86400000)
      : undefined,
  };

  res.json({ success: true, data: customerWithDays });
});

// 鍒涘缓鏂板鎴?router.post('/', (req: Request, res: Response) => {
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

  // 楠岃瘉蹇呭～瀛楁
  if (!name || !phone) {
    return res.status(400).json({ success: false, error: '濮撳悕鍜岀數璇濅负蹇呭～椤? });
  }

  // 妫€鏌ユ墜鏈哄彿鏄惁宸插瓨鍦?  const existing = mockCustomers.find((c) => c.phone === phone);
  if (existing) {
    return res.status(400).json({ success: false, error: '璇ユ墜鏈哄彿宸叉敞鍐? });
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

  // 娣诲姞鍒?mockCustomers锛堝疄闄呴」鐩腑搴旇鍐欏叆鏁版嵁搴擄級
  (mockCustomers as any[]).push(newCustomer);

  res.status(201).json({ success: true, data: newCustomer });
});

// 鏇存柊瀹㈡埛淇℃伅
router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = mockCustomers.findIndex((c) => c.id === id);

  if (index === -1) {
    return res.status(404).json({ success: false, error: '瀹㈡埛涓嶅瓨鍦? });
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

  // 濡傛灉鏇存柊鎵嬫満鍙凤紝妫€鏌ユ槸鍚︿笌鍏朵粬瀹㈡埛鍐茬獊
  if (phone && phone !== existing.phone) {
    const phoneExists = mockCustomers.find((c) => c.phone === phone && c.id !== id);
    if (phoneExists) {
      return res.status(400).json({ success: false, error: '璇ユ墜鏈哄彿宸茶鍏朵粬瀹㈡埛浣跨敤' });
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

// 鍒犻櫎瀹㈡埛
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = mockCustomers.findIndex((c) => c.id === id);

  if (index === -1) {
    return res.status(404).json({ success: false, error: '瀹㈡埛涓嶅瓨鍦? });
  }

  (mockCustomers as any[]).splice(index, 1);

  res.json({ success: true, message: '瀹㈡埛宸插垹闄? });
});

// ==================== 瀹㈡埛鐢诲儚 API ====================

// 鑾峰彇瀹㈡埛鐢诲儚
router.get('/:customerId/profile', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const customer = mockCustomers.find((c) => c.id === customerId);

  if (!customer) {
    return res.status(404).json({ success: false, error: '瀹㈡埛涓嶅瓨鍦? });
  }

  res.json({
    success: true,
    data: customer.profile || null,
  });
});

// 鍒涘缓瀹㈡埛鐢诲儚
router.post('/:customerId/profile', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const customer = mockCustomers.find((c) => c.id === customerId);

  if (!customer) {
    return res.status(404).json({ success: false, error: '瀹㈡埛涓嶅瓨鍦? });
  }

  if (customer.profile) {
    return res.status(400).json({ success: false, error: '璇ュ鎴峰凡鏈夌敾鍍忥紝璇蜂娇鐢ㄦ洿鏂版帴鍙? });
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
    allergies = '鏃?,
    productsUsed = [],
  } = req.body;

  const profile: CustomerProfile = {
    id: generateId(),
    customerId,
    updatedBy: updatedBy || '',
    updatedByName: updatedByName || '鎶€甯?,
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

// 鏇存柊瀹㈡埛鐢诲儚
router.put('/:customerId/profile', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const customer = mockCustomers.find((c) => c.id === customerId);

  if (!customer) {
    return res.status(404).json({ success: false, error: '瀹㈡埛涓嶅瓨鍦? });
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
    updatedByName: updatedByName || existing?.updatedByName || '鎶€甯?,
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
    allergies: allergies !== undefined ? allergies : existing?.allergies || '鏃?,
    productsUsed: productsUsed !== undefined ? productsUsed : existing?.productsUsed || [],
    createdAt: existing?.createdAt || now,
  };

  customer.profile = updated;

  res.json({ success: true, data: updated });
});

export default router;

