import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Plus, 
  Edit, 
  Trash2, 
  Eye, 
  EyeOff, 
  Save,
  Package,
} from 'lucide-react';
import { useAppStore } from '../../store';
import { Product, ProductCategory } from '../../../shared/types';

const categoryNames: Record<ProductCategory, string> = {
  [ProductCategory.WIG]: '假发',
  [ProductCategory.HAIR_CARE]: '洗护用品',
  [ProductCategory.STYLING]: '造型产品',
  [ProductCategory.TOOLS]: '美发工具',
  [ProductCategory.ACCESSORY]: '配饰',
  [ProductCategory.OTHER]: '其他',
};

const ProductManagement: React.FC = () => {
  const navigate = useNavigate();
  const { currentShop } = useAppStore();
  const [products, setProducts] = useState<Product[]>(currentShop?.products || []);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
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

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({ ...product });
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
      tags: [],
    });
    setShowModal(true);
  };

  const handleSave = () => {
    if (!formData.name || !formData.category || formData.price === undefined) {
      alert('请填写完整信息');
      return;
    }

    if (editingProduct) {
      // 编辑现有商品
      setProducts(products.map(p => 
        p.id === editingProduct.id 
          ? { ...p, ...formData, updatedAt: new Date() } as Product
          : p
      ));
    } else {
      // 添加新商品
      const newProduct: Product = {
        id: Date.now().toString(),
        shopId: currentShop?.id || '',
        name: formData.name!,
        category: formData.category as ProductCategory,
        price: formData.price!,
        originalPrice: formData.originalPrice,
        description: formData.description || '',
        images: formData.images || ['https://images.unsplash.com/photo-1560066984-138dadb4c035?w=400&h=400&fit=crop'],
        stock: formData.stock || 0,
        sales: formData.sales || 0,
        isActive: formData.isActive ?? true,
        rating: 5,
        reviewCount: 0,
        tags: formData.tags || [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      setProducts([...products, newProduct]);
    }

    setShowModal(false);
    setEditingProduct(null);
  };

  const handleDelete = (productId: string) => {
    if (confirm('确定要删除这个商品吗？')) {
      setProducts(products.filter(p => p.id !== productId));
    }
  };

  const toggleStatus = (productId: string) => {
    setProducts(products.map(p => 
      p.id === productId 
        ? { ...p, isActive: !p.isActive }
        : p
    ));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/shop')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
          >
            <ArrowLeft size={20} />
            <span>返回</span>
          </button>
          <h1 className="font-bold text-gray-800">商品管理</h1>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-xl font-medium transition-colors"
          >
            <Plus size={18} />
            <span>添加商品</span>
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
                      </div>
                      <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                        {product.description}
                      </p>
                    </div>
                    <div className="flex gap-2">
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
                      <span className="text-lg font-medium text-gray-800 ml-2">
                        {product.stock}
                      </span>
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
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                className="flex-1 px-6 py-3 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition-colors flex items-center justify-center gap-2"
              >
                <Save size={18} />
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProductManagement;
