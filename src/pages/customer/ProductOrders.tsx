import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Loader2 } from 'lucide-react';
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

const ProductOrders: React.FC = () => {
  const { shopId } = useParams<{ shopId: string }>();
  const navigate = useNavigate();
  const { currentCustomer } = useAppStore();
  const [orders, setOrders] = useState<ProductOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      if (!currentCustomer?.id || !shopId) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const data = await productOrderApi.getByCustomer(currentCustomer.id, shopId);
        setOrders(data || []);
      } catch (err) {
        console.error('[ProductOrders] 获取订单失败:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchOrders();
  }, [currentCustomer?.id, shopId]);

  const formatDate = (date?: string | Date) => {
    if (!date) return '-';
    const d = typeof date === 'string' ? new Date(date) : date;
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
          <div key={order.id} className="bg-white rounded-xl p-4 shadow-sm">
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
      </div>
    </div>
  );
};

export default ProductOrders;
