import { Router, type Request, type Response } from 'express';
import { reviewQueries } from '../db/index.js';

const router = Router();

// 创建评价
router.post('/', async (req: Request, res: Response) => {
  const {
    shopId, customerId, bookingId, serviceScore, priceScore, skillScore, comment,
    type = 'shop', rating, tags = [],
  } = req.body;

  const overallScore = rating || Math.round(((serviceScore || 0) + (priceScore || 0) + (skillScore || 0)) / 3);

  const newReview = {
    shop_id: shopId,
    customer_id: customerId,
    booking_id: bookingId,
    type: type,
    rating: overallScore,
    service_score: serviceScore,
    price_score: priceScore,
    skill_score: skillScore,
    overall_score: overallScore,
    comment: comment || '',
    tags: tags,
    created_at: new Date().toISOString(),
  };

  const created = await reviewQueries.create(newReview);

  res.status(201).json({
    id: created.id,
    shopId: created.shop_id,
    customerId: created.customer_id,
    bookingId: created.booking_id,
    type: created.type,
    rating: created.rating,
    serviceScore: created.service_score,
    priceScore: created.price_score,
    skillScore: created.skill_score,
    overallScore: created.overall_score,
    comment: created.comment,
    tags: created.tags,
    createdAt: created.created_at,
  });
});

export default router;
