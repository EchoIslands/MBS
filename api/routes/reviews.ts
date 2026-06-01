import { Router, Request, Response } from 'express';
import { mockReviews, mockCustomers } from '../../shared/mockData';
import { Review } from '../../shared/types';

const router = Router();

const generateId = () => Math.random().toString(36).substr(2, 9);

// 创建评价
router.post('/', (req: Request, res: Response) => {
  const { shopId, customerId, bookingId, serviceScore, priceScore, skillScore, comment } = req.body;
  
  const customer = mockCustomers.find(c => c.id === customerId);
  if (!customer) {
    return res.status(400).json({ message: '顾客不存在' });
  }

  const overallScore = (serviceScore + priceScore + skillScore) / 3;
  const newReview: Review = {
    id: generateId(),
    shopId,
    customerId,
    bookingId,
    serviceScore,
    priceScore,
    skillScore,
    overallScore: Math.round(overallScore * 10) / 10,
    comment,
    customerName: customer.name,
    createdAt: new Date(),
  };

  mockReviews.push(newReview);
  res.status(201).json(newReview);
});

export default router;
