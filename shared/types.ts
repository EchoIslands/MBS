export interface Service {
  id: string;
  name: string;
  price: number;
  duration: number;
  description?: string;
}

// 商品分类
export enum ProductCategory {
  WIG = 'wig',              // 假发
  HAIR_CARE = 'hair_care',  // 洗发养发产品
  STYLING = 'styling',      // 造型产品
  TOOLS = 'tools',          // 美发工具
  ACCESSORY = 'accessory',  // 配饰
  OTHER = 'other',          // 其他
}

// 商品
export interface Product {
  id: string;
  shopId: string;
  name: string;
  category: ProductCategory;
  price: number;
  originalPrice?: number;   // 原价（用于显示折扣）
  description: string;
  images: string[];
  stock: number;            // 库存
  sales: number;            // 销量
  isActive: boolean;        // 是否上架
  rating?: number;          // 评分
  reviewCount?: number;     // 评价数
  tags?: string[];          // 标签
  createdAt: Date;
  updatedAt: Date;
}

// 购物车项
export interface CartItem {
  id: string;
  productId: string;
  product: Product;
  quantity: number;
  selected: boolean;
}

// 商品订单
export interface ProductOrder {
  id: string;
  shopId: string;
  customerId: string;
  customerName?: string;
  items: Array<{
    productId: string;
    productName: string;
    price: number;
    quantity: number;
  }>;
  totalAmount: number;
  status: 'pending' | 'confirmed' | 'shipped' | 'completed' | 'cancelled';
  shippingAddress?: string;
  phone?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Employee {
  id: string;
  name: string;
  phone?: string; // 发型师手机号
  avatar?: string;
  title?: string; // 职称，如：首席发型师、资深发型师等
  rating: number; // 员工个人评分
  isActive: boolean;
  specialty?: string; // 专长，如：精剪、烫染等
}

export interface OpeningHours {
  [key: string]: {
    open: string;
    close: string;
    isOpen: boolean;
  };
}

export interface Shop {
  id: string;
  name: string;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
  images: string[];
  services: Service[];
  employees: Employee[];
  products: Product[]; // 新增：店铺商品
  openingHours: OpeningHours;
  level?: 'excellent' | 'good' | 'average' | 'poor'; // 保留但可选，不再显示
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  distance?: number; // 计算的距离（公里）
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  avatar?: string;
}

export interface Booking {
  id: string;
  shopId: string;
  customerId: string;
  serviceId: string;
  barberId?: string;
  barberName?: string;
  scheduledTime: Date;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  notes?: string;
  queueNumber?: number;
  serviceName?: string;
  price?: number;
  customerName?: string;
  shopName?: string;
}

export interface Queue {
  id: string;
  shopId: string;
  bookings: Booking[];
  currentNumber: number;
  estimatedWaitTime: number;
}

export interface Review {
  id: string;
  shopId: string;
  customerId: string;
  bookingId: string;
  serviceScore: number;
  priceScore: number;
  skillScore: number;
  overallScore: number;
  comment: string;
  customerName?: string;
  createdAt: Date;
}

export interface Reminder {
  id: string;
  bookingId: string;
  minutesBefore: number;
  sound: string;
  isEnabled: boolean;
}

// 美发SaaS系统角色定义
export enum UserRole {
  CUSTOMER = 'customer',        // 顾客
  PLATFORM_ADMIN = 'platform_admin',  // 平台管理员
  SHOP_OWNER = 'shop_owner',    // 老板/加盟商
  SHOP_MANAGER = 'shop_manager',  // 店长
  STYLIST = 'stylist',          // 发型师/技师
  RECEPTIONIST = 'receptionist',  // 前台/助理
  CASHIER = 'cashier',          // 收银员
}

// 权限配置
export interface RolePermissions {
  role: UserRole;
  // 数据访问权限
  canViewAllStylists: boolean;   // 查看所有发型师数据
  canViewFinancials: boolean;     // 查看财务数据
  canManageEmployees: boolean;   // 员工管理
  canExportData: boolean;        // 导出数据
  canManageBookings: boolean;    // 预约管理
  canManageServices: boolean;    // 服务项目管理
}

// 扩展员工类型，加入角色关联
export interface Employee {
  id: string;
  name: string;
  avatar?: string;
  title?: string;
  rating: number;
  isActive: boolean;
  specialty?: string;
  // 新增：员工关联的系统用户角色
  userId?: string;
  role?: UserRole;
}

// 业绩统计 - 发型师个人
export interface StylistPerformance {
  stylistId: string;
  stylistName: string;
  avatar?: string;
  // 业绩数据
  revenue: {
    today: number;
    week: number;
    month: number;
    year: number;
  };
  // 服务统计
  services: {
    total: number;
    byType: Record<string, number>;
  };
  // 预计提成
  estimatedCommission: number;
  // 评分
  averageRating: number;
}

// 财务报表
export interface FinancialReport {
  // 营收数据
  revenue: {
    today: number;
    week: number;
    month: number;
    year: number;
  };
  // 服务数据
  services: {
    today: number;
    week: number;
    month: number;
    year: number;
  };
  // 客单价
  averageTicket: {
    today: number;
    week: number;
    month: number;
    year: number;
  };
  // 发型师排名
  topStylists: Array<{
    id: string;
    name: string;
    avatar?: string;
    revenue: number;
    services: number;
    rating: number;
  }>;
}

// 日期范围
export interface DateRange {
  start: Date;
  end: Date;
}

// 老板视角 - 多店铺概览
export interface OwnerDashboard {
  // 总体数据
  totalRevenue: {
    today: number;
    week: number;
    month: number;
    year: number;
  };
  totalServices: {
    today: number;
    week: number;
    month: number;
    year: number;
  };
  totalCustomers: {
    today: number;
    week: number;
    month: number;
    year: number;
  };
  // 店铺列表
  shopStats: Array<{
    shopId: string;
    shopName: string;
    revenue: number;
    services: number;
    customers: number;
    employees: number;
  }>;
  // 跨店铺发型师排名
  topStylists: Array<{
    id: string;
    name: string;
    shopId: string;
    shopName: string;
    avatar?: string;
    revenue: number;
    services: number;
    rating: number;
  }>;
}

// 退款申请状态
export enum RefundStatus {
  PENDING = 'pending',       // 待处理
  APPROVED = 'approved',     // 已批准
  REJECTED = 'rejected',     // 已拒绝
  COMPLETED = 'completed',   // 已完成
}

// 退款申请
export interface RefundRequest {
  id: string;
  bookingId: string;
  customerId: string;
  customerName: string;
  shopId: string;
  shopName: string;
  amount: number;
  reason: string;
  status: RefundStatus;
  createdAt: Date;
  processedAt?: Date;
  processedBy?: string;
  rejectReason?: string;
  refundMethod?: 'original' | 'balance' | 'bank';  // 退款方式
}

// 客户反馈类型
export enum FeedbackType {
  COMPLAINT = 'complaint',     // 投诉
  SUGGESTION = 'suggestion',   // 建议
  PRAISE = 'praise',          // 表扬
  QUESTION = 'question',       // 咨询
}

// 客户反馈
export interface CustomerFeedback {
  id: string;
  customerId: string;
  customerName: string;
  shopId?: string;
  bookingId?: string;
  type: FeedbackType;
  title: string;
  content: string;
  status: 'pending' | 'processing' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  createdAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string;
  resolution?: string;
  attachments?: string[];
}

// 客户成功指标
export interface CustomerSuccessMetrics {
  customerId: string;
  totalBookings: number;
  completedBookings: number;
  cancelledBookings: number;
  totalSpent: number;
  averageRating: number;
  lastVisitDate?: Date;
  nextBookingDate?: Date;
  loyaltyPoints: number;
  membershipLevel: 'regular' | 'silver' | 'gold' | 'platinum';
  customerSince: Date;
}

export interface AppState {
  userRole: UserRole;
  currentCustomer: Customer | null;
  currentShop: Shop | null;
  // 新增：当前登录的员工
  currentEmployee: Employee | null;
  // 新增：购物车
  cart: CartItem[];
  // 登录时可以选择发型师身份
  setUserRole: (role: UserRole) => void;
  setCurrentCustomer: (customer: Customer | null) => void;
  setCurrentShop: (shop: Shop | null) => void;
  setCurrentEmployee: (employee: Employee | null) => void;
  logout: () => void;
  // 新增：购物车操作
  addToCart: (product: Product, quantity?: number) => void;
  updateCartItem: (itemId: string, quantity: number) => void;
  removeFromCart: (itemId: string) => void;
  toggleCartItemSelection: (itemId: string) => void;
  selectAllCartItems: (selected: boolean) => void;
  clearCart: () => void;
}
