import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Phone,
  Calendar,
  Tag,
  Search,
  Plus,
  Edit,
  Trash2,
  Eye,
  Filter,
  ChevronDown,
  X,
  Star,
  Wallet,
  Gift,
  Crown,
  Briefcase,
} from 'lucide-react';
import {
  UserCircle, ClipboardList, Scissors, Palette, Heart, HandCoins, MessageSquare,
  Clock, MapPin, Users, BarChart3
} from 'lucide-react';
import { Customer, CustomerTag, MembershipLevel } from '../../../shared/types';
import { 
  CustomerProfile, CustomerVisitRecord, UserRole,
  HaircutStylePreference, HairColorPreference, PermColorPreference, TreatmentPreference,
  HairType, HairLength, VisitFrequency, BudgetRange, CommunicationStyle,
  ExtraServicePreference, VisitTimePreference
} from '../../../shared/types';
import { mockCustomers, membershipBenefits } from '../../../shared/mockData';
import { useAppStore } from '../../store';

const CustomerManagement: React.FC = () => {
  const [customers] = useState<Customer[]>(mockCustomers);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState<CustomerTag[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<MembershipLevel | 'all'>('all');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState({
    name: '',
    phone: '',
    gender: 'male' as 'male' | 'female' | 'other',
    age: 0,
    tags: [] as CustomerTag[],
  });
  
  const { currentShop, currentEmployee, userRole, logout } = useAppStore();

  // 权限判断
  const canViewAllCustomers =
    !userRole ||
    userRole === UserRole.CEO ||
    userRole === UserRole.CUSTOMER_SERVICE ||
    userRole === UserRole.SHOP_OWNER ||
    userRole === UserRole.SHOP_MANAGER;
  const canViewOwnCustomers = userRole === UserRole.STYLIST;
  const canEditCustomerInfo = userRole === UserRole.CEO || userRole === UserRole.CUSTOMER_SERVICE;
  const canEditCustomerProfile =
    userRole === UserRole.CEO ||
    userRole === UserRole.CUSTOMER_SERVICE ||
    userRole === UserRole.STYLIST ||
    userRole === UserRole.SHOP_MANAGER;
  const canExportCustomerData = userRole === UserRole.CEO || userRole === UserRole.CUSTOMER_SERVICE;
  const canDeleteCustomer = userRole === UserRole.CEO;

  const navigate = useNavigate();

  if (!currentShop) {
    navigate('/shop/login');
    return null;
  }

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const haircutStyleLabels: Record<HaircutStylePreference, string> = {
    [HaircutStylePreference.SHORT]: '短发',
    [HaircutStylePreference.MEDIUM]: '中发',
    [HaircutStylePreference.LONG]: '长发',
    [HaircutStylePreference.BOB]: '波波头',
    [HaircutStylePreference.PIXIE]: '精灵短发',
    [HaircutStylePreference.UNDERCUT]: '两侧剃短',
    [HaircutStylePreference.LAYERED]: '层次发',
    [HaircutStylePreference.BANGS]: '有刘海',
  };

  const hairColorLabels: Record<HairColorPreference, string> = {
    [HairColorPreference.NATURAL_BLACK]: '自然黑',
    [HairColorPreference.BROWN]: '棕色系',
    [HairColorPreference.RED]: '红色系',
    [HairColorPreference.GOLD]: '金色系',
    [HairColorPreference.FASHION_COLOR]: '潮色',
    [HairColorPreference.GRAY]: '奶奶灰',
    [HairColorPreference.TWO_TONE]: '双色',
  };

  const permColorLabels: Record<PermColorPreference, string> = {
    [PermColorPreference.STRAIGHT]: '拉直',
    [PermColorPreference.BIG_CURL]: '大卷',
    [PermColorPreference.SMALL_CURL]: '小卷',
    [PermColorPreference.PERM_ROOTS]: '根烫',
    [PermColorPreference.DIGITAL_PERM]: '数码烫',
    [PermColorPreference.NO_PERM]: '不烫发',
  };

  const treatmentLabels: Record<TreatmentPreference, string> = {
    [TreatmentPreference.DEEP_TREATMENT]: '深层护理',
    [TreatmentPreference.KERATIN]: '角蛋白',
    [TreatmentPreference.SCALP_CARE]: '头皮护理',
    [TreatmentPreference.OIL_TREATMENT]: '精油护理',
    [TreatmentPreference.MOISTURE]: '补水护理',
    [TreatmentPreference.NO_TREATMENT]: '不做护理',
  };

  const hairTypeLabels: Record<HairType, string> = {
    [HairType.DRY]: '干性',
    [HairType.OILY]: '油性',
    [HairType.NORMAL]: '中性',
    [HairType.MIXED]: '混合性',
    [HairType.DAMAGED]: '受损',
    [HairType.COLOR_TREATED]: '染后',
  };

  const hairLengthLabels: Record<HairLength, string> = {
    [HairLength.SUPER_SHORT]: '超短发',
    [HairLength.SHORT]: '短发',
    [HairLength.MEDIUM]: '中发',
    [HairLength.LONG]: '长发',
    [HairLength.SUPER_LONG]: '超长发',
  };

  const visitFrequencyLabels: Record<VisitFrequency, string> = {
    [VisitFrequency.EVERY_2_WEEKS]: '每2周1次',
    [VisitFrequency.EVERY_MONTH]: '每月1次',
    [VisitFrequency.EVERY_2_MONTHS]: '每2个月1次',
    [VisitFrequency.EVERY_3_MONTHS]: '每季度1次',
    [VisitFrequency.IRREGULAR]: '不固定',
  };

  const budgetRangeLabels: Record<BudgetRange, string> = {
    [BudgetRange.UNDER_100]: '100以下',
    [BudgetRange.R100_300]: '100-300',
    [BudgetRange.R300_500]: '300-500',
    [BudgetRange.R500_1000]: '500-1000',
    [BudgetRange.OVER_1000]: '1000以上',
  };

  const communicationStyleLabels: Record<CommunicationStyle, string> = {
    [CommunicationStyle.QUIET]: '安静型',
    [CommunicationStyle.CHATTY]: '聊天型',
    [CommunicationStyle.PROFESSIONAL]: '专业型',
    [CommunicationStyle.NO_PREFERENCE]: '无所谓',
  };

  const extraServiceLabels: Record<ExtraServicePreference, string> = {
    [ExtraServicePreference.HEAD_MASSAGE]: '头部按摩',
    [ExtraServicePreference.FACE_WASH]: '洗脸',
    [ExtraServicePreference.BEARD_TRIM]: '修胡须',
    [ExtraServicePreference.HAIR_WASH]: '特色洗头',
    [ExtraServicePreference.HOT_TOWEL]: '热毛巾',
    [ExtraServicePreference.NO_EXTRA]: '不需要附加服务',
  };

  const visitTimeLabels: Record<VisitTimePreference, string> = {
    [VisitTimePreference.MORNING]: '上午',
    [VisitTimePreference.AFTERNOON]: '下午',
    [VisitTimePreference.EVENING]: '晚上',
    [VisitTimePreference.WEEKEND]: '周末',
    [VisitTimePreference.WEEKDAY]: '工作日',
  };

  const tagLabels: Record<CustomerTag, string> = {
    [CustomerTag.HAIRCUT]: '剪发',
    [CustomerTag.PERM]: '烫发',
    [CustomerTag.COLOR]: '染发',
    [CustomerTag.TREATMENT]: '护理',
    [CustomerTag.WIG]: '假发',
    [CustomerTag.PRODUCTS]: '产品消费',
    [CustomerTag.FREQUENT]: '常客',
    [CustomerTag.NEW]: '新客户',
    [CustomerTag.VIP]: 'VIP会员',
    [CustomerTag.STOCKHOLDER]: '股东',
  };

  const tagColors: Record<CustomerTag, string> = {
    [CustomerTag.HAIRCUT]: 'bg-blue-100 text-blue-700',
    [CustomerTag.PERM]: 'bg-purple-100 text-purple-700',
    [CustomerTag.COLOR]: 'bg-pink-100 text-pink-700',
    [CustomerTag.TREATMENT]: 'bg-green-100 text-green-700',
    [CustomerTag.WIG]: 'bg-yellow-100 text-yellow-700',
    [CustomerTag.PRODUCTS]: 'bg-orange-100 text-orange-700',
    [CustomerTag.FREQUENT]: 'bg-red-100 text-red-700',
    [CustomerTag.NEW]: 'bg-gray-100 text-gray-700',
    [CustomerTag.VIP]: 'bg-indigo-100 text-indigo-700',
    [CustomerTag.STOCKHOLDER]: 'bg-purple-100 text-purple-700',
  };

  const levelLabels: Record<MembershipLevel, string> = {
    [MembershipLevel.REGULAR]: '普通用户',
    [MembershipLevel.PREMIUM]: '高级会员',
    [MembershipLevel.STOCKHOLDER]: '股东会员',
  };

  const levelColors: Record<MembershipLevel, string> = {
    [MembershipLevel.REGULAR]: 'bg-gray-100 text-gray-700',
    [MembershipLevel.PREMIUM]: 'bg-blue-100 text-blue-700',
    [MembershipLevel.STOCKHOLDER]: 'bg-purple-100 text-purple-700',
  };

  // 根据角色权限过滤客户
  const customersByPermission = customers.filter(customer => {
    if (canViewAllCustomers) return true;
    if (canViewOwnCustomers && currentEmployee) {
      // 技师只能看到自己服务过的客户
      return customer.servedByStylistIds?.includes(currentEmployee.id);
    }
    return false;
  });

  const filteredCustomers = customersByPermission.filter(customer => {
    const matchesSearch = 
      customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone.includes(searchTerm);
    
    const matchesTags = selectedTags.length === 0 || 
      selectedTags.some(tag => customer.tags.includes(tag));
    
    const matchesLevel = selectedLevel === 'all' || customer.membershipLevel === selectedLevel;
    
    return matchesSearch && matchesTags && matchesLevel;
  });

  const toggleTag = (tag: CustomerTag) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const handleAddCustomer = () => {
    setShowAddModal(true);
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setShowEditModal(true);
  };

  const handleViewCustomer = (customer: Customer) => {
    setViewingCustomer(customer);
  };

  const handleDeleteCustomer = (customerId: string) => {
    if (window.confirm('确定要删除该客户吗？')) {
      console.log('Delete customer:', customerId);
    }
  };

  const getMembershipBenefits = (level: MembershipLevel) => {
    return membershipBenefits.find(b => b.level === level) || null;
  };

  const stats = [
    { label: '总客户数', value: customers.length, icon: User },
    { label: '高级会员', value: customers.filter(c => c.membershipLevel === MembershipLevel.PREMIUM).length, icon: Star },
    { label: '股东会员', value: customers.filter(c => c.isStockholder).length, icon: Crown },
    { label: '常客', value: customers.filter(c => c.tags.includes(CustomerTag.FREQUENT)).length, icon: Briefcase },
  ];

  // 如果是技师，显示提示信息
  const roleTip = canViewOwnCustomers ? '（仅显示您服务过的客户）' : '';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-gradient-to-r from-orange-500 to-orange-600 text-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <User size={24} />
              <h1 className="text-xl font-bold">客户管理</h1>
              {roleTip && <span className="text-sm opacity-80">{roleTip}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 p-2 hover:bg-orange-400 rounded-lg transition-colors"
            >
              <span className="hidden sm:inline">退出</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {stats.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <div key={index} className="bg-white rounded-2xl shadow-sm p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                    <Icon size={20} className="text-orange-500" />
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

        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex flex-col md:flex-row gap-4 mb-4">
            <div className="flex-1 relative">
              <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="搜索客户姓名或电话..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
              />
            </div>
            
            <div className="relative">
              <button
                onClick={() => setShowFilterDropdown(!showFilterDropdown)}
                className="flex items-center gap-2 px-4 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <Filter size={20} />
                <span>筛选</span>
                {selectedTags.length > 0 && (
                  <span className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full text-sm">
                    {selectedTags.length}
                  </span>
                )}
                <ChevronDown size={16} />
              </button>
              
              {showFilterDropdown && (
                <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-lg p-4 w-80 z-10">
                  <div className="mb-4">
                    <h3 className="font-medium text-gray-800 mb-2">服务标签</h3>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(tagLabels).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => toggleTag(key as CustomerTag)}
                          className={`px-3 py-1 rounded-full text-sm transition-all ${
                            selectedTags.includes(key as CustomerTag)
                              ? 'bg-orange-500 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="font-medium text-gray-800 mb-2">会员等级</h3>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setSelectedLevel('all')}
                        className={`px-3 py-1 rounded-full text-sm transition-all ${
                          selectedLevel === 'all'
                            ? 'bg-orange-500 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        全部
                      </button>
                      {Object.entries(levelLabels).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => setSelectedLevel(key as MembershipLevel)}
                          className={`px-3 py-1 rounded-full text-sm transition-all ${
                            selectedLevel === key
                              ? 'bg-orange-500 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {canEditCustomerInfo && (
              <button
                onClick={handleAddCustomer}
                className="flex items-center gap-2 px-4 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium transition-colors"
              >
                <Plus size={20} />
                <span>新增客户</span>
              </button>
            )}
            {canExportCustomerData && (
              <button
                onClick={() => {
                  console.log('Export customer data');
                  alert('导出功能（演示）');
                }}
                className="flex items-center gap-2 px-4 py-3 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors"
              >
                <BarChart3 size={20} />
                <span>导出</span>
              </button>
            )}
          </div>

          <div className="space-y-4">
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map((customer) => (
                <div
                  key={customer.id}
                  className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                        <User size={24} className="text-orange-500" />
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
                          <span className="flex items-center gap-1">
                            <Phone size={14} />
                            {customer.phone}
                          </span>
                          <span>{customer.gender === 'male' ? '男' : customer.gender === 'female' ? '女' : '其他'} · {customer.age}岁</span>
                          <span className="flex items-center gap-1">
                            <Calendar size={14} />
                            消费 {customer.visitCount} 次
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {customer.tags.map(tag => (
                            <span
                              key={tag}
                              className={`px-2 py-1 rounded-full text-xs ${tagColors[tag]}`}
                            >
                              {tagLabels[tag]}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewCustomer(customer)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        title="查看详情"
                      >
                        <Eye size={18} className="text-gray-600" />
                      </button>
                      {canEditCustomerInfo && (
                        <button
                          onClick={() => handleEditCustomer(customer)}
                          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          title="编辑"
                        >
                          <Edit size={18} className="text-blue-600" />
                        </button>
                      )}
                      {canDeleteCustomer && (
                        <button
                          onClick={() => handleDeleteCustomer(customer.id)}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                          title="删除"
                        >
                          <Trash2 size={18} className="text-red-500" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center text-gray-500 py-12">
                <User size={48} className="mx-auto mb-2 opacity-50" />
                <p>暂无匹配的客户</p>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Tag size={20} className="text-orange-500" />
            标签分类统计
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(tagLabels).map(([key, label]) => {
              const count = customers.filter(c => c.tags.includes(key as CustomerTag)).length;
              return (
                <div key={key} className={`p-4 rounded-xl ${tagColors[key as CustomerTag]} text-center`}>
                  <div className="text-2xl font-bold">{count}</div>
                  <div className="text-sm font-medium">{label}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {viewingCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-800">客户详情</h3>
              <button onClick={() => setViewingCustomer(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={20} />
              </button>
            </div>
            
            <div className="flex flex-col items-center mb-6">
              <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mb-4">
                <User size={40} className="text-orange-500" />
              </div>
              <h4 className="text-xl font-bold text-gray-800">{viewingCustomer.name}</h4>
              <span className={`px-3 py-1 rounded-full text-sm font-medium mt-2 ${levelColors[viewingCustomer.membershipLevel]}`}>
                {levelLabels[viewingCustomer.membershipLevel]}
              </span>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-2">
                  <Phone size={16} />
                  联系电话
                </span>
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
                <span className="text-gray-500 flex items-center gap-2">
                  <Calendar size={16} />
                  消费次数
                </span>
                <span className="font-medium">{viewingCustomer.visitCount}次</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-2">
                  <Wallet size={16} />
                  累计消费
                </span>
                <span className="font-medium text-orange-500">¥{viewingCustomer.totalSpent}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-2">
                  <Wallet size={16} />
                  储值余额
                </span>
                <span className="font-medium text-green-500">¥{viewingCustomer.balance}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-2">
                  <Star size={16} />
                  积分
                </span>
                <span className="font-medium">{viewingCustomer.points}分</span>
              </div>
              {viewingCustomer.isStockholder && (
                <>
                  <div className="flex items-center justify-between py-3 border-b border-gray-100">
                    <span className="text-gray-500 flex items-center gap-2">
                      <Crown size={16} />
                      股东身份
                    </span>
                    <span className="font-medium text-purple-600">已成为股东</span>
                  </div>
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
                <Tag size={16} />
                服务标签
              </h4>
              <div className="flex flex-wrap gap-2">
                {viewingCustomer.tags.map(tag => (
                  <span key={tag} className={`px-3 py-1 rounded-full text-sm ${tagColors[tag]}`}>
                    {tagLabels[tag]}
                  </span>
                ))}
              </div>
            </div>

            {getMembershipBenefits(viewingCustomer.membershipLevel) && (
              <div className="mt-6">
                <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                  <Gift size={16} />
                  会员权益
                </h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">折扣</span>
                    <span className="font-medium">{(getMembershipBenefits(viewingCustomer.membershipLevel)?.discount || 1) * 100}折</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">积分倍率</span>
                    <span className="font-medium">{getMembershipBenefits(viewingCustomer.membershipLevel)?.pointsRate}倍</span>
                  </div>
                  {getMembershipBenefits(viewingCustomer.membershipLevel)?.gifts.length && (
                    <div>
                      <span className="text-gray-500 text-sm">赠送福利：</span>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {getMembershipBenefits(viewingCustomer.membershipLevel)?.gifts.map((gift, i) => (
                          <span key={i} className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs">
                            {gift}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 客户画像 */}
            {viewingCustomer.profile && (
              <div className="mt-6 border-t border-gray-200 pt-4">
                <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                  <UserCircle size={16} className="text-orange-500" />
                  客户画像
                  <span className="text-xs text-gray-500">
                    (由 {viewingCustomer.profile.updatedByName} 更新)
                  </span>
                </h4>
                <div className="space-y-3 text-sm">
                  {viewingCustomer.profile.haircutStyles.length > 0 && (
                    <div>
                      <span className="text-gray-500">发型偏好：</span>
                      <div className="inline-flex flex-wrap gap-1 mt-1">
                        {viewingCustomer.profile.haircutStyles.map(s => (
                          <span key={s} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                            {haircutStyleLabels[s]}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {viewingCustomer.profile.hairColors.length > 0 && (
                    <div>
                      <span className="text-gray-500">发色偏好：</span>
                      <div className="inline-flex flex-wrap gap-1 mt-1">
                        {viewingCustomer.profile.hairColors.map(s => (
                          <span key={s} className="px-2 py-0.5 bg-pink-100 text-pink-700 rounded-full text-xs">
                            {hairColorLabels[s]}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {viewingCustomer.profile.permColors.length > 0 && (
                    <div>
                      <span className="text-gray-500">烫染偏好：</span>
                      <div className="inline-flex flex-wrap gap-1 mt-1">
                        {viewingCustomer.profile.permColors.map(s => (
                          <span key={s} className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs">
                            {permColorLabels[s]}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {viewingCustomer.profile.treatments.length > 0 && (
                    <div>
                      <span className="text-gray-500">护理偏好：</span>
                      <div className="inline-flex flex-wrap gap-1 mt-1">
                        {viewingCustomer.profile.treatments.map(s => (
                          <span key={s} className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs">
                            {treatmentLabels[s]}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-gray-500">发质：</span>
                      <span className="font-medium ml-1">{hairTypeLabels[viewingCustomer.profile.hairType]}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">发长：</span>
                      <span className="font-medium ml-1">{hairLengthLabels[viewingCustomer.profile.hairLength]}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">到店频率：</span>
                      <span className="font-medium ml-1">{visitFrequencyLabels[viewingCustomer.profile.visitFrequency]}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">预算范围：</span>
                      <span className="font-medium ml-1">{budgetRangeLabels[viewingCustomer.profile.budgetRange]}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">沟通风格：</span>
                      <span className="font-medium ml-1">{communicationStyleLabels[viewingCustomer.profile.communicationStyle]}</span>
                    </div>
                  </div>
                  {viewingCustomer.profile.extraServices.length > 0 && (
                    <div>
                      <span className="text-gray-500">附加服务：</span>
                      <div className="inline-flex flex-wrap gap-1 mt-1">
                        {viewingCustomer.profile.extraServices.map(s => (
                          <span key={s} className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs">
                            {extraServiceLabels[s]}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {viewingCustomer.profile.visitTimes.length > 0 && (
                    <div>
                      <span className="text-gray-500">到店时间：</span>
                      <div className="inline-flex flex-wrap gap-1 mt-1">
                        {viewingCustomer.profile.visitTimes.map(s => (
                          <span key={s} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs">
                            {visitTimeLabels[s]}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {viewingCustomer.profile.notes && (
                    <div>
                      <span className="text-gray-500">备注：</span>
                      <span className="font-medium ml-1">{viewingCustomer.profile.notes}</span>
                    </div>
                  )}
                  {viewingCustomer.profile.allergies && (
                    <div>
                      <span className="text-gray-500">过敏信息：</span>
                      <span className="font-medium ml-1 text-red-600">{viewingCustomer.profile.allergies}</span>
                    </div>
                  )}
                  {viewingCustomer.profile.productsUsed && viewingCustomer.profile.productsUsed.length > 0 && (
                    <div>
                      <span className="text-gray-500">推荐产品：</span>
                      <div className="inline-flex flex-wrap gap-1 mt-1">
                        {viewingCustomer.profile.productsUsed.map((p, i) => (
                          <span key={i} className="px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 到店记录 */}
            {viewingCustomer.visitRecords && viewingCustomer.visitRecords.length > 0 && (
              <div className="mt-6 border-t border-gray-200 pt-4">
                <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                  <ClipboardList size={16} className="text-orange-500" />
                  到店记录 ({viewingCustomer.visitRecords.length}次)
                </h4>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {viewingCustomer.visitRecords.map((record) => (
                    <div key={record.id} className="border border-gray-200 rounded-lg p-3 text-sm">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="font-medium text-gray-800">{record.stylistName}</span>
                          <span className="text-gray-400 mx-2">·</span>
                          <span className="text-gray-500">
                            {new Date(record.checkInTime).toLocaleDateString('zh-CN')}
                          </span>
                        </div>
                        <span className="text-orange-500 font-medium">¥{record.totalAmount}</span>
                      </div>
                      <div className="text-gray-600 mb-1">
                        <Scissors size={12} className="inline mr-1" />
                        {record.serviceNames.join('、')}
                      </div>
                      {record.products && record.products.length > 0 && (
                        <div className="text-gray-600 text-xs">
                          <Palette size={12} className="inline mr-1" />
                          购买：{record.products.map(p => p.name).join('、')}
                        </div>
                      )}
                      {record.notes && (
                        <div className="text-gray-500 text-xs mt-1">备注：{record.notes}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 客户来源 */}
            {viewingCustomer.source && (
              <div className="mt-6 border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-2">
                    <Users size={16} />
                    客户来源
                  </span>
                  <span className="font-medium">{viewingCustomer.source}</span>
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="mt-6 flex gap-2 justify-end border-t border-gray-200 pt-4">
              {canEditCustomerProfile && (
                <button
                  onClick={() => navigate(`/shop/customer-profile/${viewingCustomer.id}`)}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl transition-colors text-sm font-medium"
                >
                  <UserCircle size={16} />
                  {viewingCustomer.profile ? '编辑画像' : '新建画像'}
                </button>
              )}
              {canEditCustomerInfo && (
                <button
                  onClick={() => handleEditCustomer(viewingCustomer)}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors text-sm"
                >
                  <Edit size={16} />
                  编辑信息
                </button>
              )}
              <button
                onClick={() => setViewingCustomer(null)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors text-sm"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-800 mb-4">新增客户</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">姓名</label>
                <input
                  type="text"
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  placeholder="请输入客户姓名"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">电话</label>
                <input
                  type="tel"
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  placeholder="请输入客户电话"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">性别</label>
                <div className="flex gap-4">
                  {['male', 'female', 'other'].map(gender => (
                    <label key={gender} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="gender"
                        value={gender}
                        checked={newCustomer.gender === gender}
                        onChange={(e) => setNewCustomer({ ...newCustomer, gender: e.target.value as 'male' | 'female' | 'other' })}
                        className="text-orange-500"
                      />
                      <span>{gender === 'male' ? '男' : gender === 'female' ? '女' : '其他'}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">年龄</label>
                <input
                  type="number"
                  value={newCustomer.age}
                  onChange={(e) => setNewCustomer({ ...newCustomer, age: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                  placeholder="请输入年龄"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">服务标签</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(tagLabels).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setNewCustomer({
                        ...newCustomer,
                        tags: newCustomer.tags.includes(key as CustomerTag)
                          ? newCustomer.tags.filter(t => t !== key)
                          : [...newCustomer.tags, key as CustomerTag]
                      })}
                      className={`px-3 py-1 rounded-full text-sm transition-all ${
                        newCustomer.tags.includes(key as CustomerTag)
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNewCustomer({ name: '', phone: '', gender: 'male', age: 0, tags: [] });
                }}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  console.log('Add customer:', newCustomer);
                  setShowAddModal(false);
                  setNewCustomer({ name: '', phone: '', gender: 'male', age: 0, tags: [] });
                }}
                className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium transition-colors"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editingCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-lg font-bold text-gray-800 mb-4">编辑客户信息</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">姓名</label>
                <input
                  type="text"
                  value={editingCustomer.name}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">电话</label>
                <input
                  type="tel"
                  value={editingCustomer.phone}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">服务标签</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(tagLabels).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setEditingCustomer({
                        ...editingCustomer,
                        tags: editingCustomer.tags.includes(key as CustomerTag)
                          ? editingCustomer.tags.filter(t => t !== key)
                          : [...editingCustomer.tags, key as CustomerTag]
                      })}
                      className={`px-3 py-1 rounded-full text-sm transition-all ${
                        editingCustomer.tags.includes(key as CustomerTag)
                          ? 'bg-orange-500 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingCustomer(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  console.log('Update customer:', editingCustomer);
                  setShowEditModal(false);
                  setEditingCustomer(null);
                }}
                className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-medium transition-colors"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerManagement;