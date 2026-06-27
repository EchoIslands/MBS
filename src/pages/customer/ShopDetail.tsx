import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  MapPin,
  Phone,
  Star,
  Clock,
  Settings,
  ShoppingBag,
  User,
} from 'lucide-react';
import { Shop } from '../../../shared/types';
import { shopApi } from '../../api';
import { useAppStore } from '../../store';
import { getAvatarUrl } from '../../lib/avatar';

const ShopDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentShop, setCurrentShop } = useAppStore();
  const [shop, setShop] = useState<Shop | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeImage, setActiveImage] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (id) {
      loadShopData();
    }
  }, [id]);

  const loadShopData = async () => {
    try {
      const shopData = await shopApi.getShop(id!);
      setShop(shopData);
      setCurrentShop(shopData);
    } catch (error) {
      console.error('Failed to load shop data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-gray-500">加载中...</div>
      </div>
    );
  }

  if (!shop) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">店铺不存在</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <header className="sticky top-0 bg-white shadow-sm z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="font-bold text-xl text-gray-800">{shop.name}</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate('/customer/profile')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="个人中心"
            >
              <User size={20} />
            </button>
            <button
              onClick={() => navigate('/shop/login')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              title="店铺管理"
            >
              <Settings size={20} />
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 pb-24">
        {/* 图片轮播 */}
        <div className="relative mt-4">
          <div className="aspect-video rounded-2xl overflow-hidden bg-gray-200">
            <img
              src={shop.images[activeImage]}
              alt={shop.name}
              className="w-full h-full object-cover"
            />
          </div>
          {shop.images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-2">
              {shop.images.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setActiveImage(index)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    activeImage === index ? 'bg-white w-6' : 'bg-white/50'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* 店铺信息 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">{shop.name}</h2>
            </div>
          </div>

          <div className="space-y-3 text-gray-600">
            <div className="flex items-center gap-3">
              <MapPin size={20} className="text-blue-500" />
              <span>{shop.address}</span>
            </div>
            <div className="flex items-center gap-3">
              <Phone size={20} className="text-blue-500" />
              <span>{shop.phone}</span>
            </div>
            <div className="flex items-center gap-3">
              <Clock size={20} className="text-blue-500" />
              <span>营业中 · 09:00-21:00</span>
            </div>
          </div>
        </div>

        {/* 发型师团队 */}
        {shop.employees && shop.employees.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
            <h3 className="text-lg font-bold text-gray-800 mb-4">发型师团队</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {shop.employees
                .filter(emp => emp.isActive)
                .map((employee) => (
                  <div
                    key={employee.id}
                    className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl"
                  >
                    <img
                      src={employee.avatar || getAvatarUrl(employee.name)}
                      alt={employee.name}
                      className="w-16 h-16 rounded-full object-cover"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-gray-800">{employee.name}</div>
                        {employee.title && (
                          <div className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                            {employee.title}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                        <Star size={14} className="text-yellow-500 fill-yellow-500" />
                        <span>{employee.rating}</span>
                      </div>
                      {employee.specialty && (
                        <div className="text-xs text-gray-400 mt-1">
                          专长：{employee.specialty}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 商品商城 */}
        {shop.products && shop.products.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-800">商品商城</h3>
              <button
                onClick={() => navigate(`/customer/products/${shop.id}`)}
                className="text-orange-500 text-sm font-medium hover:text-orange-600"
              >
                查看全部 →
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {shop.products
                .filter(p => p.isActive)
                .slice(0, 4)
                .map((product) => (
                  <div
                    key={product.id}
                    onClick={() => navigate(`/customer/products/${shop.id}`)}
                    className="bg-gray-50 rounded-xl overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                  >
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="w-full h-32 object-cover"
                    />
                    <div className="p-3">
                      <h4 className="font-medium text-gray-800 text-sm line-clamp-2 mb-1">
                        {product.name}
                      </h4>
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold text-red-500">
                          ¥{product.price}
                        </span>
                        {product.originalPrice && (
                          <span className="text-xs text-gray-400 line-through">
                            ¥{product.originalPrice}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* 服务项目 */}
        <div className="bg-white rounded-2xl shadow-sm p-6 mt-4">
          <h3 className="text-lg font-bold text-gray-800 mb-4">服务项目</h3>
          <div className="space-y-3">
            {shop.services.map((service) => (
              <div
                key={service.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
              >
                <div>
                  <div className="font-medium text-gray-800">{service.name}</div>
                  {service.description && (
                    <div className="text-sm text-gray-500">{service.description}</div>
                  )}
                  <div className="text-sm text-gray-400 mt-1">
                    时长 {service.duration} 分钟
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-orange-500">
                    ¥{service.price}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>


      </div>

      {/* 底部操作栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4">
        <div className="max-w-4xl mx-auto flex gap-3">
          <button
            onClick={() => navigate(`/customer/products/${shop.id}`)}
            className="flex-1 bg-orange-50 hover:bg-orange-100 text-orange-600 py-4 px-6 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2"
          >
            <ShoppingBag size={20} />
            商品商城
          </button>
          <button
            onClick={() => navigate(`/customer/booking/${shop.id}`)}
            className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white py-4 px-6 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all"
          >
            立即预约
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShopDetail;