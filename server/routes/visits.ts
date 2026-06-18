import { Router, Request, Response } from 'express';
import { mockCustomers, mockShops, mockBookings } from '../_internal/mockData.js';
import { CustomerVisitRecord } from '../_internal/types.js';

const router = Router();

const generateId = () => Math.random().toString(36).substr(2, 9);

// 瀛樺偍鍒板簵璁板綍锛堝唴瀛樺瓨鍌紝瀹為檯椤圭洰涓簲璇ョ敤鏁版嵁搴擄級
const visitRecords: CustomerVisitRecord[] = [];

// ==================== 鍒板簵璁板綍 API ====================

// 瀹㈡埛鍒板簵鎵撳崱锛坈heck-in锛?router.post('/checkin', (req: Request, res: Response) => {
  const { customerId, shopId, bookingId, stylistId, stylistName } = req.body;

  // 楠岃瘉蹇呭～瀛楁
  if (!customerId || !shopId) {
    return res.status(400).json({ success: false, error: '瀹㈡埛ID鍜屽簵閾篒D涓哄繀濉」' });
  }

  // 楠岃瘉瀹㈡埛瀛樺湪
  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(404).json({ success: false, error: '瀹㈡埛涓嶅瓨鍦? });
  }

  // 楠岃瘉搴楅摵瀛樺湪
  const shop = mockShops.find((s) => s.id === shopId);
  if (!shop) {
    return res.status(404).json({ success: false, error: '搴楅摵涓嶅瓨鍦? });
  }

  // 濡傛灉鏈夐绾D锛岄獙璇侀绾﹀瓨鍦?  if (bookingId) {
    const booking = mockBookings.find((b) => b.id === bookingId);
    if (!booking) {
      return res.status(404).json({ success: false, error: '棰勭害涓嶅瓨鍦? });
    }
    // 妫€鏌ラ绾︽槸鍚﹀睘浜庤瀹㈡埛
    if (booking.customerId !== customerId) {
      return res.status(400).json({ success: false, error: '棰勭害涓嶅睘浜庤瀹㈡埛' });
    }
  }

  const visitRecord: CustomerVisitRecord = {
    id: generateId(),
    customerId,
    shopId,
    bookingId,
    stylistId,
    stylistName,
    serviceIds: [],
    serviceNames: [],
    totalAmount: 0,
    checkInTime: new Date(),
    createdAt: new Date(),
  };

  visitRecords.push(visitRecord);

  res.status(201).json({ success: true, data: visitRecord });
});

// 瀹㈡埛绂诲簵缁撶畻锛坈heck-out锛?router.post('/checkout', (req: Request, res: Response) => {
  const { visitId, serviceIds, serviceNames, products, totalAmount, paymentMethod, notes } = req.body;

  // 楠岃瘉蹇呭～瀛楁
  if (!visitId) {
    return res.status(400).json({ success: false, error: '鍒板簵璁板綍ID涓哄繀濉」' });
  }

  // 鏌ユ壘鍒板簵璁板綍
  const index = visitRecords.findIndex((v) => v.id === visitId);
  if (index === -1) {
    return res.status(404).json({ success: false, error: '鍒板簵璁板綍涓嶅瓨鍦? });
  }

  const record = visitRecords[index];

  // 妫€鏌ユ槸鍚﹀凡缁忕搴?  if (record.checkOutTime) {
    return res.status(400).json({ success: false, error: '璇ヨ褰曞凡瀹屾垚绂诲簵缁撶畻' });
  }

  // 鏇存柊璁板綍
  const updated: CustomerVisitRecord = {
    ...record,
    serviceIds: serviceIds || record.serviceIds,
    serviceNames: serviceNames || record.serviceNames,
    products: products || record.products,
    totalAmount: totalAmount || record.totalAmount,
    paymentMethod: paymentMethod || record.paymentMethod,
    notes: notes || record.notes,
    checkOutTime: new Date(),
  };

  visitRecords[index] = updated;

  // 鏇存柊瀹㈡埛缁熻淇℃伅
  const customer = mockCustomers.find((c) => c.id === record.customerId);
  if (customer) {
    customer.visitCount = (customer.visitCount || 0) + 1;
    customer.totalSpent = (customer.totalSpent || 0) + updated.totalAmount;
    customer.lastVisitAt = new Date();
  }

  res.json({ success: true, data: updated });
});

// 鑾峰彇瀹㈡埛鐨勫埌搴楄褰?router.get('/customer/:customerId', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const { page = '1', pageSize = '20' } = req.query;

  // 楠岃瘉瀹㈡埛瀛樺湪
  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(404).json({ success: false, error: '瀹㈡埛涓嶅瓨鍦? });
  }

  let records = visitRecords.filter((v) => v.customerId === customerId);

  // 鎸夊埌搴楁椂闂村€掑簭鎺掑垪
  records = records.sort((a, b) => new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime());

  // 鍒嗛〉
  const pageNum = parseInt(page as string, 10);
  const pageSizeNum = parseInt(pageSize as string, 10);
  const total = records.length;
  const start = (pageNum - 1) * pageSizeNum;
  const end = start + pageSizeNum;
  const paginatedResult = records.slice(start, end);

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

// 鑾峰彇搴楅摵鐨勫埌搴楄褰?router.get('/shop/:shopId', (req: Request, res: Response) => {
  const { shopId } = req.params;
  const { page = '1', pageSize = '20', dateStart, dateEnd } = req.query;

  // 楠岃瘉搴楅摵瀛樺湪
  const shop = mockShops.find((s) => s.id === shopId);
  if (!shop) {
    return res.status(404).json({ success: false, error: '搴楅摵涓嶅瓨鍦? });
  }

  let records = visitRecords.filter((v) => v.shopId === shopId);

  // 鏃ユ湡绛涢€?  if (dateStart) {
    records = records.filter((v) => new Date(v.checkInTime) >= new Date(dateStart as string));
  }
  if (dateEnd) {
    records = records.filter((v) => new Date(v.checkInTime) <= new Date(dateEnd as string));
  }

  // 鎸夊埌搴楁椂闂村€掑簭鎺掑垪
  records = records.sort((a, b) => new Date(b.checkInTime).getTime() - new Date(a.checkInTime).getTime());

  // 鍒嗛〉
  const pageNum = parseInt(page as string, 10);
  const pageSizeNum = parseInt(pageSize as string, 10);
  const total = records.length;
  const start = (pageNum - 1) * pageSizeNum;
  const end = start + pageSizeNum;
  const paginatedResult = records.slice(start, end);

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

// 鑾峰彇鍗曟潯鍒板簵璁板綍璇︽儏
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const record = visitRecords.find((v) => v.id === id);

  if (!record) {
    return res.status(404).json({ success: false, error: '鍒板簵璁板綍涓嶅瓨鍦? });
  }

  res.json({ success: true, data: record });
});

// 鑾峰彇搴楅摵浠婃棩鍒板簵缁熻
router.get('/shop/:shopId/today', (req: Request, res: Response) => {
  const { shopId } = req.params;

  // 楠岃瘉搴楅摵瀛樺湪
  const shop = mockShops.find((s) => s.id === shopId);
  if (!shop) {
    return res.status(404).json({ success: false, error: '搴楅摵涓嶅瓨鍦? });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todayRecords = visitRecords.filter((v) => {
    const checkIn = new Date(v.checkInTime);
    return v.shopId === shopId && checkIn >= today && checkIn < tomorrow;
  });

  const checkedIn = todayRecords.filter((v) => !v.checkOutTime).length;
  const checkedOut = todayRecords.filter((v) => v.checkOutTime).length;
  const totalAmount = todayRecords
    .filter((v) => v.checkOutTime)
    .reduce((sum, v) => sum + v.totalAmount, 0);

  res.json({
    success: true,
    data: {
      todayVisits: todayRecords.length,
      checkedIn,
      checkedOut,
      totalAmount,
      averageAmount: todayRecords.length > 0 ? Math.round(totalAmount / todayRecords.length) : 0,
    },
  });
});

export default router;

