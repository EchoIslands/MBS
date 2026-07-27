import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Loader2, X } from 'lucide-react';
import { useAppStore } from '../../store';
import { ProductOrder } from '../../../shared/types';
import { productOrderApi } from '../../api';

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

const ProductOrders: React.FC = () => {
  const { shopId } = useParams<{ shopId: string }>();
  const navigate = useNavigate();
  const { currentCustomer } = useAppStore();
  const [orders, setOrders] = useState<ProductOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailOrder, setDetailOrder] = useState<ProductOrder | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const [submittingRefund, setSubmittingRefund] = useState(false);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const fetchOrders = async () => {
      if (!currentCustomer?.id || !shopId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await productOrderApi.getByCustomer(currentCustomer.id, shopId, {
          signal: controller.signal,
          timeout: 30000,
        });
        if (!mounted) return;
        setOrders(data || []);
      } catch (err) {
        if (!mounted) return;
        if ((err as Error).name === 'AbortError') {
          return;
        }
        console.error('[ProductOrders] 获取订单失败:', err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    fetchOrders();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [currentCustomer?.id, shopId]);

  const formatDate = (date?: string | Date) => {
    if (!date) return '-';
    const d = typeof date === 'string' ? new Date(date) : date;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const canRequestRefund = (order: ProductOrder) => {
    return order.paymentMethod === 'balance' && ['paid', 'preparing', 'ready'].includes(order.status);
  };

  const handleRefundRequest = async () => {
    if (!detailOrder) return;
    const reason = refundReason.trim();
    if (!reason) {
      alert('请填写退款原因');
      return;
    }
    setSubmittingRefund(true);
    try {
      await productOrderApi.requestRefund(detailOrder.id, reason);
      alert('退款申请已提交，请等待店铺审核');
      setRefundReason('');
      setDetailOrder(null);
      // 刷新订单列表
      if (currentCustomer?.id && shopId) {
        const data = await productOrderApi.getByCustomer(currentCustomer.id, shopId);
        setOrders(data || []);
      }
    } catch (err) {
      console.error('[ProductOrders] 申请退款失败:', err);
      alert((err as Error).message || '申请退款失败');
    } finally {
      setSubmittingRefund(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 bg-white shadow-sm z-50">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="font-bold text-lg">我的商品订单</h1>
          <div className="w-10" />
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">
        {loading && (
          <div className="flex items-center justify-center py-12 text-gray-500">
            <Loader2 size={32} className="animate-spin mr-2" />
            加载中...
          </div>
        )}

        {!loading && orders.length === 0 && (
          <div className="text-center py-16">
            <Package className="w-20 h-20 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 mb-4">暂无商品订单</p>
            <button
              onClick={() => navigate(`/customer/products/${shopId}`)}
              className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
            >
              去逛逛
            </button>
          </div>
        )}

        {!loading && orders.map((order) => (
          <div
            key={order.id}
            onClick={() => setDetailOrder(order)}
            className="bg-white rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-500">订单号：{order.orderNo}</span>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[order.status] || 'text-gray-600 bg-gray-100'}`}>
                {statusLabels[order.status] || order.status}
              </span>
            </div>

            <div className="space-y-3">
              {order.items.map((item, idx) => (
                <div key={idx} className="flex gap-3">
                  <img
                    src={item.image || 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=200&h=200&fit=crop'}
                    alt={item.name}
                    className="w-16 h-16 rounded-lg object-cover"
                  />
                  <div className="flex-1">
                    <h3 className="text-sm font-medium text-gray-800">{item.name}</h3>
                    <div className="text-xs text-gray-500 mt-1">
                      ¥{item.price.toFixed(2)} × {item.quantity}
                    </div>
                  </div>
                  <div className="text-sm font-medium text-gray-800">
                    ¥{item.totalAmount.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t mt-3 pt-3 flex items-center justify-between text-sm">
              <span className="text-gray-500">下单时间：{formatDate(order.createdAt)}</span>
              <span className="text-gray-800">
                合计：<span className="text-lg font-bold text-red-500">¥{order.payableAmount.toFixed(2)}</span>
              </span>
            </div>

            {order.pickupCode && (
              <div className="mt-3 p-3 bg-orange-50 rounded-lg text-sm">
                <span className="text-gray-600">自提码：</span>
                <span className="font-bold text-orange-600 text-lg tracking-wider">{order.pickupCode}</span>
              </div>
            )}
          </div>
        ))}

        {/* 订单详情弹窗 */}
        {detailOrder && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setDetailOrder(null)}
          >
            <div
              className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-gray-800">订单详情</h2>
                <button onClick={() => setDetailOrder(null)} className="p-2 hover:bg-gray-100 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  <span className="text-gray-500">订单号：<span className="text-gray-800">{detailOrder.orderNo}</span></span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[detailOrder.status] || 'text-gray-600 bg-gray-100'}`}>
                    {statusLabels[detailOrder.status] || detailOrder.status}
                  </span>
                </div>
                <p className="text-gray-500">下单时间：<span className="text-gray-800">{formatDate(detailOrder.createdAt)}</span></p>
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

                <div className="border rounded-xl overflow-hidden mt-2">
                  {detailOrder.items.map((item, idx) => (
                    <div key={idx} className={`px-4 py-3 flex gap-3 ${idx > 0 ? 'border-t' : ''}`}>
                      <img src={item.image || 'https://images.unsplash.com/photo-1560066984-138dadb4c035?w=200&h=200&fit=crop'} alt={item.name} className="w-12 h-12 rounded-lg object-cover" />
                      <div className="flex-1">
                        <p className="text-gray-800">{item.name}</p>
                        <p className="text-xs text-gray-500">¥{item.price.toFixed(2)} × {item.quantity}</p>
                      </div>
                      <span className="font-medium">¥{item.totalAmount.toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <span className="text-gray-500">商品总额：¥{detailOrder.totalAmount.toFixed(2)}</span>
                  <span className="text-gray-500">优惠：-¥{detailOrder.discountAmount.toFixed(2)}</span>
                  <span className="font-bold text-red-500">合计：¥{detailOrder.payableAmount.toFixed(2)}</span>
                </div>

                {canRequestRefund(detailOrder) && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm text-gray-600 mb-2">申请退款</p>
                    <textarea
                      value={refundReason}
                      onChange={(e) => setRefundReason(e.target.value)}
                      placeholder="请填写退款原因"
                      className="w-full p-3 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-orange-500 text-sm"
                      rows={3}
                    />
                    <button
                      onClick={handleRefundRequest}
                      disabled={submittingRefund}
                      className="mt-3 w-full py-2.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-1"
                    >
                      {submittingRefund && <Loader2 size={16} className="animate-spin" />}
                      申请退款
                    </button>
                  </div>
                )}
              </div>

              <button
                onClick={() => setDetailOrder(null)}
                className="mt-5 w-full py-2.5 bg-gray-100 text-gray-800 rounded-lg text-sm font-medium hover:bg-gray-200"
              >
                关闭
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductOrders;
