import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  User,
  Plus,
  Minus,
  Trash2,
  ShoppingBag,
  Scissors,
  CreditCard,
  Wallet,
  Banknote,
  CheckCircle,
  AlertTriangle,
  Gift,
  Crown,
} from 'lucide-react';
import {
  Customer,
  Product,
  Service,
  Shop,
  SettlementItem,
  SettlementDiscountDetail,
  ProductCategory,
  PurchaseVIPLevel,
  StoredValueLevel,
} from '../../../shared/types';
import {
  getPurchaseVIPLabel,
  getStoredValueLabel,
  getCustomerEffectiveDiscount,
  getEffectivePurchaseVIPLevel,
  getEffectiveStoredValueLevel,
  isVIPExpiringSoon,
  calcSettlementDiscountDetail,
} from '../../lib/membership';
import { customerApi, shopApi, bookingApi, settlementApi, memberBenefitApi } from '../../api';
import { useAppStore } from '../../store';
import ShopLayout from './ShopLayout';

interface CartItem {
  id: string;
  type: 'service' | 'product';
  name: string;
  originalPrice: number;
  quantity: number;
  category?: ProductCategory;
  employeeId?: string;
  employeeName?: string;
  employeeLevel?: 'normal' | 'gold' | 'director';
}

const designerPriceMap: Record<string, number> = {
  normal: 0,
  gold: 20,
  director: 40,
};

const designerLabelMap: Record<string, string> = {
  normal: '不限理发师',
  gold: '金牌设计师',
  director: '总监设计师',
};

const Checkout: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentShop, currentEmployee } = useAppStore();

  const initialCustomerId = searchParams.get('customerId');
  const initialBookingId = searchParams.get('bookingId');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  const [shop, setShop] = useState<Shop | null>(null);
  const [loadingShop, setLoadingShop] = useState(true);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedBenefits, setSelectedBenefits] = useState<string[]>([]);
  const [availableBenefits, setAvailableBenefits] = useState<any[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wechat' | 'alipay' | 'card' | 'balance'>('cash');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const services = shop?.services || [];
  const products = shop?.products || [];
  const employees = shop?.employees || [];

  // 加载店铺信息和客户列表
  useEffect(() => {
    let cancelled = false;
    const loadInitialData = async () => {
      setLoadingShop(true);
      setLoadingCustomers(true);
      setError(null);
      try {
        const shopId = currentShop?.id || 'shop1';
        const [shopData, customerList] = await Promise.all([
          shopApi.getShop(shopId),
          customerApi.getAll(),
        ]);
        if (cancelled) return;
        setShop(shopData);
        setCustomers(customerList || []);
      } catch (err: any) {
        if (!cancelled) setError(err.message || '加载初始数据失败');
      } finally {
        if (!cancelled) {
          setLoadingShop(false);
          setLoadingCustomers(false);
        }
      }
    };
    loadInitialData();
    return () => { cancelled = true; };
  }, [currentShop?.id]);

  // 初始化：根据 URL 参数选择客户或预约
  useEffect(() => {
    if (loadingCustomers || customers.length === 0) return;

    const initFromParams = async () => {
      if (initialCustomerId) {
        const c = customers.find((c) => c.id === initialCustomerId);
        if (c) setSelectedCustomer(c);
      }
      if (initialBookingId) {
        try {
          const booking = await bookingApi.getBooking(initialBookingId);
          if (booking && booking.customerId) {
            const c = customers.find((cust) => cust.id === booking.customerId);
            if (c) setSelectedCustomer(c);
            if (booking.serviceId && booking.price) {
              setCart([
                {
                  id: booking.serviceId,
                  type: 'service',
                  name: booking.serviceName || '预约服务',
                  originalPrice: booking.price,
                  quantity: 1,
                  employeeId: booking.barberId,
                  employeeName: booking.barberName,
                },
              ]);
            }
          }
        } catch (e) {
          console.warn('[checkout] 加载预约失败:', e);
        }
      }
    };
    initFromParams();
  }, [initialCustomerId, initialBookingId, customers, loadingCustomers]);

  // 选中客户后加载可用权益
  useEffect(() => {
    if (!selectedCustomer) {
      setAvailableBenefits([]);
      return;
    }
    let cancelled = false;
    const loadBenefits = async () => {
      try {
        const benefits = await memberBenefitApi.getAvailableByCustomer(selectedCustomer.id);
        if (!cancelled) setAvailableBenefits(benefits || []);
      } catch (e) {
        if (!cancelled) setAvailableBenefits([]);
      }
    };
    loadBenefits();
    return () => { cancelled = true; };
  }, [selectedCustomer]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return customers.slice(0, 8);
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.phone.includes(customerSearch)
    );
  }, [customerSearch, customers]);

  const cartWithAdjustedPrices = useMemo(() => {
    return cart.map((item) => {
      if (item.type === 'service' && item.employeeLevel) {
        return { ...item, originalPrice: item.originalPrice + designerPriceMap[item.employeeLevel] };
      }
      return item;
    });
  }, [cart]);

  const discountResult = useMemo(() => {
    const purchaseLevel = selectedCustomer
      ? getEffectivePurchaseVIPLevel(selectedCustomer)
      : PurchaseVIPLevel.REGULAR;
    const storedLevel = selectedCustomer
      ? getEffectiveStoredValueLevel(selectedCustomer)
      : StoredValueLevel.NONE;
    const usedBenefits = availableBenefits.filter((b) => selectedBenefits.includes(b.id));
    return calcSettlementDiscountDetail(
      cartWithAdjustedPrices.map((i) => ({
        originalPrice: i.originalPrice,
        quantity: i.quantity,
        category: i.category,
      })),
      purchaseLevel,
      storedLevel,
      usedBenefits
    );
  }, [cartWithAdjustedPrices, selectedCustomer, selectedBenefits, availableBenefits]);

  const total = discountResult.total;
  const subtotal = discountResult.subtotal;
  const discountAmount = discountResult.discount;

  // 判断储值支付是否会用到返现部分
  const willUseReferral = useMemo(() => {
    if (paymentMethod !== 'balance' || !selectedCustomer) return false;
    const principal = selectedCustomer.storedValueBalance - selectedCustomer.withdrawableReferralAmount;
    return total > principal && selectedCustomer.withdrawableReferralAmount > 0;
  }, [paymentMethod, selectedCustomer, total]);

  const addService = (service: Service) => {
    setCart((prev) => [
      ...prev,
      {
        id: service.id,
        type: 'service',
        name: service.name,
        originalPrice: service.price,
        quantity: 1,
        employeeLevel: 'normal',
      },
    ]);
  };

  const addProduct = (product: Product) => {
    setCart((prev) => [
      ...prev,
      {
        id: product.id,
        type: 'product',
        name: product.name,
        originalPrice: product.price,
        quantity: 1,
        category: product.category,
      },
    ]);
  };

  const updateQuantity = (index: number, delta: number) => {
    setCart((prev) => {
      const next = [...prev];
      const item = next[index];
      item.quantity = Math.max(1, item.quantity + delta);
      return next;
    });
  };

  const removeItem = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  const updateServiceLevel = (index: number, level: 'normal' | 'gold' | 'director') => {
    setCart((prev) => {
      const next = [...prev];
      const item = next[index];
      if (item.type === 'service') {
        // 还原基础价后再加新等级差价
        const basePrice = services.find((s) => s.id === item.id)?.price || item.originalPrice;
        item.originalPrice = basePrice + designerPriceMap[level];
        item.employeeLevel = level;
      }
      return next;
    });
  };

  const toggleBenefit = (id: string) => {
    setSelectedBenefits((prev) =>
      prev.includes(id) ? prev.filter((b) => b !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (!selectedCustomer) {
      alert('请先选择客户');
      return;
    }
    if (cart.length === 0) {
      alert('请添加服务或商品');
      return;
    }

    if (paymentMethod === 'balance') {
      if (selectedCustomer.storedValueBalance < total) {
        alert('储值余额不足');
        return;
      }
      if (willUseReferral) {
        setShowConfirmModal(true);
        return;
      }
    }

    doSubmit();
  };

  const doSubmit = async () => {
    setSubmitting(true);

    const settlementItems: SettlementItem[] = cartWithAdjustedPrices.map((item) => {
      const discountedUnit = Math.round(
        (item.type === 'product' && item.category === ProductCategory.WIG
          ? item.originalPrice
          : item.originalPrice *
              getCustomerEffectiveDiscount(selectedCustomer!)) *
          100
      ) / 100;
      return {
        type: item.type,
        id: item.id,
        name: item.name,
        originalPrice: item.originalPrice,
        quantity: item.quantity,
        discountedPrice: discountedUnit,
        total: Math.round(discountedUnit * item.quantity * 100) / 100,
        category: item.category,
      };
    });

    const newSettlement = {
      id: `settle${Date.now()}`,
      shopId: currentShop?.id || 'shop1',
      customerId: selectedCustomer!.id,
      customerName: selectedCustomer!.name,
      bookingId: initialBookingId || undefined,
      items: settlementItems,
      subtotal,
      discountDetail: {
        purchaseVIPDiscount: discountResult.purchaseVIPDiscount,
        storedValueDiscount: discountResult.storedValueDiscount,
        finalDiscount: discountResult.finalDiscount,
        purchaseVIPDiscountAmount: discountResult.purchaseVIPDiscountAmount,
        storedValueDiscountAmount: discountResult.storedValueDiscountAmount,
        benefitDiscountAmount: discountResult.benefitDiscountAmount,
      } as SettlementDiscountDetail,
      discount: discountAmount,
      tax: 0,
      total,
      paymentMethod,
      usedBenefitIds: selectedBenefits,
      processedBy: currentEmployee?.name,
    };

    try {
      await settlementApi.create(newSettlement);

      // 本地同步更新客户余额，让 UI 立即反映
      if (paymentMethod === 'balance' && selectedCustomer) {
        const principal = selectedCustomer.storedValueBalance - selectedCustomer.withdrawableReferralAmount;
        const usedPrincipal = Math.min(total, principal);
        const usedReferral = total - usedPrincipal;
        const newBalance = Math.round((selectedCustomer.storedValueBalance - total) * 100) / 100;
        const newReferral = usedReferral > 0
          ? Math.round((selectedCustomer.withdrawableReferralAmount - usedReferral) * 100) / 100
          : selectedCustomer.withdrawableReferralAmount;

        const updatedCustomer = {
          ...selectedCustomer,
          storedValueBalance: newBalance,
          balance: newBalance,
          withdrawableReferralAmount: newReferral,
        };
        setSelectedCustomer(updatedCustomer);
        setCustomers((prev) =>
          prev.map((c) => (c.id === updatedCustomer.id ? updatedCustomer : c))
        );
      }

      // 清空已核销权益
      setAvailableBenefits((prev) => prev.filter((b) => !selectedBenefits.includes(b.id)));
      setSelectedBenefits([]);
      setSubmitting(false);
      setSuccess(true);
    } catch (err: any) {
      alert(err.message || '结算失败，请重试');
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <ShopLayout title="开单结算">
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center max-w-md w-full">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle size={32} className="text-green-500" />
            </div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">结算成功</h2>
            <p className="text-gray-500 mb-6">
              {selectedCustomer?.name} 消费 ¥{total.toFixed(2)}，已计入结算记录
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => navigate('/shop/settlement')}
                className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
              >
                查看结算记录
              </button>
              <button
                onClick={() => {
                  setSuccess(false);
                  setCart([]);
                  setSelectedBenefits([]);
                  setPaymentMethod('cash');
                }}
                className="flex-1 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-medium transition-colors"
              >
                继续开单
              </button>
            </div>
          </div>
        </div>
      </ShopLayout>
    );
  }

  return (
    <ShopLayout title="开单结算">
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {(loadingShop || loadingCustomers) && (
            <div className="text-center py-12 text-gray-500">
              <div className="animate-spin inline-block w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mb-3" />
              <p className="text-sm">加载中...</p>
            </div>
          )}

          {error && !loadingShop && !loadingCustomers && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-6 text-red-600 text-sm">
              {error}
            </div>
          )}

          {!loadingShop && !loadingCustomers && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 左侧：客户 + 服务/商品 + 权益 */}
            <div className="lg:col-span-2 space-y-6">
              {/* 客户选择 */}
              <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <User size={20} className="text-purple-500" />
                  客户信息
                </h2>
                {selectedCustomer ? (
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xl font-bold text-gray-800">{selectedCustomer.name}</span>
                        <span className="text-gray-500">{selectedCustomer.phone}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap mt-2">
                        <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                          {getPurchaseVIPLabel(selectedCustomer.purchaseVIPLevel)}
                        </span>
                        {selectedCustomer.storedValueLevel !== StoredValueLevel.NONE && (
                          <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                            {getStoredValueLabel(selectedCustomer.storedValueLevel)}
                          </span>
                        )}
                        {selectedCustomer.isStockholder && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs flex items-center gap-1">
                            <Crown size={10} /> 股东
                          </span>
                        )}
                        {isVIPExpiringSoon(selectedCustomer) && (
                          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs flex items-center gap-1">
                            <AlertTriangle size={10} /> VIP即将到期
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedCustomer(null);
                        setCustomerSearch('');
                      }}
                      className="text-sm text-purple-500 hover:text-purple-600 font-medium"
                    >
                      更换客户
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="搜索客户姓名或电话..."
                      value={customerSearch}
                      onChange={(e) => {
                        setCustomerSearch(e.target.value);
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                    />
                    {showCustomerDropdown && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-100 max-h-64 overflow-y-auto z-20">
                        {filteredCustomers.length > 0 ? (
                          filteredCustomers.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => {
                                setSelectedCustomer(c);
                                setCustomerSearch(c.name);
                                setShowCustomerDropdown(false);
                              }}
                              className="w-full px-4 py-3 text-left hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                            >
                              <div className="font-medium text-gray-800">{c.name}</div>
                              <div className="text-sm text-gray-500">
                                {c.phone} · {getPurchaseVIPLabel(c.purchaseVIPLevel)}
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="px-4 py-3 text-sm text-gray-500">无匹配客户</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 添加服务 */}
              <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <Scissors size={20} className="text-orange-500" />
                  添加服务
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {services.map((service) => (
                    <button
                      key={service.id}
                      onClick={() => addService(service)}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-xl hover:border-purple-300 hover:bg-purple-50 transition-colors text-left"
                    >
                      <div>
                        <div className="font-medium text-gray-800 text-sm">{service.name}</div>
                        <div className="text-xs text-gray-500">{service.duration} 分钟</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-orange-600">¥{service.price}</span>
                        <Plus size={16} className="text-purple-500" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 添加商品 */}
              <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <ShoppingBag size={20} className="text-blue-500" />
                  添加商品
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {products.map((product) => (
                    <button
                      key={product.id}
                      onClick={() => addProduct(product)}
                      className="flex items-center justify-between p-3 border border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={product.images[0]}
                          alt={product.name}
                          className="w-12 h-12 rounded-lg object-cover bg-gray-100"
                        />
                        <div>
                          <div className="font-medium text-gray-800 text-sm">{product.name}</div>
                          <div className="text-xs text-gray-500">
                            {product.category === ProductCategory.WIG ? '假发（不参与折扣）' : '参与会员折扣'}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-orange-600">¥{product.price}</span>
                        <Plus size={16} className="text-blue-500" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 可用权益 */}
              {selectedCustomer && availableBenefits.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                  <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Gift size={20} className="text-pink-500" />
                    可用权益
                  </h2>
                  <div className="space-y-2">
                    {availableBenefits.map((benefit) => (
                      <label
                        key={benefit.id}
                        className="flex items-center justify-between p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedBenefits.includes(benefit.id)}
                            onChange={() => toggleBenefit(benefit.id)}
                            className="w-4 h-4 text-purple-500 rounded focus:ring-purple-500"
                          />
                          <div>
                            <div className="font-medium text-gray-800 text-sm">{benefit.name}</div>
                            <div className="text-xs text-gray-500">{benefit.description}</div>
                          </div>
                        </div>
                        <span className="text-xs text-gray-400">
                          {benefit.expiresAt
                            ? `有效期至 ${new Date(benefit.expiresAt).toLocaleDateString()}`
                            : '无固定期限'}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 右侧：购物车 + 结算 */}
            <div className="space-y-6">
              <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100 sticky top-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <CreditCard size={20} className="text-purple-500" />
                  结算清单
                </h2>

                {cart.length === 0 ? (
                  <div className="text-center text-gray-500 py-8">
                    <ShoppingBag size={48} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">请添加服务或商品</p>
                  </div>
                ) : (
                  <div className="space-y-3 mb-6">
                    {cart.map((item, index) => (
                      <div key={`${item.id}-${index}`} className="border border-gray-200 rounded-xl p-3">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="font-medium text-gray-800 text-sm">{item.name}</div>
                            <div className="text-xs text-gray-500">
                              {item.type === 'service' ? '服务' : '商品'} · 原价 ¥{item.originalPrice}
                            </div>
                          </div>
                          <button onClick={() => removeItem(index)} className="p-1 hover:bg-red-50 rounded">
                            <Trash2 size={14} className="text-red-500" />
                          </button>
                        </div>

                        {item.type === 'service' && (
                          <select
                            value={item.employeeLevel || 'normal'}
                            onChange={(e) => updateServiceLevel(index, e.target.value as any)}
                            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 mb-2 outline-none"
                          >
                            <option value="normal">{designerLabelMap.normal} (+¥0)</option>
                            <option value="gold">{designerLabelMap.gold} (+¥20)</option>
                            <option value="director">{designerLabelMap.director} (+¥40)</option>
                          </select>
                        )}

                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateQuantity(index, -1)}
                              className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center hover:bg-gray-200"
                            >
                              <Minus size={14} />
                            </button>
                            <span className="text-sm font-medium w-6 text-center">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(index, 1)}
                              className="w-7 h-7 bg-gray-100 rounded-lg flex items-center justify-center hover:bg-gray-200"
                            >
                              <Plus size={14} />
                            </button>
                          </div>
                          <div className="text-sm font-bold text-gray-800">
                            ¥{(item.originalPrice * item.quantity).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 折扣明细 */}
                {cart.length > 0 && (
                  <div className="border-t border-gray-100 pt-4 mb-6 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-500">原价合计</span>
                      <span className="font-medium">¥{subtotal.toFixed(2)}</span>
                    </div>
                    {discountResult.purchaseVIPDiscountAmount > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">
                          VIP 折扣 ×{discountResult.purchaseVIPDiscount}
                        </span>
                        <span className="text-orange-500">-¥{discountResult.purchaseVIPDiscountAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {discountResult.storedValueDiscountAmount > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">
                          储值折扣 ×{discountResult.storedValueDiscount}
                        </span>
                        <span className="text-orange-500">-¥{discountResult.storedValueDiscountAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {discountResult.benefitDiscountAmount > 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-500">权益抵扣</span>
                        <span className="text-orange-500">-¥{discountResult.benefitDiscountAmount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-base font-bold pt-2 border-t border-gray-100">
                      <span className="text-gray-800">实付金额</span>
                      <span className="text-orange-600 text-xl">¥{total.toFixed(2)}</span>
                    </div>
                    {selectedCustomer && (
                      <div className="text-xs text-gray-400 text-right">
                        当前综合折扣 {(getCustomerEffectiveDiscount(selectedCustomer) * 10).toFixed(2)} 折
                      </div>
                    )}
                  </div>
                )}

                {/* 支付方式 */}
                {cart.length > 0 && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">支付方式</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { key: 'cash', label: '现金', icon: Banknote },
                        { key: 'wechat', label: '微信', icon: CreditCard },
                        { key: 'alipay', label: '支付宝', icon: CreditCard },
                        { key: 'card', label: '银行卡', icon: CreditCard },
                        { key: 'balance', label: '储值余额', icon: Wallet },
                      ].map((opt) => {
                        const Icon = opt.icon;
                        const disabled = opt.key === 'balance' && selectedCustomer && selectedCustomer.storedValueBalance < total;
                        return (
                          <button
                            key={opt.key}
                            onClick={() => !disabled && setPaymentMethod(opt.key as any)}
                            disabled={disabled}
                            className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 text-sm transition-all ${
                              paymentMethod === opt.key
                                ? 'border-purple-500 bg-purple-50 text-purple-700'
                                : disabled
                                ? 'border-gray-100 bg-gray-50 text-gray-400 cursor-not-allowed'
                                : 'border-gray-200 hover:border-purple-300 text-gray-700'
                            }`}
                          >
                            <Icon size={18} />
                            <span>{opt.label}</span>
                            {opt.key === 'balance' && selectedCustomer && (
                              <span className="text-xs">¥{selectedCustomer.storedValueBalance}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    {willUseReferral && (
                      <div className="mt-2 p-2 bg-yellow-50 text-yellow-700 text-xs rounded-lg flex items-start gap-1.5">
                        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                        本次将使用部分返现余额，结算前会要求确认。
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={!selectedCustomer || cart.length === 0 || submitting}
                  className="w-full py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:from-gray-400 disabled:to-gray-500 text-white rounded-xl font-bold text-lg shadow-lg transition-all flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <span className="animate-pulse">结算中...</span>
                  ) : (
                    <>确认结算 ¥{total.toFixed(2)}</>
                  )}
                </button>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>

      {/* 返现确认弹窗 */}
      {showConfirmModal && selectedCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <div className="flex items-center gap-2 mb-4 text-yellow-600">
              <AlertTriangle size={24} />
              <h3 className="text-lg font-bold">使用返现余额确认</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              本次实付 <span className="font-bold text-gray-800">¥{total.toFixed(2)}</span>，
              扣除本金后将从返现余额中扣除
              <span className="font-bold text-orange-600">
                ¥{(total - (selectedCustomer.storedValueBalance - selectedCustomer.withdrawableReferralAmount)).toFixed(2)}
              </span>
              。请确认客户已同意。
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium"
              >
                取消
              </button>
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  doSubmit();
                }}
                className="flex-1 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-medium"
              >
                确认使用
              </button>
            </div>
          </div>
        </div>
      )}
    </ShopLayout>
  );
};

export default Checkout;
