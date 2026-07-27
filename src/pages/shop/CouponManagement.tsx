import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Ticket,
  Loader2,
  Calendar,
  Users,
  Eye,
  EyeOff,
  X,
  Save,
  Tag,
  Percent,
  Gift,
} from 'lucide-react';
import { useAppStore } from '../../store';
import { Coupon, CouponType, CouponScope } from '../../../shared/types';
import { couponApi } from '../../api';
import ShopLayout from './ShopLayout';

const typeLabels: Record<CouponType, string> = {
  fixed_amount: '固定金额',
  percentage: '百分比折扣',
  buy_x_get_y: '买赠',
};

const scopeLabels: Record<CouponScope, string> = {
  all: '全场通用',
  product: '指定商品',
  service: '指定服务',
};

const CouponManagement: React.FC = () => {
  const { currentShop } = useAppStore();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const shopId = currentShop?.id || '';

  const loadCoupons = useCallback(async () => {
    if (!shopId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await couponApi.getByShop(shopId);
      setCoupons(Array.isArray(data) ? data : []);
    } catch (err: unknown) {
      console.error('[CouponManagement] 获取优惠券失败:', err);
      alert('获取优惠券失败：' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    loadCoupons();
  }, [shopId, loadCoupons]);

  const [formData, setFormData] = useState<Partial<Coupon>>({
    name: '',
    type: 'fixed_amount',
    value: 0,
    minOrderAmount: 0,
    applicableScope: 'all',
    totalQuantity: -1,
    perCustomerLimit: 1,
    startAt: new Date(),
    endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    isActive: true,
  });

  const handleAdd = () => {
    setFormData({
      name: '',
      type: 'fixed_amount',
      value: 0,
      minOrderAmount: 0,
      applicableScope: 'all',
      totalQuantity: -1,
      perCustomerLimit: 1,
      startAt: new Date(),
      endAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      isActive: true,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.name || formData.value === undefined) {
      alert('请填写优惠券名称和优惠值');
      return;
    }
    if (!shopId) {
      alert('未选择店铺');
      return;
    }
    if (!formData.startAt || !formData.endAt) {
      alert('请选择有效期');
      return;
    }
    if (new Date(formData.endAt) <= new Date(formData.startAt)) {
      alert('结束时间必须晚于开始时间');
      return;
    }

    setSaving(true);
    try {
      const created = await couponApi.create(shopId, {
        name: formData.name,
        type: formData.type,
        value: Number(formData.value),
        minOrderAmount: Number(formData.minOrderAmount || 0),
        applicableScope: formData.applicableScope,
        totalQuantity: Number(formData.totalQuantity ?? -1),
        perCustomerLimit: Number(formData.perCustomerLimit ?? 1),
        startAt: formData.startAt,
        endAt: formData.endAt,
        isActive: formData.isActive,
      });
      if (created) {
        setCoupons([created, ...coupons]);
        setShowModal(false);
      } else {
        alert('创建失败');
      }
    } catch (err: unknown) {
      console.error('[CouponManagement] 创建优惠券失败:', err);
      alert('创建失败：' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (couponId: string) => {
    const coupon = coupons.find((c) => c.id === couponId);
    if (!coupon) return;
    const nextActive = !coupon.isActive;
    try {
      const updated = await couponApi.toggleActive(couponId, nextActive);
      if (updated) {
        setCoupons(coupons.map((c) => (c.id === couponId ? { ...c, isActive: nextActive, updatedAt: new Date() } : c)));
      } else {
        alert('操作失败');
      }
    } catch (err: unknown) {
      console.error('[CouponManagement] 切换优惠券状态失败:', err);
      alert('操作失败：' + (err as Error).message);
    }
  };

  const formatDate = (date?: Date | string) => {
    if (!date) return '-';
    const d = typeof date === 'string' ? new Date(date) : date;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const isExpired = (coupon: Coupon) => {
    return new Date(coupon.endAt) < new Date();
  };

  const activeCoupons = coupons.filter((c) => c.isActive && !isExpired(c));
  const inactiveCoupons = coupons.filter((c) => !c.isActive || isExpired(c));

  return (
    <ShopLayout title="优惠券管理">
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
                    <Ticket className="text-orange-500" size={24} />
                  </div>
                  <div>
                    <p className="text-gray-500 text-sm">全部优惠券</p>
                    <p className="text-2xl font-bold text-gray-800">{coupons.length}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                    <Eye className="text-green-500" size={24} />
                  </div>
                  <div>
                    <p className="text-gray-500 text-sm">生效中</p>
                    <p className="text-2xl font-bold text-gray-800">{activeCoupons.length}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                    <EyeOff className="text-gray-500" size={24} />
                  </div>
                  <div>
                    <p className="text-gray-500 text-sm">已停用/过期</p>
                    <p className="text-2xl font-bold text-gray-800">{inactiveCoupons.length}</p>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                    <Users className="text-blue-500" size={24} />
                  </div>
                  <div>
                    <p className="text-gray-500 text-sm">总发行量</p>
                    <p className="text-2xl font-bold text-gray-800">
                      {coupons.reduce((sum, c) => sum + (c.totalQuantity > 0 ? c.totalQuantity : 0), 0) || '不限'}
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
                新建优惠券
              </button>
            </div>

            {/* 优惠券列表 */}
            <div className="space-y-4">
              {coupons.map((coupon) => (
                <div key={coupon.id} className="bg-white rounded-2xl shadow-sm p-4 md:p-5">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-gray-800 text-lg">{coupon.name}</h3>
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                          {typeLabels[coupon.type]}
                        </span>
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full">
                          {scopeLabels[coupon.applicableScope]}
                        </span>
                        {!coupon.isActive && (
                          <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded-full">已停用</span>
                        )}
                        {coupon.isActive && isExpired(coupon) && (
                          <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-600 rounded-full">已过期</span>
                        )}
                      </div>
                      <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-2xl font-bold text-red-500">
                          {coupon.type === 'percentage' ? `${coupon.value}折` : `¥${Number(coupon.value).toFixed(2)}`}
                        </span>
                        {coupon.minOrderAmount ? (
                          <span className="text-sm text-gray-500">满 ¥{Number(coupon.minOrderAmount).toFixed(2)} 可用</span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 text-sm text-gray-500">
                        <div className="flex items-center gap-1">
                          <Calendar size={14} />
                          <span>
                            {formatDate(coupon.startAt)} ~ {formatDate(coupon.endAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Tag size={14} />
                          <span>每人限领 {coupon.perCustomerLimit} 张</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Gift size={14} />
                          <span>
                            库存 {coupon.remainingQuantity >= 0 ? coupon.remainingQuantity : '不限'}
                            {coupon.totalQuantity > 0 ? ` / ${coupon.totalQuantity}` : ''}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleActive(coupon.id)}
                        className={`flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          coupon.isActive
                            ? 'bg-red-50 text-red-600 hover:bg-red-100'
                            : 'bg-green-50 text-green-600 hover:bg-green-100'
                        }`}
                      >
                        {coupon.isActive ? <EyeOff size={16} /> : <Eye size={16} />}
                        {coupon.isActive ? '停用' : '启用'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {coupons.length === 0 && (
                <div className="text-center py-16 bg-white rounded-2xl shadow-sm">
                  <Ticket className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                  <p className="text-gray-500 mb-4">暂无优惠券</p>
                  <button
                    onClick={handleAdd}
                    className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
                  >
                    创建第一张优惠券
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 新建优惠券弹窗 */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-800">新建优惠券</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">优惠券名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  placeholder="例如：新客满减券"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">优惠类型</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as CouponType })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  >
                    <option value="fixed_amount">固定金额减免</option>
                    <option value="percentage">百分比折扣</option>
                    <option value="buy_x_get_y">买赠</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {formData.type === 'percentage' ? '折扣率 (如 8.8)' : '优惠值 (元)'}
                  </label>
                  <div className="relative">
                    {formData.type === 'percentage' ? (
                      <Percent size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    ) : null}
                    <input
                      type="number"
                      step={formData.type === 'percentage' ? '0.1' : '0.01'}
                      value={formData.value}
                      onChange={(e) => setFormData({ ...formData, value: Number(e.target.value) })}
                      className={`w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none ${
                        formData.type === 'percentage' ? 'pl-10' : ''
                      }`}
                      placeholder="0"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">最低使用门槛 (元)</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.minOrderAmount || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, minOrderAmount: e.target.value ? Number(e.target.value) : 0 })
                  }
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  placeholder="0 表示无门槛"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">适用范围</label>
                <select
                  value={formData.applicableScope}
                  onChange={(e) => setFormData({ ...formData, applicableScope: e.target.value as CouponScope })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                >
                  <option value="all">全场通用</option>
                  <option value="product">指定商品</option>
                  <option value="service">指定服务</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">总发行量</label>
                  <input
                    type="number"
                    value={formData.totalQuantity === -1 ? '' : formData.totalQuantity}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        totalQuantity: e.target.value === '' ? -1 : Number(e.target.value),
                      })
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    placeholder="-1 表示不限"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">每人限领</label>
                  <input
                    type="number"
                    min={1}
                    value={formData.perCustomerLimit}
                    onChange={(e) => setFormData({ ...formData, perCustomerLimit: Number(e.target.value) })}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                    placeholder="1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">开始时间</label>
                  <input
                    type="date"
                    value={formData.startAt ? formatDate(formData.startAt) : ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        startAt: e.target.value ? new Date(e.target.value) : undefined,
                      })
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">结束时间</label>
                  <input
                    type="date"
                    value={formData.endAt ? formatDate(formData.endAt) : ''}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        endAt: e.target.value ? new Date(e.target.value) : undefined,
                      })
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="couponActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-5 h-5 text-orange-500 rounded"
                />
                <label htmlFor="couponActive" className="text-sm text-gray-700 cursor-pointer">
                  立即启用
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
    </ShopLayout>
  );
};

export default CouponManagement;
