import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Crown,
  Star,
  User,
  Gift,
  Percent,
  Wallet,
  ArrowRight,
  Plus,
  Check,
  Search,
  Filter,
  ChevronDown,
  Eye,
  CreditCard,
  TrendingUp,
  Award,
  Calendar,
  Clock,
  RefreshCw,
  Package,
  Coffee,
} from 'lucide-react';
import {
  Customer,
  PurchaseVIPLevel,
  StoredValueLevel,
  BenefitType,
  MembershipLevel,
} from '../../../shared/types';
import {
  mockCustomers,
  mockReferrals,
  purchaseVIPPlans,
  storedValuePlans,
  mockMemberBenefitRecords,
} from '../../../shared/mockData';
import {
  getPurchaseVIPLabel,
  getStoredValueLabel,
  getCustomerEffectiveDiscount,
  isVIPExpiringSoon,
} from '../../lib/membership';
import { useAppStore } from '../../store';
import ShopLayout from './ShopLayout';

type ModalMode = 'purchase' | 'storedValue' | null;

const MembershipManagement: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([...mockCustomers]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterVIP, setFilterVIP] = useState<PurchaseVIPLevel | 'all'>('all');
  const [filterStored, setFilterStored] = useState<StoredValueLevel | 'all'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [modalCustomer, setModalCustomer] = useState<Customer | null>(null);
  const [selectedPurchaseLevel, setSelectedPurchaseLevel] = useState<PurchaseVIPLevel>(PurchaseVIPLevel.BRONZE);
  const [selectedStoredLevel, setSelectedStoredLevel] = useState<StoredValueLevel>(StoredValueLevel.STORE_500);
  const [activeTab, setActiveTab] = useState<'purchase' | 'stored'>('purchase');

  const navigate = useNavigate();
  const { currentShop } = useAppStore();

  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone.includes(searchTerm);
    const matchesVIP = filterVIP === 'all' || customer.purchaseVIPLevel === filterVIP;
    const matchesStored = filterStored === 'all' || customer.storedValueLevel === filterStored;
    return matchesSearch && matchesVIP && matchesStored;
  });

  const stats = [
    {
      label: '总会员数',
      value: customers.length,
      icon: User,
      color: 'text-gray-600',
      bgColor: 'bg-gray-100',
    },
    {
      label: 'VIP会员',
      value: customers.filter((c) => c.purchaseVIPLevel !== PurchaseVIPLevel.REGULAR).length,
      icon: Star,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      label: '储值会员',
      value: customers.filter((c) => c.storedValueLevel !== StoredValueLevel.NONE).length,
      icon: Wallet,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      label: '股东会员',
      value: customers.filter((c) => c.isStockholder).length,
      icon: Crown,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
  ];

  const getPurchaseColor = (level: PurchaseVIPLevel) => {
    const plan = purchaseVIPPlans.find((p) => p.level === level);
    switch (plan?.color) {
      case 'orange':
        return 'bg-orange-100 text-orange-700';
      case 'blue':
        return 'bg-blue-100 text-blue-700';
      case 'yellow':
        return 'bg-yellow-100 text-yellow-700';
      case 'purple':
        return 'bg-purple-100 text-purple-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStoredColor = (level: StoredValueLevel) => {
    const plan = storedValuePlans.find((p) => p.level === level);
    switch (plan?.color) {
      case 'green':
        return 'bg-green-100 text-green-700';
      case 'cyan':
        return 'bg-cyan-100 text-cyan-700';
      case 'indigo':
        return 'bg-indigo-100 text-indigo-700';
      case 'red':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const openPurchaseModal = (customer: Customer) => {
    setModalCustomer(customer);
    setSelectedPurchaseLevel(
      customer.purchaseVIPLevel === PurchaseVIPLevel.REGULAR
        ? PurchaseVIPLevel.BRONZE
        : customer.purchaseVIPLevel
    );
    setModalMode('purchase');
  };

  const openStoredModal = (customer: Customer) => {
    setModalCustomer(customer);
    setSelectedStoredLevel(
      customer.storedValueLevel === StoredValueLevel.NONE
        ? StoredValueLevel.STORE_500
        : customer.storedValueLevel
    );
    setModalMode('storedValue');
  };

  const confirmPurchaseUpgrade = () => {
    if (!modalCustomer || !selectedPurchaseLevel) return;

    const updated = customers.map((c) => {
      if (c.id !== modalCustomer.id) return c;
      return {
        ...c,
        purchaseVIPLevel: selectedPurchaseLevel,
        purchaseVIPExpiresAt: new Date(Date.now() + 365 * 86400000),
        membershipLevel: selectedPurchaseLevel as unknown as MembershipLevel,
        isMember: selectedPurchaseLevel !== PurchaseVIPLevel.REGULAR,
      };
    });

    setCustomers(updated);
    setModalMode(null);
    setModalCustomer(null);
  };

  const confirmStoredUpgrade = () => {
    if (!modalCustomer || !selectedStoredLevel) return;

    const newPlan = storedValuePlans.find((p) => p.level === selectedStoredLevel);
    const currentPlan = storedValuePlans.find((p) => p.level === modalCustomer.storedValueLevel);
    const addAmount = (newPlan?.amount || 0) - (currentPlan?.amount || 0);

    const updated = customers.map((c) => {
      if (c.id !== modalCustomer.id) return c;
      return {
        ...c,
        storedValueLevel: selectedStoredLevel,
        storedValueBalance: c.storedValueBalance + addAmount,
        balance: c.storedValueBalance + addAmount,
        hasRecharged: selectedStoredLevel !== StoredValueLevel.NONE,
        rechargeLevel: selectedStoredLevel,
      };
    });

    setCustomers(updated);
    setModalMode(null);
    setModalCustomer(null);
  };

  const renderPlanCards = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      {/* 购买型 VIP */}
      <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <Crown size={22} className="text-purple-500" />
          <h2 className="text-lg font-bold text-gray-800">购买型 VIP</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {purchaseVIPPlans
            .filter((p) => p.level !== PurchaseVIPLevel.REGULAR)
            .map((plan) => (
              <div
                key={plan.level}
                className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Star size={16} className="text-orange-500" />
                  <span className="font-bold text-gray-800">{plan.name}</span>
                </div>
                <div className="text-2xl font-bold text-gray-800 mb-1">
                  ¥{plan.price}
                  <span className="text-sm font-normal text-gray-500">/{plan.period}</span>
                </div>
                <div className="text-sm text-orange-600 font-medium mb-2">
                  {(plan.discount * 10).toFixed(plan.discount === 0.58 ? 1 : 2)} 折
                </div>
                <div className="space-y-1">
                  {plan.benefits.slice(0, 3).map((b, i) => (
                    <div key={i} className="flex items-center gap-1 text-xs text-gray-600">
                      <Check size={12} className="text-green-500" />
                      {b}
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* 储值会员 */}
      <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <Wallet size={22} className="text-green-500" />
          <h2 className="text-lg font-bold text-gray-800">储值会员</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {storedValuePlans
            .filter((p) => p.level !== StoredValueLevel.NONE)
            .map((plan) => (
              <div
                key={plan.level}
                className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-2 mb-2">
                  <CreditCard size={16} className="text-green-500" />
                  <span className="font-bold text-gray-800">{plan.name}</span>
                </div>
                <div className="text-2xl font-bold text-gray-800 mb-1">
                  ¥{plan.amount}
                </div>
                <div className="text-sm text-green-600 font-medium mb-2">
                  折上折再享 {(plan.discount * 10).toFixed(plan.discount === 0.7 ? 1 : 2)} 折
                </div>
                <div className="space-y-1">
                  {plan.benefits.slice(0, 3).map((b, i) => (
                    <div key={i} className="flex items-center gap-1 text-xs text-gray-600">
                      <Check size={12} className="text-green-500" />
                      {b}
                    </div>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );

  const renderCustomerList = () => (
    <div className="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
      <div className="flex flex-col md:flex-row gap-4 mb-4">
        <div className="flex-1 relative">
          <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索会员姓名或电话..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
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
            <div className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-lg p-4 w-64 z-10 border border-gray-100">
              <div className="mb-4">
                <span className="text-sm font-medium text-gray-700 block mb-2">VIP 等级</span>
                <button
                  onClick={() => setFilterVIP('all')}
                  className={`w-full px-3 py-2 rounded-lg text-left text-sm transition-all mb-1 ${
                    filterVIP === 'all' ? 'bg-purple-500 text-white' : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  全部 VIP
                </button>
                {purchaseVIPPlans
                  .filter((p) => p.level !== PurchaseVIPLevel.REGULAR)
                  .map((plan) => (
                    <button
                      key={plan.level}
                      onClick={() => setFilterVIP(plan.level)}
                      className={`w-full px-3 py-2 rounded-lg text-left text-sm transition-all mb-1 ${
                        filterVIP === plan.level ? 'bg-purple-500 text-white' : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      {plan.name}
                    </button>
                  ))}
              </div>
              <div>
                <span className="text-sm font-medium text-gray-700 block mb-2">储值等级</span>
                <button
                  onClick={() => setFilterStored('all')}
                  className={`w-full px-3 py-2 rounded-lg text-left text-sm transition-all mb-1 ${
                    filterStored === 'all' ? 'bg-green-500 text-white' : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  全部储值
                </button>
                {storedValuePlans
                  .filter((p) => p.level !== StoredValueLevel.NONE)
                  .map((plan) => (
                    <button
                      key={plan.level}
                      onClick={() => setFilterStored(plan.level)}
                      className={`w-full px-3 py-2 rounded-lg text-left text-sm transition-all mb-1 ${
                        filterStored === plan.level ? 'bg-green-500 text-white' : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      {plan.name}
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {filteredCustomers.length > 0 ? (
          filteredCustomers.map((customer) => {
            const effectiveDiscount = getCustomerEffectiveDiscount(customer);
            const expiringSoon = isVIPExpiringSoon(customer);
            return (
              <div
                key={customer.id}
                className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-100 to-blue-100 rounded-full flex items-center justify-center">
                      <User size={24} className="text-purple-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-bold text-gray-800 text-lg">{customer.name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPurchaseColor(customer.purchaseVIPLevel)}`}>
                          {getPurchaseVIPLabel(customer.purchaseVIPLevel)}
                        </span>
                        {customer.storedValueLevel !== StoredValueLevel.NONE && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStoredColor(customer.storedValueLevel)}`}>
                            {getStoredValueLabel(customer.storedValueLevel)}
                          </span>
                        )}
                        {customer.isStockholder && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium flex items-center gap-1">
                            <Crown size={10} />
                            股东
                          </span>
                        )}
                        {expiringSoon && (
                          <span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium flex items-center gap-1">
                            <Clock size={10} />
                            VIP即将到期
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 mb-2 flex-wrap">
                        <span>{customer.phone}</span>
                        <span>
                          {customer.gender === 'male' ? '男' : customer.gender === 'female' ? '女' : '其他'} · {customer.age}岁
                        </span>
                        <span>消费 {customer.visitCount} 次</span>
                      </div>
                      <div className="flex items-center gap-4 text-sm flex-wrap">
                        <span className="text-orange-500 font-medium">累计消费 ¥{customer.totalSpent}</span>
                        <span className="text-green-500">储值余额 ¥{customer.storedValueBalance}</span>
                        {customer.withdrawableReferralAmount > 0 && (
                          <span className="text-purple-500">可提现返现 ¥{customer.withdrawableReferralAmount}</span>
                        )}
                        <span className="text-blue-500">{customer.points} 积分</span>
                        <span className="text-gray-400">当前折扣 {(effectiveDiscount * 10).toFixed(2)} 折</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => setViewingCustomer(customer)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      title="查看详情"
                    >
                      <Eye size={18} className="text-gray-600" />
                    </button>
                    <button
                      onClick={() => openPurchaseModal(customer)}
                      className="flex items-center gap-1 px-3 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Plus size={16} />
                      <span>VIP</span>
                    </button>
                    <button
                      onClick={() => openStoredModal(customer)}
                      className="flex items-center gap-1 px-3 py-2 bg-green-100 hover:bg-green-200 text-green-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Plus size={16} />
                      <span>储值</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center text-gray-500 py-12">
            <User size={48} className="mx-auto mb-2 opacity-50" />
            <p>暂无会员数据</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderCustomerDetail = () => {
    if (!viewingCustomer) return null;
    const benefits = mockMemberBenefitRecords.filter((b) => b.customerId === viewingCustomer.id);
    const purchasePlan = purchaseVIPPlans.find((p) => p.level === viewingCustomer.purchaseVIPLevel);
    const storedPlan = storedValuePlans.find((p) => p.level === viewingCustomer.storedValueLevel);

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-gray-800">会员详情</h3>
            <button onClick={() => setViewingCustomer(null)} className="p-2 hover:bg-gray-100 rounded-lg">
              <span className="text-gray-500 text-xl">&times;</span>
            </button>
          </div>

          <div className="flex flex-col items-center mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-100 to-blue-100 rounded-full flex items-center justify-center mb-4">
              <User size={40} className="text-purple-600" />
            </div>
            <h4 className="text-xl font-bold text-gray-800">{viewingCustomer.name}</h4>
            <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getPurchaseColor(viewingCustomer.purchaseVIPLevel)}`}>
                {getPurchaseVIPLabel(viewingCustomer.purchaseVIPLevel)}
              </span>
              {viewingCustomer.storedValueLevel !== StoredValueLevel.NONE && (
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStoredColor(viewingCustomer.storedValueLevel)}`}>
                  {getStoredValueLabel(viewingCustomer.storedValueLevel)}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-gray-500">联系电话</span>
              <span className="font-medium">{viewingCustomer.phone}</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-gray-500">当前综合折扣</span>
              <span className="font-medium text-orange-500">
                {(getCustomerEffectiveDiscount(viewingCustomer) * 10).toFixed(2)} 折
              </span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-gray-500">储值余额</span>
              <span className="font-medium text-green-500">¥{viewingCustomer.storedValueBalance}</span>
            </div>
            {viewingCustomer.withdrawableReferralAmount > 0 && (
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">可提现返现</span>
                <span className="font-medium text-purple-500">¥{viewingCustomer.withdrawableReferralAmount}</span>
              </div>
            )}
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <span className="text-gray-500">积分</span>
              <span className="font-medium text-blue-500">{viewingCustomer.points} 分</span>
            </div>
            {viewingCustomer.purchaseVIPExpiresAt && (
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">VIP 到期时间</span>
                <span className="font-medium">
                  {new Date(viewingCustomer.purchaseVIPExpiresAt).toLocaleDateString()}
                </span>
              </div>
            )}
            {viewingCustomer.isStockholder && (
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">股东推荐提成</span>
                <span className="font-medium">{(viewingCustomer.referralBonusRate || 0) * 100}%</span>
              </div>
            )}
          </div>

          {/* VIP 权益 */}
          <div className="mb-6">
            <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
              <Award size={16} />
              VIP 权益
            </h4>
            <div className="bg-purple-50 rounded-xl p-4">
              <div className="font-medium text-gray-800 mb-1">{purchasePlan?.name}</div>
              <div className="text-sm text-purple-600 mb-2">
                消费折扣 {(purchasePlan?.discount || 1) * 10} 折
              </div>
              <div className="flex flex-wrap gap-2">
                {purchasePlan?.benefits.map((b, i) => (
                  <span key={i} className="px-2 py-1 bg-white text-purple-700 rounded-full text-xs">
                    {b}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* 储值权益 */}
          {storedPlan && (
            <div className="mb-6">
              <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                <Wallet size={16} />
                储值权益
              </h4>
              <div className="bg-green-50 rounded-xl p-4">
                <div className="font-medium text-gray-800 mb-1">{storedPlan.name}</div>
                <div className="text-sm text-green-600 mb-2">
                  折上折再享 {(storedPlan.discount * 10).toFixed(storedPlan.discount === 0.7 ? 1 : 2)} 折
                </div>
                <div className="flex flex-wrap gap-2">
                  {storedPlan.benefits.map((b, i) => (
                    <span key={i} className="px-2 py-1 bg-white text-green-700 rounded-full text-xs">
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 可用权益 */}
          <div className="mb-6">
            <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
              <Gift size={16} />
              可用权益
            </h4>
            {benefits.length > 0 ? (
              <div className="space-y-2">
                {benefits.map((benefit) => (
                  <div
                    key={benefit.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
                  >
                    <div className="flex items-center gap-2">
                      {benefit.type === BenefitType.SHAMPOO && <Package size={16} className="text-blue-500" />}
                      {benefit.type === BenefitType.FREE_HAIRCUT && <User size={16} className="text-purple-500" />}
                      {benefit.type === BenefitType.DRINK && <Coffee size={16} className="text-orange-500" />}
                      <span className="text-sm font-medium text-gray-800">{benefit.name}</span>
                    </div>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        benefit.status === 'available'
                          ? 'bg-green-100 text-green-700'
                          : benefit.status === 'used'
                          ? 'bg-gray-100 text-gray-500'
                          : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {benefit.status === 'available' ? '可用' : benefit.status === 'used' ? '已用' : '已过期'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500 py-2">暂无可用权益</div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setViewingCustomer(null);
                openPurchaseModal(viewingCustomer);
              }}
              className="flex-1 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-medium transition-colors"
            >
              调整 VIP
            </button>
            <button
              onClick={() => {
                setViewingCustomer(null);
                openStoredModal(viewingCustomer);
              }}
              className="flex-1 py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium transition-colors"
            >
              调整储值
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderUpgradeModal = () => {
    if (!modalCustomer || !modalMode) return null;

    const isPurchase = modalMode === 'purchase';
    const plans = isPurchase ? purchaseVIPPlans : storedValuePlans;
    const selected = isPurchase ? selectedPurchaseLevel : selectedStoredLevel;
    const setSelected = isPurchase
      ? setSelectedPurchaseLevel
      : setSelectedStoredLevel;

    const currentPlan = plans.find((p) =>
      isPurchase
        ? (p as typeof purchaseVIPPlans[0]).level === modalCustomer.purchaseVIPLevel
        : (p as typeof storedValuePlans[0]).level === modalCustomer.storedValueLevel
    );
    const selectedPlan = plans.find((p) =>
      isPurchase
        ? (p as typeof purchaseVIPPlans[0]).level === selected
        : (p as typeof storedValuePlans[0]).level === selected
    );

    const priceLabel = isPurchase
      ? `¥${(selectedPlan as typeof purchaseVIPPlans[0])?.price || 0}`
      : `储值 ¥${(selectedPlan as typeof storedValuePlans[0])?.amount || 0}`;

    const currentPrice = isPurchase
      ? (currentPlan as typeof purchaseVIPPlans[0])?.price || 0
      : (currentPlan as typeof storedValuePlans[0])?.amount || 0;
    const selectedPrice = isPurchase
      ? (selectedPlan as typeof purchaseVIPPlans[0])?.price || 0
      : (selectedPlan as typeof storedValuePlans[0])?.amount || 0;
    const diff = selectedPrice - currentPrice;

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
          <h3 className="text-lg font-bold text-gray-800 mb-4">
            {isPurchase ? '办理/调整 VIP' : '办理/调整储值卡'}
          </h3>

          <div className="mb-4 p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                <User size={20} className="text-gray-500" />
              </div>
              <div>
                <div className="font-medium text-gray-800">{modalCustomer.name}</div>
                <div className="text-sm text-gray-500">{modalCustomer.phone}</div>
              </div>
            </div>
            <div className="mt-3 text-sm text-gray-600">
              当前：
              {isPurchase
                ? getPurchaseVIPLabel(modalCustomer.purchaseVIPLevel)
                : getStoredValueLabel(modalCustomer.storedValueLevel)}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              选择{isPurchase ? 'VIP 等级' : '储值档位'}
            </label>
            <div className="space-y-2">
              {plans
                .filter((p) =>
                  isPurchase
                    ? (p as typeof purchaseVIPPlans[0]).level !== PurchaseVIPLevel.REGULAR
                    : (p as typeof storedValuePlans[0]).level !== StoredValueLevel.NONE
                )
                .map((plan) => {
                  const level = isPurchase
                    ? (plan as typeof purchaseVIPPlans[0]).level
                    : (plan as typeof storedValuePlans[0]).level;
                  const isSelected = level === selected;
                  return (
                    <button
                      key={level}
                      onClick={() => setSelected(level as PurchaseVIPLevel & StoredValueLevel)}
                      className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                        isSelected ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-800">{plan.name}</div>
                          <div className="text-sm text-gray-500">
                            {isPurchase
                              ? `消费折扣 ${((plan as typeof purchaseVIPPlans[0]).discount * 10).toFixed(
                                  (plan as typeof purchaseVIPPlans[0]).discount === 0.58 ? 1 : 2
                                )} 折`
                              : `折上折再享 ${((plan as typeof storedValuePlans[0]).discount * 10).toFixed(
                                  (plan as typeof storedValuePlans[0]).discount === 0.7 ? 1 : 2
                                )} 折`}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-gray-800">
                            {isPurchase
                              ? `¥${(plan as typeof purchaseVIPPlans[0]).price}`
                              : `¥${(plan as typeof storedValuePlans[0]).amount}`}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">当前{isPurchase ? '已付' : '已储'}金额</span>
              <span className="font-medium">¥{currentPrice}</span>
            </div>
            <div className="flex items-center justify-between text-sm mt-2">
              <span className="text-gray-500">目标{isPurchase ? '金额' : '储值金额'}</span>
              <span className="font-medium">¥{selectedPrice}</span>
            </div>
            <div className="flex items-center justify-between text-base mt-3 pt-3 border-t border-gray-200">
              <span className="font-medium text-gray-700">需{isPurchase ? '补交' : '补差价'}</span>
              <span className="font-bold text-orange-600">¥{diff}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setModalMode(null);
                setModalCustomer(null);
              }}
              className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
            >
              取消
            </button>
            <button
              onClick={isPurchase ? confirmPurchaseUpgrade : confirmStoredUpgrade}
              className="flex-1 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-medium transition-colors"
            >
              确认办理
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <ShopLayout title="会员管理">
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <div key={index} className="bg-white rounded-2xl shadow-sm p-6">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${stat.bgColor} rounded-xl flex items-center justify-center`}>
                      <Icon size={20} className={stat.color} />
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

          {renderPlanCards()}
          {renderCustomerList()}

          <div className="bg-white rounded-2xl shadow-sm p-6 mt-6 border border-gray-100">
            <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
              <TrendingUp size={20} className="text-green-500" />
              推荐记录
            </h2>
            <div className="space-y-4">
              {mockReferrals.length > 0 ? (
                mockReferrals.map((referral) => (
                  <div key={referral.id} className="border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-800">
                          {referral.referrerName} 推荐 {referral.referredName}
                        </div>
                        <div className="text-sm text-gray-500">被推荐人: {referral.referredPhone}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-green-500">¥{referral.bonusAmount.toFixed(2)}</div>
                        <div
                          className={`text-xs font-medium ${
                            referral.status === 'paid'
                              ? 'text-green-600'
                              : referral.status === 'confirmed'
                              ? 'text-blue-600'
                              : 'text-yellow-600'
                          }`}
                        >
                          {referral.status === 'paid' ? '已发放' : referral.status === 'confirmed' ? '已确认' : '待确认'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-gray-500 py-8">
                  <Gift size={32} className="mx-auto mb-2 opacity-50" />
                  <p>暂无推荐记录</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {viewingCustomer && renderCustomerDetail()}
      {renderUpgradeModal()}
    </ShopLayout>
  );
};

export default MembershipManagement;
