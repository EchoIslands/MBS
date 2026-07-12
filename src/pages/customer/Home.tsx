import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Star, Filter, User } from 'lucide-react';
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
  const [showHelp, setShowHelp] = useState(false);
  const navigate = useNavigate();
  const { currentCustomer, logout } = useAppStore();

  const loadShops = React.useCallback(async () => {
    try {
      const data = await shopApi.getNearbyShops(39.9042, 116.4074, filterLevel || undefined);
      setShops(data);
    } catch (error) {
      console.error('Failed to load shops:', error);
    } finally {
      setLoading(false);
    }
  }, [filterLevel]);

  useEffect(() => {
    if (!currentCustomer) {
      navigate('/customer/login');
      return;
    }
    loadShops();
  }, [currentCustomer, loadShops, navigate]);

  useEffect(() => {
    loadShops();
  }, [loadShops]);

  const levelLabels = [
    { value: '', label: '全部' },
    { value: 'excellent', label: '优秀' },
    { value: 'good', label: '良好' },
    { value: 'average', label: '一般' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 —— 手机端更紧凑 */}
      <header className="bg-gradient-to-r from-blue-600 to-blue-700 text-white sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-base sm:text-xl font-bold">附近理发店</h1>
            <div className="flex items-center gap-1 sm:gap-3">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="w-10 h-10 sm:w-auto sm:h-auto sm:p-2 flex items-center justify-center hover:bg-blue-500 rounded-lg transition-colors"
                aria-label="筛选"
              >
                <Filter size={20} />
              </button>
              <button
                onClick={() => setShowHelp(true)}
                className="w-10 h-10 sm:w-auto sm:h-auto sm:p-2 flex items-center justify-center hover:bg-blue-500 rounded-lg transition-colors"
                aria-label="帮助"
              >
                <span className="text-lg">?</span>
              </button>
              <div className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className="w-10 h-10 sm:w-auto sm:h-auto sm:p-2 flex items-center justify-center sm:gap-2 hover:bg-blue-500 rounded-lg transition-colors"
                >
                  <User size={20} />
                  <span className="hidden sm:inline text-sm">{currentCustomer?.name}</span>
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-full mt-2 bg-white rounded-xl shadow-xl py-2 w-40 sm:w-48 z-50">
                    <button
                      onClick={() => navigate('/customer/profile')}
                      className="w-full px-4 py-3 sm:py-2 text-left text-gray-700 hover:bg-gray-100 text-sm"
                    >
                      个人中心
                    </button>
                    <button
                      onClick={() => {
                        logout();
                        navigate('/');
                      }}
                      className="w-full px-4 py-3 sm:py-2 text-left text-red-600 hover:bg-gray-100 text-sm"
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

      {/* 筛选栏 —— 手机端横向滑动 */}
      {showFilters && (
        <div className="bg-white border-b shadow-sm">
          <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3 sm:py-4">
            <div className="flex items-start gap-2 sm:gap-3">
              <span className="text-gray-600 font-medium text-xs sm:text-sm pt-1 sm:pt-2 flex-shrink-0">等级筛选：</span>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {levelLabels.map((level) => (
                  <button
                    key={level.value}
                    onClick={() => setFilterLevel(level.value)}
                    className={`flex-shrink-0 px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm font-medium transition-all ${
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

      <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 sm:py-6">
        {/* 雷达动画区域 —— 手机端缩小尺寸，桌面端保持较大 */}
        <div className="bg-white rounded-2xl p-4 sm:p-8 mb-4 sm:mb-8 shadow-lg">
          <div className="flex items-center justify-center">
            <div className="relative">
              {/* 雷达背景圆 — w-44(176px) 手机 / w-64(256px) 桌面 */}
              <div className="w-36 h-36 sm:w-44 sm:h-44 md:w-64 md:h-64 rounded-full border-4 border-blue-200 flex items-center justify-center relative overflow-hidden">
                <div className="w-24 h-24 sm:w-32 sm:h-32 md:w-48 md:h-48 rounded-full border-2 border-blue-300 absolute" />
                <div className="w-14 h-14 sm:w-20 sm:h-20 md:w-32 md:h-32 rounded-full border-2 border-blue-400 absolute" />
                <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-16 md:h-16 rounded-full border-2 border-blue-500 absolute" />
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
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 md:w-4 md:h-4 bg-blue-600 rounded-full z-10 shadow-lg" />
              </div>
              {/* 店铺标记 */}
              {shops.slice(0, 3).map((shop, index) => (
                <div
                  key={shop.id}
                  className="absolute bg-white p-1 sm:p-2 rounded-xl shadow-lg cursor-pointer hover:scale-110 transition-transform"
                  style={{
                    top: `${30 + index * 20}%`,
                    left: `${40 + index * 15}%`,
                  }}
                  onClick={() => navigate(`/customer/shop/${shop.id}`)}
                >
                  <div className="text-[10px] sm:text-xs font-medium text-gray-700">
                    {shop.name.slice(0, 4)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="text-center mt-3 sm:mt-6">
            <p className="text-gray-600 text-xs sm:text-sm md:text-base">附近门店</p>
            <p className="text-xs sm:text-sm text-gray-400 mt-1">共 {shops.length} 家店铺 · 按距离排序</p>
          </div>
        </div>

        {/* 店铺列表 */}
        {loading ? (
          <div className="space-y-3 sm:space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl p-4 sm:p-6 shadow animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-4" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4">
            {shops.map((shop) => (
              <div
                key={shop.id}
                onClick={() => navigate(`/customer/shop/${shop.id}`)}
                className="bg-white rounded-xl p-3 sm:p-6 shadow-md hover:shadow-xl transition-all cursor-pointer active:scale-[0.99]"
              >
                <div className="flex gap-3 sm:gap-6">
                  <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-xl overflow-hidden flex-shrink-0">
                    <img
                      src={shop.images[0]}
                      alt={shop.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm sm:text-lg font-bold text-gray-800 truncate mb-1">{shop.name}</h3>
                        <div className="flex items-center gap-1 text-xs sm:text-sm text-gray-500 mb-1">
                          <Star size={12} className="sm:hidden text-yellow-500 fill-yellow-500" />
                          <Star size={14} className="hidden sm:inline text-yellow-500 fill-yellow-500" />
                          <span className="font-medium text-gray-700">{shop.rating}</span>
                          <span>({shop.reviewCount}条评价)</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs sm:text-sm text-gray-500 mb-1">
                          <MapPin size={12} className="sm:hidden flex-shrink-0" />
                          <MapPin size={14} className="hidden sm:inline flex-shrink-0" />
                          <span className="truncate">{shop.address}</span>
                        </div>
                        {shop.distance && (
                          <div className="text-xs sm:text-sm text-blue-600 font-medium">
                            {shop.distance.toFixed(2)} km
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 sm:gap-2 mt-2 sm:mt-3">
                      {shop.services.slice(0, 3).map((service) => (
                        <span
                          key={service.id}
                          className="px-2 sm:px-3 py-0.5 sm:py-1 bg-gray-100 text-gray-600 rounded-full text-[11px] sm:text-xs"
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

      {/* 帮助模态框 —— 手机端优化 */}
      {showHelp && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4">
          <div className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-lg max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h3 className="text-base sm:text-lg font-bold text-gray-800">使用帮助</h3>
              <button
                onClick={() => setShowHelp(false)}
                className="w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
              >
                X
              </button>
            </div>
            
            <div className="space-y-4 sm:space-y-6">
              <div>
                <h4 className="font-bold text-gray-700 mb-1 sm:mb-2 text-sm sm:text-base">📱 如何预约？</h4>
                <ol className="list-decimal list-inside text-gray-600 space-y-1 text-xs sm:text-sm">
                  <li>在首页浏览附近的理发店</li>
                  <li>点击店铺卡片查看详情</li>
                  <li>选择服务项目和时间</li>
                  <li>选择发型师或使用智能匹配</li>
                  <li>确认预约信息并提交</li>
                </ol>
              </div>
              
              <div>
                <h4 className="font-bold text-gray-700 mb-1 sm:mb-2 text-sm sm:text-base">⚡ 最快匹配是什么？</h4>
                <p className="text-gray-600 text-xs sm:text-sm">
                  最快匹配会自动为您选择当前最空闲的发型师，减少您的等待时间。
                </p>
              </div>
              
              <div>
                <h4 className="font-bold text-gray-700 mb-1 sm:mb-2 text-sm sm:text-base">❓ 如何取消预约？</h4>
                <p className="text-gray-600 text-xs sm:text-sm">
                  在「个人中心」&gt;「我的预约」中，找到要取消的订单，点击「取消预约」即可。
                </p>
              </div>
              
              <div>
                <h4 className="font-bold text-gray-700 mb-1 sm:mb-2 text-sm sm:text-base">⭐ 如何评价服务？</h4>
                <p className="text-gray-600 text-xs sm:text-sm">
                  服务完成后，在「个人中心」&gt;「我的预约」中找到已完成的订单，点击「评价」即可。
                </p>
              </div>
              
              <div>
                <h4 className="font-bold text-gray-700 mb-1 sm:mb-2 text-sm sm:text-base">💸 如何申请退款？</h4>
                <p className="text-gray-600 text-xs sm:text-sm">
                  在「个人中心」&gt;「退款管理」中，选择要退款的订单，填写原因后提交申请。
                </p>
              </div>
            </div>
            
            <button
              onClick={() => setShowHelp(false)}
              className="w-full mt-4 sm:mt-6 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors text-sm sm:text-base min-h-[48px]"
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerHome;
