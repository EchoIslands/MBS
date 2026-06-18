import { Router, Request, Response } from 'express';
import { mockRefundRequests, mockCustomers, mockBookings } from '../../shared/mockData.js';
import { RefundStatus } from '../../shared/types.js';

const router = Router();

const generateId = () => Math.random().toString(36).substr(2, 9);

// ==================== 退款申请 API ====================

// 获取退款申请列表
router.get('/', (req: Request, res: Response) => {
  const { shopId, status, page = '1', pageSize = '20' } = req.query;

  let refunds = [...mockRefundRequests];

  // 店铺筛选
  if (shopId) {
    refunds = refunds.filter((r) => r.shopId === shopId);
  }

  // 状态筛选
  if (status) {
    refunds = refunds.filter((r) => r.status === status);
  }

  // 按创建时间倒序
  refunds.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // 分页
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

// 获取单个退款申请详情
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const refund = mockRefundRequests.find((r) => r.id === id);

  if (!refund) {
    return res.status(404).json({ success: false, error: '退款申请不存在' });
  }

  res.json({ success: true, data: refund });
});

// 创建退款申请
router.post('/', (req: Request, res: Response) => {
  const { 
    shopId, 
    customerId, 
    bookingId, 
    amount, 
    reason, 
    description,
    type = 'refund' // refund 或 partial_refund
  } = req.body;

  // 验证必填字段
  if (!shopId || !customerId || !amount || !reason) {
    return res.status(400).json({ 
      success: false, 
      error: '店铺ID、客户ID、退款金额和退款原因为必填项' 
    });
  }

  // 验证客户存在
  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(404).json({ success: false, error: '客户不存在' });
  }

  // 验证金额
  if (amount <= 0) {
    return res.status(400).json({ success: false, error: '退款金额必须大于0' });
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

// 审批退款申请
router.post('/:id/approve', (req: Request, res: Response) => {
  const { id } = req.params;
  const { approvedBy, approvedByName, note } = req.body;

  const refund = mockRefundRequests.find((r) => r.id === id);
  if (!refund) {
    return res.status(404).json({ success: false, error: '退款申请不存在' });
  }

  if (refund.status !== 'pending') {
    return res.status(400).json({ success: false, error: '只能审批待处理的退款申请' });
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

// 拒绝退款申请
router.post('/:id/reject', (req: Request, res: Response) => {
  const { id } = req.params;
  const { rejectedBy, rejectedByName, reason } = req.body;

  const refund = mockRefundRequests.find((r) => r.id === id);
  if (!refund) {
    return res.status(404).json({ success: false, error: '退款申请不存在' });
  }

  if (refund.status !== 'pending') {
    return res.status(400).json({ success: false, error: '只能拒绝待处理的退款申请' });
  }

  if (!reason) {
    return res.status(400).json({ success: false, error: '拒绝原因必填' });
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

// 处理退款（完成退款）
router.post('/:id/process', (req: Request, res: Response) => {
  const { id } = req.params;
  const { processedBy, processedByName, transactionId, note } = req.body;

  const refund = mockRefundRequests.find((r) => r.id === id);
  if (!refund) {
    return res.status(404).json({ success: false, error: '退款申请不存在' });
  }

  if (refund.status !== 'approved') {
    return res.status(400).json({ success: false, error: '只能处理已审批的退款申请' });
  }

  refund.status = RefundStatus.COMPLETED;
  (refund as any).processedBy = processedBy;
  (refund as any).processedByName = processedByName;
  (refund as any).processedAt = new Date();
  (refund as any).transactionId = transactionId;
  (refund as any).processNote = note;

  // 更新客户累计消费（扣除退款金额）
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

// 取消退款申请
router.post('/:id/cancel', (req: Request, res: Response) => {
  const { id } = req.params;
  const { cancelledBy, reason } = req.body;

  const refund = mockRefundRequests.find((r) => r.id === id);
  if (!refund) {
    return res.status(404).json({ success: false, error: '退款申请不存在' });
  }

  if (!['pending', 'approved'].includes(refund.status)) {
    return res.status(400).json({ success: false, error: '只能取消待处理或已审批的退款申请' });
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

// 获取退款统计
router.get('/stats/summary', (req: Request, res: Response) => {
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
