import { Router, Request, Response } from 'express';
import { mockReviews, mockShopReviews, mockStylistReviews } from '../_internal/mockData.js';

const router = Router();

const generateId = () => Math.random().toString(36).substr(2, 9);

// ==================== 评价管理 API ====================

// 获取评价列表（支持多种筛选）
router.get('/', (req: Request, res: Response) => {
  const { 
    shopId, 
    stylistId, 
    customerId,
    rating,
    hasReply,
    isHidden,
    page = '1', 
    pageSize = '20' 
  } = req.query;

  let reviews = [...mockReviews];

  // 店铺筛�?  if (shopId) {
    reviews = reviews.filter((r) => r.shopId === shopId);
  }

  // 发型师筛�?  if (stylistId) {
    reviews = reviews.filter((r) => r.stylistId === stylistId);
  }

  // 客户筛�?  if (customerId) {
    reviews = reviews.filter((r) => r.customerId === customerId);
  }

  // 评分筛�?  if (rating) {
    const ratingNum = parseInt(rating as string, 10);
    reviews = reviews.filter((r) => Math.floor(r.overallScore) === ratingNum);
  }

  // 是否有回�?  if (hasReply === 'true') {
    reviews = reviews.filter((r) => (r as any).reply);
  } else if (hasReply === 'false') {
    reviews = reviews.filter((r) => !(r as any).reply);
  }

  // 是否隐藏
  if (isHidden === 'true') {
    reviews = reviews.filter((r) => (r as any).isHidden);
  } else if (isHidden === 'false') {
    reviews = reviews.filter((r) => !(r as any).isHidden);
  }

  // 按创建时间倒序
  reviews.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  // 分页
  const pageNum = parseInt(page as string, 10);
  const pageSizeNum = parseInt(pageSize as string, 10);
  const total = reviews.length;
  const start = (pageNum - 1) * pageSizeNum;
  const paginatedResult = reviews.slice(start, start + pageSizeNum);

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

// 获取单条评价详情
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const review = mockReviews.find((r) => r.id === id);

  if (!review) {
    return res.status(404).json({ success: false, error: '评价不存�? });
  }

  res.json({ success: true, data: review });
});

// 回复评价
router.post('/:id/reply', (req: Request, res: Response) => {
  const { id } = req.params;
  const { repliedBy, repliedByName, content } = req.body;

  const review = mockReviews.find((r) => r.id === id);
  if (!review) {
    return res.status(404).json({ success: false, error: '评价不存�? });
  }

  if (!content || content.trim() === '') {
    return res.status(400).json({ success: false, error: '回复内容不能为空' });
  }

  // 检查是否已回复
  if ((review as any).reply) {
    return res.status(400).json({ success: false, error: '该评价已回复' });
  }

  (review as any).reply = {
    content,
    repliedBy,
    repliedByName,
    repliedAt: new Date(),
  };

  res.json({
    success: true,
    data: {
      id: review.id,
      reply: (review as any).reply,
    },
  });
});

// 编辑回复
router.put('/:id/reply', (req: Request, res: Response) => {
  const { id } = req.params;
  const { content } = req.body;

  const review = mockReviews.find((r) => r.id === id);
  if (!review) {
    return res.status(404).json({ success: false, error: '评价不存�? });
  }

  if (!(review as any).reply) {
    return res.status(400).json({ success: false, error: '该评价尚未回�? });
  }

  if (!content || content.trim() === '') {
    return res.status(400).json({ success: false, error: '回复内容不能为空' });
  }

  (review as any).reply.content = content;
  (review as any).reply.updatedAt = new Date();

  res.json({
    success: true,
    data: {
      id: review.id,
      reply: (review as any).reply,
    },
  });
});

// 删除回复
router.delete('/:id/reply', (req: Request, res: Response) => {
  const { id } = req.params;

  const review = mockReviews.find((r) => r.id === id);
  if (!review) {
    return res.status(404).json({ success: false, error: '评价不存�? });
  }

  if (!(review as any).reply) {
    return res.status(400).json({ success: false, error: '该评价尚未回�? });
  }

  delete (review as any).reply;

  res.json({
    success: true,
    data: {
      id: review.id,
      message: '回复已删�?,
    },
  });
});

// 隐藏评价
router.post('/:id/hide', (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason, hiddenBy, hiddenByName } = req.body;

  const review = mockReviews.find((r) => r.id === id);
  if (!review) {
    return res.status(404).json({ success: false, error: '评价不存�? });
  }

  if ((review as any).isHidden) {
    return res.status(400).json({ success: false, error: '该评价已隐藏' });
  }

  (review as any).isHidden = true;
  (review as any).hiddenReason = reason;
  (review as any).hiddenBy = hiddenBy;
  (review as any).hiddenByName = hiddenByName;
  (review as any).hiddenAt = new Date();

  res.json({
    success: true,
    data: {
      id: review.id,
      isHidden: true,
      hiddenReason: reason,
      hiddenAt: (review as any).hiddenAt,
    },
  });
});

// 显示评价（取消隐藏）
router.post('/:id/show', (req: Request, res: Response) => {
  const { id } = req.params;

  const review = mockReviews.find((r) => r.id === id);
  if (!review) {
    return res.status(404).json({ success: false, error: '评价不存�? });
  }

  if (!(review as any).isHidden) {
    return res.status(400).json({ success: false, error: '该评价未隐藏' });
  }

  (review as any).isHidden = false;
  delete (review as any).hiddenReason;
  delete (review as any).hiddenBy;
  delete (review as any).hiddenByName;
  delete (review as any).hiddenAt;

  res.json({
    success: true,
    data: {
      id: review.id,
      isHidden: false,
      message: '评价已显�?,
    },
  });
});

// 获取评价统计
router.get('/stats/summary', (req: Request, res: Response) => {
  const { shopId, stylistId } = req.query;

  let reviews = [...mockReviews];

  if (shopId) {
    reviews = reviews.filter((r) => r.shopId === shopId);
  }
  if (stylistId) {
    reviews = reviews.filter((r) => r.stylistId === stylistId);
  }

  const total = reviews.length;
  const avgRating = total > 0 
    ? parseFloat((reviews.reduce((sum, r) => sum + r.overallScore, 0) / total).toFixed(1))
    : 0;

  const ratingDistribution = {
    5: reviews.filter((r) => Math.floor(r.overallScore) === 5).length,
    4: reviews.filter((r) => Math.floor(r.overallScore) === 4).length,
    3: reviews.filter((r) => Math.floor(r.overallScore) === 3).length,
    2: reviews.filter((r) => Math.floor(r.overallScore) === 2).length,
    1: reviews.filter((r) => Math.floor(r.overallScore) === 1).length,
  };

  const stats = {
    total,
    avgRating,
    ratingDistribution,
    withReply: reviews.filter((r) => (r as any).reply).length,
    withoutReply: reviews.filter((r) => !(r as any).reply).length,
    hidden: reviews.filter((r) => (r as any).isHidden).length,
    avgServiceScore: total > 0 
      ? parseFloat((reviews.reduce((sum, r) => sum + r.serviceScore, 0) / total).toFixed(1))
      : 0,
    avgSkillScore: total > 0 
      ? parseFloat((reviews.reduce((sum, r) => sum + r.skillScore, 0) / total).toFixed(1))
      : 0,
  };

  res.json({ success: true, data: stats });
});

// 获取店铺评价列表
router.get('/shop/:shopId', (req: Request, res: Response) => {
  const { shopId } = req.params;
  const { rating, page = '1', pageSize = '20' } = req.query;

  let reviews = mockReviews.filter((r) => r.shopId === shopId);

  if (rating) {
    const ratingNum = parseInt(rating as string, 10);
    reviews = reviews.filter((r) => Math.floor(r.overallScore) === ratingNum);
  }

  reviews.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const pageNum = parseInt(page as string, 10);
  const pageSizeNum = parseInt(pageSize as string, 10);
  const total = reviews.length;
  const start = (pageNum - 1) * pageSizeNum;
  const paginatedResult = reviews.slice(start, start + pageSizeNum);

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

// 获取发型师评价列�?router.get('/stylist/:stylistId', (req: Request, res: Response) => {
  const { stylistId } = req.params;
  const { rating, page = '1', pageSize = '20' } = req.query;

  let reviews = mockReviews.filter((r) => r.stylistId === stylistId);

  if (rating) {
    const ratingNum = parseInt(rating as string, 10);
    reviews = reviews.filter((r) => Math.floor(r.overallScore) === ratingNum);
  }

  reviews.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const pageNum = parseInt(page as string, 10);
  const pageSizeNum = parseInt(pageSize as string, 10);
  const total = reviews.length;
  const start = (pageNum - 1) * pageSizeNum;
  const paginatedResult = reviews.slice(start, start + pageSizeNum);

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

export default router;
