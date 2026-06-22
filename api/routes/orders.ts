import { Router, Request, Response } from 'express';
import { mockCustomers } from '../_internal/mockData.js';

const router = Router();

const generateId = () => Math.random().toString(36).substr(2, 9);

// ==================== 数据模型 ====================

interface CartItem {
  productId: string;
  productName: string;
  price: number;
  quantity: number;
}

interface Cart {
  id: string;
  customerId: string;
  shopId: string;
  items: CartItem[];
  createdAt: Date;
  updatedAt: Date;
}

interface Order {
  id: string;
  orderNo: string;
  customerId: string;
  customerName: string;
  shopId: string;
  items: CartItem[];
  totalAmount: number;
  discountAmount: number;
  payAmount: number;
  status: 'pending' | 'paid' | 'completed' | 'cancelled' | 'refunded';
  paymentMethod?: string;
  paymentTime?: Date;
  note?: string;
  createdAt: Date;
  updatedAt: Date;
}

// 购物车存储
const carts: Cart[] = [];

// 订单存储
const orders: Order[] = [
  {
    id: 'order1',
    orderNo: 'ORD20260616001',
    customerId: 'cust1',
    customerName: '张三',
    shopId: 'shop1',
    items: [
      { productId: 'prod1', productName: '洗发水', price: 68, quantity: 2 },
    ],
    totalAmount: 136,
    discountAmount: 0,
    payAmount: 136,
    status: 'completed',
    paymentMethod: 'wechat',
    paymentTime: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// ==================== 购物车 API ====================

// 获取购物车
router.get('/cart/:customerId', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const { shopId } = req.query;

  let cart = carts.find((c) => c.customerId === customerId && c.shopId === shopId);

  if (!cart) {
    // 返回空购物车
    cart = {
      id: generateId(),
      customerId,
      shopId: shopId as string,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  const totalAmount = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalQuantity = cart.items.reduce((sum, item) => sum + item.quantity, 0);

  res.json({
    success: true,
    data: {
      ...cart,
      totalAmount,
      totalQuantity,
    },
  });
});

// 添加商品到购物车
router.post('/cart/:customerId/items', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const { shopId, productId, productName, price, quantity = 1 } = req.body;

  if (!shopId || !productId || !productName || price === undefined) {
    return res.status(400).json({ 
      success: false, 
      error: '店铺ID、商品ID、商品名称和价格为必填项' 
    });
  }

  let cart = carts.find((c) => c.customerId === customerId && c.shopId === shopId);

  if (!cart) {
    cart = {
      id: generateId(),
      customerId,
      shopId,
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    carts.push(cart);
  }

  // 检查是否已存在该商品
  const existingItem = cart.items.find((item) => item.productId === productId);
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    cart.items.push({ productId, productName, price, quantity });
  }

  cart.updatedAt = new Date();

  const totalAmount = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  res.json({
    success: true,
    data: {
      ...cart,
      totalAmount,
    },
  });
});

// 更新购物车商品数量
router.put('/cart/:customerId/items/:productId', (req: Request, res: Response) => {
  const { customerId, productId } = req.params;
  const { shopId, quantity } = req.body;

  if (quantity === undefined || quantity < 0) {
    return res.status(400).json({ success: false, error: '数量必须大于等于0' });
  }

  const cart = carts.find((c) => c.customerId === customerId && c.shopId === shopId);
  if (!cart) {
    return res.status(404).json({ success: false, error: '购物车不存在' });
  }

  const item = cart.items.find((i) => i.productId === productId);
  if (!item) {
    return res.status(404).json({ success: false, error: '购物车中无此商品' });
  }

  if (quantity === 0) {
    // 数量为0时删除商品
    cart.items = cart.items.filter((i) => i.productId !== productId);
  } else {
    item.quantity = quantity;
  }

  cart.updatedAt = new Date();
  const totalAmount = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  res.json({
    success: true,
    data: {
      ...cart,
      totalAmount,
    },
  });
});

// 删除购物车商品
router.delete('/cart/:customerId/items/:productId', (req: Request, res: Response) => {
  const { customerId, productId } = req.params;
  const { shopId } = req.query;

  const cart = carts.find((c) => c.customerId === customerId && c.shopId === shopId);
  if (!cart) {
    return res.status(404).json({ success: false, error: '购物车不存在' });
  }

  const beforeCount = cart.items.length;
  cart.items = cart.items.filter((i) => i.productId !== productId);

  if (cart.items.length === beforeCount) {
    return res.status(404).json({ success: false, error: '购物车中无此商品' });
  }

  cart.updatedAt = new Date();
  const totalAmount = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  res.json({
    success: true,
    data: {
      ...cart,
      totalAmount,
      message: '商品已从购物车移除',
    },
  });
});

// 清空购物车
router.delete('/cart/:customerId', (req: Request, res: Response) => {
  const { customerId } = req.params;
  const { shopId } = req.query;

  const cart = carts.find((c) => c.customerId === customerId && c.shopId === shopId);
  if (!cart) {
    return res.status(404).json({ success: false, error: '购物车不存在' });
  }

  cart.items = [];
  cart.updatedAt = new Date();

  res.json({
    success: true,
    data: {
      message: '购物车已清空',
    },
  });
});

// ==================== 订单 API ====================

// 获取订单列表
router.get('/orders', (req: Request, res: Response) => {
  const { shopId, customerId, status, page = '1', pageSize = '20' } = req.query;

  let result = [...orders];

  if (shopId) {
    result = result.filter((o) => o.shopId === shopId);
  }
  if (customerId) {
    result = result.filter((o) => o.customerId === customerId);
  }
  if (status) {
    result = result.filter((o) => o.status === status);
  }

  result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const pageNum = parseInt(page as string, 10);
  const pageSizeNum = parseInt(pageSize as string, 10);
  const total = result.length;
  const start = (pageNum - 1) * pageSizeNum;
  const paginatedResult = result.slice(start, start + pageSizeNum);

  res.json({
    success: true,
    data: paginatedResult,
    pagination: {
      page: pageNum,
      pageSize: pageSizeNum,
      total,
      totalPages: Math.ceil(total / pageSizeNum),
    },
  });
});

// 获取订单详情
router.get('/orders/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const order = orders.find((o) => o.id === id);

  if (!order) {
    return res.status(404).json({ success: false, error: '订单不存在' });
  }

  res.json({ success: true, data: order });
});

// 创建订单（从购物车）
router.post('/orders', (req: Request, res: Response) => {
  const { customerId, shopId, note, discountAmount = 0 } = req.body;

  // 验证客户
  const customer = mockCustomers.find((c) => c.id === customerId);
  if (!customer) {
    return res.status(404).json({ success: false, error: '客户不存在' });
  }

  // 获取购物车
  const cart = carts.find((c) => c.customerId === customerId && c.shopId === shopId);
  if (!cart || cart.items.length === 0) {
    return res.status(400).json({ success: false, error: '购物车为空' });
  }

  const totalAmount = cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const payAmount = totalAmount - discountAmount;

  // 生成订单号
  const orderNo = `ORD${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${String(orders.length + 1).padStart(3, '0')}`;

  const order: Order = {
    id: generateId(),
    orderNo,
    customerId,
    customerName: customer.name,
    shopId,
    items: [...cart.items],
    totalAmount,
    discountAmount,
    payAmount,
    status: 'pending',
    note,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  orders.push(order);

  // 清空购物车
  cart.items = [];
  cart.updatedAt = new Date();

  res.status(201).json({ success: true, data: order });
});

// 支付订单
router.post('/orders/:id/pay', (req: Request, res: Response) => {
  const { id } = req.params;
  const { paymentMethod } = req.body;

  const order = orders.find((o) => o.id === id);
  if (!order) {
    return res.status(404).json({ success: false, error: '订单不存在' });
  }

  if (order.status !== 'pending') {
    return res.status(400).json({ success: false, error: '只能支付待付款订单' });
  }

  order.status = 'paid';
  order.paymentMethod = paymentMethod || 'wechat';
  order.paymentTime = new Date();
  order.updatedAt = new Date();

  // 更新客户累计消费
  const customer = mockCustomers.find((c) => c.id === order.customerId);
  if (customer) {
    customer.totalSpent = (customer.totalSpent || 0) + order.payAmount;
    customer.points = (customer.points || 0) + Math.floor(order.payAmount);
  }

  res.json({
    success: true,
    data: {
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentTime: order.paymentTime,
    },
  });
});

// 完成订单
router.post('/orders/:id/complete', (req: Request, res: Response) => {
  const { id } = req.params;

  const order = orders.find((o) => o.id === id);
  if (!order) {
    return res.status(404).json({ success: false, error: '订单不存在' });
  }

  if (order.status !== 'paid') {
    return res.status(400).json({ success: false, error: '只能完成已支付订单' });
  }

  order.status = 'completed';
  order.updatedAt = new Date();

  res.json({
    success: true,
    data: {
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
    },
  });
});

// 取消订单
router.post('/orders/:id/cancel', (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;

  const order = orders.find((o) => o.id === id);
  if (!order) {
    return res.status(404).json({ success: false, error: '订单不存在' });
  }

  if (!['pending', 'paid'].includes(order.status)) {
    return res.status(400).json({ success: false, error: '只能取消待付款或已支付订单' });
  }

  // 如果已支付，退款
  if (order.status === 'paid') {
    const customer = mockCustomers.find((c) => c.id === order.customerId);
    if (customer) {
      customer.totalSpent = Math.max(0, (customer.totalSpent || 0) - order.payAmount);
      customer.points = Math.max(0, (customer.points || 0) - Math.floor(order.payAmount));
    }
  }

  order.status = 'cancelled';
  (order as any).cancelReason = reason;
  order.updatedAt = new Date();

  res.json({
    success: true,
    data: {
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      cancelReason: reason,
    },
  });
});

// 申请退款
router.post('/orders/:id/refund', (req: Request, res: Response) => {
  const { id } = req.params;
  const { reason } = req.body;

  const order = orders.find((o) => o.id === id);
  if (!order) {
    return res.status(404).json({ success: false, error: '订单不存在' });
  }

  if (order.status !== 'completed') {
    return res.status(400).json({ success: false, error: '只能对已完成订单申请退款' });
  }

  order.status = 'refunded';
  (order as any).refundReason = reason;
  (order as any).refundedAt = new Date();
  order.updatedAt = new Date();

  // 退款给客户
  const customer = mockCustomers.find((c) => c.id === order.customerId);
  if (customer) {
    customer.totalSpent = Math.max(0, (customer.totalSpent || 0) - order.payAmount);
  }

  res.json({
    success: true,
    data: {
      id: order.id,
      orderNo: order.orderNo,
      status: order.status,
      refundReason: reason,
      refundedAt: (order as any).refundedAt,
    },
  });
});

// 获取订单统计
router.get('/orders/stats/summary', (req: Request, res: Response) => {
  const { shopId } = req.query;

  let shopOrders = orders;
  if (shopId) {
    shopOrders = orders.filter((o) => o.shopId === shopId);
  }

  const stats = {
    total: shopOrders.length,
    pending: shopOrders.filter((o) => o.status === 'pending').length,
    paid: shopOrders.filter((o) => o.status === 'paid').length,
    completed: shopOrders.filter((o) => o.status === 'completed').length,
    cancelled: shopOrders.filter((o) => o.status === 'cancelled').length,
    refunded: shopOrders.filter((o) => o.status === 'refunded').length,
    totalAmount: shopOrders.reduce((sum, o) => sum + o.totalAmount, 0),
    totalPayAmount: shopOrders.reduce((sum, o) => sum + o.payAmount, 0),
  };

  res.json({ success: true, data: stats });
});

export default router;
