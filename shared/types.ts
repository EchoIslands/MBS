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
  rating?: number; // 店铺评分
  reviewCount?: number; // 店铺评价数量
  bookingConfirmMode?: 'auto' | 'manual'; // 预约确认方式：auto 自动确认（默认），manual 手动确认
}

// 客户标签类型
export enum CustomerTag {
  HAIRCUT = 'haircut',           // 剪发
  PERM = 'perm',                 // 烫发
  COLOR = 'color',               // 染发
  TREATMENT = 'treatment',       // 护理
  WIG = 'wig',                   // 假发
  PRODUCTS = 'products',         // 产品消费
  FREQUENT = 'frequent',         // 常客
  NEW = 'new',                   // 新客户
  VIP = 'vip',                   // VIP会员
  STOCKHOLDER = 'stockholder',   // 股东
}

// 客户性别
export type Gender = 'male' | 'female' | 'other';

// ==================== 会员体系类型 ====================

// 购买型 VIP 会员等级（年卡制）
export const PurchaseVIPLevel = {
  REGULAR: 'regular',       // 普通用户（未购买）
  BRONZE: 'bronze',         // 普卡 VIP
  SILVER: 'silver',         // 银卡 VIP
  GOLD: 'gold',             // 金卡 VIP
  DIAMOND: 'diamond',       // 钻石 VIP
} as const;

export type PurchaseVIPLevel = typeof PurchaseVIPLevel[keyof typeof PurchaseVIPLevel];

// 储值会员等级
export const StoredValueLevel = {
  NONE: 'none',             // 未储值
  STORE_500: 'store_500',   // 储值卡 500
  STORE_1000: 'store_1000', // 安心卡 1000
  STORE_2000: 'store_2000', // 顺心卡 2000
  STORE_5000: 'store_5000', // 随心卡 5000
} as const;

export type StoredValueLevel = typeof StoredValueLevel[keyof typeof StoredValueLevel];

// 旧的会员等级（兼容保留，后续逐步替换为双体系）
export const MembershipLevel = {
  REGULAR: 'regular',
  PREMIUM: 'premium',
  STOCKHOLDER: 'stockholder',
  NORMAL: 'normal',
  SILVER: 'silver',
  GOLD: 'gold',
  PLATINUM: 'platinum',
} as const;

export type MembershipLevel = typeof MembershipLevel[keyof typeof MembershipLevel];

// 权益类型
export enum BenefitType {
  SHAMPOO = 'shampoo',           // 洗发水
  CONDITIONER = 'conditioner',   // 护发素（女士）
  FREE_HAIRCUT = 'free_haircut', // 免费剪发（钻石 VIP）
  DRINK = 'drink',               // 咖啡/饮料
  REDO = 'redo',                 // 不满意重做
}

// 权益记录状态
export type BenefitStatus = 'available' | 'used' | 'expired';

// 储值流水类型
export enum StoredValueTxType {
  RECHARGE = 'recharge',           // 充值/购买储值卡
  UPGRADE = 'upgrade',             // 储值卡升级补差价
  CONSUME = 'consume',             // 消费扣款
  REFUND = 'refund',               // 退款
  REFERRAL_BONUS = 'referral_bonus', // 推荐返现
  WITHDRAW = 'withdraw',           // 提现
}

// 扩展客户信息 - 完整定义见文件末尾（CustomerProfile、Reviews等已加入
// 占位（稍后删除 - 保留以保证结构）
// 客户信息详细定义见下方 Customer 接口

// 结算项明细（含原价、折扣后价）
export interface SettlementItem {
  type: 'service' | 'product';
  id: string;
  name: string;
  originalPrice: number;         // 原价
  quantity: number;
  discountedPrice: number;       // 折后单价
  total: number;                 // 折后小计
  category?: ProductCategory;    // 商品分类（用于假发等排除折扣）
}

// 结算折扣明细
export interface SettlementDiscountDetail {
  purchaseVIPDiscount: number;   // 购买 VIP 折扣率
  storedValueDiscount: number;   // 储值折扣率
  finalDiscount: number;         // 最终折扣率（折上折）
  purchaseVIPDiscountAmount: number; // 购买 VIP 减免金额
  storedValueDiscountAmount: number; // 储值减免金额
  benefitDiscountAmount: number;     // 权益抵扣金额（如免费剪发）
  discount: number;              // 总折扣金额
}

// 结算记录
export interface Settlement {
  id: string;
  shopId: string;
  customerId: string;
  customerName: string;
  bookingId?: string;
  items: SettlementItem[];
  subtotal: number;              // 原价小计
  discountDetail: SettlementDiscountDetail;
  discount: number;              // 总折扣金额
  tax: number;                   // 税费
  total: number;                 // 实付总计
  paymentMethod: 'cash' | 'wechat' | 'alipay' | 'card' | 'balance';
  paymentStatus: 'pending' | 'completed' | 'failed';
  usedBenefitIds?: string[];     // 本次核销的权益 ID
  createdAt: Date;
  processedBy?: string;          // 操作员
}

// 满意度回访
export interface SatisfactionSurvey {
  id: string;
  bookingId: string;
  customerId: string;
  customerName: string;
  shopId: string;
  rating: number;                // 1-5星
  comment?: string;              // 评价内容
  recommended: boolean;          // 是否推荐给朋友
  createdAt: Date;
}

// 会员权益（旧版兼容，后续替换）
export interface MembershipBenefit {
  level: MembershipLevel;
  discount: number;              // 折扣比例（如0.9表示9折）
  pointsRate: number;            // 积分倍率
  gifts: string[];               // 赠送礼物
  canBecomeStockholder: boolean; // 是否可成为股东
  referralBonusRate?: number;    // 推荐提成比例
}

// 购买型 VIP 会员计划
export interface PurchaseVIPPlan {
  level: PurchaseVIPLevel;
  name: string;                  // 显示名称，如"普卡 VIP"
  price: number;                 // 购买价格
  period: string;                // 有效期，如"1年"
  discount: number;              // 消费折扣（0.88 表示 8.8 折）
  pointsRate: number;            // 积分倍率
  benefits: string[];            // 权益说明
  color: string;                 // UI 主题色
}

// 储值会员计划
export interface StoredValuePlan {
  level: StoredValueLevel;
  name: string;                  // 显示名称，如"储值卡"
  amount: number;                // 储值金额
  discount: number;              // 消费折扣（0.90 表示 9 折）
  pointsRate: number;            // 积分倍率
  benefits: string[];            // 权益说明
  color: string;                 // UI 主题色
}

// 会员权益记录（可核销）
export interface MemberBenefitRecord {
  id: string;
  customerId: string;
  type: BenefitType;
  name: string;
  description?: string;
  status: BenefitStatus;
  grantedAt: Date;
  grantedBy?: string;            // 发放员工 ID
  usedAt?: Date;
  usedBy?: string;               // 核销员工 ID
  usedOrderId?: string;          // 关联订单 ID
  expiresAt?: Date;              // 过期时间
}

// 储值余额流水
export interface StoredValueTransaction {
  id: string;
  customerId: string;
  type: StoredValueTxType;
  amount: number;                // 正数为增加，负数为扣减
  balanceAfter: number;          // 变动后总余额
  referralPortion: number;       // 本次变动中来自返现的部分
  orderId?: string;              // 关联订单
  relatedBenefitId?: string;     // 关联权益/返现记录
  note?: string;
  createdAt: Date;
  createdBy?: string;            // 操作员工 ID
}

// 推荐记录
export interface ReferralRecord {
  id: string;
  referrerId: string;            // 推荐人ID
  referrerName: string;          // 推荐人姓名
  referredId: string;            // 被推荐人ID
  referredName: string;          // 被推荐人姓名
  referredPhone: string;         // 被推荐人电话
  bonusAmount: number;           // 提成金额
  status: 'pending' | 'confirmed' | 'paid';
  createdAt: Date;
  confirmedAt?: Date;            // 确认日期（首次消费后）
}

export interface Booking {
  id: string;
  shopId: string;
  customerId: string;
  serviceId: string;
  barberId?: string;
  barberName?: string;
  stylistId?: string;        // 与 barberId 同义，后端统一使用
  stylistName?: string;      // 与 barberName 同义，后端统一使用
  scheduledTime: Date;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  notes?: string;
  queueNumber?: number;
  serviceName?: string;
  price?: number;
  customerName?: string;
  customerPhone?: string;
  shopName?: string;
  createdAt?: Date;
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
  stylistId?: string;           // 发型师ID
  serviceScore: number;
  priceScore: number;
  skillScore: number;
  overallScore: number;
  comment: string;
  customerName?: string;
  createdAt: Date;
  // 店铺端回复与展示控制
  reply?: string;
  replyBy?: string;
  replyAt?: Date;
  isHidden?: boolean;
}

export interface Reminder {
  id: string;
  bookingId: string;
  minutesBefore: number;
  sound: string;
  isEnabled: boolean;
}

// 美发SaaS系统角色定义（按权限由高到低）
export enum UserRole {
  CUSTOMER = 'customer',        // 顾客
  PLATFORM_ADMIN = 'platform_admin',  // 平台管理员
  CEO = 'ceo',                  // CEO - 最高权限
  CUSTOMER_SERVICE = 'customer_service',  // 客服专员 - 复购客户维护/回访
  SHOP_OWNER = 'shop_owner',    // 老板/加盟商
  SHOP_MANAGER = 'shop_manager',  // 店长 - 只能看客户信息，不能导出
  STYLIST = 'stylist',          // 发型师/技师 - 只能看自己服务的客户
  RECEPTIONIST = 'receptionist',  // 前台/助理
  CASHIER = 'cashier',          // 收银员
}

// 权限配置（细化到具体功能
export interface RolePermissions {
  role: UserRole;
  // 客户管理权限
  canViewAllCustomers: boolean;      // 查看所有客户
  canViewOwnCustomers: boolean;   // 查看自己服务的客户
  canEditCustomerInfo: boolean;    // 编辑客户信息
  canEditCustomerProfile: boolean; // 编辑客户画像/偏好
  canExportCustomerData: boolean; // 导出客户数据
  canDeleteCustomer: boolean;      // 删除客户
  canDoCustomerFollowUp: boolean; // 做客户回访
  // 员工管理权限
  canViewAllStylists: boolean;   // 查看所有发型师数据
  canManageEmployees: boolean;    // 员工管理
  // 财务权限
  canViewFinancials: boolean;     // 查看财务数据
  canExportData: boolean;        // 导出数据
  // 预约权限
  canManageBookings: boolean;    // 预约管理
  // 服务管理
  canManageServices: boolean;    // 服务项目管理
  // 评价管理
  canViewReviews: boolean;       // 查看评价
  canReplyReview: boolean;     // 回复评价
  // 店铺管理
  canManageShop: boolean;   // 店铺管理
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
  // 新增：手艺人数据（Step 1 - 手艺值、服务数、作品集、评价数、擅长标签）
  skillValue?: number;          // 手艺值（综合评分 0-5）
  totalServices?: number;        // 累计服务数
  reviewCount?: number;          // 评价数
  tags?: string[];              // 擅长标签，如 ["日系短发", "男士油头"]
  portfolio?: string[];          // 作品集图片URL
  // 近 7 天收入（管理端用）
  weeklyRevenue?: number;
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
  CANCELLED = 'cancelled',   // 已取消
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

// ==================== 客户画像相关类型 ====================
// 客户到店记录
export interface CustomerVisitRecord {
  id: string;
  customerId: string;
  shopId: string;
  bookingId?: string;
  stylistId?: string;       // 服务技师ID
  stylistName?: string;     // 服务技师姓名
  serviceIds: string[];     // 服务项目ID
  serviceNames: string[];   // 服务项目名称
  products?: Array<{
    id: string;
    name: string;
    quantity: number;
  }>;                      // 购买的产品
  totalAmount: number;      // 本次消费金额
  paymentMethod?: string;
  checkInTime: Date;        // 到店时间
  checkOutTime?: Date;     // 离开时间
  notes?: string;           // 备注
  createdAt: Date;
}

// 客户偏好字段类型 - 用于技师做选择题形式的画像记录
// 发型偏好
export enum HaircutStylePreference {
  SHORT = 'short',           // 短发
  MEDIUM = 'medium',         // 中发
  LONG = 'long',             // 长发
  BOB = 'bob',               // 波波头
  PIXIE = 'pixie',           // 精灵短发
  UNDERCUT = 'undercut',     // 两侧剃短
  LAYERED = 'layered',       // 层次发
  BANGS = 'bangs',           // 有刘海
}

// 发色偏好
export enum HairColorPreference {
  NATURAL_BLACK = 'natural_black',    // 自然黑
  BROWN = 'brown',                    // 棕色系
  RED = 'red',                        // 红色系
  GOLD = 'gold',                      // 金色系
  FASHION_COLOR = 'fashion',          // 潮色(蓝/紫/粉)
  GRAY = 'gray',                      // 奶奶灰
  TWO_TONE = 'two_tone',              // 双色
}

// 烫染偏好
export enum PermColorPreference {
  STRAIGHT = 'straight',              // 拉直
  BIG_CURL = 'big_curl',              // 大卷
  SMALL_CURL = 'small_curl',          // 小卷
  PERM_ROOTS = 'perm_roots',          // 根烫
  DIGITAL_PERM = 'digital_perm',      // 数码烫
  NO_PERM = 'no_perm',                // 不烫发
}

// 护理偏好
export enum TreatmentPreference {
  DEEP_TREATMENT = 'deep',          // 深层护理
  KERATIN = 'keratin',              // 角蛋白
  SCALP_CARE = 'scalp',             // 头皮护理
  OIL_TREATMENT = 'oil',            // 精油护理
  MOISTURE = 'moisture',            // 补水护理
  NO_TREATMENT = 'no_treatment',    // 不做护理
}

// 发质类型
export enum HairType {
  DRY = 'dry',                       // 干性
  OILY = 'oily',                     // 油性
  NORMAL = 'normal',                 // 中性
  MIXED = 'mixed',                   // 混合性
  DAMAGED = 'damaged',               // 受损
  COLOR_TREATED = 'color_treated',   // 染后
}

// 发型长度
export enum HairLength {
  SUPER_SHORT = 'super_short',      // 超短发
  SHORT = 'short',                  // 短发
  MEDIUM = 'medium',                // 中发
  LONG = 'long',                    // 长发
  SUPER_LONG = 'super_long',        // 超长发
}

// 消费频次偏好
export enum VisitFrequency {
  EVERY_2_WEEKS = '2_weeks',        // 每2周1次
  EVERY_MONTH = 'month',             // 每月1次
  EVERY_2_MONTHS = '2_months',       // 每2个月1次
  EVERY_3_MONTHS = '3_months',      // 每季度1次
  IRREGULAR = 'irregular',           // 不固定
}

// 消费预算范围
export enum BudgetRange {
  UNDER_100 = 'under_100',          // 100以下
  R100_300 = '100_300',             // 100-300
  R300_500 = '300_500',             // 300-500
  R500_1000 = '500_1000',           // 500-1000
  OVER_1000 = 'over_1000',           // 1000以上
}

// 沟通风格偏好
export enum CommunicationStyle {
  QUIET = 'quiet',                   // 安静型，喜欢安静服务
  CHATTY = 'chatty',                 // 聊天型，喜欢边做边聊
  PROFESSIONAL = 'professional',     // 专业型，只问服务相关
  NO_PREFERENCE = 'no_preference',   // 无所谓
}

// 附加服务偏好
export enum ExtraServicePreference {
  HEAD_MASSAGE = 'head_massage',     // 头部按摩
  FACE_WASH = 'face_wash',           // 洗脸
  BEARD_TRIM = 'beard_trim',         // 修胡须
  HAIR_WASH = 'hair_wash',           // 特色洗头
  HOT_TOWEL = 'hot_towel',           // 热毛巾
  NO_EXTRA = 'no_extra',             // 不需要附加服务
}

// 到店时间偏好
export enum VisitTimePreference {
  MORNING = 'morning',               // 上午(9-12)
  AFTERNOON = 'afternoon',           // 下午(12-18)
  EVENING = 'evening',               // 晚上(18-21)
  WEEKEND = 'weekend',               // 周末
  WEEKDAY = 'weekday',               // 工作日
}

// 客户画像 - 详细的客户偏好记录（由技师录入，选择题形式
export interface CustomerProfile {
  id: string;
  customerId: string;
  updatedBy: string;               // 更新人(技师ID)
  updatedByName: string;           // 更新人姓名
  updatedAt: Date;
  // 基本特征 - 选择题
  haircutStyles: HaircutStylePreference[]; // 喜欢的发型(多选)
  hairColors: HairColorPreference[];        // 喜欢的发色(多选)
  permColors: PermColorPreference[];        // 烫染偏好(多选)
  treatments: TreatmentPreference[];        // 护理偏好(多选)
  hairType: HairType;                       // 发质(单选)
  hairLength: HairLength;                   // 头发长度(单选)
  visitFrequency: VisitFrequency;           // 预计到店频率(单选)
  budgetRange: BudgetRange;                 // 消费预算(单选)
  communicationStyle: CommunicationStyle;   // 沟通风格(单选)
  extraServices: ExtraServicePreference[];  // 喜欢的附加服务(多选)
  visitTimes: VisitTimePreference[];        // 喜欢的到店时间(多选)
  // 文本补充
  notes?: string;                           // 其他备注(技师可以简单写)
  allergies?: string;                       // 过敏信息
  productsUsed?: string[];                  // 推荐使用的产品
  // 画像生成时间
  createdAt: Date;
}

// ==================== 评价系统 ====================
// 客户对店铺的评价
export interface ShopReview {
  id: string;
  shopId: string;
  customerId: string;
  customerName: string;
  customerAvatar?: string;
  bookingId?: string;
  rating: number;                   // 1-5星
  // 细项评分
  serviceRating: number;            // 服务态度
  skillRating: number;              // 技术水平
  environmentRating: number;        // 环境
  priceRating: number;              // 性价比
  comment: string;                  // 评价内容
  tags?: string[];                  // 评价标签(自动生成)
  images?: string[];                // 图片
  reply?: string;                   // 店铺回复
  replyBy?: string;                 // 回复人
  replyAt?: Date;                   // 回复时间
  isHidden: boolean;                // 是否隐藏
  createdAt: Date;
}

// 客户对技师的评价
export interface StylistReview {
  id: string;
  shopId: string;
  stylistId: string;
  stylistName: string;
  customerId: string;
  customerName: string;
  customerAvatar?: string;
  bookingId?: string;
  serviceName?: string;             // 服务项目
  rating: number;                   // 1-5星
  // 细项评分
  skillRating: number;              // 技术
  serviceRating: number;            // 态度
  communicationRating: number;      // 沟通
  comment: string;
  tags?: string[];                  // 评价标签
  reply?: string;                   // 技师回复
  replyAt?: Date;
  isHidden: boolean;
  createdAt: Date;
}

// ==================== 回访记录 ====================
// 客户回访记录 - 客服专员/店长进行的回访工作
export interface FollowUpRecord {
  id: string;
  customerId: string;
  customerName: string;
  shopId: string;
  followUpBy: string;              // 回访人ID
  followUpByName: string;          // 回访人姓名
  type: 'phone' | 'wechat' | 'sms' | 'visit' | 'other'; // 回访方式
  purpose: 'satisfaction' | 'rebooking' | 'complaint' | 'membership' | 'promotion' | 'other';
  result: 'success' | 'pending' | 'failed' | 'no_answer';
  rating?: number;                  // 客户反馈满意度(1-5)
  comment: string;                  // 回访内容
  nextAction?: string;              // 下一步行动
  nextFollowUpAt?: Date;           // 下次回访时间
  bookingId?: string;
  createdAt: Date;
}

// 扩展Customer，添加技师关联（该客户由哪些技师服务过
export interface Customer {
  id: string;
  name: string;
  phone: string;
  wechat?: string;               // 微信
  avatar?: string;
  gender?: Gender;
  age?: number;
  birthday?: Date;               // 生日
  idCardNumber?: string;         // 身份证号
  hobbies?: string;              // 爱好及其它
  tags: CustomerTag[];
  visitCount: number;
  totalSpent: number;            // 消费金额（累计）
  lastServiceItems?: string[];   // 上次消费项目
  lastServiceAmount?: number;    // 上次消费金额
  hasBooking?: boolean;          // 是否预约
  lastStylist?: string;          // 上次服务设计师
  // ===== 新版会员体系（双轨并行）=====
  purchaseVIPLevel: PurchaseVIPLevel;     // 购买型 VIP 等级
  purchaseVIPExpiresAt?: Date;            // VIP 到期时间（1 年有效期）
  storedValueLevel: StoredValueLevel;     // 储值会员等级
  storedValueBalance: number;             // 储值总余额（本金 + 返现）
  withdrawableReferralAmount: number;     // 可提现返现余额

  // ===== 兼容旧字段（后续逐步替换）=====
  membershipLevel?: MembershipLevel;      // 旧会员等级（兼容）
  isMember?: boolean;                     // 是否会员（兼容）
  hasRecharged?: boolean;                 // 是否充值（兼容）
  rechargeLevel?: string;                 // 充值级别（兼容）
  balance?: number;                       // 旧余额字段（兼容，请使用 storedValueBalance）

  // ===== 股东/共享基金相关（保留旧机制）=====
  sharedFund?: number;                    // 共享基金
  totalSharedFund?: number;               // 合计共享基金
  withdrawableAmount?: number;            // 可取现金额

  points: number;
  isReferred?: boolean;                   // 是否转介绍
  referrerName?: string;                  // 转介绍人员
  referrerPhone?: string;                 // 转介绍人员电话
  referralConsumption?: number;           // 转介绍带来的消费金额
  joinedAt: Date;
  lastVisitAt?: Date;
  preferences?: string[];
  // 股东相关
  isStockholder: boolean;
  stockholderSince?: Date;
  referralBonusRate?: number;
  referralEarnings?: number;
  // 新增：客户画像
  profile?: CustomerProfile;
  // 新增：服务过该客户的技师列表
  servedByStylistIds?: string[];
  // 新增：到店记录
  visitRecords?: CustomerVisitRecord[];
  // 新增：来源
  source?: string;
  // 新增：会员累计节省金额、召回相关
  totalSaved?: number;           // 作为高级/股东会员累计节省的金额
  daysSinceLastVisit?: number;   // 距离上次到店天数（计算字段）
  estimatedNextVisitAt?: Date;   // 预计下次到店时间
  churnRisk?: 'low' | 'medium' | 'high';  // 流失风险
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
  updateShop: (shopData: Partial<Shop>) => void;
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
