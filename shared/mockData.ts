import { Shop, Customer, Booking, Review, Queue, Service, OpeningHours, Employee, StylistPerformance, FinancialReport, DateRange, UserRole, OwnerDashboard, RefundRequest, RefundStatus, CustomerFeedback, FeedbackType, CustomerSuccessMetrics, Product, ProductCategory } from './types';

// 生成ID
const generateId = () => Math.random().toString(36).substr(2, 9);

// 默认营业时间
const defaultOpeningHours: OpeningHours = {
  monday: { open: '09:00', close: '21:00', isOpen: true },
  tuesday: { open: '09:00', close: '21:00', isOpen: true },
  wednesday: { open: '09:00', close: '21:00', isOpen: true },
  thursday: { open: '09:00', close: '21:00', isOpen: true },
  friday: { open: '09:00', close: '22:00', isOpen: true },
  saturday: { open: '10:00', close: '22:00', isOpen: true },
  sunday: { open: '10:00', close: '20:00', isOpen: true },
};

// 店铺密码映射（演示用）
export const shopPasswords: Record<string, string> = {
  'shop1': '123456',
};

// 发型师密码映射（演示用）
export const stylistPasswords: Record<string, string> = {
  'e1': '123456',
  'e2': '123456',
  'e3': '123456',
};

// 模拟理发店数据
export const mockShops: Shop[] = [
  {
    id: 'shop1',
    name: '皓诗形象设计',
    description: '专业剪发、烫染护理，让您拥有时尚发型',
    address: '北京市朝阳区建国路88号',
    latitude: 39.9042,
    longitude: 116.4074,
    phone: '13800138001',
    images: [
      'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&h=300&fit=crop',
      'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=400&h=300&fit=crop',
    ],
    services: [
      { id: 's1', name: '精剪', price: 68, duration: 30, description: '专业发型设计' },
      { id: 's2', name: '烫染套餐', price: 388, duration: 120, description: '染发+烫发' },
      { id: 's3', name: '护理', price: 168, duration: 60, description: '深层护理' },
    ],
    employees: [
      { id: 'e1', name: '李明', phone: '13900000011', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=LiMing', title: '首席发型师', rating: 4.9, isActive: true, specialty: '精剪、烫染' },
      { id: 'e2', name: '王芳', phone: '13900000012', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=WangFang', title: '资深发型师', rating: 4.7, isActive: true, specialty: '护理、造型' },
      { id: 'e3', name: '张伟', phone: '13900000013', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ZhangWei', title: '发型师', rating: 4.5, isActive: true, specialty: '精剪' },
    ],
    products: generateMockProducts('shop1'),
    openingHours: defaultOpeningHours,
    rating: 4.8,
    reviewCount: 126,
    level: 'excellent',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'shop2',
    name: '匠人理发',
    description: '传统与现代结合的理发技艺',
    address: '北京市海淀区中关村大街1号',
    latitude: 39.9892,
    longitude: 116.3174,
    phone: '13800138002',
    images: [
      'https://images.unsplash.com/photo-1585747860715-2ba37e788b70?w=400&h=300&fit=crop',
    ],
    services: [
      { id: 's1', name: '男士剪发', price: 58, duration: 25 },
      { id: 's2', name: '女士剪发', price: 88, duration: 40 },
      { id: 's3', name: '渐变剪', price: 98, duration: 45 },
    ],
    employees: [
      { id: 'e1', name: '陈师傅', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ChenShifu', title: '首席造型师', rating: 4.8, isActive: true, specialty: '渐变剪、油头' },
      { id: 'e2', name: '刘师傅', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=LiuShifu', title: '资深发型师', rating: 4.6, isActive: true, specialty: '男士剪发' },
    ],
    products: generateMockProducts('shop2'),
    openingHours: defaultOpeningHours,
    rating: 4.5,
    reviewCount: 89,
    level: 'good',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'shop3',
    name: '潮人理发店',
    description: '时尚潮流发型设计中心',
    address: '北京市西城区西单北大街120号',
    latitude: 39.9142,
    longitude: 116.3774,
    phone: '13800138003',
    images: [
      'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&h=300&fit=crop',
    ],
    services: [
      { id: 's1', name: '潮流剪发', price: 128, duration: 45 },
      { id: 's2', name: '接发', price: 588, duration: 180 },
    ],
    employees: [
      { id: 'e1', name: 'Tony老师', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Tony', title: '创意总监', rating: 4.7, isActive: true, specialty: '潮流剪发、接发' },
      { id: 'e2', name: 'Kevin', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Kevin', title: '发型设计师', rating: 4.4, isActive: true, specialty: '潮流造型' },
    ],
    products: generateMockProducts('shop3'),
    openingHours: defaultOpeningHours,
    rating: 3.8,
    reviewCount: 45,
    level: 'average',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// 模拟顾客
export const mockCustomers: Customer[] = [
  {
    id: 'cust1',
    name: '张三',
    phone: '13900000001',
    avatar: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face',
  },
];

// 模拟预约
export const mockBookings: Booking[] = [
  {
    id: 'book1',
    shopId: 'shop1',
    customerId: 'cust1',
    serviceId: 's1',
    barberId: 'e1',
    barberName: '李明',
    scheduledTime: new Date(Date.now() + 3600000),
    status: 'confirmed',
    queueNumber: 3,
    serviceName: '精剪',
    price: 68,
    customerName: '张三',
    shopName: '风格美发沙龙',
  },
];

// 模拟评价
export const mockReviews: Review[] = [
  {
    id: 'rev1',
    shopId: 'shop1',
    customerId: 'cust1',
    bookingId: 'book1',
    serviceScore: 5,
    priceScore: 4,
    skillScore: 5,
    overallScore: 4.7,
    comment: '发型师技术很好，服务态度也很棒！',
    customerName: '张三',
    createdAt: new Date(Date.now() - 86400000),
  },
];

// 模拟排队队列
export const mockQueues: Queue[] = [
  {
    id: 'queue1',
    shopId: 'shop1',
    currentNumber: 1,
    estimatedWaitTime: 45,
    bookings: [mockBookings[0]],
  },
];

// 音效列表
export const soundOptions = [
  { id: 'chime', name: '清脆铃声' },
  { id: 'bell', name: '传统铃铛' },
  { id: 'notify', name: '通知音' },
  { id: 'ding', name: '叮咚声' },
];

// 生成模拟业绩数据
export function getMockStylistPerformance(
  stylistId: string, 
  shopId: string
): StylistPerformance {
  // 找到对应的发型师
  const shop = mockShops.find(s => s.id === shopId);
  const stylist = shop?.employees.find(e => e.id === stylistId);
  
  // 生成模拟业绩（基于评分）
  const baseRevenue = stylist?.rating ? (stylist.rating * 500) : 2000;
  
  return {
    stylistId,
    stylistName: stylist?.name || '发型师',
    avatar: stylist?.avatar,
    revenue: {
      today: Math.floor(baseRevenue * 0.12),
      week: Math.floor(baseRevenue * 0.5),
      month: Math.floor(baseRevenue * 2),
      year: Math.floor(baseRevenue * 24),
    },
    services: {
      total: Math.floor(Math.random() * 50) + 20,
      byType: {
        '精剪': Math.floor(Math.random() * 30) + 10,
        '烫染': Math.floor(Math.random() * 15) + 5,
        '护理': Math.floor(Math.random() * 10) + 3,
      }
    },
    estimatedCommission: Math.floor(baseRevenue * 0.3),
    averageRating: stylist?.rating || 4.5,
  };
}

// 获取模拟财务报表
export function getMockFinancialReport(shopId: string): FinancialReport {
  const shop = mockShops.find(s => s.id === shopId);
  
  const baseRevenue = 50000;
  
  // 生成发型师排名
  const topStylists = shop?.employees
    .filter(emp => emp.isActive)
    .map(emp => ({
      id: emp.id,
      name: emp.name,
      avatar: emp.avatar,
      revenue: Math.floor((emp.rating || 4.5) * 3000) + Math.floor(Math.random() * 2000),
      services: Math.floor(Math.random() * 50) + 20,
      rating: emp.rating || 4.5,
    }))
    .sort((a, b) => b.revenue - a.revenue) || [];
  
  return {
    revenue: {
      today: Math.floor(baseRevenue * 0.05) + Math.floor(Math.random() * 1000),
      week: Math.floor(baseRevenue * 0.3) + Math.floor(Math.random() * 5000),
      month: baseRevenue + Math.floor(Math.random() * 20000),
      year: baseRevenue * 12 + Math.floor(Math.random() * 100000),
    },
    services: {
      today: Math.floor(Math.random() * 20) + 5,
      week: Math.floor(Math.random() * 100) + 30,
      month: Math.floor(Math.random() * 400) + 100,
      year: Math.floor(Math.random() * 5000) + 1000,
    },
    averageTicket: {
      today: Math.floor(Math.random() * 100) + 150,
      week: Math.floor(Math.random() * 80) + 160,
      month: Math.floor(Math.random() * 70) + 170,
      year: Math.floor(Math.random() * 60) + 180,
    },
    topStylists,
  };
}

// 辅助：计算日期范围
export function getDefaultDateRange(): DateRange {
  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);
  
  return {
    start: lastWeek,
    end: today,
  };
}

// 获取老板视角 - 多店铺概览数据
export function getOwnerDashboard(): OwnerDashboard {
  // 计算所有店铺的总体数据
  const baseRevenue = 150000;
  const baseServices = 800;
  const baseCustomers = 600;
  
  // 店铺统计
  const shopStats = mockShops.map(shop => {
    const shopRevenue = Math.floor(baseRevenue * (0.3 + Math.random() * 0.2));
    return {
      shopId: shop.id,
      shopName: shop.name,
      revenue: shopRevenue,
      services: Math.floor(baseServices * (shopRevenue / baseRevenue)),
      customers: Math.floor(baseCustomers * (shopRevenue / baseRevenue)),
      rating: shop.rating,
      employees: shop.employees.filter(e => e.isActive).length,
    };
  });
  
  // 跨店铺发型师排名
  const topStylists = mockShops.flatMap(shop => 
    shop.employees
      .filter(emp => emp.isActive)
      .map(emp => ({
        id: emp.id,
        name: emp.name,
        shopId: shop.id,
        shopName: shop.name,
        avatar: emp.avatar,
        revenue: Math.floor((emp.rating || 4.5) * 5000) + Math.floor(Math.random() * 3000),
        services: Math.floor(Math.random() * 60) + 30,
        rating: emp.rating || 4.5,
      }))
  ).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  
  return {
    totalRevenue: {
      today: Math.floor(baseRevenue * 0.04) + Math.floor(Math.random() * 2000),
      week: Math.floor(baseRevenue * 0.25) + Math.floor(Math.random() * 10000),
      month: baseRevenue + Math.floor(Math.random() * 50000),
      year: baseRevenue * 12 + Math.floor(Math.random() * 200000),
    },
    totalServices: {
      today: Math.floor(Math.random() * 40) + 15,
      week: Math.floor(Math.random() * 200) + 80,
      month: baseServices + Math.floor(Math.random() * 200),
      year: baseServices * 12 + Math.floor(Math.random() * 2000),
    },
    totalCustomers: {
      today: Math.floor(Math.random() * 30) + 10,
      week: Math.floor(Math.random() * 150) + 60,
      month: baseCustomers + Math.floor(Math.random() * 150),
      year: baseCustomers * 12 + Math.floor(Math.random() * 1500),
    },
    averageRating: mockShops.reduce((sum, s) => sum + s.rating, 0) / mockShops.length,
    shopStats,
    topStylists,
  };
}

// 模拟退款申请数据
export const mockRefundRequests: RefundRequest[] = [
  {
    id: 'refund1',
    bookingId: 'booking1',
    customerId: 'customer1',
    customerName: '张三',
    shopId: 'shop1',
    shopName: '潮流造型',
    amount: 68,
    reason: '服务时间与预约不符，等待时间过长',
    status: RefundStatus.PENDING,
    createdAt: new Date(Date.now() - 86400000),
  },
  {
    id: 'refund2',
    bookingId: 'booking2',
    customerId: 'customer2',
    customerName: '李四',
    shopId: 'shop1',
    shopName: '潮流造型',
    amount: 128,
    reason: '发型师技术不满意',
    status: RefundStatus.APPROVED,
    createdAt: new Date(Date.now() - 172800000),
    processedAt: new Date(Date.now() - 86400000),
    processedBy: '店主',
    refundMethod: 'original',
  },
  {
    id: 'refund3',
    bookingId: 'booking3',
    customerId: 'customer3',
    customerName: '王五',
    shopId: 'shop2',
    shopName: '时尚发艺',
    amount: 88,
    reason: '临时有事无法到店',
    status: RefundStatus.COMPLETED,
    createdAt: new Date(Date.now() - 259200000),
    processedAt: new Date(Date.now() - 172800000),
    processedBy: '店长',
    refundMethod: 'original',
  },
];

// 模拟客户反馈数据
export const mockCustomerFeedbacks: CustomerFeedback[] = [
  {
    id: 'feedback1',
    customerId: 'customer1',
    customerName: '张三',
    shopId: 'shop1',
    bookingId: 'booking1',
    type: FeedbackType.COMPLAINT,
    title: '服务态度问题',
    content: '发型师在服务过程中频繁接打电话，影响服务体验',
    status: 'pending',
    priority: 'high',
    createdAt: new Date(Date.now() - 43200000),
  },
  {
    id: 'feedback2',
    customerId: 'customer2',
    customerName: '李四',
    shopId: 'shop1',
    type: FeedbackType.SUGGESTION,
    title: '建议增加周末营业时间',
    content: '希望周末能延长营业时间到晚上10点，方便上班族',
    status: 'processing',
    priority: 'medium',
    createdAt: new Date(Date.now() - 86400000),
  },
  {
    id: 'feedback3',
    customerId: 'customer3',
    customerName: '王五',
    shopId: 'shop2',
    type: FeedbackType.PRAISE,
    title: '非常满意的服务',
    content: '发型师技术很好，服务态度也很棒，环境舒适',
    status: 'resolved',
    priority: 'low',
    createdAt: new Date(Date.now() - 172800000),
    resolvedAt: new Date(Date.now() - 86400000),
    resolvedBy: '店长',
    resolution: '感谢您的认可，我们会继续保持优质服务！',
  },
];

// 生成模拟商品数据
export function generateMockProducts(shopId: string): Product[] {
  return [
    {
      id: `p${shopId}_1`,
      shopId,
      name: '真人发丝假发 - 自然黑中长发',
      category: ProductCategory.WIG,
      price: 1280,
      originalPrice: 1580,
      description: '100%真人发丝，自然逼真，透气舒适，可烫可染',
      images: [
        'https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?w=400&h=400&fit=crop',
      ],
      stock: 50,
      sales: 128,
      isActive: true,
      rating: 4.8,
      reviewCount: 56,
      tags: ['热销', '新品'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: `p${shopId}_2`,
      shopId,
      name: '高端假发 - 亚麻棕大波浪',
      category: ProductCategory.WIG,
      price: 2580,
      originalPrice: 3280,
      description: '高端定制，手织工艺，轻盈舒适，明星同款',
      images: [
        'https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=400&h=400&fit=crop',
      ],
      stock: 25,
      sales: 68,
      isActive: true,
      rating: 4.9,
      reviewCount: 32,
      tags: ['高端', '明星同款'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: `p${shopId}_3`,
      shopId,
      name: '专业防脱洗发水 500ml',
      category: ProductCategory.HAIR_CARE,
      price: 168,
      originalPrice: 218,
      description: '蕴含生姜精华，有效防脱固发，滋养发根',
      images: [
        'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?w=400&h=400&fit=crop',
      ],
      stock: 200,
      sales: 356,
      isActive: true,
      rating: 4.7,
      reviewCount: 142,
      tags: ['热销', '防脱'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: `p${shopId}_4`,
      shopId,
      name: '深层滋养发膜 300ml',
      category: ProductCategory.HAIR_CARE,
      price: 128,
      originalPrice: 168,
      description: '深度滋养，修复受损发质，让头发柔顺亮泽',
      images: [
        'https://images.unsplash.com/photo-1571875257727-256c39da4228?w=400&h=400&fit=crop',
      ],
      stock: 180,
      sales: 289,
      isActive: true,
      rating: 4.6,
      reviewCount: 98,
      tags: ['滋养', '修复'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: `p${shopId}_5`,
      shopId,
      name: '强力定型发胶 500ml',
      category: ProductCategory.STYLING,
      price: 88,
      originalPrice: 128,
      description: '强力定型，持久不塌，清爽不粘腻',
      images: [
        'https://images.unsplash.com/photo-1616394584738-fc6e612e7169?w=400&h=400&fit=crop',
      ],
      stock: 150,
      sales: 423,
      isActive: true,
      rating: 4.5,
      reviewCount: 186,
      tags: ['热销', '定型'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: `p${shopId}_6`,
      shopId,
      name: '专业美发剪刀套装',
      category: ProductCategory.TOOLS,
      price: 398,
      originalPrice: 498,
      description: '德国工艺，锋利耐用，专业发型师首选',
      images: [
        'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=400&h=400&fit=crop',
      ],
      stock: 45,
      sales: 78,
      isActive: true,
      rating: 4.9,
      reviewCount: 45,
      tags: ['专业', '德国工艺'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
}

// 获取客户成功指标
export function getCustomerSuccessMetrics(customerId: string): CustomerSuccessMetrics {
  const customer = mockCustomers.find(c => c.id === customerId);
  const bookings = mockBookings.filter(b => b.customerId === customerId);
  
  return {
    customerId,
    totalBookings: bookings.length,
    completedBookings: bookings.filter(b => b.status === 'completed').length,
    cancelledBookings: bookings.filter(b => b.status === 'cancelled').length,
    totalSpent: bookings
      .filter(b => b.status === 'completed')
      .reduce((sum, b) => sum + (b.price || 0), 0),
    averageRating: 4.5,
    lastVisitDate: bookings.length > 0 ? new Date(bookings[0].scheduledTime) : undefined,
    loyaltyPoints: Math.floor(Math.random() * 500) + 100,
    membershipLevel: ['regular', 'silver', 'gold', 'platinum'][Math.floor(Math.random() * 4)] as any,
    customerSince: new Date(Date.now() - Math.floor(Math.random() * 365) * 86400000),
  };
}
