import { Shop, Booking, Review, Queue } from '../shared/types';
import { mockShops, mockBookings, mockReviews, mockQueues } from '../shared/mockData';

// 直接使用模拟数据，不依赖后端
export const shopApi = {
  getNearbyShops: async (lat?: number, lon?: number, level?: string): Promise<Shop[]> => {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, 500));
    return mockShops;
  },
  
  getShop: async (id: string): Promise<Shop> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    const shop = mockShops.find(s => s.id === id);
    if (!shop) throw new Error('Shop not found');
    return shop;
  },
  
  getShopBookings: async (id: string): Promise<Booking[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return mockBookings.filter(b => b.shopId === id);
  },
  
  getShopReviews: async (id: string): Promise<Review[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return mockReviews.filter(r => r.shopId === id);
  },
  
  getShopQueue: async (id: string): Promise<Queue> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    const queue = mockQueues.find(q => q.shopId === id);
    if (!queue) throw new Error('Queue not found');
    return queue;
  },
};

// 预约相关API
export const bookingApi = {
  createBooking: async (data: Omit<Booking, 'id' | 'queueNumber' | 'serviceName' | 'price' | 'customerName' | 'shopName'>): Promise<Booking> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const shop = mockShops.find(s => s.id === data.shopId);
    const service = shop?.services.find(s => s.id === data.serviceId);
    
    const newBooking: Booking = {
      id: Date.now().toString(),
      ...data,
      queueNumber: mockBookings.length + 1,
      serviceName: service?.name || '服务',
      price: service?.price || 0,
      customerName: '顾客',
      shopName: shop?.name || '店铺',
    };
    
    mockBookings.push(newBooking);
    return newBooking;
  },
  
  getBooking: async (id: string): Promise<Booking> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    const booking = mockBookings.find(b => b.id === id);
    if (!booking) throw new Error('Booking not found');
    return booking;
  },
  
  updateBookingStatus: async (id: string, status: Booking['status']): Promise<Booking> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    const index = mockBookings.findIndex(b => b.id === id);
    if (index !== -1) {
      mockBookings[index].status = status;
    }
    const booking = mockBookings.find(b => b.id === id);
    if (!booking) throw new Error('Booking not found');
    return booking;
  },
  
  getCustomerBookings: async (customerId: string): Promise<Booking[]> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return mockBookings.filter(b => b.customerId === customerId);
  },
};

// 评价相关API
export const reviewApi = {
  createReview: async (data: Omit<Review, 'id' | 'overallScore' | 'customerName' | 'createdAt'>): Promise<Review> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const overallScore = Math.round((data.serviceScore + data.priceScore + data.skillScore) / 3 * 10) / 10;
    const newReview: Review = {
      id: Date.now().toString(),
      ...data,
      overallScore,
      customerName: '顾客',
      createdAt: new Date(),
    };
    mockReviews.push(newReview);
    return newReview;
  },
};

// 队列相关API
export const queueApi = {
  getQueue: async (shopId: string): Promise<Queue> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    let queue = mockQueues.find(q => q.shopId === shopId);
    if (!queue) {
      queue = {
        id: Date.now().toString(),
        shopId,
        currentNumber: 1,
        estimatedWaitTime: 30,
        bookings: mockBookings.filter(b => b.shopId === shopId),
      };
      mockQueues.push(queue);
    }
    return queue;
  },
  
  updateQueue: async (shopId: string, data: Partial<Queue>): Promise<Queue> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    let queue = mockQueues.find(q => q.shopId === shopId);
    if (queue) {
      Object.assign(queue, data);
    }
    return queue!;
  },
};
