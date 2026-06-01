export interface Service {
  id: string;
  name: string;
  price: number;
  duration: number;
  description?: string;
}

export interface Employee {
  id: string;
  name: string;
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
  openingHours: OpeningHours;
  rating: number;
  reviewCount: number;
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

export type UserRole = 'customer' | 'shop' | null;

export interface AppState {
  userRole: UserRole;
  currentCustomer: Customer | null;
  currentShop: Shop | null;
  setUserRole: (role: UserRole) => void;
  setCurrentCustomer: (customer: Customer | null) => void;
  setCurrentShop: (shop: Shop | null) => void;
  logout: () => void;
}
