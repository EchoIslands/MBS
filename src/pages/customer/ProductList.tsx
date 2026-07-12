import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShoppingCart, Search, Filter, Star } from 'lucide-react';
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

const ProductList: React.FC = () => {
  const { shopId } = useParams<{ shopId: string }>();
  const navigate = useNavigate();
  const { currentShop, cart, addToCart } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | 'all'>('all');
  const [sortBy, setSortBy] = useState<'sales' | 'price' | 'rating'>('sales');

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const filteredProducts = useMemo(() => {
    const products = currentShop?.products || [];
    let result = [...products];

    // 搜索过滤
    if (searchQuery) {
      result = result.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // 分类过滤
    if (selectedCategory !== 'all') {
      result = result.filter(p => p.category === selectedCategory);
    }

    // 只显示上架商品
    result = result.filter(p => p.isActive);

    // 排序
    switch (sortBy) {
      case 'sales':
        result.sort((a, b) => b.sales - a.sales);
        break;
      case 'price':
        result.sort((a, b) => a.price - b.price);
        break;
      case 'rating':
        result.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
    }

    return result;
  }, [currentShop?.products, searchQuery, selectedCategory, sortBy]);

  const handleAddToCart = (product: Product) => {
    addToCart(product);
    alert('已添加到购物车！');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white shadow-sm z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-bold text-lg">商品商城</h1>
          <button
            onClick={() => navigate(`/customer/cart/${shopId}`)}
            className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ShoppingCart size={20} />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
                {cartCount}
              </span>
            )}
          </button>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* 搜索栏 */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="搜索商品..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm sm:text-base"
          />
        </div>

        {/* 分类筛选 —— 手机端横向滑动 */}
        <div className="bg-white rounded-xl p-3 sm:p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-2 sm:mb-3">
            <Filter size={16} className="text-gray-500" />
            <span className="font-medium text-gray-700 text-sm sm:text-base">商品分类</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`flex-shrink-0 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              全部
            </button>
            {Object.values(ProductCategory).map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`flex-shrink-0 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-colors ${
                  selectedCategory === category
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {categoryNames[category]}
              </button>
            ))}
          </div>
        </div>

        {/* 排序 —— 手机端紧凑 */}
        <div className="flex justify-between items-center gap-2">
          <span className="text-gray-600 text-xs sm:text-sm whitespace-nowrap">
            共 {filteredProducts.length} 件商品
          </span>
          <div className="flex gap-1 sm:gap-2 overflow-x-auto">
            <button
              onClick={() => setSortBy('sales')}
              className={`flex-shrink-0 px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                sortBy === 'sales'
                  ? 'bg-orange-100 text-orange-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              销量
            </button>
            <button
              onClick={() => setSortBy('price')}
              className={`flex-shrink-0 px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                sortBy === 'price'
                  ? 'bg-orange-100 text-orange-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              价格
            </button>
            <button
              onClick={() => setSortBy('rating')}
              className={`flex-shrink-0 px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                sortBy === 'rating'
                  ? 'bg-orange-100 text-orange-600'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              评分
            </button>
          </div>
        </div>

        {/* 商品列表 —— 手机端图片更小 */}
        <div className="grid grid-cols-2 gap-2 sm:gap-4">
          {filteredProducts.map((product) => (
            <div
              key={product.id}
              className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => navigate(`/customer/product/${shopId}/${product.id}`)}
            >
              <div className="relative">
                <img
                  src={product.images[0]}
                  alt={product.name}
                  className="w-full h-40 sm:h-48 object-cover"
                />
                {product.tags && product.tags.length > 0 && (
                  <div className="absolute top-1 sm:top-2 left-1 sm:left-2 flex gap-1">
                    {product.tags.slice(0, 2).map((tag, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-0.5 bg-red-500 text-white text-[10px] sm:text-xs rounded-full"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-2.5 sm:p-3 space-y-1.5 sm:space-y-2">
                <h3 className="font-medium text-gray-800 line-clamp-2 text-xs sm:text-sm">
                  {product.name}
                </h3>
                <div className="flex items-center gap-1">
                  <Star size={10} className="sm:hidden text-yellow-400 fill-current" />
                  <Star size={12} className="hidden sm:inline text-yellow-400 fill-current" />
                  <span className="text-[10px] sm:text-xs text-gray-500">
                    {product.rating?.toFixed(1) || '暂无'}
                  </span>
                  <span className="text-[10px] sm:text-xs text-gray-400 ml-auto">
                    已售{product.sales}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-baseline gap-1">
                    <span className="text-base sm:text-lg font-bold text-red-500">
                      ¥{product.price}
                    </span>
                    {product.originalPrice && (
                      <span className="text-[10px] sm:text-xs text-gray-400 line-through">
                        ¥{product.originalPrice}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddToCart(product);
                  }}
                  className="w-full py-2 sm:py-2.5 bg-orange-500 text-white text-xs sm:text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors"
                >
                  加入购物车
                </button>
              </div>
            </div>
          ))}
        </div>

        {filteredProducts.length === 0 && (
          <div className="text-center py-8 sm:py-12">
            <p className="text-gray-500 text-sm">暂无相关商品</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductList;
