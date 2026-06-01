import { Router, Request, Response } from 'express';
import { mockQueues, mockBookings } from '../../shared/mockData';

const router = Router();

// 获取队列
router.get('/:shopId', (req: Request, res: Response) => {
  const queue = mockQueues.find(q => q.shopId === req.params.shopId);
  if (!queue) {
    return res.status(404).json({ message: '队列不存在' });
  }
  // 更新队列中的预约
  queue.bookings = mockBookings.filter(b => 
    b.shopId === req.params.shopId && 
    (b.status === 'pending' || b.status === 'confirmed')
  );
  res.json(queue);
});

// 更新队列
router.put('/:shopId', (req: Request, res: Response) => {
  const { currentNumber, estimatedWaitTime } = req.body;
  const queueIndex = mockQueues.findIndex(q => q.shopId === req.params.shopId);
  
  if (queueIndex === -1) {
    return res.status(404).json({ message: '队列不存在' });
  }

  mockQueues[queueIndex] = {
    ...mockQueues[queueIndex],
    currentNumber: currentNumber ?? mockQueues[queueIndex].currentNumber,
    estimatedWaitTime: estimatedWaitTime ?? mockQueues[queueIndex].estimatedWaitTime,
  };

  res.json(mockQueues[queueIndex]);
});

export default router;
