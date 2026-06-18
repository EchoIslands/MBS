import { Router, Request, Response } from 'express';
import { mockReviews, mockShopReviews, mockStylistReviews } from '../_internal/mockData.js';

const router = Router();

const generateId = () => Math.random().toString(36).substr(2, 9);

// ==================== 璇勪环绠＄悊 API ====================

// 鑾峰彇璇勪环鍒楄〃锛堟敮鎸佸绉嶇瓫閫夛級
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

  // 搴楅摵绛涢€?  if (shopId) {
    reviews = reviews.filter((r) => r.shopId === shopId);
  }

  // 鍙戝瀷甯堢瓫閫?  if (stylistId) {
    reviews = reviews.filter((r) => r.stylistId === stylistId);
  }

  // 瀹㈡埛绛涢€?  if (customerId) {
    reviews = reviews.filter((r) => r.customerId === customerId);
  }

  // 璇勫垎绛涢€?  if (rating) {
    const ratingNum = parseInt(rating as string, 10);
    reviews = reviews.filter((r) => Math.floor(r.overallScore) === ratingNum);
  }

  // 鏄惁鏈夊洖澶?  if (hasReply === 'true') {
    reviews = reviews.filter((r) => (r as any).reply);
  } else if (hasReply === 'false') {
    reviews = reviews.filter((r) => !(r as any).reply);
  }

  // 鏄惁闅愯棌
  if (isHidden === 'true') {
    reviews = reviews.filter((r) => (r as any).isHidden);
  } else if (isHidden === 'false') {
    reviews = reviews.filter((r) => !(r as any).isHidden);
  }

  // 鎸夊垱寤烘椂闂村€掑簭
  reviews.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  // 鍒嗛〉
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

// 鑾峰彇鍗曟潯璇勪环璇︽儏
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const review = mockReviews.find((r) => r.id === id);

  if (!review) {
    return res.status(404).json({ success: false, error: '璇勪环涓嶅瓨鍦? });
  }

  res.json({ success: true, data: review });
});

// 鍥炲璇勪环
router.post('/:id/reply', (req: Request, res: Response) => {
  const { id } = req.params;
  const { repliedBy, repliedByName, content } = req.body;

  const review = mockReviews.find((r) => r.id === id);
  if (!review) {
    return res.status(404).json({ success: false, error: '璇勪环涓嶅瓨鍦? });
  }

  if (!content || content.trim() === '') {
    return res.status(400).json({ success: false, error: '鍥炲鍐呭涓嶈兘涓虹┖' });
  }

  // 妫€鏌ユ槸鍚﹀凡鍥炲
  if ((review as any).reply) {
    return res.status(400).json({ success: false, error: '璇ヨ瘎浠峰凡鍥炲' });
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

// 缂栬緫鍥炲
router.put('/:id/reply', (req: Request, res: Response) => {
  const { id } = req.params;
  const { content } = req.body;

  const review = mockReviews.find((r) => r.id === id);
  if (!review) {
    return res.status(404).json({ success: false, error: '璇勪环涓嶅瓨鍦? });
  }

  if (!(review as any).reply) {
    return res.status(400).json({ success: false, error: '璇ヨ瘎浠峰皻鏈洖澶? });
  }

  if (!content || content.trim() === '') {
    return res.status(400).json({ success: false, error: '鍥炲鍐呭涓嶈兘涓虹┖' });
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

// 鍒犻櫎鍥炲
router.delete('/:id/reply', (req: Request, res: Response) => {
  const { id } = req.params;

  const review = mockReviews.find((r) => r.id === id);
  if (!review) {
    return res.status(404).json({ success: false, error: '璇勪环涓嶅瓨鍦? });
  }

  if (!(review as any).reply) {
    return res.status(400).json({ success: false, error: '璇ヨ瘎浠峰皻鏈洖澶? });
  }

  delete (review as any).reply;

  res.json({
    success: true,
    data: {
      id: review.id,
      message: '鍥炲宸插垹闄?,
    },
  });
});

// 闅愯棌璇勪环
router.post('/:id/hide', (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason, hiddenBy, hiddenByName } = req.body;

  const review = mockReviews.find((r) => r.id === id);
  if (!review) {
    return res.status(404).json({ success: false, error: '璇勪环涓嶅瓨鍦? });
  }

  if ((review as any).isHidden) {
    return res.status(400).json({ success: false, error: '璇ヨ瘎浠峰凡闅愯棌' });
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

// 鏄剧ず璇勪环锛堝彇娑堥殣钘忥級
router.post('/:id/show', (req: Request, res: Response) => {
  const { id } = req.params;

  const review = mockReviews.find((r) => r.id === id);
  if (!review) {
    return res.status(404).json({ success: false, error: '璇勪环涓嶅瓨鍦? });
  }

  if (!(review as any).isHidden) {
    return res.status(400).json({ success: false, error: '璇ヨ瘎浠锋湭闅愯棌' });
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
      message: '璇勪环宸叉樉绀?,
    },
  });
});

// 鑾峰彇璇勪环缁熻
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

// 鑾峰彇搴楅摵璇勪环鍒楄〃
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

// 鑾峰彇鍙戝瀷甯堣瘎浠峰垪琛?router.get('/stylist/:stylistId', (req: Request, res: Response) => {
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

