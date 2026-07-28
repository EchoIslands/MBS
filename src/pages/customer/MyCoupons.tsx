import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Ticket, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useAppStore } from '../../store';
import { CustomerCoupon, Coupon } from '../../../shared/types';
import { couponApi } from '../../api';

type CouponTab = 'all' | 'unused' | 'used' | 'expired';

const MyCoupons: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentCustomer } = useAppStore();
  const [coupons, setCoupons] = useState<CustomerCoupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const activeTab: CouponTab = (searchParams.get('tab') as CouponTab) || 'all';
  const defaultShopId = currentCustomer?.shopId || 'shop1';

  const loadCoupons = React.useCallback(async () => {
    if (!currentCustomer?.id) return;
    setLoading(true);
    setError('');
    try {
      const status = activeTab === 'all' ? undefined : activeTab;
      const data = await couponApi.getCustomerCoupons(currentCustomer.id, defaultShopId, status);
      setCoupons(data || []);
    } catch (err) {
      console.error('[MyCoupons] 加载优惠券失败:', err);
      setError('加载优惠券失败，请重试');
      setCoupons([]);
    } finally {
      setLoading(false);
    }
  }, [currentCustomer?.id, currentCustomer?.shopId, activeTab, defaultShopId]);

  useEffect(() => {
    if (!currentCustomer?.id) {
      navigate('/customer/login');
      return;
    }
    loadCoupons();
  }, [currentCustomer, navigate, loadCoupons]);

  const filteredCoupons = useMemo(() => {
    const now = new Date();
    return coupons.filter((cc) => {
      const coupon = cc.coupon;
      if (!coupon) return false;
      if (activeTab === 'all') return true;
      if (activeTab === 'used') return cc.status === 'used';
      if (activeTab === 'expired') {
        return cc.status === 'expired' || new Date(coupon.endAt) < now;
      }
      return cc.status === 'unused' && new Date(coupon.endAt) >= now;
    });
  }, [coupons, activeTab]);

  const tabs: { key: CouponTab; label: string }[] = [
    { key: 'all', label: '全部' },
    { key: 'unused', label: '未使用' },
    { key: 'used', label: '已使用' },
    { key: 'expired', label: '已过期' },
  ];

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('zh-CN');
  };

  const getCouponValueText = (coupon: Coupon) => {
    if (coupon.type === 'fixed_amount') return `¥${coupon.value.toFixed(0)}`;
    if (coupon.type === 'percentage') return `${coupon.value}折`;
    return '买赠';
  };

  const getCouponScopeText = (coupon: Coupon) => {
    if (coupon.applicableScope === 'all') return '全场通用';
    if (coupon.applicableScope === 'product') return '限定商品';
    if (coupon.applicableScope === 'service') return '仅限服务';
    return '';
  };

  const getStatusBadge = (cc: CustomerCoupon) => {
    const coupon = cc.coupon;
    const isExpired = coupon && new Date(coupon.endAt) < new Date();
    if (cc.status === 'used') {
      return <span className="inline-flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full"><CheckCircle size={12} /> 已使用</span>;
    }
    if (cc.status === 'expired' || isExpired) {
      return <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full"><XCircle size={12} /> 已过期</span>;
    }
    if (cc.status === 'cancelled') {
      return <span className="inline-flex items-center gap-1 text-xs text-red-500 bg-red-50 px-2 py-1 rounded-full"><AlertCircle size={12} /> 已作废</span>;
    }
    return <span className="inline-flex items-center gap-1 text-xs text-orange-600 bg-orange-50 px-2 py-1 rounded-full"><Clock size={12} /> 未使用</span>;
  };

  const handleUseCoupon = (cc: CustomerCoupon) => {
    const coupon = cc.coupon;
    if (!coupon) return;
    if (coupon.applicableScope === 'service') {
      navigate(`/customer/shop/${defaultShopId}`);
    } else {
      navigate(`/customer/products/${defaultShopId}`);
    }
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
          <h1 className="font-bold text-lg">我的优惠券</h1>
          <div className="w-10"></div>
        </div>
      </header>

      {/* Tab 切换 */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4">
          <div className="flex items-center gap-2 py-3 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setSearchParams({ tab: tab.key })}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.key
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 内容区 */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-16 text-gray-500">加载中...</div>
        ) : error ? (
          <div className="text-center py-16 text-red-500">{error}</div>
        ) : filteredCoupons.length === 0 ? (
          <div className="text-center py-16">
            <Ticket className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">暂无{tabs.find((t) => t.key === activeTab)?.label}优惠券</p>
            <button
              onClick={() => navigate(`/customer/products/${defaultShopId}`)}
              className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
            >
              去领券
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredCoupons.map((cc) => {
              const coupon = cc.coupon;
              if (!coupon) return null;
              const isUsable = cc.status === 'unused' && new Date(coupon.endAt) >= new Date();
              return (
                <div
                  key={cc.id}
                  className={`bg-white rounded-xl p-4 shadow-sm border ${
                    isUsable ? 'border-orange-200' : 'border-gray-200 opacity-70'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-800">{coupon.name}</h3>
                        {getStatusBadge(cc)}
                      </div>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-2xl font-bold text-red-500">{getCouponValueText(coupon)}</span>
                        {coupon.minOrderAmount ? (
                          <span className="text-xs text-gray-500">满{coupon.minOrderAmount}元可用</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-gray-400 mt-2">
                        {getCouponScopeText(coupon)} · 有效期至 {formatDate(coupon.endAt)}
                      </div>
                      {cc.usedAt && (
                        <div className="text-xs text-gray-400 mt-1">
                          使用时间：{formatDate(cc.usedAt)}
                        </div>
                      )}
                    </div>
                    {isUsable && (
                      <button
                        onClick={() => handleUseCoupon(cc)}
                        className="flex-shrink-0 px-4 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600 transition-colors"
                      >
                        去使用
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MyCoupons;
