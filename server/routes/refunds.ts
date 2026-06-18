import { Router, Request, Response } from 'express';
import { mockRefundRequests, mockCustomers, mockBookings } from '../_internal/mockData.js';
import { RefundStatus } from '../_internal/types.js';

const router = Router();

const generateId = () => Math.random().toString(36).substr(2, 9);

// ==================== 閫€娆剧敵璇?API ====================

// 鑾峰彇閫€娆剧敵璇峰垪琛?router.get('/', (req: Request, res: Response) => {
  const { shopId, status, page = '1', pageSize = '20' } = req.query;

  let refunds = [...mockRefundRequests];

  // 搴楅摵绛涢€?  if (shopId) {
    refunds = refunds.filter((r) => r.shopId === shopId);
  }

  // 鐘舵€佺瓫閫?  if (status) {
    refunds = refunds.filter((r) => r.status === status);
  }

  // 鎸夊垱寤烘椂闂村€掑簭
  refunds.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // 鍒嗛〉
  const pageNum = parseInt(page as string, 10);
  const pageSizeNum = parseInt(pageSize as string, 10);
  const total = refunds.length;
  const start = (pageNum - 1) * pageSizeNum;
  const paginatedResult = refunds.slice(start, start + pageSizeNum);

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

// 鑾峰彇鍗曚釜閫€娆剧敵璇疯鎯?router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const refund = mockRefundRequests.find((r) => r.id === id);

  if (!refund) {
    return res.status(404).json({ success: false, error: '閫€娆剧敵璇蜂笉瀛樺湪' });
  }

  res.json({ success: true, data: refund });
});

// 鍒涘缓閫€娆剧敵璇?router.post('/', (req: Request, res: Response) => {
  const { 
    shopId, 
    customerId, 
    bookingId, 
    amount, 
    reason, 
    description,
    type = 'refund' // refund 鎴?partial_refund
  } = req.body;

  // 楠岃瘉蹇呭～瀛楁
  if (!shopId || !customerId || !amount || !reason) {
    return res.status(400).json({ 
      success: false, 
      error: '搴楅摵ID銆佸鎴稩D銆侀€€娆鹃噾棰濆拰閫€娆惧師鍥犱负蹇呭～椤? 
    });
  }

  // 楠岃瘉瀹㈡埛瀛樺湪
  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(404).json({ success: false, error: '瀹㈡埛涓嶅瓨鍦? });
  }

  // 楠岃瘉閲戦
  if (amount <= 0) {
    return res.status(400).json({ success: false, error: '閫€娆鹃噾棰濆繀椤诲ぇ浜?' });
  }

  const refund = {
    id: generateId(),
    shopId,
    customerId,
    customerName: customer.name,
    bookingId,
    amount,
    reason,
    description,
    type,
    status: 'pending',
    createdAt: new Date(),
  };

  mockRefundRequests.push(refund as any);

  res.status(201).json({ success: true, data: refund });
});

// 瀹℃壒閫€娆剧敵璇?router.post('/:id/approve', (req: Request, res: Response) => {
  const { id } = req.params;
  const { approvedBy, approvedByName, note } = req.body;

  const refund = mockRefundRequests.find((r) => r.id === id);
  if (!refund) {
    return res.status(404).json({ success: false, error: '閫€娆剧敵璇蜂笉瀛樺湪' });
  }

  if (refund.status !== 'pending') {
    return res.status(400).json({ success: false, error: '鍙兘瀹℃壒寰呭鐞嗙殑閫€娆剧敵璇? });
  }

  refund.status = RefundStatus.APPROVED;
  (refund as any).approvedBy = approvedBy;
  (refund as any).approvedByName = approvedByName;
  (refund as any).approvedAt = new Date();
  (refund as any).approvalNote = note;

  res.json({
    success: true,
    data: {
      id: refund.id,
      status: refund.status,
      approvedBy,
      approvedByName,
      approvedAt: (refund as any).approvedAt,
    },
  });
});

// 鎷掔粷閫€娆剧敵璇?router.post('/:id/reject', (req: Request, res: Response) => {
  const { id } = req.params;
  const { rejectedBy, rejectedByName, reason } = req.body;

  const refund = mockRefundRequests.find((r) => r.id === id);
  if (!refund) {
    return res.status(404).json({ success: false, error: '閫€娆剧敵璇蜂笉瀛樺湪' });
  }

  if (refund.status !== 'pending') {
    return res.status(400).json({ success: false, error: '鍙兘鎷掔粷寰呭鐞嗙殑閫€娆剧敵璇? });
  }

  if (!reason) {
    return res.status(400).json({ success: false, error: '鎷掔粷鍘熷洜蹇呭～' });
  }

  refund.status = RefundStatus.REJECTED;
  (refund as any).rejectedBy = rejectedBy;
  (refund as any).rejectedByName = rejectedByName;
  (refund as any).rejectedAt = new Date();
  (refund as any).rejectionReason = reason;

  res.json({
    success: true,
    data: {
      id: refund.id,
      status: refund.status,
      rejectedBy,
      rejectedByName,
      rejectedAt: (refund as any).rejectedAt,
      rejectionReason: reason,
    },
  });
});

// 澶勭悊閫€娆撅紙瀹屾垚閫€娆撅級
router.post('/:id/process', (req: Request, res: Response) => {
  const { id } = req.params;
  const { processedBy, processedByName, transactionId, note } = req.body;

  const refund = mockRefundRequests.find((r) => r.id === id);
  if (!refund) {
    return res.status(404).json({ success: false, error: '閫€娆剧敵璇蜂笉瀛樺湪' });
  }

  if (refund.status !== 'approved') {
    return res.status(400).json({ success: false, error: '鍙兘澶勭悊宸插鎵圭殑閫€娆剧敵璇? });
  }

  refund.status = RefundStatus.COMPLETED;
  (refund as any).processedBy = processedBy;
  (refund as any).processedByName = processedByName;
  (refund as any).processedAt = new Date();
  (refund as any).transactionId = transactionId;
  (refund as any).processNote = note;

  // 鏇存柊瀹㈡埛绱娑堣垂锛堟墸闄ら€€娆鹃噾棰濓級
  const customer = mockCustomers.find((c) => c.id === refund.customerId);
  if (customer) {
    customer.totalSpent = Math.max(0, (customer.totalSpent || 0) - refund.amount);
  }

  res.json({
    success: true,
    data: {
      id: refund.id,
      status: refund.status,
      amount: refund.amount,
      processedBy,
      processedByName,
      processedAt: (refund as any).processedAt,
      transactionId,
    },
  });
});

// 鍙栨秷閫€娆剧敵璇?router.post('/:id/cancel', (req: Request, res: Response) => {
  const { id } = req.params;
  const { cancelledBy, reason } = req.body;

  const refund = mockRefundRequests.find((r) => r.id === id);
  if (!refund) {
    return res.status(404).json({ success: false, error: '閫€娆剧敵璇蜂笉瀛樺湪' });
  }

  if (!['pending', 'approved'].includes(refund.status)) {
    return res.status(400).json({ success: false, error: '鍙兘鍙栨秷寰呭鐞嗘垨宸插鎵圭殑閫€娆剧敵璇? });
  }

  refund.status = RefundStatus.CANCELLED;
  (refund as any).cancelledBy = cancelledBy;
  (refund as any).cancelledAt = new Date();
  (refund as any).cancelReason = reason;

  res.json({
    success: true,
    data: {
      id: refund.id,
      status: refund.status,
      cancelledBy,
      cancelledAt: (refund as any).cancelledAt,
      cancelReason: reason,
    },
  });
});

// 鑾峰彇閫€娆剧粺璁?router.get('/stats/summary', (req: Request, res: Response) => {
  const { shopId } = req.query;

  let refunds = [...mockRefundRequests];
  if (shopId) {
    refunds = refunds.filter((r) => r.shopId === shopId);
  }

  const stats = {
    total: refunds.length,
    pending: refunds.filter((r) => r.status === 'pending').length,
    approved: refunds.filter((r) => r.status === 'approved').length,
    rejected: refunds.filter((r) => r.status === 'rejected').length,
    completed: refunds.filter((r) => r.status === 'completed').length,
    cancelled: refunds.filter((r) => r.status === RefundStatus.CANCELLED).length,
    totalAmount: refunds
      .filter((r) => r.status === 'completed')
      .reduce((sum, r) => sum + r.amount, 0),
    pendingAmount: refunds
      .filter((r) => r.status === 'pending')
      .reduce((sum, r) => sum + r.amount, 0),
  };

  res.json({ success: true, data: stats });
});

export default router;

