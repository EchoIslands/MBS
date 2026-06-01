import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Star, Filter, User, Menu, X } from 'lucide-react';
import { Shop } from '../../../shared/types';
import { shopApi } from '../../api';
import { useAppStore } from '../../store';

// 移除等级映射

const CustomerHome: React.FC = () => {
  const [shops, setShops] = useState<Shop[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { currentCustomer, logout } = useAppStore();

  useEffect(() => {
    if (!currentCustomer) {
      navigate('/customer/login');
      return;
    }
    loadShops();
  }, [currentCustomer]);

  const loadShops = async () => {
    try {
      const data = await shopApi.getNearbyShops(39.9042, 116.4074, filterLevel || undefined);
      setShops(data);
    } catch (error) {
      console.error('Failed to load shops:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShops();
  }, [filterLevel]);

  const levelLabels = [
    { value: '', label: '全部' },
    { value: 'excellent', label: '优秀' },
    { value: 'good', label: '良好' },
    { value: 'average', label: '一般' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold">附近理发店</h1>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="p-2 hover:bg-blue-500 rounded-lg transition-colors"
              >
                <Filter size={20} />
              </button>
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="flex items-center gap-2 p-2 hover:bg-blue-500 rounded-lg transition-colors"
                >
                  <User size={20} />
                  <span className="hidden sm:inline">{currentCustomer?.name}</span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-xl py-2 w-48 z-50">
                    <button
                      onClick={() => navigate('/customer/profile')}
                      className="w-full px-4 py-2 text-left text-gray-700 hover:bg-gray-100"
                    >
                      个人中心
                    </button>
                    <button
                      onClick={() => {
                        logout();
                        navigate('/');
                      }}
                      className="w-full px-4 py-2 text-left text-red-600 hover:bg-gray-100"
                    >
                      退出登录
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* 筛选栏 */}
      {showFilters && (
        <div className="bg-white border-b shadow-sm">
          <div className="max-w-6xl mx-auto px-4 py-4">
            <div className="flex items-center gap-3">
              <span className="text-gray-600 font-medium">等级筛选：</span>
              <div className="flex gap-2">
                {levelLabels.map((level) => (
                  <button
                    key={level.value}
                    onClick={() => setFilterLevel(level.value)}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                      filterLevel === level.value
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* 雷达动画区域 */}
        <div className="bg-white rounded-2xl p-8 mb-8 shadow-lg">
          <div className="flex items-center justify-center">
            <div className="relative">
              {/* 雷达背景圆 */}
              <div className="w-64 h-64 rounded-full border-4 border-blue-200 flex items-center justify-center relative overflow-hidden">
                <div className="w-48 h-48 rounded-full border-2 border-blue-300 absolute" />
                <div className="w-32 h-32 rounded-full border-2 border-blue-400 absolute" />
                <div className="w-16 h-16 rounded-full border-2 border-blue-500 absolute" />
                {/* 雷达扫描线动画 */}
                <div
                  className="absolute w-full h-full origin-center"
                  style={{
                    animation: 'scan 3s linear infinite',
                  }}
                >
                  <div className="w-1/2 h-full bg-gradient-to-r from-transparent to-blue-400 opacity-30" />
                </div>
                {/* 中心点 */}
                <div className="w-4 h-4 bg-blue-600 rounded-full z-10 shadow-lg" />
              </div>
              {/* 店铺标记 */}
              {shops.slice(0, 3).map((shop, index) => (
                <div
                  key={shop.id}
                  className="absolute bg-white p-2 rounded-xl shadow-lg cursor-pointer hover:scale-110 transition-transform animate-pulse"
                  style={{
                    top: `${30 + index * 20}%`,
                    left: `${40 + index * 15}%`,
                    animationDelay: `${index * 0.5}s`,
                  }}
                  onClick={() => navigate(`/customer/shop/${shop.id}`)}
                >
                  <div className="text-xs font-medium text-gray-700">{shop.name.slice(0, 4)}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="text-center mt-6">
            <p className="text-gray-600">加载附近门店...</p>
            <p className="text-sm text-gray-400 mt-1">发现 {shops.length} 家店铺</p>
          </div>
        </div>

        {/* 店铺列表 */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl p-6 shadow animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-4" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {shops.map((shop) => (
              <div
                key={shop.id}
                onClick={() => navigate(`/customer/shop/${shop.id}`)}
                className="bg-white rounded-xl p-6 shadow-md hover:shadow-xl transition-all cursor-pointer transform hover:-translate-y-1"
              >
                <div className="flex gap-6">
                  <div className="w-24 h-24 rounded-xl overflow-hidden flex-shrink-0">
                    <img
                      src={shop.images[0]}
                      alt={shop.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="text-lg font-bold text-gray-800 truncate mb-1">{shop.name}</h3>
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                          <Star size={14} className="text-yellow-500 fill-yellow-500" />
                          <span className="font-medium text-gray-700">{shop.rating}</span>
                          <span>({shop.reviewCount}条评价)</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                          <MapPin size={14} />
                          <span className="truncate">{shop.address}</span>
                        </div>
                        {shop.distance && (
                          <div className="text-sm text-blue-600 font-medium">
                            {shop.distance.toFixed(2)} km
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      {shop.services.slice(0, 3).map((service) => (
                        <span
                          key={service.id}
                          className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs"
                        >
                          {service.name}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes scan {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
        `
      }} />
    </div>
  );
};

export default CustomerHome;
