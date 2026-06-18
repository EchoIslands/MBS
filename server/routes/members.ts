import { Router, Request, Response } from 'express';
import { mockCustomers, mockReferrals } from '../_internal/mockData.js';

const router = Router();

const generateId = () => Math.random().toString(36).substr(2, 9);

// 浼氬憳绛夌骇閰嶇疆
const MEMBER_LEVELS = {
  normal: { name: '鏅€氫細鍛?, discount: 1.0, pointsRate: 1, benefits: ['鍩虹鏈嶅姟'] },
  silver: { name: '閾跺崱浼氬憳', discount: 0.95, pointsRate: 1.2, benefits: ['鍩虹鏈嶅姟', '鐢熸棩浼樻儬', '浼樺厛棰勭害'] },
  gold: { name: '閲戝崱浼氬憳', discount: 0.9, pointsRate: 1.5, benefits: ['鍩虹鏈嶅姟', '鐢熸棩浼樻儬', '浼樺厛棰勭害', '涓撳睘鎶樻墸', '鍏嶈垂鎶ょ悊'] },
  platinum: { name: '閾傞噾浼氬憳', discount: 0.85, pointsRate: 2.0, benefits: ['鍩虹鏈嶅姟', '鐢熸棩浼樻儬', '浼樺厛棰勭害', '涓撳睘鎶樻墸', '鍏嶈垂鎶ょ悊', '绉佷汉椤鹃棶', '骞村害绀煎寘'] },
};

// 鍗囩骇鎵€闇€娑堣垂閲戦
const UPGRADE_THRESHOLDS = {
  normal: 0,
  silver: 1000,
  gold: 5000,
  platinum: 15000,
};

// ==================== 浼氬憳绠＄悊 API ====================

// 鑾峰彇浼氬憳鏉冪泭淇℃伅
router.get('/:customerId/benefits', (req: Request, res: Response) => {
  const { customerId } = req.params;

  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(404).json({ success: false, error: '瀹㈡埛涓嶅瓨鍦? });
  }

  const level = (customer.membershipLevel || 'normal') as keyof typeof MEMBER_LEVELS;
  const levelConfig = MEMBER_LEVELS[level] || MEMBER_LEVELS.normal;

  // 璁＄畻鍗囩骇杩涘害
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
      membershipLevel: level,
      membershipLevelName: levelConfig.name,
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

// 浼氬憳鍗囩骇
router.post('/:customerId/upgrade', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const { targetLevel, reason } = req.body;

  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(404).json({ success: false, error: '瀹㈡埛涓嶅瓨鍦? });
  }

  const currentLevel = (customer.membershipLevel || 'normal') as keyof typeof MEMBER_LEVELS;
  const target = targetLevel as keyof typeof MEMBER_LEVELS;

  if (!MEMBER_LEVELS[target]) {
    return res.status(400).json({ success: false, error: '鏃犳晥鐨勭洰鏍囩瓑绾? });
  }

  // 妫€鏌ユ槸鍚﹀彲浠ュ崌绾э紙涓嶈兘闄嶇骇锛?  const levelOrder = ['normal', 'silver', 'gold', 'platinum'];
  const currentIndex = levelOrder.indexOf(currentLevel);
  const targetIndex = levelOrder.indexOf(target);

  if (targetIndex <= currentIndex) {
    return res.status(400).json({ success: false, error: '鍙兘鍗囩骇鍒版洿楂樼骇鍒? });
  }

  // 妫€鏌ユ秷璐归噾棰濇槸鍚﹁揪鏍?  const totalSpent = customer.totalSpent || 0;
  if (totalSpent < UPGRADE_THRESHOLDS[target]) {
    return res.status(400).json({ 
      success: false, 
      error: `娑堣垂閲戦鏈揪鏍囷紝闇€瑕佺疮璁℃秷璐?${UPGRADE_THRESHOLDS[target]} 鍏僠 
    });
  }

  // 鎵ц鍗囩骇
  customer.membershipLevel = target;
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

// 鑾峰彇鎺ㄨ崘璁板綍
router.get('/:customerId/referrals', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const { page = '1', pageSize = '20' } = req.query;

  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(404).json({ success: false, error: '瀹㈡埛涓嶅瓨鍦? });
  }

  // 鑾峰彇璇ュ鎴风殑鎺ㄨ崘璁板綍
  const referrals = mockReferrals.filter((r) => r.referrerId === customerId);

  // 璁＄畻鎬绘彁鎴?  const totalCommission = referrals
    .filter((r) => r.status === 'paid')
    .reduce((sum, r) => sum + (r.bonusAmount || 0), 0);

  // 鍒嗛〉
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
      completedReferrals: referrals.filter((r) => r.status === 'paid').length,
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

// 鍒涘缓鎺ㄨ崘璁板綍
router.post('/:customerId/referrals', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const { referredName, referredPhone, note } = req.body;

  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(404).json({ success: false, error: '鎺ㄨ崘浜轰笉瀛樺湪' });
  }

  if (!referredName || !referredPhone) {
    return res.status(400).json({ success: false, error: '琚帹鑽愪汉濮撳悕鍜屾墜鏈哄彿涓哄繀濉」' });
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

// 纭鎺ㄨ崘锛堣鎺ㄨ崘浜哄埌搴楁秷璐瑰悗锛?router.post('/referrals/:referralId/confirm', (req: Request, res: Response) => {
  const { referralId } = req.params;
  const { commission = 50 } = req.body;

  const referral = mockReferrals.find((r) => r.id === referralId);
  if (!referral) {
    return res.status(404).json({ success: false, error: '鎺ㄨ崘璁板綍涓嶅瓨鍦? });
  }

  if (referral.status === 'paid') {
    return res.status(400).json({ success: false, error: '璇ユ帹鑽愬凡瀹屾垚' });
  }

  referral.status = 'paid';
  referral.bonusAmount = commission;
  (referral as any).completedAt = new Date();

  // 缁欐帹鑽愪汉澧炲姞绉垎
  const referrer = mockCustomers.find((c) => c.id === referral.referrerId);
  if (referrer) {
    referrer.points = (referrer.points || 0) + Math.floor(commission);
  }

  res.json({
    success: true,
    data: referral,
  });
});

// 绉垎鍏戞崲
router.post('/:customerId/points/redeem', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const { points, rewardType } = req.body;

  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(404).json({ success: false, error: '瀹㈡埛涓嶅瓨鍦? });
  }

  if (!points || points <= 0) {
    return res.status(400).json({ success: false, error: '绉垎鏁伴噺蹇呴』澶т簬0' });
  }

  if ((customer.points || 0) < points) {
    return res.status(400).json({ success: false, error: '绉垎涓嶈冻' });
  }

  // 鎵ｅ噺绉垎
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

// 鑾峰彇浼氬憳绛夌骇閰嶇疆
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

