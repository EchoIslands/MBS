import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ShoppingCart, Plus, Minus, Star, Package, Crown } from 'lucide-react';
import { useAppStore } from '../../store';
import { Product } from '../../../shared/types';
import { productApi } from '../../api';
import { calcDiscountedItemPriceForCustomer } from '../../lib/membership';

const ProductDetail: React.FC = () => {
  const { shopId, productId } = useParams<{ shopId: string; productId: string }>();
  const navigate = useNavigate();
  const { cart, addToCart, currentCustomer } = useAppStore();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  useEffect(() => {
    const fetchProduct = async () => {
      if (!shopId || !productId) return;
      setLoading(true);
      try {
        const products = await productApi.getByShop(shopId);
        const found = products.find((p) => p.id === productId);
        setProduct(found || null);
      } catch (err) {
        console.error('[ProductDetail] 获取商品失败:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [shopId, productId]);

  const handleAddToCart = () => {
    if (!product) return;
    if (quantity > product.stock) {
      alert('库存不足');
      return;
    }
    addToCart(product, quantity);
    alert(`已将 ${quantity} 件商品加入购物车`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center text-gray-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mr-2" />
        加载中...
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center text-gray-500">
        <Package size={48} className="mb-4 text-gray-300" />
        <p>商品不存在或已下架</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 px-6 py-2 bg-orange-500 text-white rounded-lg"
        >
          返回
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 bg-white shadow-sm z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-bold text-lg">商品详情</h1>
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

      <div className="max-w-4xl mx-auto">
        {/* 商品图片 */}
        <div className="relative bg-white">
          <img
            src={product.images?.[0] || 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=600&h=600&fit=crop'}
            alt={product.name}
            className="w-full h-72 sm:h-96 object-cover"
          />
          {product.tags && product.tags.length > 0 && (
            <div className="absolute top-4 left-4 flex gap-2">
              {product.tags.map((tag, idx) => (
                <span key={idx} className="px-3 py-1 bg-red-500 text-white text-xs rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 商品信息 */}
        <div className="bg-white p-4 sm:p-6 space-y-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">{product.name}</h1>
            <div className="flex items-center gap-2 mt-2">
              <Star size={16} className="text-yellow-400 fill-current" />
              <span className="text-sm text-gray-600">{product.rating?.toFixed(1) || '暂无'}</span>
              <span className="text-sm text-gray-400">已售 {product.sales || 0}</span>
            </div>
          </div>

          {(() => {
            const memberPrice = calcDiscountedItemPriceForCustomer(
              product.price,
              currentCustomer,
              product.category
            );
            const hasDiscount = memberPrice < product.price;
            return (
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl sm:text-3xl font-bold text-red-500">
                  ¥{memberPrice.toFixed(2)}
                </span>
                {hasDiscount ? (
                  <>
                    <span className="text-sm text-gray-400 line-through">
                      ¥{product.price.toFixed(2)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full font-medium">
                      <Crown size={10} /> 会员价
                    </span>
                  </>
                ) : product.originalPrice ? (
                  <span className="text-sm text-gray-400 line-through">
                    ¥{product.originalPrice.toFixed(2)}
                  </span>
                ) : null}
              </div>
            );
          })()}

          <div className="text-sm text-gray-500">
            库存：{product.stock > 0 ? `${product.stock} 件` : '暂时缺货'}
          </div>

          <div className="border-t pt-4">
            <h3 className="font-medium text-gray-800 mb-2">商品介绍</h3>
            <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
              {product.description || '暂无商品介绍'}
            </p>
          </div>
        </div>
      </div>

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          {/* 数量选择 */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">数量</span>
            <div className="flex items-center border rounded-lg">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-10 h-10 flex items-center justify-center hover:bg-gray-100"
              >
                <Minus size={16} />
              </button>
              <span className="w-12 text-center font-medium">{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-10 h-10 flex items-center justify-center hover:bg-gray-100"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(`/customer/cart/${shopId}`)}
              className="px-4 py-3 border border-orange-500 text-orange-500 rounded-xl font-medium"
            >
              购物车
            </button>
            <button
              onClick={handleAddToCart}
              disabled={product.stock <= 0}
              className="px-6 py-3 bg-orange-500 text-white rounded-xl font-medium disabled:bg-gray-300"
            >
              加入购物车
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;
