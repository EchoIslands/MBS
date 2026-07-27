import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, Loader2, CheckCircle, Clock, Truck } from 'lucide-react';
import { useAppStore } from '../../store';
import { ProductOrder } from '../../../shared/types';
import { productOrderApi } from '../../api';
import ShopLayout from './ShopLayout';

const statusLabels: Record<string, string> = {
  pending: '待支付',
  paid: '已支付',
  preparing: '备货中',
  ready: '待提货',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
};

const statusColors: Record<string, string> = {
  pending: 'text-orange-600 bg-orange-100',
  paid: 'text-blue-600 bg-blue-100',
  preparing: 'text-yellow-600 bg-yellow-100',
  ready: 'text-purple-600 bg-purple-100',
  completed: 'text-green-600 bg-green-100',
  cancelled: 'text-gray-600 bg-gray-100',
  refunded: 'text-red-600 bg-red-100',
};

type TabKey = 'all' | 'pending' | 'processing' | 'ready' | 'completed' | 'cancelled';

const tabs: { key: TabKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待支付' },
  { key: 'processing', label: '处理中' },
  { key: 'ready', label: '待提货' },
  { key: 'completed', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
];

const ProductOrderManagement: React.FC = () => {
  const { currentShop } = useAppStore();
  const [orders, setOrders] = useState<ProductOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [verifyInputs, setVerifyInputs] = useState<Record<string, string>>({});

  const shopId = currentShop?.id || '';

  const fetchOrders = useCallback(async () => {
    if (!shopId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await productOrderApi.getByShop(shopId);
      setOrders(data || []);
    } catch (err) {
      console.error('[ProductOrderManagement] 获取订单失败:', err);
      alert('获取订单失败：' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [shopId]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const filteredOrders = useMemo(() => {
    if (activeTab === 'all') return orders;
    if (activeTab === 'processing') return orders.filter((o) => ['paid', 'preparing'].includes(o.status));
    return orders.filter((o) => o.status === activeTab);
  }, [orders, activeTab]);

  const updateOrderStatus = async (orderId: string, status: string, cancelReason?: string) => {
    setUpdatingId(orderId);
    try {
      const updated = await productOrderApi.updateStatus(orderId, status, cancelReason);
      if (updated) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updated } : o)));
      } else {
        alert('操作失败');
      }
    } catch (err) {
      console.error('[ProductOrderManagement] 更新状态失败:', err);
      alert((err as Error).message || '操作失败');
    } finally {
      setUpdatingId(null);
    }
  };

  const verifyPickup = async (orderId: string) => {
    const code = verifyInputs[orderId]?.trim();
    if (!code) {
      alert('请输入自提码');
      return;
    }
    setUpdatingId(orderId);
    try {
      const updated = await productOrderApi.verifyPickup(orderId, code);
      if (updated) {
        setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...updated } : o)));
        setVerifyInputs((prev) => ({ ...prev, [orderId]: '' }));
        alert('核销成功');
      } else {
        alert('核销失败，请检查自提码');
      }
    } catch (err) {
      console.error('[ProductOrderManagement] 核销失败:', err);
      alert((err as Error).message || '核销失败');
    } finally {
      setUpdatingId(null);
    }
  };

  const formatDate = (date?: string | Date) => {
    if (!date) return '-';
    const d = typeof date === 'string' ? new Date(date) : date;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const renderActions = (order: ProductOrder) => {
    const isUpdating = updatingId === order.id;

    if (order.status === 'pending') {
      // 到店自提付款：顾客到店后一次性核销并收款
      if (order.paymentMethod === 'store_pickup') {
        return (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              value={verifyInputs[order.id] || ''}
              onChange={(e) => setVerifyInputs((prev) => ({ ...prev, [order.id]: e.target.value }))}
              placeholder="输入自提码核销"
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
            />
            <button
              onClick={() => verifyPickup(order.id)}
              disabled={isUpdating}
              className="px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {isUpdating && <Loader2 size={14} className="animate-spin" />}
              核销并收款
            </button>
          </div>
        );
      }
      return (
        <button
          onClick={() => updateOrderStatus(order.id, 'cancelled', '店铺取消')}
          disabled={isUpdating}
          className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
        >
          取消订单
        </button>
      );
    }

    if (order.status === 'paid') {
      return (
        <button
          onClick={() => updateOrderStatus(order.id, 'preparing')}
          disabled={isUpdating}
          className="px-3 py-1.5 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 flex items-center gap-1"
        >
          {isUpdating && <Loader2 size={14} className="animate-spin" />}
          开始备货
        </button>
      );
    }

    if (order.status === 'preparing') {
      return (
        <button
          onClick={() => updateOrderStatus(order.id, 'ready')}
          disabled={isUpdating}
          className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1"
        >
          {isUpdating && <Loader2 size={14} className="animate-spin" />}
          通知提货
        </button>
      );
    }

    if (order.status === 'ready') {
      return (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <input
            type="text"
            value={verifyInputs[order.id] || ''}
            onChange={(e) => setVerifyInputs((prev) => ({ ...prev, [order.id]: e.target.value }))}
            placeholder="输入自提码"
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
          />
          <button
            onClick={() => verifyPickup(order.id)}
            disabled={isUpdating}
            className="px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-1"
          >
            {isUpdating && <Loader2 size={14} className="animate-spin" />}
            核销提货
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <ShopLayout title="商品订单管理">
      <div className="min-h-screen bg-gray-50">
        {/* 统计 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                <Package className="text-orange-500" size={20} />
              </div>
              <div>
                <p className="text-gray-500 text-xs">全部订单</p>
                <p className="text-xl font-bold text-gray-800">{orders.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-xl flex items-center justify-center">
                <Clock className="text-yellow-600" size={20} />
              </div>
              <div>
                <p className="text-gray-500 text-xs">待处理</p>
                <p className="text-xl font-bold text-gray-800">{orders.filter((o) => ['pending', 'paid', 'preparing'].includes(o.status)).length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                <Truck className="text-purple-600" size={20} />
              </div>
              <div>
                <p className="text-gray-500 text-xs">待提货</p>
                <p className="text-xl font-bold text-gray-800">{orders.filter((o) => o.status === 'ready').length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <CheckCircle className="text-green-600" size={20} />
              </div>
              <div>
                <p className="text-gray-500 text-xs">已完成</p>
                <p className="text-xl font-bold text-gray-800">{orders.filter((o) => o.status === 'completed').length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 标签页 */}
        <div className="bg-white rounded-2xl shadow-sm p-2 mb-6 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-orange-500 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <Loader2 size={32} className="animate-spin mr-2" />
            加载中...
          </div>
        )}

        {!loading && (
          <div className="space-y-4">
            {filteredOrders.map((order) => (
              <div key={order.id} className="bg-white rounded-2xl shadow-sm p-5">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                  <div>
                    <p className="text-sm text-gray-500">订单号：{order.orderNo}</p>
                    <p className="text-xs text-gray-400 mt-1">下单时间：{formatDate(order.createdAt)}</p>
                  </div>
                  <span className={`text-xs px-3 py-1 rounded-full font-medium ${statusColors[order.status] || 'text-gray-600 bg-gray-100'}`}>
                    {statusLabels[order.status] || order.status}
                  </span>
                </div>

                <div className="space-y-3 mb-4">
                  {order.items.map((item, idx) => (
                    <div key={idx} className="flex gap-3">
                      <img
                        src={item.image || 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=200&h=200&fit=crop'}
                        alt={item.name}
                        className="w-16 h-16 rounded-xl object-cover"
                      />
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-gray-800">{item.name}</h3>
                        <p className="text-xs text-gray-500 mt-1">
                          ¥{item.price.toFixed(2)} × {item.quantity}
                        </p>
                      </div>
                      <div className="text-sm font-medium text-gray-800">
                        ¥{item.totalAmount.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t pt-4">
                  <div className="text-sm">
                    <span className="text-gray-500">顾客：{order.customerName || '-'}</span>
                    <span className="text-gray-500 ml-4">手机号：{order.customerPhone || '-'}</span>
                    {order.pickupCode && (
                      <span className="block sm:inline text-orange-600 font-medium sm:ml-4">
                        自提码：{order.pickupCode}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-800">
                      合计：<span className="text-lg font-bold text-red-500">¥{order.payableAmount.toFixed(2)}</span>
                    </span>
                    {renderActions(order)}
                  </div>
                </div>
              </div>
            ))}

            {filteredOrders.length === 0 && (
              <div className="text-center py-16 bg-white rounded-2xl shadow-sm">
                <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">暂无订单</p>
              </div>
            )}
          </div>
        )}
      </div>
    </ShopLayout>
  );
};

export default ProductOrderManagement;
