import { Shop, Customer, Booking, Review, Queue, Service, OpeningHours, Employee } from './types';

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
  'shop2': '123456',
  'shop3': '123456',
};

// 模拟理发店数据
export const mockShops: Shop[] = [
  {
    id: 'shop1',
    name: '风格美发沙龙',
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
      { id: 'e1', name: '李明', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=LiMing', title: '首席发型师', rating: 4.9, isActive: true, specialty: '精剪、烫染' },
      { id: 'e2', name: '王芳', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=WangFang', title: '资深发型师', rating: 4.7, isActive: true, specialty: '护理、造型' },
      { id: 'e3', name: '张伟', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=ZhangWei', title: '发型师', rating: 4.5, isActive: true, specialty: '精剪' },
    ],
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
