import { Router, Request, Response } from 'express';

const router = Router();

const generateId = () => Math.random().toString(36).substr(2, 9);

// 商品数据存储（内存存储，实际项目中应该用数据库）
interface Product {
  id: string;
  shopId: string;
  name: string;
  category: string;
  price: number;
  costPrice?: number;
  stock: number;
  minStock?: number;
  maxStock?: number;
  unit: string;
  barcode?: string;
  description?: string;
  images?: string[];
  status: 'active' | 'inactive' | 'discontinued';
  createdAt: Date;
  updatedAt: Date;
}

const products: Product[] = [
  {
    id: 'prod1',
    shopId: 'shop1',
    name: '洗发水',
    category: '洗护用品',
    price: 68,
    costPrice: 35,
    stock: 100,
    minStock: 20,
    maxStock: 200,
    unit: '瓶',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'prod2',
    shopId: 'shop1',
    name: '护发素',
    category: '洗护用品',
    price: 58,
    costPrice: 28,
    stock: 80,
    minStock: 15,
    maxStock: 150,
    unit: '瓶',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// 库存变动记录
interface StockRecord {
  id: string;
  productId: string;
  productName: string;
  type: 'in' | 'out' | 'adjust';
  quantity: number;
  beforeStock: number;
  afterStock: number;
  reason?: string;
  operatorId?: string;
  operatorName?: string;
  createdAt: Date;
}

const stockRecords: StockRecord[] = [];

// ==================== 商品 CRUD API ====================

// 获取商品列表
router.get('/', (req: Request, res: Response) => {
  const {
    shopId,
    category,
    status,
    keyword,
    lowStock,
    page = '1',
    pageSize = '20'
  } = req.query;

  let result = [...products];

  // 店铺筛选
  if (shopId) {
    result = result.filter((p) => p.shopId === shopId);
  }

  // 分类筛选
  if (category) {
    result = result.filter((p) => p.category === category);
  }

  // 状态筛选
  if (status) {
    result = result.filter((p) => p.status === status);
  }

  // 关键词搜索
  if (keyword) {
    const kw = (keyword as string).toLowerCase();
    result = result.filter((p) =>
      p.name.toLowerCase().includes(kw) ||
      p.barcode?.includes(kw)
    );
  }

  // 低库存筛选
  if (lowStock === 'true') {
    result = result.filter((p) => p.minStock && p.stock <= p.minStock);
  }

  // 按更新时间倒序
  result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  // 分页
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

// 获取单个商品详情
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const product = products.find((p) => p.id === id);

  if (!product) {
    return res.status(404).json({ success: false, error: '商品不存在' });
  }

  res.json({ success: true, data: product });
});

// 创建商品
router.post('/', (req: Request, res: Response) => {
  const {
    shopId,
    name,
    category,
    price,
    costPrice,
    stock = 0,
    minStock,
    maxStock,
    unit,
    barcode,
    description,
    images
  } = req.body;

  // 验证必填字段
  if (!shopId || !name || !category || price === undefined) {
    return res.status(400).json({
      success: false,
      error: '店铺ID、商品名称、分类和价格为必填项'
    });
  }

  // 检查条码是否重复
  if (barcode) {
    const existing = products.find((p) => p.barcode === barcode);
    if (existing) {
      return res.status(400).json({ success: false, error: '条码已存在' });
    }
  }

  const product: Product = {
    id: generateId(),
    shopId,
    name,
    category,
    price,
    costPrice,
    stock,
    minStock,
    maxStock,
    unit: unit || '瓶',
    barcode,
    description,
    images,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  products.push(product);

  res.status(201).json({ success: true, data: product });
});

// 更新商品
router.put('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    name,
    category,
    price,
    costPrice,
    minStock,
    maxStock,
    unit,
    barcode,
    description,
    images,
    status
  } = req.body;

  const product = products.find((p) => p.id === id);
  if (!product) {
    return res.status(404).json({ success: false, error: '商品不存在' });
  }

  // 检查条码是否重复
  if (barcode && barcode !== product.barcode) {
    const existing = products.find((p) => p.barcode === barcode && p.id !== id);
    if (existing) {
      return res.status(400).json({ success: false, error: '条码已存在' });
    }
  }

  // 更新字段
  if (name !== undefined) product.name = name;
  if (category !== undefined) product.category = category;
  if (price !== undefined) product.price = price;
  if (costPrice !== undefined) product.costPrice = costPrice;
  if (minStock !== undefined) product.minStock = minStock;
  if (maxStock !== undefined) product.maxStock = maxStock;
  if (unit !== undefined) product.unit = unit;
  if (barcode !== undefined) product.barcode = barcode;
  if (description !== undefined) product.description = description;
  if (images !== undefined) product.images = images;
  if (status !== undefined) product.status = status;
  product.updatedAt = new Date();

  res.json({ success: true, data: product });
});

// 删除商品
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = products.findIndex((p) => p.id === id);

  if (index === -1) {
    return res.status(404).json({ success: false, error: '商品不存在' });
  }

  const deleted = products.splice(index, 1)[0];

  res.json({
    success: true,
    data: {
      id: deleted.id,
      name: deleted.name,
      message: '商品已删除'
    }
  });
});

// ==================== 库存管理 API ====================

// 获取库存列表
router.get('/inventory/list', (req: Request, res: Response) => {
  const { shopId, lowStock } = req.query;

  let result = products.filter((p) => p.shopId === shopId);

  // 低库存筛选
  if (lowStock === 'true') {
    result = result.filter((p) => p.minStock && p.stock <= p.minStock);
  }

  const inventory = result.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    stock: p.stock,
    minStock: p.minStock,
    maxStock: p.maxStock,
    unit: p.unit,
    status: p.minStock && p.stock <= p.minStock ? 'low' : 'normal',
  }));

  res.json({ success: true, data: inventory });
});

// 库存入库
router.post('/:id/stock/in', (req: Request, res: Response) => {
  const { id } = req.params;
  const { quantity, reason, operatorId, operatorName } = req.body;

  if (!quantity || quantity <= 0) {
    return res.status(400).json({ success: false, error: '入库数量必须大于0' });
  }

  const product = products.find((p) => p.id === id);
  if (!product) {
    return res.status(404).json({ success: false, error: '商品不存在' });
  }

  const beforeStock = product.stock;
  product.stock += quantity;
  product.updatedAt = new Date();

  // 记录库存变动
  const record: StockRecord = {
    id: generateId(),
    productId: id,
    productName: product.name,
    type: 'in',
    quantity,
    beforeStock,
    afterStock: product.stock,
    reason,
    operatorId,
    operatorName,
    createdAt: new Date(),
  };
  stockRecords.push(record);

  res.json({
    success: true,
    data: {
      productId: id,
      productName: product.name,
      beforeStock,
      afterStock: product.stock,
      quantity,
      record,
    },
  });
});

// 库存出库
router.post('/:id/stock/out', (req: Request, res: Response) => {
  const { id } = req.params;
  const { quantity, reason, operatorId, operatorName } = req.body;

  if (!quantity || quantity <= 0) {
    return res.status(400).json({ success: false, error: '出库数量必须大于0' });
  }

  const product = products.find((p) => p.id === id);
  if (!product) {
    return res.status(404).json({ success: false, error: '商品不存在' });
  }

  if (product.stock < quantity) {
    return res.status(400).json({ success: false, error: '库存不足' });
  }

  const beforeStock = product.stock;
  product.stock -= quantity;
  product.updatedAt = new Date();

  // 记录库存变动
  const record: StockRecord = {
    id: generateId(),
    productId: id,
    productName: product.name,
    type: 'out',
    quantity,
    beforeStock,
    afterStock: product.stock,
    reason,
    operatorId,
    operatorName,
    createdAt: new Date(),
  };
  stockRecords.push(record);

  res.json({
    success: true,
    data: {
      productId: id,
      productName: product.name,
      beforeStock,
      afterStock: product.stock,
      quantity,
      record,
    },
  });
});

// 库存调整
router.post('/:id/stock/adjust', (req: Request, res: Response) => {
  const { id } = req.params;
  const { quantity, reason, operatorId, operatorName } = req.body;

  if (quantity === undefined) {
    return res.status(400).json({ success: false, error: '调整后库存数量必填' });
  }

  if (quantity < 0) {
    return res.status(400).json({ success: false, error: '库存不能为负数' });
  }

  const product = products.find((p) => p.id === id);
  if (!product) {
    return res.status(404).json({ success: false, error: '商品不存在' });
  }

  const beforeStock = product.stock;
  product.stock = quantity;
  product.updatedAt = new Date();

  // 记录库存变动
  const record: StockRecord = {
    id: generateId(),
    productId: id,
    productName: product.name,
    type: 'adjust',
    quantity: Math.abs(quantity - beforeStock),
    beforeStock,
    afterStock: product.stock,
    reason: reason || '库存盘点调整',
    operatorId,
    operatorName,
    createdAt: new Date(),
  };
  stockRecords.push(record);

  res.json({
    success: true,
    data: {
      productId: id,
      productName: product.name,
      beforeStock,
      afterStock: product.stock,
      record,
    },
  });
});

// 获取库存变动记录
router.get('/:id/stock/records', (req: Request, res: Response) => {
  const { id } = req.params;
  const { page = '1', pageSize = '20' } = req.query;

  const records = stockRecords
    .filter((r) => r.productId === id)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const pageNum = parseInt(page as string, 10);
  const pageSizeNum = parseInt(pageSize as string, 10);
  const total = records.length;
  const start = (pageNum - 1) * pageSizeNum;
  const paginatedResult = records.slice(start, start + pageSizeNum);

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

// 获取商品分类列表
router.get('/categories/list', (req: Request, res: Response) => {
  const { shopId } = req.query;

  const shopProducts = shopId
    ? products.filter((p) => p.shopId === shopId)
    : products;

  const categories = [...new Set(shopProducts.map((p) => p.category))];

  res.json({ success: true, data: categories });
});

// 获取库存统计
router.get('/inventory/stats', (req: Request, res: Response) => {
  const { shopId } = req.query;

  const shopProducts = shopId
    ? products.filter((p) => p.shopId === shopId)
    : products;

  const stats = {
    totalProducts: shopProducts.length,
    activeProducts: shopProducts.filter((p) => p.status === 'active').length,
    lowStockProducts: shopProducts.filter((p) => p.minStock && p.stock <= p.minStock).length,
    outOfStockProducts: shopProducts.filter((p) => p.stock === 0).length,
    totalStockValue: shopProducts.reduce((sum, p) => sum + p.stock * (p.costPrice || p.price), 0),
  };

  res.json({ success: true, data: stats });
});

export default router;
