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
} from 'lucide-react';
import { Customer, MembershipLevel, CustomerTag } from '../../../shared/types';
import { mockCustomers, membershipBenefits, mockReferrals } from '../../../shared/mockData';
import { useAppStore } from '../../store';
import ShopLayout from './ShopLayout';

const MembershipManagement: React.FC = () => {
  const [customers] = useState<Customer[]>(mockCustomers);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<MembershipLevel | 'all'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeCustomer, setUpgradeCustomer] = useState<Customer | null>(null);
  const [selectedUpgradeLevel, setSelectedUpgradeLevel] = useState<MembershipLevel>(MembershipLevel.PREMIUM);
  
  const navigate = useNavigate();
  const { currentShop } = useAppStore();

  const levelLabels: Partial<Record<MembershipLevel, string>> = {
    [MembershipLevel.REGULAR]: '普通用户',
    [MembershipLevel.PREMIUM]: '高级会员',
    [MembershipLevel.STOCKHOLDER]: '股东会员',
  };

  const levelColors: Partial<Record<MembershipLevel, string>> = {
    [MembershipLevel.REGULAR]: 'bg-gray-100 text-gray-700',
    [MembershipLevel.PREMIUM]: 'bg-blue-100 text-blue-700',
    [MembershipLevel.STOCKHOLDER]: 'bg-purple-100 text-purple-700',
  };

  const levelIcons: Partial<Record<MembershipLevel, typeof User>> = {
    [MembershipLevel.REGULAR]: User,
    [MembershipLevel.PREMIUM]: Star,
    [MembershipLevel.STOCKHOLDER]: Crown,
  };

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = 
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone.includes(searchTerm);
    
    const matchesLevel = selectedLevel === 'all' || customer.membershipLevel === selectedLevel;
    
    return matchesSearch && matchesLevel;
  });

  const stats = [
    { 
      label: '总会员数', 
      value: customers.length, 
      icon: User,
      color: 'text-gray-600',
      bgColor: 'bg-gray-100'
    },
    { 
      label: '高级会员', 
      value: customers.filter(c => c.membershipLevel === MembershipLevel.PREMIUM).length, 
      icon: Star,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100'
    },
    { 
      label: '股东会员', 
      value: customers.filter(c => c.isStockholder).length, 
      icon: Crown,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100'
    },
    { 
      label: '推荐收益', 
      value: `¥${mockReferrals.filter(r => r.status === 'paid').reduce((sum, r) => sum + r.bonusAmount, 0).toFixed(2)}`, 
      icon: Wallet,
      color: 'text-green-600',
      bgColor: 'bg-green-100'
    },
  ];

  const membershipPlans = [
    {
      level: MembershipLevel.PREMIUM,
      name: '高级会员',
      price: 999,
      period: '年',
      description: '享受专属会员权益',
      benefits: ['9折优惠', '1.5倍积分', '免费护理一次', '生日礼品'],
      popular: true,
    },
    {
      level: MembershipLevel.STOCKHOLDER,
      name: '股东会员',
      price: 9999,
      period: '年',
      description: '成为门店股东，享受分红权益',
      benefits: ['8折优惠', '2倍积分', '专属发型师', '优先预约', '推荐5%提成', '年度分红'],
      popular: false,
    },
  ];

  const handleUpgrade = (customer: Customer) => {
    setUpgradeCustomer(customer);
    setSelectedUpgradeLevel(MembershipLevel.PREMIUM);
    setShowUpgradeModal(true);
  };

  const confirmUpgrade = () => {
    if (upgradeCustomer && selectedUpgradeLevel) {
      console.log('Upgrade customer:', upgradeCustomer.id, 'to level:', selectedUpgradeLevel);
      setShowUpgradeModal(false);
      setUpgradeCustomer(null);
    }
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {membershipPlans.map((plan) => (
            <div key={plan.level} className={`relative bg-white rounded-2xl shadow-sm p-6 border-2 ${plan.popular ? 'border-purple-500' : 'border-gray-200'}`}>
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-purple-500 text-white text-sm font-medium rounded-full">
                  热门推荐
                </div>
              )}
              <div className="flex items-center gap-3 mb-4">
                {plan.level === MembershipLevel.PREMIUM ? (
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                    <Star size={24} className="text-blue-500" />
                  </div>
                ) : (
                  <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                    <Crown size={24} className="text-purple-500" />
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-bold text-gray-800">{plan.name}</h3>
                  <p className="text-sm text-gray-500">{plan.description}</p>
                </div>
              </div>
              <div className="mb-4">
                <span className="text-4xl font-bold text-gray-800">¥{plan.price}</span>
                <span className="text-gray-500">/{plan.period}</span>
              </div>
              <div className="space-y-2 mb-6">
                {plan.benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check size={16} className="text-green-500" />
                    {benefit}
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  setSelectedUpgradeLevel(plan.level);
                  setShowUpgradeModal(true);
                }}
                className={`w-full py-3 rounded-xl font-medium transition-colors ${
                  plan.popular 
                    ? 'bg-purple-500 hover:bg-purple-600 text-white' 
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
              >
                立即开通
              </button>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6">
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
                <span>会员等级</span>
                <ChevronDown size={16} />
              </button>
              
              {showFilterDropdown && (
                <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-lg p-4 w-48 z-10">
                  <button
                    onClick={() => setSelectedLevel('all')}
                    className={`w-full px-3 py-2 rounded-lg text-left text-sm transition-all ${
                      selectedLevel === 'all'
                        ? 'bg-purple-500 text-white'
                        : 'hover:bg-gray-100 text-gray-700'
                    }`}
                  >
                    全部
                  </button>
                  {Object.entries(levelLabels).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setSelectedLevel(key as MembershipLevel)}
                      className={`w-full px-3 py-2 rounded-lg text-left text-sm transition-all ${
                        selectedLevel === key
                          ? 'bg-purple-500 text-white'
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map((customer) => {
                const Icon = levelIcons[customer.membershipLevel];
                return (
                  <div
                    key={customer.id}
                    className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 ${levelColors[customer.membershipLevel].split(' ')[0]} rounded-full flex items-center justify-center`}>
                          <Icon size={24} className={levelColors[customer.membershipLevel].split(' ')[1]} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-gray-800 text-lg">{customer.name}</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${levelColors[customer.membershipLevel]}`}>
                              {levelLabels[customer.membershipLevel]}
                            </span>
                            {customer.isStockholder && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium flex items-center gap-1">
                                <Crown size={10} />
                                股东
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-500 mb-2">
                            <span>{customer.phone}</span>
                            <span>{customer.gender === 'male' ? '男' : customer.gender === 'female' ? '女' : '其他'} · {customer.age}岁</span>
                            <span>消费 {customer.visitCount} 次</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-orange-500 font-medium">累计消费 ¥{customer.totalSpent}</span>
                            <span className="text-green-500">余额 ¥{customer.balance}</span>
                            <span className="text-blue-500">{customer.points}积分</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setViewingCustomer(customer)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="查看详情"
                        >
                          <Eye size={18} className="text-gray-600" />
                        </button>
                        {customer.membershipLevel !== MembershipLevel.STOCKHOLDER && (
                          <button
                            onClick={() => handleUpgrade(customer)}
                            className="flex items-center gap-1 px-3 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-sm font-medium transition-colors"
                          >
                            <Plus size={16} />
                            <span>升级会员</span>
                          </button>
                        )}
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

        <div className="bg-white rounded-2xl shadow-sm p-6 mt-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <TrendingUp size={20} className="text-green-500" />
            推荐记录
          </h2>
          <div className="space-y-4">
            {mockReferrals.length > 0 ? (
              mockReferrals.map((referral) => (
                <div
                  key={referral.id}
                  className="border border-gray-200 rounded-xl p-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-gray-800">
                        {referral.referrerName} 推荐 {referral.referredName}
                      </div>
                      <div className="text-sm text-gray-500">
                        被推荐人: {referral.referredPhone}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-green-500">¥{referral.bonusAmount.toFixed(2)}</div>
                      <div className={`text-xs font-medium ${
                        referral.status === 'paid' ? 'text-green-600' :
                        referral.status === 'confirmed' ? 'text-blue-600' : 'text-yellow-600'
                      }`}>
                        {referral.status === 'paid' ? '已发放' :
                         referral.status === 'confirmed' ? '已确认' : '待确认'}
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

      {viewingCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-800">会员详情</h3>
              <button onClick={() => setViewingCustomer(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <span className="text-gray-500 text-xl">&times;</span>
              </button>
            </div>
            
            <div className="flex flex-col items-center mb-6">
              <div className={`w-20 h-20 ${levelColors[viewingCustomer.membershipLevel].split(' ')[0]} rounded-full flex items-center justify-center mb-4`}>
                {(() => {
                  const Icon = levelIcons[viewingCustomer.membershipLevel];
                  return <Icon size={40} className={levelColors[viewingCustomer.membershipLevel].split(' ')[1]} />;
                })()}
              </div>
              <h4 className="text-xl font-bold text-gray-800">{viewingCustomer.name}</h4>
              <span className={`px-3 py-1 rounded-full text-sm font-medium mt-2 ${levelColors[viewingCustomer.membershipLevel]}`}>
                {levelLabels[viewingCustomer.membershipLevel]}
              </span>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">联系电话</span>
                <span className="font-medium">{viewingCustomer.phone}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">性别</span>
                <span className="font-medium">{viewingCustomer.gender === 'male' ? '男' : viewingCustomer.gender === 'female' ? '女' : '其他'}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">年龄</span>
                <span className="font-medium">{viewingCustomer.age}岁</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">消费次数</span>
                <span className="font-medium">{viewingCustomer.visitCount}次</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">累计消费</span>
                <span className="font-medium text-orange-500">¥{viewingCustomer.totalSpent}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">储值余额</span>
                <span className="font-medium text-green-500">¥{viewingCustomer.balance}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500">积分</span>
                <span className="font-medium text-blue-500">{viewingCustomer.points}分</span>
              </div>
              {viewingCustomer.isStockholder && (
                <>
                  <div className="flex items-center justify-between py-3 border-b border-gray-100">
                    <span className="text-gray-500">推荐提成比例</span>
                    <span className="font-medium">{(viewingCustomer.referralBonusRate || 0) * 100}%</span>
                  </div>
                  <div className="flex items-center justify-between py-3 border-b border-gray-100">
                    <span className="text-gray-500">累计推荐收益</span>
                    <span className="font-medium text-green-500">¥{viewingCustomer.referralEarnings || 0}</span>
                  </div>
                </>
              )}
            </div>

            <div className="mt-6">
              <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                <Gift size={16} />
                会员权益
              </h4>
              <div className="space-y-2">
                {membershipBenefits.map((benefit) => (
                  <div
                    key={benefit.level}
                    className={`p-4 rounded-xl ${
                      viewingCustomer.membershipLevel === benefit.level ? 'bg-purple-50' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Award size={16} className={viewingCustomer.membershipLevel === benefit.level ? 'text-purple-500' : 'text-gray-500'} />
                      <span className="font-medium text-gray-800">{levelLabels[benefit.level]}</span>
                      {viewingCustomer.membershipLevel === benefit.level && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs">当前等级</span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Percent size={14} className="text-gray-400" />
                        <span className="text-gray-600">折扣: {(benefit.discount * 100).toFixed(0)}折</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Star size={14} className="text-gray-400" />
                        <span className="text-gray-600">积分: {benefit.pointsRate}倍</span>
                      </div>
                    </div>
                    {benefit.gifts.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {benefit.gifts.map((gift, i) => (
                          <span key={i} className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                            {gift}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => handleUpgrade(viewingCustomer)}
              className="w-full mt-6 py-3 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-medium transition-colors"
            >
              升级会员等级
            </button>
          </div>
        </div>
      )}

      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-800 mb-4">升级会员</h3>
            
            {upgradeCustomer && (
              <div className="mb-4 p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                    <User size={20} className="text-gray-500" />
                  </div>
                  <div>
                    <div className="font-medium text-gray-800">{upgradeCustomer.name}</div>
                    <div className="text-sm text-gray-500">{upgradeCustomer.phone}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">选择会员等级</label>
              <div className="space-y-2">
                {membershipPlans.map((plan) => (
                  <button
                    key={plan.level}
                    onClick={() => setSelectedUpgradeLevel(plan.level)}
                    className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                      selectedUpgradeLevel === plan.level
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {plan.level === MembershipLevel.PREMIUM ? (
                          <Star size={20} className="text-blue-500" />
                        ) : (
                          <Crown size={20} className="text-purple-500" />
                        )}
                        <div>
                          <div className="font-medium text-gray-800">{plan.name}</div>
                          <div className="text-sm text-gray-500">{plan.description}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-gray-800">¥{plan.price}</div>
                        <div className="text-xs text-gray-500">/{plan.period}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowUpgradeModal(false);
                  setUpgradeCustomer(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
              >
                取消
              </button>
              <button
                onClick={confirmUpgrade}
                className="flex-1 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-xl font-medium transition-colors"
              >
                确认升级
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </ShopLayout>
  );
};

export default MembershipManagement;