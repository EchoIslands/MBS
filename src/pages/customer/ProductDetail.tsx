import { CustomerHeader } from '../../components/CustomerPage';
import { useCustomerToast } from '../../hooks/useCustomerToast';
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Plus, Minus, Star, Package, Crown } from 'lucide-react';
import { useAppStore } from '../../store';
import { Product } from '../../../shared/types';
import { productApi } from '../../api';
import CustomerImage from '../../components/CustomerImage';
import { calcDiscountedItemPriceForCustomer } from '../../lib/membership';

const ProductDetail: React.FC = () => {
  const { shopId, productId } = useParams<{ shopId: string; productId: string }>();
  const navigate = useNavigate();
  const { addToCart, currentCustomer } = useAppStore();
  const { toast, notify } = useCustomerToast();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);



  useEffect(() => {
    const fetchProduct = async () => {
      if (!shopId || !productId) return;
      setLoading(true);
      try {
        const products = await productApi.getPublicCatalog(shopId);
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
    const inCart = useAppStore.getState().cart.find(item => item.product.id === product.id)?.quantity ?? 0;
    if (quantity + inCart > product.stock) {
      notify('购物车内数量已达库存上限');
      return;
    }
    addToCart(product, quantity);
    notify('已加入购物车');
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
          onClick={() => navigate('/customer/products/' + (shopId || 'shop1'), { replace: true })}
          className="mt-4 px-6 py-2 bg-orange-500 text-white rounded-lg"
        >
          返回
        </button>
      </div>
    );
  }

  const images = product.images && product.images.length > 0 ? product.images : [];
  const activeIndex = images.length > 0 ? Math.min(activeImage, images.length - 1) : 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <CustomerHeader title="商品详情" backTo={'/customer/products/' + (shopId || 'shop1')} />
      {toast}

      <div className="max-w-4xl mx-auto">
        {/* 商品图片 */}
        <div className="bg-white">
          <div className="relative">
            <CustomerImage
              images={[...images.slice(activeIndex), ...images.slice(0, activeIndex)]}
              alt={product.name}
              className="aspect-square w-full object-cover"
            />
            {images.length > 1 && (
              <span className="absolute bottom-3 right-3 bg-black/60 text-white text-xs px-2 py-1 rounded-full">
                {activeIndex + 1}/{images.length}
              </span>
            )}
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
          {images.length > 1 && (
            <div className="flex gap-2 px-4 py-3 overflow-x-auto">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImage(idx)}
                  className={`flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-colors ${
                    idx === activeIndex ? 'border-orange-500' : 'border-transparent'
                  }`}
                >
                  <CustomerImage
                    images={[img]}
                    alt={`${product.name} 图${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
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
        <div className="max-w-4xl mx-auto px-3 py-2 flex items-center justify-between gap-2">
          {/* 数量选择 */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">数量</span>
            <div className="flex items-center border rounded-lg">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-8 h-10 flex items-center justify-center hover:bg-gray-100"
              >
                <Minus size={16} />
              </button>
              <span className="w-6 text-center font-medium">{quantity}</span>
              <button
                onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                className="w-8 h-10 flex items-center justify-center hover:bg-gray-100"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/customer/cart/' + shopId, { state: { customerBack: true } })}
              className="customer-secondary whitespace-nowrap text-sm !px-2"
            >
              购物车
            </button>
            <button
              onClick={handleAddToCart}
              disabled={product.stock <= 0}
              className="customer-primary whitespace-nowrap text-sm !px-2"
            >
              {product.stock > 0 ? '加入购物车' : '暂时缺货'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductDetail;
