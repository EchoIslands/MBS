import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Package, Loader2, CheckCircle, Clock, Truck, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../store';
import { ProductOrder, ProductOrderRefund } from '../../../shared/types';
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
  refunding: '退款中',
};

const statusColors: Record<string, string> = {
  pending: 'text-orange-600 bg-orange-100',
  paid: 'text-blue-600 bg-blue-100',
  preparing: 'text-yellow-600 bg-yellow-100',
  ready: 'text-purple-600 bg-purple-100',
  completed: 'text-green-600 bg-green-100',
  cancelled: 'text-gray-600 bg-gray-100',
  refunded: 'text-red-600 bg-red-100',
  refunding: 'text-pink-600 bg-pink-100',
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
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('all');
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [verifyInputs, setVerifyInputs] = useState<Record<string, string>>({});
  const [detailOrder, setDetailOrder] = useState<ProductOrder | null>(null);
  const [refundModal, setRefundModal] = useState<{ open: boolean; refund?: ProductOrderRefund; rejectReason: string }>({ open: false, rejectReason: '' });

  const shopId = currentShop?.id || '';

  const fetchOrders = useCallback(async () => {
    if (!shopId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const statusParam =
        activeTab === 'all' ? undefined : activeTab === 'processing' ? 'paid,preparing' : activeTab;
      const data = await productOrderApi.getByShop(shopId, {
        status: statusParam,
        keyword: keyword.trim() || undefined,
        page,
        pageSize,
      });
      setOrders(data.list || []);
      setTotal(data.total || 0);
    } catch (err) {
      console.error('[ProductOrderManagement] 获取订单失败:', err);
      alert('获取订单失败：' + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [shopId, activeTab, keyword, page, pageSize]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const totalPages = useMemo(() => Math.ceil(total / pageSize) || 1, [total, pageSize]);

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

  const openRefundModal = async (orderId: string) => {
    if (!shopId) return;
    setUpdatingId(orderId);
    try {
      const refunds = await productOrderApi.getRefundRequests(shopId, 'pending');
      const target = refunds.find((r) => r.orderId === orderId);
      if (target) {
        setRefundModal({ open: true, refund: target, rejectReason: '' });
      } else {
        alert('未找到该订单的待处理退款申请');
      }
    } catch (err) {
      console.error('[ProductOrderManagement] 获取退款申请失败:', err);
      alert((err as Error).message || '获取退款申请失败');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleRefund = async (status: 'approved' | 'rejected') => {
    if (!refundModal.refund) return;
    if (status === 'rejected' && !refundModal.rejectReason.trim()) {
      alert('请填写拒绝原因');
      return;
    }
    setUpdatingId(refundModal.refund.id);
    try {
      await productOrderApi.handleRefund(refundModal.refund.id, status, refundModal.rejectReason.trim() || undefined);
      setRefundModal({ open: false, refund: undefined, rejectReason: '' });
      await fetchOrders();
      setDetailOrder(null);
    } catch (err) {
      console.error('[ProductOrderManagement] 处理退款失败:', err);
      alert((err as Error).message || '处理退款失败');
    } finally {
      setUpdatingId(null);
    }
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

    if (order.status === 'refunding') {
      return (
        <button
          onClick={() => openRefundModal(order.id)}
          disabled={isUpdating}
          className="px-3 py-1.5 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:opacity-50 flex items-center gap-1"
        >
          {isUpdating && <Loader2 size={14} className="animate-spin" />}
          处理退款
        </button>
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

        {/* 搜索 + 标签页 */}
        <div className="bg-white rounded-2xl shadow-sm p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setKeyword(searchInput);
                    setPage(1);
                  }
                }}
                placeholder="搜索订单号 / 手机号"
                className="w-full pl-10 pr-10 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-orange-500"
              />
              {searchInput && (
                <button
                  onClick={() => {
                    setSearchInput('');
                    setKeyword('');
                    setPage(1);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>
            <button
              onClick={() => {
                setKeyword(searchInput);
                setPage(1);
              }}
              className="px-5 py-2 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600"
            >
              搜索
            </button>
          </div>
          <div className="flex gap-1 overflow-x-auto min-w-max">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setPage(1);
                }}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
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
            {orders.map((order) => (
              <div
                key={order.id}
                onClick={() => setDetailOrder(order)}
                className="bg-white rounded-2xl shadow-sm p-5 cursor-pointer hover:shadow-md transition-shadow"
              >
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

            {orders.length === 0 && (
              <div className="text-center py-16 bg-white rounded-2xl shadow-sm">
                <Package className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500">暂无订单</p>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between bg-white rounded-2xl shadow-sm p-4">
                <span className="text-sm text-gray-500">
                  共 {total} 条，第 {page}/{totalPages} 页
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 退款处理弹窗 */}
        {refundModal.open && refundModal.refund && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setRefundModal({ open: false, refund: undefined, rejectReason: '' })}
          >
            <div
              className="bg-white rounded-2xl max-w-lg w-full p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800">处理退款申请</h2>
                <button
                  onClick={() => setRefundModal({ open: false, refund: undefined, rejectReason: '' })}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-3 text-sm mb-5">
                <p className="text-gray-500">订单号：<span className="text-gray-800">{refundModal.refund.orderNo || refundModal.refund.orderId}</span></p>
                <p className="text-gray-500">顾客：<span className="text-gray-800">{refundModal.refund.customerName || '-'}</span></p>
                <p className="text-gray-500">退款金额：<span className="text-red-500 font-bold">¥{refundModal.refund.amount.toFixed(2)}</span></p>
                <p className="text-gray-500">退款原因：<span className="text-gray-800">{refundModal.refund.reason}</span></p>
                <textarea
                  value={refundModal.rejectReason}
                  onChange={(e) => setRefundModal((prev) => ({ ...prev, rejectReason: e.target.value }))}
                  placeholder="拒绝时必填，同意时可选备注"
                  className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => handleRefund('rejected')}
                  disabled={!!updatingId}
                  className="flex-1 px-4 py-2.5 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                >
                  拒绝退款
                </button>
                <button
                  onClick={() => handleRefund('approved')}
                  disabled={!!updatingId}
                  className="flex-1 px-4 py-2.5 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600 disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  {updatingId === refundModal.refund.id && <Loader2 size={16} className="animate-spin" />}
                  同意退款
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 订单详情弹窗 */}
        {detailOrder && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setDetailOrder(null)}
          >
            <div
              className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800">订单详情</h2>
                <button
                  onClick={() => setDetailOrder(null)}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <span className="text-gray-500">订单号：<span className="text-gray-800">{detailOrder.orderNo}</span></span>
                  <span className="text-gray-500">下单时间：<span className="text-gray-800">{formatDate(detailOrder.createdAt)}</span></span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[detailOrder.status] || 'text-gray-600 bg-gray-100'}`}>
                    {statusLabels[detailOrder.status] || detailOrder.status}
                  </span>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <p className="text-gray-500">顾客：<span className="text-gray-800">{detailOrder.customerName || '-'}</span></p>
                  <p className="text-gray-500">手机号：<span className="text-gray-800">{detailOrder.customerPhone || '-'}</span></p>
                  <p className="text-gray-500">提货人：<span className="text-gray-800">{detailOrder.pickupName || '-'}</span></p>
                  <p className="text-gray-500">提货电话：<span className="text-gray-800">{detailOrder.pickupPhone || '-'}</span></p>
                  {detailOrder.pickupCode && (
                    <p className="text-gray-500">
                      自提码：<span className="font-bold text-orange-600 text-lg tracking-wider">{detailOrder.pickupCode}</span>
                    </p>
                  )}
                  <p className="text-gray-500">
                    支付方式：<span className="text-gray-800">{detailOrder.paymentMethod === 'balance' ? '余额支付' : detailOrder.paymentMethod === 'store_pickup' ? '到店自提付款' : detailOrder.paymentMethod}</span>
                  </p>
                  {detailOrder.notes && <p className="text-gray-500">备注：<span className="text-gray-800">{detailOrder.notes}</span></p>}
                </div>

                <div className="border rounded-xl overflow-hidden">
                  <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500 grid grid-cols-12 gap-2">
                    <span className="col-span-6">商品</span>
                    <span className="col-span-3 text-right">单价</span>
                    <span className="col-span-2 text-center">数量</span>
                    <span className="col-span-1 text-right">小计</span>
                  </div>
                  {detailOrder.items.map((item, idx) => (
                    <div key={idx} className="px-4 py-3 border-t grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-6 flex items-center gap-3">
                        <img src={item.image || 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=200&h=200&fit=crop'} alt={item.name} className="w-10 h-10 rounded-lg object-cover" />
                        <span className="text-gray-800">{item.name}</span>
                      </div>
                      <span className="col-span-3 text-right text-gray-600">¥{item.price.toFixed(2)}</span>
                      <span className="col-span-2 text-center text-gray-600">{item.quantity}</span>
                      <span className="col-span-1 text-right font-medium">¥{item.totalAmount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-4 text-sm pt-2">
                  <span className="text-gray-500">商品总额：<span className="text-gray-800">¥{detailOrder.totalAmount.toFixed(2)}</span></span>
                  <span className="text-gray-500">优惠：<span className="text-gray-800">-¥{detailOrder.discountAmount.toFixed(2)}</span></span>
                  <span className="text-gray-800 font-bold">
                    应付：<span className="text-red-500 text-lg">¥{detailOrder.payableAmount.toFixed(2)}</span>
                  </span>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button
                  onClick={() => setDetailOrder(null)}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                >
                  关闭
                </button>
                {renderActions(detailOrder)}
              </div>
            </div>
          </div>
        )}
      </div>
    </ShopLayout>
  );
};

export default ProductOrderManagement;
