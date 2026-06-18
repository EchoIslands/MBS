import { Router, Request, Response } from 'express';

const router = Router();

const generateId = () => Math.random().toString(36).substr(2, 9);

// 鍟嗗搧鏁版嵁瀛樺偍锛堝唴瀛樺瓨鍌紝瀹為檯椤圭洰涓簲璇ョ敤鏁版嵁搴擄級
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
    name: '娲楀彂姘?,
    category: '娲楁姢鐢ㄥ搧',
    price: 68,
    costPrice: 35,
    stock: 100,
    minStock: 20,
    maxStock: 200,
    unit: '鐡?,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 'prod2',
    shopId: 'shop1',
    name: '鎶ゅ彂绱?,
    category: '娲楁姢鐢ㄥ搧',
    price: 58,
    costPrice: 28,
    stock: 80,
    minStock: 15,
    maxStock: 150,
    unit: '鐡?,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// 搴撳瓨鍙樺姩璁板綍
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

// ==================== 鍟嗗搧 CRUD API ====================

// 鑾峰彇鍟嗗搧鍒楄〃
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

  // 搴楅摵绛涢€?  if (shopId) {
    result = result.filter((p) => p.shopId === shopId);
  }

  // 鍒嗙被绛涢€?  if (category) {
    result = result.filter((p) => p.category === category);
  }

  // 鐘舵€佺瓫閫?  if (status) {
    result = result.filter((p) => p.status === status);
  }

  // 鍏抽敭璇嶆悳绱?  if (keyword) {
    const kw = (keyword as string).toLowerCase();
    result = result.filter((p) => 
      p.name.toLowerCase().includes(kw) || 
      p.barcode?.includes(kw)
    );
  }

  // 浣庡簱瀛樼瓫閫?  if (lowStock === 'true') {
    result = result.filter((p) => p.minStock && p.stock <= p.minStock);
  }

  // 鎸夋洿鏂版椂闂村€掑簭
  result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  // 鍒嗛〉
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

// 鑾峰彇鍗曚釜鍟嗗搧璇︽儏
router.get('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const product = products.find((p) => p.id === id);

  if (!product) {
    return res.status(404).json({ success: false, error: '鍟嗗搧涓嶅瓨鍦? });
  }

  res.json({ success: true, data: product });
});

// 鍒涘缓鍟嗗搧
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

  // 楠岃瘉蹇呭～瀛楁
  if (!shopId || !name || !category || price === undefined) {
    return res.status(400).json({ 
      success: false, 
      error: '搴楅摵ID銆佸晢鍝佸悕绉般€佸垎绫诲拰浠锋牸涓哄繀濉」' 
    });
  }

  // 妫€鏌ユ潯鐮佹槸鍚﹂噸澶?  if (barcode) {
    const existing = products.find((p) => p.barcode === barcode);
    if (existing) {
      return res.status(400).json({ success: false, error: '鏉＄爜宸插瓨鍦? });
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
    unit: unit || '浠?,
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

// 鏇存柊鍟嗗搧
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
    return res.status(404).json({ success: false, error: '鍟嗗搧涓嶅瓨鍦? });
  }

  // 妫€鏌ユ潯鐮佹槸鍚﹂噸澶?  if (barcode && barcode !== product.barcode) {
    const existing = products.find((p) => p.barcode === barcode && p.id !== id);
    if (existing) {
      return res.status(400).json({ success: false, error: '鏉＄爜宸插瓨鍦? });
    }
  }

  // 鏇存柊瀛楁
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

// 鍒犻櫎鍟嗗搧
router.delete('/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const index = products.findIndex((p) => p.id === id);

  if (index === -1) {
    return res.status(404).json({ success: false, error: '鍟嗗搧涓嶅瓨鍦? });
  }

  const deleted = products.splice(index, 1)[0];

  res.json({ 
    success: true, 
    data: { 
      id: deleted.id, 
      name: deleted.name,
      message: '鍟嗗搧宸插垹闄? 
    } 
  });
});

// ==================== 搴撳瓨绠＄悊 API ====================

// 鑾峰彇搴撳瓨鍒楄〃
router.get('/inventory/list', (req: Request, res: Response) => {
  const { shopId, lowStock } = req.query;

  let result = products.filter((p) => p.shopId === shopId);

  // 浣庡簱瀛樼瓫閫?  if (lowStock === 'true') {
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

// 搴撳瓨鍏ュ簱
router.post('/:id/stock/in', (req: Request, res: Response) => {
  const { id } = req.params;
  const { quantity, reason, operatorId, operatorName } = req.body;

  if (!quantity || quantity <= 0) {
    return res.status(400).json({ success: false, error: '鍏ュ簱鏁伴噺蹇呴』澶т簬0' });
  }

  const product = products.find((p) => p.id === id);
  if (!product) {
    return res.status(404).json({ success: false, error: '鍟嗗搧涓嶅瓨鍦? });
  }

  const beforeStock = product.stock;
  product.stock += quantity;
  product.updatedAt = new Date();

  // 璁板綍搴撳瓨鍙樺姩
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

// 搴撳瓨鍑哄簱
router.post('/:id/stock/out', (req: Request, res: Response) => {
  const { id } = req.params;
  const { quantity, reason, operatorId, operatorName } = req.body;

  if (!quantity || quantity <= 0) {
    return res.status(400).json({ success: false, error: '鍑哄簱鏁伴噺蹇呴』澶т簬0' });
  }

  const product = products.find((p) => p.id === id);
  if (!product) {
    return res.status(404).json({ success: false, error: '鍟嗗搧涓嶅瓨鍦? });
  }

  if (product.stock < quantity) {
    return res.status(400).json({ success: false, error: '搴撳瓨涓嶈冻' });
  }

  const beforeStock = product.stock;
  product.stock -= quantity;
  product.updatedAt = new Date();

  // 璁板綍搴撳瓨鍙樺姩
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

// 搴撳瓨璋冩暣
router.post('/:id/stock/adjust', (req: Request, res: Response) => {
  const { id } = req.params;
  const { quantity, reason, operatorId, operatorName } = req.body;

  if (quantity === undefined) {
    return res.status(400).json({ success: false, error: '璋冩暣鍚庡簱瀛樻暟閲忓繀濉? });
  }

  if (quantity < 0) {
    return res.status(400).json({ success: false, error: '搴撳瓨涓嶈兘涓鸿礋鏁? });
  }

  const product = products.find((p) => p.id === id);
  if (!product) {
    return res.status(404).json({ success: false, error: '鍟嗗搧涓嶅瓨鍦? });
  }

  const beforeStock = product.stock;
  product.stock = quantity;
  product.updatedAt = new Date();

  // 璁板綍搴撳瓨鍙樺姩
  const record: StockRecord = {
    id: generateId(),
    productId: id,
    productName: product.name,
    type: 'adjust',
    quantity: Math.abs(quantity - beforeStock),
    beforeStock,
    afterStock: product.stock,
    reason: reason || '搴撳瓨鐩樼偣璋冩暣',
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

// 鑾峰彇搴撳瓨鍙樺姩璁板綍
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

// 鑾峰彇鍟嗗搧鍒嗙被鍒楄〃
router.get('/categories/list', (req: Request, res: Response) => {
  const { shopId } = req.query;

  const shopProducts = shopId 
    ? products.filter((p) => p.shopId === shopId)
    : products;

  const categories = [...new Set(shopProducts.map((p) => p.category))];

  res.json({ success: true, data: categories });
});

// 鑾峰彇搴撳瓨缁熻
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

