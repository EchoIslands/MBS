import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus,
  Edit, 
  Trash2, 
  Eye, 
  EyeOff, 
  Save,
  Package,
  Loader2,
  Upload,
  X,
  AlertTriangle,
  History,
} from 'lucide-react';
import { useAppStore } from '../../store';
import { Product, ProductCategory, ProductInventoryLog } from '../../../shared/types';
import { productApi } from '../../api';
import ShopLayout from './ShopLayout';

const categoryNames: Record<ProductCategory, string> = {
  [ProductCategory.WIG]: '假发',
  [ProductCategory.HAIR_CARE]: '洗护用品',
  [ProductCategory.STYLING]: '造型产品',
  [ProductCategory.TOOLS]: '美发工具',
  [ProductCategory.ACCESSORY]: '配饰',
  [ProductCategory.OTHER]: '其他',
};

const ProductManagement: React.FC = () => {
  const { currentShop } = useAppStore();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [inventoryModal, setInventoryModal] = useState<{ open: boolean; product?: Product; stock: string; reason: string }>({ open: false, stock: '', reason: '' });
  const [logsModal, setLogsModal] = useState<{ open: boolean; product?: Product; logs: ProductInventoryLog[]; loading: boolean }>({ open: false, logs: [], loading: false });
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState<Partial<Product>>({
    name: '',
    category: ProductCategory.OTHER,
    price: 0,
    originalPrice: undefined,
    description: '',
    images: ['https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&h=400&fit=crop'],
    stock: 0,
    sales: 0,
    isActive: true,
    tags: [],
  });

  const shopId = currentShop?.id || '';

  useEffect(() => {
    const fetchProducts = async () => {
      if (!shopId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await productApi.getByShop(shopId);
        if (Array.isArray(data)) {
          setProducts(data.map((p: unknown) => {
            const item = p as Partial<Product>;
            return {
              ...item,
              createdAt: item.createdAt ? new Date(item.createdAt) : new Date(),
              updatedAt: item.updatedAt ? new Date(item.updatedAt) : new Date(),
            } as Product;
          }));
        }
      } catch (err: unknown) {
        console.error('[ProductManagement] 获取商品失败:', err);
        alert('获取商品失败：' + (err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [shopId]);

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      ...product,
      isRecommended: product.isRecommended ?? false,
      isActive: product.isActive ?? true,
      sortOrder: product.sortOrder ?? 0,
      lowStockThreshold: product.lowStockThreshold ?? 10,
    });
    setShowModal(true);
  };

  const handleAdd = () => {
    setEditingProduct(null);
    setFormData({
      name: '',
      category: ProductCategory.OTHER,
      price: 0,
      originalPrice: undefined,
      description: '',
      images: ['https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&h=400&fit=crop'],
      stock: 0,
      sales: 0,
      isActive: true,
      isRecommended: false,
      sortOrder: 0,
      lowStockThreshold: 10,
      tags: [],
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.category || formData.price === undefined) {
      alert('请填写完整信息');
      return;
    }
    if (!shopId) {
      alert('未选择店铺');
      return;
    }

    setSaving(true);
    try {
      if (editingProduct) {
        const updated = await productApi.update(shopId, editingProduct.id, formData);
        if (updated) {
          setProducts(products.map(p => 
            p.id === editingProduct.id 
              ? { ...p, ...updated, updatedAt: new Date(updated.updatedAt || Date.now()) } as Product
              : p
          ));
        }
      } else {
        const newProduct = await productApi.create(shopId, {
          name: formData.name,
          category: formData.category,
          price: formData.price,
          originalPrice: formData.originalPrice,
          description: formData.description,
          images: formData.images || ['https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&h=400&fit=crop'],
          stock: formData.stock || 0,
          sales: formData.sales || 0,
          isActive: formData.isActive ?? true,
          isRecommended: formData.isRecommended,
          sortOrder: formData.sortOrder,
          rating: 5,
          reviewCount: 0,
          tags: formData.tags || [],
        });
        if (newProduct) {
          setProducts([...products, {
            ...newProduct,
            createdAt: new Date(newProduct.createdAt || Date.now()),
            updatedAt: new Date(newProduct.updatedAt || Date.now()),
          }]);
        }
      }
      setShowModal(false);
      setEditingProduct(null);
    } catch (err: unknown) {
      console.error('[ProductManagement] 保存商品失败:', err);
      alert('保存失败：' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('图片大小不能超过 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setFormData((prev) => ({ ...prev, images: [base64] }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setFormData((prev) => ({ ...prev, images: ['https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&h=400&fit=crop'] }));
  };

  const handleDelete = async (productId: string) => {
    if (!confirm('确定要删除这个商品吗？')) return;
    if (!shopId) return;
    try {
      const ok = await productApi.delete(shopId, productId);
      if (ok) {
        setProducts(products.filter(p => p.id !== productId));
      } else {
        alert('删除失败');
      }
    } catch (err: unknown) {
      console.error('[ProductManagement] 删除商品失败:', err);
      alert('删除失败：' + (err as Error).message);
    }
  };

  const toggleStatus = async (productId: string) => {
    if (!shopId) return;
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const nextIsActive = !product.isActive;
    try {
      const updated = await productApi.update(shopId, productId, { isActive: nextIsActive });
      if (updated) {
        setProducts(products.map(p => 
          p.id === productId 
            ? { ...p, isActive: nextIsActive, updatedAt: new Date(updated.updatedAt || Date.now()) }
            : p
        ));
      }
    } catch (err: unknown) {
      console.error('[ProductManagement] 切换商品状态失败:', err);
      alert('操作失败：' + (err as Error).message);
    }
  };

  const openInventoryModal = (product: Product) => {
    setInventoryModal({ open: true, product, stock: String(product.stock), reason: '' });
  };

  const handleAdjustInventory = async () => {
    if (!shopId || !inventoryModal.product) return;
    const stockNum = Number(inventoryModal.stock);
    if (Number.isNaN(stockNum) || stockNum < 0) {
      alert('请输入有效的库存数量');
      return;
    }
    if (!inventoryModal.reason.trim()) {
      alert('请填写调整原因');
      return;
    }
    setSaving(true);
    try {
      const updated = await productApi.adjustInventory(shopId, inventoryModal.product.id, stockNum, inventoryModal.reason.trim());
      if (updated) {
        setProducts(products.map(p => (p.id === inventoryModal.product!.id ? { ...p, ...updated, updatedAt: new Date(updated.updatedAt || Date.now()) } : p)));
        setInventoryModal({ open: false, stock: '', reason: '' });
      } else {
        alert('调整库存失败');
      }
    } catch (err: unknown) {
      console.error('[ProductManagement] 调整库存失败:', err);
      alert('调整失败：' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const openLogsModal = async (product: Product) => {
    if (!shopId) return;
    setLogsModal({ open: true, product, logs: [], loading: true });
    try {
      const logs = await productApi.getInventoryLogs(shopId, product.id);
      setLogsModal({ open: true, product, logs: logs || [], loading: false });
    } catch (err: unknown) {
      console.error('[ProductManagement] 获取库存记录失败:', err);
      alert('获取记录失败：' + (err as Error).message);
      setLogsModal({ open: true, product, logs: [], loading: false });
    }
  };

  const formatDate = (date?: string | Date) => {
    if (!date) return '-';
    const d = typeof date === 'string' ? new Date(date) : date;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const isLowStock = (product: Product) => {
    const threshold = product.lowStockThreshold ?? 10;
    return product.stock <= threshold;
  };

  const logTypeLabels: Record<string, string> = {
    sale: '销售扣减',
    refund: '退款回滚',
    manual_adjust: '手动调整',
    init: '初始库存',
    cancel: '订单取消',
  };

  return (
    <ShopLayout title="商品管理">
      <div className="min-h-screen bg-gray-50">
        {loading && (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <Loader2 size={32} className="animate-spin mr-2" />
            加载中...
          </div>
        )}

        {!loading && (
          <>
            {/* 统计卡片 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center">
                <Package className="text-orange-500" size={24} />
              </div>
              <div>
                <p className="text-gray-500 text-sm">全部商品</p>
                <p className="text-2xl font-bold text-gray-800">{products.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <Eye className="text-green-500" size={24} />
              </div>
              <div>
                <p className="text-gray-500 text-sm">上架中</p>
                <p className="text-2xl font-bold text-gray-800">
                  {products.filter(p => p.isActive).length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                <EyeOff className="text-gray-500" size={24} />
              </div>
              <div>
                <p className="text-gray-500 text-sm">已下架</p>
                <p className="text-2xl font-bold text-gray-800">
                  {products.filter(p => !p.isActive).length}
                </p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                <AlertTriangle className="text-red-500" size={24} />
              </div>
              <div>
                <p className="text-gray-500 text-sm">库存预警</p>
                <p className="text-2xl font-bold text-gray-800">
                  {products.filter(isLowStock).length}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 添加按钮 */}
        <div className="flex justify-end mb-4">
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium transition-colors"
          >
            <Plus size={18} />
            添加商品
          </button>
        </div>

        {/* 商品列表 */}
        <div className="space-y-4">
          {products.map((product) => (
            <div
              key={product.id}
              className="bg-white rounded-2xl shadow-sm p-4"
            >
              <div className="flex gap-4">
                <img
                  src={product.images[0]}
                  alt={product.name}
                  className="w-24 h-24 rounded-xl object-cover"
                />
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-gray-800">{product.name}</h3>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                          {categoryNames[product.category]}
                        </span>
                        {!product.isActive && (
                          <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full">
                            已下架
                          </span>
                        )}
                        {product.isRecommended && (
                          <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full">
                            推荐
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                        {product.description}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => openLogsModal(product)}
                        className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
                        title="库存记录"
                      >
                        <History size={18} />
                      </button>
                      <button
                        onClick={() => openInventoryModal(product)}
                        className="p-2 text-orange-500 hover:bg-orange-50 rounded-lg transition-colors"
                        title="调整库存"
                      >
                        <Package size={18} />
                      </button>
                      <button
                        onClick={() => toggleStatus(product.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          product.isActive
                            ? 'text-yellow-500 hover:bg-yellow-50'
                            : 'text-green-500 hover:bg-green-50'
                        }`}
                        title={product.isActive ? '下架' : '上架'}
                      >
                        {product.isActive ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                      <button
                        onClick={() => handleEdit(product)}
                        className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                        title="编辑"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="删除"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 mt-3">
                    <div>
                      <span className="text-sm text-gray-500">售价</span>
                      <span className="text-lg font-bold text-red-500 ml-2">
                        ¥{product.price}
                      </span>
                      {product.originalPrice && (
                        <span className="text-sm text-gray-400 line-through ml-1">
                          ¥{product.originalPrice}
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">库存</span>
                      <span className={`text-lg font-medium ml-2 ${isLowStock(product) ? 'text-red-500' : 'text-gray-800'}`}>
                        {product.stock}
                      </span>
                      {isLowStock(product) && (
                        <span className="ml-2 text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full">
                          库存预警
                        </span>
                      )}
                    </div>
                    <div>
                      <span className="text-sm text-gray-500">销量</span>
                      <span className="text-lg font-medium text-gray-800 ml-2">
                        {product.sales}
                      </span>
                    </div>
                  </div>
                  {product.tags && product.tags.length > 0 && (
                    <div className="flex gap-2 mt-2">
                      {product.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="text-xs px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {products.length === 0 && (
            <div className="text-center py-16 bg-white rounded-2xl shadow-sm">
              <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500 mb-4">暂无商品</p>
              <button
                onClick={handleAdd}
                className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
              >
                添加第一个商品
              </button>
            </div>
          )}
        </div>
      </>
    )}
  </div>

      {/* 添加/编辑商品弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100">
              <h2 className="text-xl font-bold text-gray-800">
                {editingProduct ? '编辑商品' : '添加商品'}
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {/* 商品图片 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  商品图片
                </label>
                <div className="flex items-center gap-4">
                  <div className="relative group">
                    <img
                      src={formData.images?.[0] || 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&h=400&fit=crop'}
                      alt="商品预览"
                      className="w-24 h-24 rounded-xl object-cover border border-gray-200"
                    />
                    {formData.images?.[0] && !formData.images[0].includes('unsplash.com') && (
                      <button
                        type="button"
                        onClick={handleRemoveImage}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow hover:bg-red-600"
                        title="移除图片"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors text-sm"
                  >
                    <Upload size={16} />
                    {formData.images?.[0] && !formData.images[0].includes('unsplash.com') ? '更换图片' : '上传图片'}
                  </button>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </div>
                <p className="text-xs text-gray-400 mt-2">支持 jpg、png、gif，大小不超过 2MB</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  商品名称 *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  placeholder="请输入商品名称"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  商品分类 *
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value as ProductCategory })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                >
                  {Object.entries(categoryNames).map(([key, value]) => (
                    <option key={key} value={key}>{value}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    售价 (元) *
                  </label>
                  <input
                    type="number"
                    value={formData.price}
                    onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    原价 (元)
                  </label>
                  <input
                    type="number"
                    value={formData.originalPrice || ''}
                    onChange={(e) => setFormData({ ...formData, originalPrice: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    placeholder="留空则不显示"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    库存
                  </label>
                  <input
                    type="number"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    库存预警阈值
                  </label>
                  <input
                    type="number"
                    value={formData.lowStockThreshold ?? 10}
                    onChange={(e) => setFormData({ ...formData, lowStockThreshold: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    placeholder="10"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  销量
                </label>
                <input
                  type="number"
                  value={formData.sales}
                  onChange={(e) => setFormData({ ...formData, sales: Number(e.target.value) })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  商品描述
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none"
                  placeholder="请输入商品描述"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  标签 (用逗号分隔)
                </label>
                <input
                  type="text"
                  value={(formData.tags || []).join(', ')}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    tags: e.target.value.split(',').map(t => t.trim()).filter(t => t) 
                  })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  placeholder="例如: 新品, 热销, 推荐"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">排序权重</label>
                  <input
                    type="number"
                    value={formData.sortOrder ?? 0}
                    onChange={(e) => setFormData({ ...formData, sortOrder: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    placeholder="数值越大越靠前"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isRecommended"
                    checked={formData.isRecommended}
                    onChange={(e) => setFormData({ ...formData, isRecommended: e.target.checked })}
                    className="w-5 h-5 text-orange-500 rounded"
                  />
                  <label htmlFor="isRecommended" className="text-sm text-gray-700 cursor-pointer">
                    推荐位展示
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-5 h-5 text-orange-500 rounded"
                  />
                  <label htmlFor="isActive" className="text-sm text-gray-700 cursor-pointer">
                    立即上架
                  </label>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 px-6 py-3 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 库存调整弹窗 */}
      {inventoryModal.open && inventoryModal.product && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setInventoryModal({ open: false, stock: '', reason: '' })}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">调整库存</h2>
              <button
                onClick={() => setInventoryModal({ open: false, stock: '', reason: '' })}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-gray-500">商品：<span className="text-gray-800 font-medium">{inventoryModal.product.name}</span></p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">调整后库存</label>
                <input
                  type="number"
                  min={0}
                  value={inventoryModal.stock}
                  onChange={(e) => setInventoryModal((prev) => ({ ...prev, stock: e.target.value }))}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  placeholder="请输入库存数量"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">调整原因</label>
                <textarea
                  value={inventoryModal.reason}
                  onChange={(e) => setInventoryModal((prev) => ({ ...prev, reason: e.target.value }))}
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none resize-none"
                  placeholder="例如：盘点补货、损耗登记"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setInventoryModal({ open: false, stock: '', reason: '' })}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAdjustInventory}
                disabled={saving}
                className="flex-1 px-6 py-3 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {saving && <Loader2 size={18} className="animate-spin" />}
                确认调整
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 库存变动记录弹窗 */}
      {logsModal.open && logsModal.product && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setLogsModal({ open: false, logs: [], loading: false })}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">库存变动记录 - {logsModal.product.name}</h2>
              <button
                onClick={() => setLogsModal({ open: false, logs: [], loading: false })}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {logsModal.loading && (
                <div className="flex items-center justify-center py-12 text-gray-500">
                  <Loader2 size={24} className="animate-spin mr-2" />
                  加载中...
                </div>
              )}
              {!logsModal.loading && logsModal.logs.length === 0 && (
                <div className="text-center py-12 text-gray-500">暂无变动记录</div>
              )}
              {!logsModal.loading && logsModal.logs.length > 0 && (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-4 py-3 text-left rounded-l-lg">时间</th>
                      <th className="px-4 py-3 text-left">类型</th>
                      <th className="px-4 py-3 text-right">变动</th>
                      <th className="px-4 py-3 text-right">库存</th>
                      <th className="px-4 py-3 text-left rounded-r-lg">原因/备注</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {logsModal.logs.map((log) => (
                      <tr key={log.id}>
                        <td className="px-4 py-3 text-gray-600">{formatDate(log.createdAt)}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            log.type === 'sale' ? 'bg-red-100 text-red-600' :
                            log.type === 'refund' || log.type === 'cancel' ? 'bg-green-100 text-green-600' :
                            log.type === 'manual_adjust' ? 'bg-blue-100 text-blue-600' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {logTypeLabels[log.type] || log.type}
                          </span>
                        </td>
                        <td className={`px-4 py-3 text-right font-medium ${log.changeAmount > 0 ? 'text-green-600' : log.changeAmount < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                          {log.changeAmount > 0 ? '+' : ''}{log.changeAmount}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-800">{log.stockAfter}</td>
                        <td className="px-4 py-3 text-gray-600 max-w-xs truncate" title={log.reason}>
                          {log.reason}
                          {log.operatorName && <span className="text-gray-400 ml-1">({log.operatorName})</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </ShopLayout>
  );
};

export default ProductManagement;
