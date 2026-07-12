import React, { useState, useEffect } from 'react';

import {
  CreditCard,
  Wallet,
  Search,
  Filter,
  ChevronDown,
  Plus,
  Eye,
  Calendar,
  DollarSign,
  XCircle,
  Clock,
  User,
  Package,
} from 'lucide-react';
import { Settlement, Customer } from '../../../shared/types';
import { settlementApi, customerApi } from '../../api';
import { useAppStore } from '../../store';
import ShopLayout from './ShopLayout';

const SettlementManagement: React.FC = () => {
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [viewingSettlement, setViewingSettlement] = useState<Settlement | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // 新建结算弹窗状态
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newPaymentMethod, setNewPaymentMethod] = useState<'cash' | 'wechat' | 'alipay' | 'card' | 'balance'>('cash');
  const [newAmount, setNewAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { currentShop, currentEmployee } = useAppStore();

  // 加载结算记录和客户列表
  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      setLoading(true);
      setError(null);
      try {
        const shopId = currentShop?.id || 'shop1';
        const [settlementList, customerList] = await Promise.all([
          settlementApi.getByShop(shopId),
          customerApi.getAll(),
        ]);
        if (cancelled) return;
        setSettlements((settlementList || []).map((s: unknown) => {
          const item = s as Partial<Settlement> & { created_at?: string | Date };
          return {
            ...item,
            createdAt: item.createdAt || item.created_at,
          } as Settlement;
        }));
        setCustomers(customerList || []);
      } catch (err: unknown) {
        if (!cancelled) setError((err as Error).message || '加载数据失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadData();
    return () => { cancelled = true; };
  }, [currentShop?.id]);

  const paymentMethods = [
    { value: 'all', label: '全部' },
    { value: 'cash', label: '现金' },
    { value: 'wechat', label: '微信支付' },
    { value: 'alipay', label: '支付宝' },
    { value: 'card', label: '银行卡' },
    { value: 'balance', label: '储值余额' },
  ];

  const statuses = [
    { value: 'all', label: '全部' },
    { value: 'pending', label: '待支付' },
    { value: 'completed', label: '已完成' },
    { value: 'failed', label: '失败' },
  ];

  const filteredSettlements = settlements.filter(settlement => {
    const matchesSearch = 
      settlement.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      settlement.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesPaymentMethod = selectedPaymentMethod === 'all' || settlement.paymentMethod === selectedPaymentMethod;
    
    const matchesStatus = selectedStatus === 'all' || settlement.paymentStatus === selectedStatus;
    
    return matchesSearch && matchesPaymentMethod && matchesStatus;
  });

  const getPaymentMethodLabel = (method: string) => {
    return paymentMethods.find(p => p.value === method)?.label || method;
  };

  const getStatusLabel = (status: string) => {
    return statuses.find(s => s.value === status)?.label || status;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-700';
      case 'pending':
        return 'bg-yellow-100 text-yellow-700';
      case 'failed':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getPaymentMethodColor = (method: string) => {
    switch (method) {
      case 'wechat':
        return 'bg-green-100 text-green-700';
      case 'alipay':
        return 'bg-blue-100 text-blue-700';
      case 'cash':
        return 'bg-yellow-100 text-yellow-700';
      case 'card':
        return 'bg-purple-100 text-purple-700';
      case 'balance':
        return 'bg-cyan-100 text-cyan-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const totalRevenue = settlements
    .filter(s => s.paymentStatus === 'completed')
    .reduce((sum, s) => sum + s.total, 0);

  const todaySettlements = settlements.filter(s => 
    new Date(s.createdAt).toDateString() === new Date().toDateString()
  );

  const todayRevenue = todaySettlements
    .filter(s => s.paymentStatus === 'completed')
    .reduce((sum, s) => sum + s.total, 0);

  const stats = [
    { label: '今日结算', value: todaySettlements.length, icon: Calendar, color: 'text-blue-500' },
    { label: '今日营收', value: `¥${todayRevenue.toFixed(2)}`, icon: DollarSign, color: 'text-green-500' },
    { label: '累计结算', value: settlements.length, icon: CreditCard, color: 'text-purple-500' },
    { label: '累计营收', value: `¥${totalRevenue.toFixed(2)}`, icon: Wallet, color: 'text-orange-500' },
  ];

  return (
    <ShopLayout title="结算管理">
      <div className="min-h-screen bg-gray-50">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div key={index} className="bg-white rounded-2xl shadow-sm p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                    <Icon size={20} className="text-green-500" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-800">{stat.value}</div>
                    <div className="text-sm text-gray-500">{stat.label}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {loading && (
          <div className="text-center py-12 text-gray-500">
            <div className="animate-spin inline-block w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full mb-3" />
            <p className="text-sm">加载中...</p>
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-6 text-red-600 text-sm">
            {error}
          </div>
        )}

        {!loading && (
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="flex-1 relative">
              <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="搜索客户姓名或结算单号..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
              />
            </div>
            
            <div className="relative">
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className="flex items-center gap-2 px-4 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <Filter size={20} />
                <span>筛选</span>
                <ChevronDown size={16} />
              </button>
              
              {showFilterDropdown && (
                <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-lg p-4 w-72 z-10">
                  <div className="mb-4">
                    <h3 className="font-medium text-gray-800 mb-2">支付方式</h3>
                    <div className="flex flex-wrap gap-2">
                      {paymentMethods.map(method => (
                        <button
                          key={method.value}
                          onClick={() => setSelectedPaymentMethod(method.value)}
                          className={`px-3 py-1 rounded-full text-sm transition-all ${
                            selectedPaymentMethod === method.value
                              ? 'bg-green-500 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {method.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-medium text-gray-800 mb-2">结算状态</h3>
                    <div className="flex flex-wrap gap-2">
                      {statuses.map(status => (
                        <button
                          key={status.value}
                          onClick={() => setSelectedStatus(status.value)}
                          className={`px-3 py-1 rounded-full text-sm transition-all ${
                            selectedStatus === status.value
                              ? 'bg-green-500 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {status.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium transition-colors"
            >
              <Plus size={20} />
              <span>新建结算</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">结算单号</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">客户</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">商品/服务</th>
                  <th className="text-right py-3 px-4 text-sm font-medium text-gray-600">金额</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">支付方式</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">状态</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-600">时间</th>
                  <th className="text-center py-3 px-4 text-sm font-medium text-gray-600">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredSettlements.length > 0 ? (
                  filteredSettlements.map((settlement) => (
                    <tr key={settlement.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-4 px-4">
                        <span className="font-medium text-gray-800">{settlement.id}</span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                            <User size={16} className="text-gray-500" />
                          </div>
                          <span>{settlement.customerName}</span>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <div className="max-w-xs truncate">
                          {settlement.items.map((item, index) => (
                            <div key={index} className="text-sm text-gray-600">
                              {item.type === 'service' ? <span className="text-green-600">服务:</span> : <span className="text-blue-600">商品:</span>}
                              {item.name} x{item.quantity}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <div className="font-bold text-orange-500">¥{settlement.total.toFixed(2)}</div>
                        {settlement.discount > 0 && (
                          <div className="text-xs text-gray-500">折扣 ¥{settlement.discount.toFixed(2)}</div>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPaymentMethodColor(settlement.paymentMethod)}`}>
                          {getPaymentMethodLabel(settlement.paymentMethod)}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(settlement.paymentStatus)}`}>
                          {getStatusLabel(settlement.paymentStatus)}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Clock size={14} />
                          {new Date(settlement.createdAt).toLocaleString()}
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <button
                          onClick={() => setViewingSettlement(settlement)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="查看详情"
                        >
                          <Eye size={18} className="text-gray-600" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="text-center text-gray-500 py-12">
                      <CreditCard size={48} className="mx-auto mb-2 opacity-50" />
                      <p>暂无结算记录</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </div>

      {viewingSettlement && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-800">结算详情</h3>
              <button onClick={() => setViewingSettlement(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <XCircle size={20} />
              </button>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">结算单号</span>
                <span className="font-medium">{viewingSettlement.id}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-2">
                  <User size={16} />
                  客户
                </span>
                <span className="font-medium">{viewingSettlement.customerName}</span>
              </div>
              <div className="py-3 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-2 mb-3 block">
                  <Package size={16} />
                  商品/服务明细
                </span>
                <div className="space-y-2">
                  {viewingSettlement.items.map((item, index) => (
                    <div key={index} className="flex items-center justify-between text-sm">
                      <span>
                        {item.type === 'service' ? (
                          <span className="text-green-600 mr-1">服务</span>
                        ) : (
                          <span className="text-blue-600 mr-1">商品</span>
                        )}
                        {item.name} x{item.quantity}
                      </span>
                      <span className="font-medium">
                        ¥{(item.discountedPrice * item.quantity).toFixed(2)}
                        {item.discountedPrice < item.originalPrice && (
                          <span className="text-xs text-gray-400 line-through ml-1">
                            ¥{(item.originalPrice * item.quantity).toFixed(2)}
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">小计</span>
                <span className="font-medium">¥{viewingSettlement.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">折扣</span>
                <span className="font-medium text-green-500">-¥{viewingSettlement.discount.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">税费</span>
                <span className="font-medium">¥{viewingSettlement.tax.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between py-3">
                <span className="text-gray-800 font-bold text-lg">总计</span>
                <span className="text-orange-500 font-bold text-xl">¥{viewingSettlement.total.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">支付方式</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPaymentMethodColor(viewingSettlement.paymentMethod)}`}>
                  {getPaymentMethodLabel(viewingSettlement.paymentMethod)}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">状态</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(viewingSettlement.paymentStatus)}`}>
                  {getStatusLabel(viewingSettlement.paymentStatus)}
                </span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-2">
                  <Clock size={16} />
                  创建时间
                </span>
                <span className="font-medium">{new Date(viewingSettlement.createdAt).toLocaleString()}</span>
              </div>
              {viewingSettlement.processedBy && (
                <div className="flex items-center justify-between py-3">
                  <span className="text-gray-500">操作员</span>
                  <span className="font-medium">{viewingSettlement.processedBy}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-lg font-bold text-gray-800 mb-4">新建结算</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">选择客户</label>
                <select
                  value={newCustomerId}
                  onChange={(e) => setNewCustomerId(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                >
                  <option value="">请选择客户</option>
                  {customers.map(customer => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} ({customer.phone})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">支付方式</label>
                <div className="grid grid-cols-3 gap-2">
                  {paymentMethods.filter(p => p.value !== 'all').map(method => (
                    <button
                      key={method.value}
                      className={`py-2 px-3 rounded-xl text-sm transition-all ${
                        newPaymentMethod === method.value
                          ? 'bg-green-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      onClick={() => setNewPaymentMethod(method.value as 'cash' | 'wechat' | 'alipay' | 'card' | 'balance')}
                    >
                      {method.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">金额</label>
                <div className="relative">
                  <DollarSign size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="number"
                    value={newAmount}
                    onChange={(e) => setNewAmount(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
              >
                取消
              </button>
              <button
                disabled={submitting || !newCustomerId || !newAmount || Number(newAmount) <= 0}
                onClick={async () => {
                  setSubmitting(true);
                  try {
                    const amount = Number(newAmount);
                    const customer = customers.find(c => c.id === newCustomerId);
                    await settlementApi.create({
                      shopId: currentShop?.id || 'shop1',
                      customerId: newCustomerId,
                      customerName: customer?.name || '',
                      items: [{
                        type: 'service',
                        id: 'manual',
                        name: '手工结算',
                        originalPrice: amount,
                        discountedPrice: amount,
                        quantity: 1,
                        total: amount,
                      }],
                      subtotal: amount,
                      discountDetail: {
                        purchaseVIPDiscount: 1,
                        storedValueDiscount: 1,
                        finalDiscount: 1,
                        purchaseVIPDiscountAmount: 0,
                        storedValueDiscountAmount: 0,
                        benefitDiscountAmount: 0,
                        discount: 0,
                      },
                      discount: 0,
                      tax: 0,
                      total: amount,
                      paymentMethod: newPaymentMethod,
                      usedBenefitIds: [],
                      processedBy: currentEmployee?.name,
                    });
                    // 刷新列表
                    const list = await settlementApi.getByShop(currentShop?.id || 'shop1');
                    setSettlements((list || []).map((s: unknown) => {
                      const item = s as Partial<Settlement> & { created_at?: string | Date };
                      return {
                        ...item,
                        createdAt: item.createdAt || item.created_at,
                      } as Settlement;
                    }));
                    setShowAddModal(false);
                    setNewCustomerId('');
                    setNewAmount('');
                    setNewPaymentMethod('cash');
                  } catch (err: unknown) {
                    alert((err as Error).message || '创建结算失败');
                  } finally {
                    setSubmitting(false);
                  }
                }}
                className="flex-1 px-4 py-2 bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white rounded-xl font-medium transition-colors"
              >
                {submitting ? '提交中...' : '确认结算'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ShopLayout>
  );
};

export default SettlementManagement;