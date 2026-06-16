import { Router, Request, Response } from 'express';
import { mockCustomers, mockReferrals } from '../../shared/mockData';

const router = Router();

const generateId = () => Math.random().toString(36).substr(2, 9);

// 会员等级配置
const MEMBER_LEVELS = {
  normal: { name: '普通会员', discount: 1.0, pointsRate: 1, benefits: ['基础服务'] },
  silver: { name: '银卡会员', discount: 0.95, pointsRate: 1.2, benefits: ['基础服务', '生日优惠', '优先预约'] },
  gold: { name: '金卡会员', discount: 0.9, pointsRate: 1.5, benefits: ['基础服务', '生日优惠', '优先预约', '专属折扣', '免费护理'] },
  platinum: { name: '铂金会员', discount: 0.85, pointsRate: 2.0, benefits: ['基础服务', '生日优惠', '优先预约', '专属折扣', '免费护理', '私人顾问', '年度礼包'] },
};

// 升级所需消费金额
const UPGRADE_THRESHOLDS = {
  normal: 0,
  silver: 1000,
  gold: 5000,
  platinum: 15000,
};

// ==================== 会员管理 API ====================

// 获取会员权益信息
router.get('/:customerId/benefits', (req: Request, res: Response) => {
  const { customerId } = req.params;

  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(404).json({ success: false, error: '客户不存在' });
  }

  const level = (customer.memberLevel || 'normal') as keyof typeof MEMBER_LEVELS;
  const levelConfig = MEMBER_LEVELS[level] || MEMBER_LEVELS.normal;

  // 计算升级进度
  const totalSpent = customer.totalSpent || 0;
  let nextLevel: keyof typeof MEMBER_LEVELS | null = null;
  let progress = 100;

  if (level === 'normal') {
    nextLevel = 'silver';
    progress = Math.min(100, (totalSpent / UPGRADE_THRESHOLDS.silver) * 100);
  } else if (level === 'silver') {
    nextLevel = 'gold';
    progress = Math.min(100, (totalSpent / UPGRADE_THRESHOLDS.gold) * 100);
  } else if (level === 'gold') {
    nextLevel = 'platinum';
    progress = Math.min(100, (totalSpent / UPGRADE_THRESHOLDS.platinum) * 100);
  }

  res.json({
    success: true,
    data: {
      customerId,
      customerName: customer.name,
      memberLevel: level,
      memberLevelName: levelConfig.name,
      discount: levelConfig.discount,
      pointsRate: levelConfig.pointsRate,
      benefits: levelConfig.benefits,
      totalSpent,
      points: customer.points || 0,
      upgradeProgress: nextLevel ? {
        currentLevel: level,
        nextLevel,
        nextLevelName: MEMBER_LEVELS[nextLevel].name,
        progress: Math.round(progress),
        amountNeeded: UPGRADE_THRESHOLDS[nextLevel] - totalSpent,
      } : null,
    },
  });
});

// 会员升级
router.post('/:customerId/upgrade', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const { targetLevel, reason } = req.body;

  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(404).json({ success: false, error: '客户不存在' });
  }

  const currentLevel = (customer.memberLevel || 'normal') as keyof typeof MEMBER_LEVELS;
  const target = targetLevel as keyof typeof MEMBER_LEVELS;

  if (!MEMBER_LEVELS[target]) {
    return res.status(400).json({ success: false, error: '无效的目标等级' });
  }

  // 检查是否可以升级（不能降级）
  const levelOrder = ['normal', 'silver', 'gold', 'platinum'];
  const currentIndex = levelOrder.indexOf(currentLevel);
  const targetIndex = levelOrder.indexOf(target);

  if (targetIndex <= currentIndex) {
    return res.status(400).json({ success: false, error: '只能升级到更高级别' });
  }

  // 检查消费金额是否达标
  const totalSpent = customer.totalSpent || 0;
  if (totalSpent < UPGRADE_THRESHOLDS[target]) {
    return res.status(400).json({ 
      success: false, 
      error: `消费金额未达标，需要累计消费 ${UPGRADE_THRESHOLDS[target]} 元` 
    });
  }

  // 执行升级
  customer.memberLevel = target;
  const levelConfig = MEMBER_LEVELS[target];

  res.json({
    success: true,
    data: {
      customerId,
      customerName: customer.name,
      previousLevel: currentLevel,
      previousLevelName: MEMBER_LEVELS[currentLevel].name,
      newLevel: target,
      newLevelName: levelConfig.name,
      newBenefits: levelConfig.benefits,
      newDiscount: levelConfig.discount,
      reason,
      upgradedAt: new Date(),
    },
  });
});

// 获取推荐记录
router.get('/:customerId/referrals', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const { page = '1', pageSize = '20' } = req.query;

  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(404).json({ success: false, error: '客户不存在' });
  }

  // 获取该客户的推荐记录
  const referrals = mockReferrals.filter((r) => r.referrerId === customerId);

  // 计算总提成
  const totalCommission = referrals
    .filter((r) => r.status === 'completed')
    .reduce((sum, r) => sum + (r.commission || 0), 0);

  // 分页
  const pageNum = parseInt(page as string, 10);
  const pageSizeNum = parseInt(pageSize as string, 10);
  const total = referrals.length;
  const start = (pageNum - 1) * pageSizeNum;
  const paginatedResult = referrals.slice(start, start + pageSizeNum);

  res.json({
    success: true,
    data: paginatedResult,
    summary: {
      totalReferrals: total,
      completedReferrals: referrals.filter((r) => r.status === 'completed').length,
      pendingReferrals: referrals.filter((r) => r.status === 'pending').length,
      totalCommission,
    },
    pagination: {
      page: pageNum,
      pageSize: pageSizeNum,
      total,
      totalPages: Math.ceil(total / pageSizeNum),
    },
  });
});

// 创建推荐记录
router.post('/:customerId/referrals', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const { referredName, referredPhone, note } = req.body;

  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(404).json({ success: false, error: '推荐人不存在' });
  }

  if (!referredName || !referredPhone) {
    return res.status(400).json({ success: false, error: '被推荐人姓名和手机号为必填项' });
  }

  const referral = {
    id: generateId(),
    referrerId: customerId,
    referrerName: customer.name,
    referredName,
    referredPhone,
    status: 'pending',
    commission: 0,
    note,
    createdAt: new Date(),
  };

  mockReferrals.push(referral as any);

  res.status(201).json({
    success: true,
    data: referral,
  });
});

// 确认推荐（被推荐人到店消费后）
router.post('/referrals/:referralId/confirm', (req: Request, res: Response) => {
  const { referralId } = req.params;
  const { commission = 50 } = req.body;

  const referral = mockReferrals.find((r) => r.id === referralId);
  if (!referral) {
    return res.status(404).json({ success: false, error: '推荐记录不存在' });
  }

  if (referral.status === 'completed') {
    return res.status(400).json({ success: false, error: '该推荐已完成' });
  }

  referral.status = 'completed';
  referral.commission = commission;
  (referral as any).completedAt = new Date();

  // 给推荐人增加积分
  const referrer = mockCustomers.find((c) => c.id === referral.referrerId);
  if (referrer) {
    referrer.points = (referrer.points || 0) + Math.floor(commission);
  }

  res.json({
    success: true,
    data: referral,
  });
});

// 积分兑换
router.post('/:customerId/points/redeem', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const { points, rewardType } = req.body;

  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(404).json({ success: false, error: '客户不存在' });
  }

  if (!points || points <= 0) {
    return res.status(400).json({ success: false, error: '积分数量必须大于0' });
  }

  if ((customer.points || 0) < points) {
    return res.status(400).json({ success: false, error: '积分不足' });
  }

  // 扣减积分
  customer.points = (customer.points || 0) - points;

  res.json({
    success: true,
    data: {
      customerId,
      customerName: customer.name,
      redeemedPoints: points,
      remainingPoints: customer.points,
      rewardType,
      redeemedAt: new Date(),
    },
  });
});

// 获取会员等级配置
router.get('/levels', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: Object.entries(MEMBER_LEVELS).map(([key, config]) => ({
      level: key,
      ...config,
      threshold: UPGRADE_THRESHOLDS[key as keyof typeof UPGRADE_THRESHOLDS],
    })),
  });
});

export default router;
