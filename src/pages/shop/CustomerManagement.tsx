import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Phone,
  Calendar,
  Tag,
  Search,
  Plus,
  Edit,
  X,
  Star,
  Wallet,
  Gift,
  Crown,
  Clock,
  UserCircle,
  Scissors,
  Palette,
  ClipboardList,
  Filter,
  ChevronRight,
  RefreshCw,
  AlertTriangle,
  Bell,
  Download,
  Loader2,
  MapPin,
  AlertCircle,
} from 'lucide-react';
import { Customer, CustomerTag, MembershipLevel, UserRole, PurchaseVIPLevel, StoredValueLevel } from '../../../shared/types';
import {
  HaircutStylePreference,
  HairColorPreference,
  PermColorPreference,
  TreatmentPreference,
  HairType,
  HairLength,
  VisitFrequency,
  BudgetRange,
  CommunicationStyle,
  ExtraServicePreference,
  VisitTimePreference,
} from '../../../shared/types';
import { purchaseVIPPlans, storedValuePlans } from '../../../shared/mockData';
import { customerApi } from '../../api';
import { useAppStore } from '../../store';
import ShopLayout from './ShopLayout';

const CustomerManagement: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTag, setActiveTag] = useState<CustomerTag | 'all'>('all');
  const [activePurchaseLevel, setActivePurchaseLevel] = useState<PurchaseVIPLevel | 'all'>('all');
  const [activeStoredLevel, setActiveStoredLevel] = useState<StoredValueLevel | 'all'>('all');
  const [viewingCustomer, setViewingCustomer] = useState<Customer | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState<Customer | null>(null);
  const navigate = useNavigate();
  const { currentEmployee, userRole } = useAppStore();

  // 获取客户列表 - 通过 API 获取（带缓存回退）
  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let result = await customerApi.getAll();
      
      // 搜索筛选
      if (searchTerm) {
        const keyword = searchTerm.toLowerCase();
        result = result.filter(
          (c) => c.name.toLowerCase().includes(keyword) || c.phone.includes(keyword)
        );
      }
      
      // 标签筛选
      if (activeTag !== 'all') {
        result = result.filter((c) => c.tags.includes(activeTag));
      }
      
      // 购买型 VIP 等级筛选
      if (activePurchaseLevel !== 'all') {
        result = result.filter((c) => c.purchaseVIPLevel === activePurchaseLevel);
      }

      // 储值会员等级筛选
      if (activeStoredLevel !== 'all') {
        result = result.filter((c) => c.storedValueLevel === activeStoredLevel);
      }

      // 发型师只看自己服务的客户
      if (userRole === UserRole.STYLIST && currentEmployee) {
        result = result.filter(
          (c) => c.servedByStylistIds && c.servedByStylistIds.includes(currentEmployee.id)
        );
      }
      
      // 计算到店天数
      result = result.map((c) => ({
        ...c,
        daysSinceLastVisit: c.lastVisitAt
          ? Math.floor((Date.now() - new Date(c.lastVisitAt).getTime()) / 86400000)
          : undefined,
      }));
      
      setCustomers(result);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '获取客户列表失败');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, activeTag, activePurchaseLevel, activeStoredLevel, currentEmployee, userRole]);

  // 初始加载和筛选变化时获取数据
  React.useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // 添加客户
  const handleAddCustomer = async (data: Partial<Customer>) => {
    const newCustomer = {
      name: data.name || '',
      phone: data.phone || '',
      gender: data.gender || 'other',
      age: data.age,
      birthday: data.birthday,
      tags: [],
      membershipLevel: MembershipLevel.REGULAR,
      purchaseVIPLevel: PurchaseVIPLevel.REGULAR,
      storedValueLevel: StoredValueLevel.NONE,
      source: data.source || '',
    };
    await customerApi.create(newCustomer);
    setShowAdd(false);
    fetchCustomers();
  };

  // 更新客户
  const handleUpdateCustomer = async (updated: Customer) => {
    await customerApi.update(updated.id, updated);
    setShowEdit(null);
    fetchCustomers();
  };

  // 标签名称映射
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

  const tagActiveColors: Record<CustomerTag, string> = {
    [CustomerTag.HAIRCUT]: 'bg-blue-500 text-white ring-2 ring-blue-200',
    [CustomerTag.PERM]: 'bg-purple-500 text-white ring-2 ring-purple-200',
    [CustomerTag.COLOR]: 'bg-pink-500 text-white ring-2 ring-pink-200',
    [CustomerTag.TREATMENT]: 'bg-green-500 text-white ring-2 ring-green-200',
    [CustomerTag.WIG]: 'bg-yellow-500 text-white ring-2 ring-yellow-200',
    [CustomerTag.PRODUCTS]: 'bg-orange-500 text-white ring-2 ring-orange-200',
    [CustomerTag.FREQUENT]: 'bg-red-500 text-white ring-2 ring-red-200',
    [CustomerTag.NEW]: 'bg-gray-500 text-white ring-2 ring-gray-200',
    [CustomerTag.VIP]: 'bg-indigo-500 text-white ring-2 ring-indigo-200',
    [CustomerTag.STOCKHOLDER]: 'bg-purple-500 text-white ring-2 ring-purple-200',
  };

  // 新版双轨会员体系 - 购买型 VIP
  const purchaseVIPLabels: Record<PurchaseVIPLevel, string> = {
    [PurchaseVIPLevel.REGULAR]: '普通用户',
    [PurchaseVIPLevel.BRONZE]: '普卡 VIP',
    [PurchaseVIPLevel.SILVER]: '银卡 VIP',
    [PurchaseVIPLevel.GOLD]: '金卡 VIP',
    [PurchaseVIPLevel.DIAMOND]: '钻石 VIP',
  };

  const purchaseVIPColors: Record<PurchaseVIPLevel, string> = {
    [PurchaseVIPLevel.REGULAR]: 'bg-gray-100 text-gray-700',
    [PurchaseVIPLevel.BRONZE]: 'bg-amber-100 text-amber-700',
    [PurchaseVIPLevel.SILVER]: 'bg-slate-100 text-slate-700',
    [PurchaseVIPLevel.GOLD]: 'bg-yellow-100 text-yellow-700',
    [PurchaseVIPLevel.DIAMOND]: 'bg-purple-100 text-purple-700',
  };

  // 新版双轨会员体系 - 储值会员
  const storedValueLabels: Record<StoredValueLevel, string> = {
    [StoredValueLevel.NONE]: '未储值',
    [StoredValueLevel.STORE_500]: '储值卡',
    [StoredValueLevel.STORE_1000]: '安心卡',
    [StoredValueLevel.STORE_2000]: '顺心卡',
    [StoredValueLevel.STORE_5000]: '随心卡',
  };

  const storedValueColors: Record<StoredValueLevel, string> = {
    [StoredValueLevel.NONE]: 'bg-gray-100 text-gray-700',
    [StoredValueLevel.STORE_500]: 'bg-blue-100 text-blue-700',
    [StoredValueLevel.STORE_1000]: 'bg-green-100 text-green-700',
    [StoredValueLevel.STORE_2000]: 'bg-indigo-100 text-indigo-700',
    [StoredValueLevel.STORE_5000]: 'bg-rose-100 text-rose-700',
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

  // 计算筛选后的客户（发型师只看自己服务过的客户）
  const filteredCustomers = useMemo(() => {
    let base = customers;

    // 发型师角色：只看自己服务过的客户
    if (userRole === UserRole.STYLIST && currentEmployee) {
      base = base.filter(
        (c) => c.servedByStylistIds && c.servedByStylistIds.includes(currentEmployee.id),
      );
    }

    return base.filter((c) => {
      const matchesSearch =
        searchTerm === '' ||
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm);

      const matchesTag =
        activeTag === 'all' || c.tags.includes(activeTag);

      const matchesPurchase =
        activePurchaseLevel === 'all' || c.purchaseVIPLevel === activePurchaseLevel;

      const matchesStored =
        activeStoredLevel === 'all' || c.storedValueLevel === activeStoredLevel;

      return matchesSearch && matchesTag && matchesPurchase && matchesStored;
    });
  }, [customers, searchTerm, activeTag, activePurchaseLevel, activeStoredLevel, userRole, currentEmployee]);

  // 统计（发型师只统计自己的客户）
  const stats = useMemo(() => {
    const base = userRole === UserRole.STYLIST && currentEmployee
      ? filteredCustomers
      : customers;
    const totalMembers = base.filter(
      (c) => c.purchaseVIPLevel !== PurchaseVIPLevel.REGULAR || c.storedValueLevel !== StoredValueLevel.NONE
    ).length;

    return [
      { label: '总客户', value: base.length, icon: User, color: 'text-orange-500' },
      {
        label: '会员总数',
        value: totalMembers,
        icon: Crown,
        color: 'text-purple-500',
      },
      {
        label: '购买型VIP',
        value: base.filter((c) => c.purchaseVIPLevel !== PurchaseVIPLevel.REGULAR).length,
        icon: Star,
        color: 'text-blue-500',
      },
      {
        label: '储值会员',
        value: base.filter((c) => c.storedValueLevel !== StoredValueLevel.NONE).length,
        icon: Wallet,
        color: 'text-green-500',
      },
    ];
  }, [customers, filteredCustomers, userRole, currentEmployee]);

  // 导出客户CSV（仅CEO和客服可见）
  const handleExportCSV = () => {
    const headers = [
      '姓名', '手机号', '性别', '年龄', '会员等级', '累计消费', '储值余额',
      '积分', '到店次数', '上次到店', '流失风险', '是否股东', '来源',
      '服务标签', '注册时间',
    ];

    const rows = filteredCustomers.map((c) => [
      c.name,
      c.phone,
      c.gender === 'male' ? '男' : c.gender === 'female' ? '女' : '其他',
      c.age || '',
      `${purchaseVIPLabels[c.purchaseVIPLevel] || ''}${c.purchaseVIPLevel !== PurchaseVIPLevel.REGULAR && c.storedValueLevel !== StoredValueLevel.NONE ? ' / ' : ''}${c.storedValueLevel !== StoredValueLevel.NONE ? storedValueLabels[c.storedValueLevel] : ''}`,
      c.totalSpent,
      c.storedValueBalance,
      c.points,
      c.visitCount,
      c.lastVisitAt ? new Date(c.lastVisitAt).toLocaleDateString('zh-CN') : '',
      c.churnRisk === 'high' ? '高风险' : c.churnRisk === 'medium' ? '需关注' : '正常',
      c.isStockholder ? '是' : '否',
      c.source || '',
      c.tags.map((t) => tagLabels[t]).join('/'),
      c.joinedAt ? new Date(c.joinedAt).toLocaleDateString('zh-CN') : '',
    ]);

    const csvContent =
      '\uFEFF' + // BOM for UTF-8
      [headers, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `客户列表_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const canExport =
    userRole === UserRole.CEO || userRole === UserRole.CUSTOMER_SERVICE;

  // 点击标签统计卡片
  const handleTagClick = (tag: CustomerTag | 'all') => {
    setActiveTag(tag);
  };

  // 点击购买型 VIP 等级
  const handlePurchaseLevelClick = (level: PurchaseVIPLevel | 'all') => {
    setActivePurchaseLevel(level);
  };

  // 点击储值会员等级
  const handleStoredLevelClick = (level: StoredValueLevel | 'all') => {
    setActiveStoredLevel(level);
  };

  // 重置筛选
  const resetFilters = () => {
    setActiveTag('all');
    setActivePurchaseLevel('all');
    setActiveStoredLevel('all');
    setSearchTerm('');
  };

  return (
    <ShopLayout title="客户管理">
      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className="bg-white rounded-2xl shadow-sm p-4 md:p-5 border border-gray-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
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

      {/* 搜索栏 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 md:p-5 mb-5 border border-gray-100">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 relative">
            <Search
              size={18}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="搜索客户姓名或电话..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <button
            onClick={fetchCustomers}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-3 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl transition-colors text-sm disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            {loading ? '刷新中...' : '刷新'}
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl transition-all text-sm font-medium shadow-md"
          >
            <Plus size={16} />
            添加客户
          </button>
          {(activeTag !== 'all' || activePurchaseLevel !== 'all' || activeStoredLevel !== 'all' || searchTerm !== '') && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-2 px-4 py-3 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl transition-colors text-sm"
            >
              <RefreshCw size={16} />
              重置筛选
            </button>
          )}
        </div>

        {/* 当前筛选条件提示 */}
        {(activeTag !== 'all' || activePurchaseLevel !== 'all' || activeStoredLevel !== 'all') && (
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
            <Filter size={14} />
            当前筛选：
            {activeTag !== 'all' && (
              <span className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded-full text-xs">
                {tagLabels[activeTag]}
              </span>
            )}
            {activePurchaseLevel !== 'all' && (
              <span className="px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full text-xs">
                {purchaseVIPLabels[activePurchaseLevel]}
              </span>
            )}
            {activeStoredLevel !== 'all' && (
              <span className="px-2 py-0.5 bg-green-100 text-green-600 rounded-full text-xs">
                {storedValueLabels[activeStoredLevel]}
              </span>
            )}
            <span className="text-gray-400">共 {filteredCustomers.length} 位客户</span>
          </div>
        )}
      </div>

      {/* 标签分类 - 可点击筛选 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 md:p-5 mb-5 border border-gray-100">
        <h2 className="text-base md:text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Tag size={18} className="text-orange-500" />
          标签分类（点击筛选）
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {/* 全部 */}
          <button
            onClick={() => handleTagClick('all')}
            className={`p-3 md:p-4 rounded-xl text-center transition-all ${
              activeTag === 'all'
                ? 'bg-orange-500 text-white shadow-md ring-2 ring-orange-200'
                : 'bg-gray-50 text-gray-700 hover:bg-orange-50 hover:text-orange-600 border border-gray-100'
            }`}
          >
            <div className="text-xl md:text-2xl font-bold">{filteredCustomers.length}</div>
            <div className="text-sm font-medium mt-1">全部客户</div>
          </button>
          {Object.entries(tagLabels).map(([key, label]) => {
            const count = filteredCustomers.filter((c) => c.tags.includes(key as CustomerTag)).length;
            if (count === 0) return null;
            const tagKey = key as CustomerTag;
            const isActive = activeTag === tagKey;
            return (
              <button
                key={key}
                onClick={() => handleTagClick(tagKey)}
                className={`p-3 md:p-4 rounded-xl text-center transition-all ${
                  isActive
                    ? tagActiveColors[tagKey] + ' shadow-md'
                    : tagColors[tagKey] + ' hover:shadow-sm border border-transparent hover:border-current/20'
                }`}
              >
                <div className="text-xl md:text-2xl font-bold">{count}</div>
                <div className="text-sm font-medium mt-1">{label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 购买型 VIP 等级分类 - 可点击筛选 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 md:p-5 mb-5 border border-gray-100">
        <h2 className="text-base md:text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Star size={18} className="text-orange-500" />
          购买型 VIP 等级（点击筛选）
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <button
            onClick={() => handlePurchaseLevelClick('all')}
            className={`p-3 md:p-4 rounded-xl text-center transition-all ${
              activePurchaseLevel === 'all'
                ? 'bg-orange-500 text-white shadow-md ring-2 ring-orange-200'
                : 'bg-gray-50 text-gray-700 hover:bg-orange-50 hover:text-orange-600 border border-gray-100'
            }`}
          >
            <div className="text-xl md:text-2xl font-bold">{filteredCustomers.length}</div>
            <div className="text-sm font-medium mt-1">全部</div>
          </button>
          {Object.entries(purchaseVIPLabels).map(([key, label]) => {
            const count = filteredCustomers.filter((c) => c.purchaseVIPLevel === (key as PurchaseVIPLevel)).length;
            const levelKey = key as PurchaseVIPLevel;
            const isActive = activePurchaseLevel === levelKey;
            return (
              <button
                key={key}
                onClick={() => handlePurchaseLevelClick(levelKey)}
                className={`p-3 md:p-4 rounded-xl text-center transition-all ${
                  isActive
                    ? purchaseVIPColors[levelKey] + ' shadow-md ring-2 ring-orange-200'
                    : purchaseVIPColors[levelKey] + ' hover:shadow-sm opacity-80 hover:opacity-100'
                }`}
              >
                <div className="text-xl md:text-2xl font-bold">{count}</div>
                <div className="text-sm font-medium mt-1">{label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 储值会员等级分类 - 可点击筛选 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 md:p-5 mb-5 border border-gray-100">
        <h2 className="text-base md:text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Wallet size={18} className="text-orange-500" />
          储值会员等级（点击筛选）
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <button
            onClick={() => handleStoredLevelClick('all')}
            className={`p-3 md:p-4 rounded-xl text-center transition-all ${
              activeStoredLevel === 'all'
                ? 'bg-orange-500 text-white shadow-md ring-2 ring-orange-200'
                : 'bg-gray-50 text-gray-700 hover:bg-orange-50 hover:text-orange-600 border border-gray-100'
            }`}
          >
            <div className="text-xl md:text-2xl font-bold">{filteredCustomers.length}</div>
            <div className="text-sm font-medium mt-1">全部</div>
          </button>
          {Object.entries(storedValueLabels).map(([key, label]) => {
            const count = filteredCustomers.filter((c) => c.storedValueLevel === (key as StoredValueLevel)).length;
            const levelKey = key as StoredValueLevel;
            const isActive = activeStoredLevel === levelKey;
            return (
              <button
                key={key}
                onClick={() => handleStoredLevelClick(levelKey)}
                className={`p-3 md:p-4 rounded-xl text-center transition-all ${
                  isActive
                    ? storedValueColors[levelKey] + ' shadow-md ring-2 ring-orange-200'
                    : storedValueColors[levelKey] + ' hover:shadow-sm opacity-80 hover:opacity-100'
                }`}
              >
                <div className="text-xl md:text-2xl font-bold">{count}</div>
                <div className="text-sm font-medium mt-1">{label}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 客户列表 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 md:p-5 border border-gray-100">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-base md:text-lg font-bold text-gray-800 flex items-center gap-2">
            <User size={18} className="text-orange-500" />
            {activeTag === 'all' && activePurchaseLevel === 'all' && activeStoredLevel === 'all' ? '所有客户' : '筛选结果'}
            <span className="text-sm font-normal text-gray-500">({filteredCustomers.length})</span>
          </h2>
          {canExport && filteredCustomers.length > 0 && (
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl transition-colors text-sm font-medium border border-green-100"
            >
              <Download size={16} />
              导出CSV
            </button>
          )}
        </div>

        {/* Loading 状态 */}
        {loading && !error && (
          <div className="flex flex-col items-center justify-center py-12 text-gray-500">
            <Loader2 size={48} className="animate-spin mb-4 text-orange-500" />
            <p className="text-sm">加载中...</p>
          </div>
        )}

        {/* Error 状态 */}
        {error && !loading && (
          <div className="flex flex-col items-center justify-center py-12 text-red-500">
            <AlertCircle size={48} className="mb-4" />
            <p className="text-sm mb-4">{error}</p>
            <button
              onClick={fetchCustomers}
              className="px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-sm"
            >
              重试
            </button>
          </div>
        )}

        {/* 客户列表 */}
        {!loading && !error && filteredCustomers.length > 0 ? (
          <div className="space-y-3">
            {filteredCustomers.map((customer) => (
              <div
                key={customer.id}
                className="border border-gray-200 rounded-xl p-4 hover:shadow-md hover:border-orange-200 transition-shadow cursor-pointer"
                onClick={() => setViewingCustomer(customer)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
                      <User size={22} className="text-orange-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-bold text-gray-800 text-base">{customer.name}</span>
                        {customer.purchaseVIPLevel !== PurchaseVIPLevel.REGULAR && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${purchaseVIPColors[customer.purchaseVIPLevel]}`}
                          >
                            {purchaseVIPLabels[customer.purchaseVIPLevel]}
                          </span>
                        )}
                        {customer.storedValueLevel !== StoredValueLevel.NONE && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${storedValueColors[customer.storedValueLevel]}`}
                          >
                            {storedValueLabels[customer.storedValueLevel]}
                          </span>
                        )}
                        {customer.isStockholder && (
                          <span className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium flex items-center gap-1">
                            <Crown size={10} />
                            股东
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500 mb-2 flex-wrap">
                        <span className="flex items-center gap-1">
                          <Phone size={14} />
                          {customer.phone}
                        </span>
                        <span>
                          {customer.gender === 'male' ? '男' : customer.gender === 'female' ? '女' : '其他'} · {customer.age}岁
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar size={14} />
                          消费 {customer.visitCount} 次
                        </span>
                        <span className="flex items-center gap-1 text-orange-600">
                          <Wallet size={14} />
                          ¥{customer.totalSpent}
                        </span>
                        {/* 距上次到店天数 */}
                        <span className="flex items-center gap-1 text-gray-500">
                          <Clock size={14} />
                          上次到店：{customer.daysSinceLastVisit ?? '-'} 天前
                        </span>
                        {/* 流失风险徽标 */}
                        {customer.churnRisk === 'high' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-medium">
                            <AlertTriangle size={12} />
                            高流失风险
                          </span>
                        )}
                        {customer.churnRisk === 'medium' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700 font-medium">
                            <Bell size={12} />
                            需关注
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {customer.tags.map((tag) => (
                          <span key={tag} className={`px-2 py-1 rounded-full text-xs ${tagColors[tag]}`}>
                            {tagLabels[tag]}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewingCustomer(customer);
                      }}
                      className="p-2 hover:bg-orange-50 rounded-lg transition-colors text-orange-500"
                      title="查看详情"
                    >
                      <ChevronRight size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500 py-12">
            <User size={48} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">暂无匹配的客户</p>
            <button
              onClick={resetFilters}
              className="mt-3 px-4 py-2 text-sm bg-orange-50 text-orange-600 rounded-xl hover:bg-orange-100 transition-colors"
            >
              重置筛选
            </button>
          </div>
        )}
      </div>

      {/* 客户详情弹窗 */}
      {viewingCustomer && (
        <div className="fixed inset-0 bg-black/50 flex items-start md:items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-5 md:p-6 w-full max-w-2xl my-8 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-gray-800">客户详情</h3>
              <button
                onClick={() => setViewingCustomer(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* 头部信息 */}
            <div className="flex flex-col items-center mb-5 pb-5 border-b border-gray-100">
              <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mb-3">
                <UserCircle size={64} className="text-orange-500" />
              </div>
              <h4 className="text-xl font-bold text-gray-800">{viewingCustomer.name}</h4>
              <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
                {viewingCustomer.purchaseVIPLevel !== PurchaseVIPLevel.REGULAR && (
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${purchaseVIPColors[viewingCustomer.purchaseVIPLevel]}`}>
                    {purchaseVIPLabels[viewingCustomer.purchaseVIPLevel]}
                  </span>
                )}
                {viewingCustomer.storedValueLevel !== StoredValueLevel.NONE && (
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${storedValueColors[viewingCustomer.storedValueLevel]}`}>
                    {storedValueLabels[viewingCustomer.storedValueLevel]}
                  </span>
                )}
                {viewingCustomer.isStockholder && (
                  <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium flex items-center gap-1">
                    <Crown size={12} />
                    股东
                  </span>
                )}
              </div>
            </div>

            {/* 基本信息 */}
            <div className="space-y-3 mb-5">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-2 text-sm">
                  <Phone size={16} />
                  联系电话
                </span>
                <span className="font-medium text-gray-800">{viewingCustomer.phone}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500 text-sm">性别 / 年龄</span>
                <span className="font-medium text-gray-800">
                  {viewingCustomer.gender === 'male' ? '男' : viewingCustomer.gender === 'female' ? '女' : '其他'} ·{' '}
                  {viewingCustomer.age}岁
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-2 text-sm">
                  <Calendar size={16} />
                  消费次数
                </span>
                <span className="font-medium text-gray-800">{viewingCustomer.visitCount}次</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-2 text-sm">
                  <Wallet size={16} />
                  累计消费
                </span>
                <span className="font-bold text-orange-500">¥{viewingCustomer.totalSpent}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-2 text-sm">
                  <Wallet size={16} />
                  储值余额
                </span>
                <span className="font-bold text-green-500">¥{viewingCustomer.storedValueBalance}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-gray-500 flex items-center gap-2 text-sm">
                  <Star size={16} />
                  积分
                </span>
                <span className="font-medium text-gray-800">{viewingCustomer.points}分</span>
              </div>
              {viewingCustomer.isStockholder && (
                <>
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500 text-sm">推荐提成比例</span>
                    <span className="font-medium text-purple-600">
                      {(viewingCustomer.referralBonusRate || 0) * 100}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-100">
                    <span className="text-gray-500 text-sm">累计推荐收益</span>
                    <span className="font-medium text-green-500">
                      ¥{viewingCustomer.referralEarnings || 0}
                    </span>
                  </div>
                </>
              )}
            </div>

            {/* 服务标签 */}
            <div className="mb-5">
              <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2 text-sm">
                <Tag size={16} className="text-orange-500" />
                服务标签
              </h4>
              <div className="flex flex-wrap gap-2">
                {viewingCustomer.tags.map((tag) => (
                  <span key={tag} className={`px-3 py-1 rounded-full text-sm ${tagColors[tag]}`}>
                    {tagLabels[tag]}
                  </span>
                ))}
              </div>
            </div>

            {/* 会员权益 - 双轨体系 */}
            {(viewingCustomer.purchaseVIPLevel !== PurchaseVIPLevel.REGULAR ||
              viewingCustomer.storedValueLevel !== StoredValueLevel.NONE) && (
              <div className="mb-5">
                <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2 text-sm">
                  <Gift size={16} className="text-orange-500" />
                  会员权益
                </h4>
                <div className="space-y-3">
                  {viewingCustomer.purchaseVIPLevel !== PurchaseVIPLevel.REGULAR && (
                    <div className="bg-purple-50 rounded-xl p-4 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-purple-800">
                          {purchaseVIPPlans.find((p) => p.level === viewingCustomer.purchaseVIPLevel)?.name}
                        </span>
                        <span className="font-bold text-purple-600">
                          {(purchaseVIPPlans.find((p) => p.level === viewingCustomer.purchaseVIPLevel)?.discount || 1) * 10} 折
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {purchaseVIPPlans
                          .find((p) => p.level === viewingCustomer.purchaseVIPLevel)
                          ?.benefits.map((benefit, i) => (
                            <span key={i} className="px-2 py-1 bg-white text-purple-700 rounded-full text-xs">
                              {benefit}
                            </span>
                          ))}
                      </div>
                    </div>
                  )}
                  {viewingCustomer.storedValueLevel !== StoredValueLevel.NONE && (
                    <div className="bg-green-50 rounded-xl p-4 space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-green-800">
                          {storedValuePlans.find((p) => p.level === viewingCustomer.storedValueLevel)?.name}
                        </span>
                        <span className="font-bold text-green-600">
                          折上折再享 {(storedValuePlans.find((p) => p.level === viewingCustomer.storedValueLevel)?.discount || 1) * 10} 折
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {storedValuePlans
                          .find((p) => p.level === viewingCustomer.storedValueLevel)
                          ?.benefits.map((benefit, i) => (
                            <span key={i} className="px-2 py-1 bg-white text-green-700 rounded-full text-xs">
                              {benefit}
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
              <div className="mb-5 border border-gray-200 rounded-xl p-4 bg-gray-50">
                <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2 text-sm">
                  <UserCircle size={16} className="text-orange-500" />
                  客户画像
                  <span className="text-xs text-gray-400 font-normal">
                    (由 {viewingCustomer.profile.updatedByName} 更新)
                  </span>
                </h4>
                <div className="space-y-3 text-sm">
                  {viewingCustomer.profile.haircutStyles.length > 0 && (
                    <div>
                      <span className="text-gray-500">发型偏好：</span>
                      <div className="inline-flex flex-wrap gap-1 mt-1">
                        {viewingCustomer.profile.haircutStyles.map((s) => (
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
                        {viewingCustomer.profile.hairColors.map((s) => (
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
                        {viewingCustomer.profile.permColors.map((s) => (
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
                        {viewingCustomer.profile.treatments.map((s) => (
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
                      <span className="font-medium ml-1 text-gray-700">
                        {hairTypeLabels[viewingCustomer.profile.hairType]}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">发长：</span>
                      <span className="font-medium ml-1 text-gray-700">
                        {hairLengthLabels[viewingCustomer.profile.hairLength]}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">到店频率：</span>
                      <span className="font-medium ml-1 text-gray-700">
                        {visitFrequencyLabels[viewingCustomer.profile.visitFrequency]}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">预算范围：</span>
                      <span className="font-medium ml-1 text-gray-700">
                        {budgetRangeLabels[viewingCustomer.profile.budgetRange]}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">沟通风格：</span>
                      <span className="font-medium ml-1 text-gray-700">
                        {communicationStyleLabels[viewingCustomer.profile.communicationStyle]}
                      </span>
                    </div>
                  </div>
                  {viewingCustomer.profile.extraServices.length > 0 && (
                    <div>
                      <span className="text-gray-500">附加服务：</span>
                      <div className="inline-flex flex-wrap gap-1 mt-1">
                        {viewingCustomer.profile.extraServices.map((s) => (
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
                        {viewingCustomer.profile.visitTimes.map((s) => (
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
                      <span className="font-medium ml-1 text-gray-700">{viewingCustomer.profile.notes}</span>
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
              <div className="mb-5">
                <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2 text-sm">
                  <ClipboardList size={16} className="text-orange-500" />
                  到店记录 ({viewingCustomer.visitRecords.length}次)
                </h4>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {viewingCustomer.visitRecords.map((record) => (
                    <div key={record.id} className="border border-gray-200 rounded-lg p-3 text-sm bg-white">
                      <div className="flex justify-between items-start mb-1">
                        <div>
                          <span className="font-medium text-gray-800">{record.stylistName}</span>
                          <span className="text-gray-400 mx-2">·</span>
                          <span className="text-gray-500 text-xs">
                            {new Date(record.checkInTime).toLocaleDateString('zh-CN')}
                          </span>
                        </div>
                        <span className="text-orange-500 font-bold">¥{record.totalAmount}</span>
                      </div>
                      <div className="text-gray-600 text-xs flex items-center gap-1">
                        <Scissors size={12} />
                        {record.serviceNames.join('、')}
                      </div>
                      {record.products && record.products.length > 0 && (
                        <div className="text-gray-500 text-xs mt-1 flex items-center gap-1">
                          <Palette size={12} />
                          购买：{record.products.map((p) => p.name).join('、')}
                        </div>
                      )}
                      {record.notes && (
                        <div className="text-gray-400 text-xs mt-1">备注：{record.notes}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 客户来源 */}
            {viewingCustomer.source && (
              <div className="mb-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500 flex items-center gap-2">
                    <MapPin size={16} />
                    客户来源
                  </span>
                  <span className="font-medium text-gray-800">{viewingCustomer.source}</span>
                </div>
              </div>
            )}

            {/* 底部按钮 */}
            <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
              <button
                onClick={() => setViewingCustomer(null)}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors text-sm font-medium"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  setShowEdit(viewingCustomer);
                  setViewingCustomer(null);
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl transition-colors text-sm font-medium"
              >
                <Edit size={16} />
                编辑信息
              </button>
              <button
                onClick={() => {
                  navigate(`/shop/customer-profile/${viewingCustomer.id}`);
                  setViewingCustomer(null);
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-colors text-sm font-medium"
              >
                <UserCircle size={16} />
                {viewingCustomer.profile ? '编辑画像' : '新建画像'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 添加/编辑客户表单弹窗 */}
      {(showAdd || showEdit) && (
        <div className="fixed inset-0 bg-black/50 flex items-start md:items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg my-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <User size={24} className="text-orange-500" />
                {showAdd ? '添加新客户' : '编辑客户信息'}
              </h3>
              <button
                onClick={() => { if (showEdit) setShowEdit(null); else setShowAdd(false); }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>

            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">客户称呼 *</label>
                  <input id="cm-name" defaultValue={showEdit?.name || ''} placeholder="请输入姓名" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">联系方式 *</label>
                  <input id="cm-phone" defaultValue={showEdit?.phone || ''} placeholder="请输入手机号" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">性别</label>
                  <select id="cm-gender" defaultValue={showEdit?.gender || 'other'} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm bg-white">
                    <option value="male">男</option>
                    <option value="female">女</option>
                    <option value="other">其他</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">年龄</label>
                  <input id="cm-age" type="number" defaultValue={showEdit?.age || ''} placeholder="请输入年龄" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">生日</label>
                  <input id="cm-birthday" type="date" defaultValue={showEdit?.birthday ? new Date(showEdit.birthday).toISOString().split('T')[0] : ''} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">购买型 VIP 等级</label>
                  <select id="cm-purchase-vip" defaultValue={showEdit?.purchaseVIPLevel || PurchaseVIPLevel.REGULAR} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm bg-white">
                    <option value={PurchaseVIPLevel.REGULAR}>普通用户</option>
                    <option value={PurchaseVIPLevel.BRONZE}>普卡 VIP</option>
                    <option value={PurchaseVIPLevel.SILVER}>银卡 VIP</option>
                    <option value={PurchaseVIPLevel.GOLD}>金卡 VIP</option>
                    <option value={PurchaseVIPLevel.DIAMOND}>钻石 VIP</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">储值会员等级</label>
                  <select id="cm-stored-value" defaultValue={showEdit?.storedValueLevel || StoredValueLevel.NONE} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm bg-white">
                    <option value={StoredValueLevel.NONE}>未储值</option>
                    <option value={StoredValueLevel.STORE_500}>储值卡 500</option>
                    <option value={StoredValueLevel.STORE_1000}>安心卡 1000</option>
                    <option value={StoredValueLevel.STORE_2000}>顺心卡 2000</option>
                    <option value={StoredValueLevel.STORE_5000}>随心卡 5000</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">储值余额</label>
                  <input id="cm-stored-balance" type="number" defaultValue={showEdit?.storedValueBalance ?? ''} placeholder="0" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">客户来源</label>
                <input id="cm-source" defaultValue={showEdit?.source || ''} placeholder="如：朋友推荐、线上推广、路过等" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none text-sm" />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                onClick={() => { if (showEdit) setShowEdit(null); else setShowAdd(false); }}
                className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors text-sm font-medium"
              >
                取消
              </button>
              <button
                onClick={async () => {
                  const name = (document.getElementById('cm-name') as HTMLInputElement)?.value;
                  const phone = (document.getElementById('cm-phone') as HTMLInputElement)?.value;
                  if (!name || !phone) { alert('请填写客户姓名和电话！'); return; }
                  const data: Partial<Customer> = {
                    name,
                    phone,
                    gender: (document.getElementById('cm-gender') as HTMLSelectElement)?.value as 'male' | 'female' | 'other',
                    age: parseInt((document.getElementById('cm-age') as HTMLInputElement)?.value) || undefined,
                    birthday: (document.getElementById('cm-birthday') as HTMLInputElement)?.value ? new Date((document.getElementById('cm-birthday') as HTMLInputElement).value) : undefined,
                    purchaseVIPLevel: (document.getElementById('cm-purchase-vip') as HTMLSelectElement)?.value as PurchaseVIPLevel,
                    storedValueLevel: (document.getElementById('cm-stored-value') as HTMLSelectElement)?.value as StoredValueLevel,
                    storedValueBalance: parseFloat((document.getElementById('cm-stored-balance') as HTMLInputElement)?.value) || 0,
                    source: (document.getElementById('cm-source') as HTMLInputElement)?.value,
                  };
                  if (showEdit) {
                    await handleUpdateCustomer({ ...showEdit, ...data });
                  } else {
                    await handleAddCustomer(data);
                  }
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl transition-all text-sm font-medium shadow-md"
              >
                <Plus size={16} />
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </ShopLayout>
  );
};

export default CustomerManagement;
