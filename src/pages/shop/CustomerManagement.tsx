import React, { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { Customer, CustomerTag, MembershipLevel, PurchaseVIPLevel, StoredValueLevel } from '../../../shared/types';
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
import { purchaseVIPPlans, storedValuePlans } from '../../../shared/membershipPlans';
import {
  canCreateCustomer,
  canEditCustomer,
  canExportCustomers,
  canDeleteCustomer,
  filterCustomersByRole,
  getCustomerDataScope,
} from '../../../shared/permissions';
import { customerApi } from '../../api';
import { useAppStore } from '../../store';
import ShopLayout from './ShopLayout';
import { useCustomerDirectory } from '../../hooks/useCustomerDirectory';
import CustomerEditor from '../../components/CustomerEditor';
import CustomerTableView from '../../components/CustomerTableView';
import { customerColumns, exportCustomers } from '../../lib/customerPresentation';
import { UserRole } from '../../../shared/types';

const CustomerManagement: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTag, setActiveTag] = useState<CustomerTag | 'all'>('all');
  const [activePurchaseLevel, setActivePurchaseLevel] = useState<PurchaseVIPLevel | 'all'>('all');
  const [activeStoredLevel, setActiveStoredLevel] = useState<StoredValueLevel | 'all'>('all');
  const [viewingId, setViewingId] = useState<string | null>(null);
  const setViewingCustomer = (customer: Customer | null) => setViewingId(customer?.id || null);
  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState<Customer | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterMember, setFilterMember] = useState('all');
  const [filterBooking, setFilterBooking] = useState('all');
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { currentEmployee, currentShop, userRole } = useAppStore();

  const scope = currentEmployee ? [currentEmployee.id, currentShop?.id, userRole].join(':') : '';
  const {customers, loading, error, syncing, syncedAt, refresh: fetchCustomers} = useCustomerDirectory(scope);
  const [detail, setDetail] = useState<Customer | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const directoryCustomer = customers.find(customer => customer.id === viewingId) || null;
  const detailReady = !!viewingId && detail?.id === viewingId;
  const viewingCustomer = directoryCustomer && detailReady
    ? { ...detail, ...directoryCustomer, profile: detail.profile, visitRecords: detail.visitRecords }
    : directoryCustomer;
  React.useEffect(() => {
    if (!viewingId || !scope) { setDetail(null); setDetailError(null); setDetailLoading(false); return; }
    let cancelled = false;
    setDetail(null); setDetailError(null); setDetailLoading(true);
    void customerApi.getById(viewingId).then(customer => {
      if (!cancelled) {
        if (customer) setDetail(customer);
        else setDetailError('客户完整档案未找到，请稍后重试');
      }
    }).catch(err => {
      if (!cancelled) setDetailError(err instanceof Error ? err.message : '完整档案加载失败');
    }).finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [viewingId, scope]);
  const countText = (count: number) => syncedAt ? count : '—';
  const canUseTable = [UserRole.CEO,UserRole.CUSTOMER_SERVICE,UserRole.SHOP_MANAGER].includes(userRole as UserRole);
  const tableView = canUseTable && searchParams.get('view') === 'table';
  React.useEffect(() => { setShowEdit(null);setShowAdd(false);setViewingId(null);setActionError(null); }, [scope]);
  const handleSave = async (patch: Partial<Customer>) => {
    try {
      if (showEdit) await customerApi.update(showEdit.id, patch, showEdit);
      else await customerApi.create(patch);
    } catch (err) { await fetchCustomers(); throw err; }
    setShowEdit(null);setShowAdd(false);
    await fetchCustomers(false);
  };
  const runAccountAction = async (action: () => Promise<void>) => {
    if (accountBusy || error || loading) return;
    setAccountBusy(true);setActionError(null);
    try { await action(); await fetchCustomers(false); }
    catch(err) { setActionError(err instanceof Error ? err.message : '操作失败'); }
    finally { setAccountBusy(false); }
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

  // 计算筛选后的客户（按角色过滤可见范围）
  const filteredCustomers = useMemo(() => {
    const base = filterCustomersByRole(customers, userRole, currentEmployee?.id);

    return base.filter((c) => {
      const matchesSearch =
        searchTerm === '' ||
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm) ||
        [c.wechat,c.idCardNumber,c.lastStylist,c.visitRecords?.[0]?.stylistName].some(value => value?.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesTag =
        activeTag === 'all' || (c.tags || []).includes(activeTag);

      const matchesPurchase =
        activePurchaseLevel === 'all' || c.purchaseVIPLevel === activePurchaseLevel;

      const matchesStored =
        activeStoredLevel === 'all' || c.storedValueLevel === activeStoredLevel;

      const member = !!c.isStockholder || (c.purchaseVIPLevel || PurchaseVIPLevel.REGULAR) !== PurchaseVIPLevel.REGULAR || (c.storedValueLevel || StoredValueLevel.NONE) !== StoredValueLevel.NONE;
      const levelMatch = filterLevel === 'all' || (filterLevel==='stockholder' && c.isStockholder) || (filterLevel==='purchase' && (c.purchaseVIPLevel || PurchaseVIPLevel.REGULAR)!==PurchaseVIPLevel.REGULAR) || (filterLevel==='stored' && (c.storedValueLevel || StoredValueLevel.NONE)!==StoredValueLevel.NONE) || (filterLevel==='regular' && !member);
      const memberMatch = filterMember === 'all' || (filterMember==='member' && member) || (filterMember==='non-member' && !member) || (filterMember==='recharged' && c.hasRecharged===true);
      const bookingMatch = filterBooking === 'all' || (filterBooking==='with-booking' && c.hasBooking) || (filterBooking==='without-booking' && !c.hasBooking) || (filterBooking==='referred' && c.isReferred);
      return matchesSearch && matchesTag && matchesPurchase && matchesStored && levelMatch && memberMatch && bookingMatch;
    });
  }, [customers, searchTerm, activeTag, activePurchaseLevel, activeStoredLevel, userRole, currentEmployee, filterLevel, filterMember, filterBooking]);

  // 统计（按角色限定统计范围）
  const stats = useMemo(() => {
    const base = getCustomerDataScope(userRole) === 'own' ? filteredCustomers : customers;
    const totalMembers = base.filter(
      (c) => c.isStockholder || (c.purchaseVIPLevel || PurchaseVIPLevel.REGULAR) !== PurchaseVIPLevel.REGULAR || (c.storedValueLevel || StoredValueLevel.NONE) !== StoredValueLevel.NONE
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
        value: base.filter((c) => (c.purchaseVIPLevel || PurchaseVIPLevel.REGULAR) !== PurchaseVIPLevel.REGULAR).length,
        icon: Star,
        color: 'text-blue-500',
      },
      {
        label: '储值会员',
        value: base.filter((c) => (c.storedValueLevel || StoredValueLevel.NONE) !== StoredValueLevel.NONE).length,
        icon: Wallet,
        color: 'text-green-500',
      },
    ];
  }, [customers, filteredCustomers, userRole]);

  const handleExportCSV = () => { if (!error && !loading && canExportCustomers(userRole)) exportCustomers(filteredCustomers); };

  const canExport = canExportCustomers(userRole) && !loading && !error;

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
    setFilterLevel('all');setFilterMember('all');setFilterBooking('all');
  };

  return (
    <ShopLayout title="客户管理">
      <div className="bg-white border rounded-xl p-4 mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" role="group" aria-label="客户显示方式">
          <button aria-pressed={!tableView} onClick={()=>{const next=new URLSearchParams(searchParams);next.delete('view');setSearchParams(next,{replace:true});}} className={!tableView?'rounded-lg px-4 py-2 bg-orange-500 text-white':'rounded-lg px-4 py-2 bg-gray-100'}>日常视图</button>
          {canUseTable && <button aria-pressed={tableView} onClick={()=>{const next=new URLSearchParams(searchParams);next.set('view','table');setSearchParams(next,{replace:true});}} className={tableView?'rounded-lg px-4 py-2 bg-orange-500 text-white':'rounded-lg px-4 py-2 bg-gray-100'}>表格视图</button>}
        </div>
        <p role="status" className="text-sm text-gray-600">{error ? '同步失败，暂停编辑和导出' : syncing ? '正在同步客户数据…' : syncedAt ? '最近同步：'+new Date(syncedAt).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）' : '正在载入'}<br/>同页两视图共用数据；其他操作员变更每分钟检查，返回页面时同步。</p>
      </div>
      {actionError && <p role="alert" className="mb-4 rounded-lg bg-red-50 text-red-700 p-3">{actionError}</p>}

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
                  <div className="text-2xl font-bold text-gray-800">{countText(stat.value)}</div>
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
              placeholder="搜索姓名、电话、微信、设计师…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
            />
          </div>
          <button
            onClick={() => { void fetchCustomers(); }}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-3 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl transition-colors text-sm disabled:opacity-50"
          >
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
            {syncing ? '同步中…' : '刷新'}
          </button>
          {canCreateCustomer(userRole) && !loading && !error && (
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl transition-all text-sm font-medium shadow-md"
            >
              <Plus size={16} />
              添加客户
            </button>
          )}
          {(activeTag !== 'all' || activePurchaseLevel !== 'all' || activeStoredLevel !== 'all' || searchTerm !== '' || filterLevel !== 'all' || filterMember !== 'all' || filterBooking !== 'all') && (
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
            <span className="text-gray-400">共 {countText(filteredCustomers.length)} 位客户</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <label className="text-sm">客户类型 <select aria-label="客户类型" className="border rounded-lg p-2" value={filterLevel} onChange={e=>setFilterLevel(e.target.value)}>{[['all','全部'],['stockholder','股东'],['purchase','购买型VIP'],['stored','储值会员'],['regular','普通客户']].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
        <label className="text-sm">会员筛选 <select aria-label="会员筛选" className="border rounded-lg p-2" value={filterMember} onChange={e=>setFilterMember(e.target.value)}>{[['all','全部'],['member','会员'],['non-member','非会员'],['recharged','档案标记已充值']].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
        <label className="text-sm">预约与来源 <select aria-label="预约与来源" className="border rounded-lg p-2" value={filterBooking} onChange={e=>setFilterBooking(e.target.value)}>{[['all','全部'],['with-booking','有预约'],['without-booking','无预约'],['referred','转介绍']].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
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
            <div className="text-xl md:text-2xl font-bold">{countText(filteredCustomers.length)}</div>
            <div className="text-sm font-medium mt-1">全部客户</div>
          </button>
          {Object.entries(tagLabels).map(([key, label]) => {
            const count = filteredCustomers.filter((c) => (c.tags || []).includes(key as CustomerTag)).length;
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
            <div className="text-xl md:text-2xl font-bold">{countText(filteredCustomers.length)}</div>
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
                <div className="text-xl md:text-2xl font-bold">{countText(count)}</div>
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
            <div className="text-xl md:text-2xl font-bold">{countText(filteredCustomers.length)}</div>
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
                <div className="text-xl md:text-2xl font-bold">{countText(count)}</div>
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
            <span className="text-sm font-normal text-gray-500">({countText(filteredCustomers.length)})</span>
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
            <p className="text-sm mb-4">客户资料未同步；这不代表客户数量为零。{error}</p>
            <button
              onClick={() => { void fetchCustomers(); }}
              className="px-4 py-2 bg-orange-500 text-white rounded-xl hover:bg-orange-600 transition-colors text-sm"
            >
              重试
            </button>
          </div>
        )}

        {/* 客户列表 */}
        {!loading && !error && (filteredCustomers.length > 0 ? (tableView ? <CustomerTableView customers={filteredCustomers} role={userRole} onView={setViewingCustomer} onEdit={setShowEdit} /> : (
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
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
                        {(customer.purchaseVIPLevel || PurchaseVIPLevel.REGULAR) !== PurchaseVIPLevel.REGULAR && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${purchaseVIPColors[customer.purchaseVIPLevel]}`}
                          >
                            {purchaseVIPLabels[customer.purchaseVIPLevel]}
                          </span>
                        )}
                        {(customer.storedValueLevel || StoredValueLevel.NONE) !== StoredValueLevel.NONE && (
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
                      <div className="overflow-x-auto mb-2">
                        <div className="flex items-center gap-4 text-sm text-gray-500 whitespace-nowrap min-w-max">
                          <span className="flex items-center gap-1">
                            <Phone size={14} />
                            {customer.phone}
                          </span>
                          <span>
                            {customer.gender === 'male' ? '男' : customer.gender === 'female' ? '女' : '其他'} · {customer.age == null ? '年龄未记录' : customer.age+'岁'}
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
                            上次到店：{customer.lastVisitAt ? Math.floor((Date.now()-new Date(customer.lastVisitAt).getTime())/86400000) : '-'} 天前
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
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(customer.tags || []).map((tag) => (
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
        )) : (
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
        ))}
      </div>

      {/* 客户详情弹窗 */}
      {viewingCustomer && (
        <div role="dialog" aria-modal="true" aria-label="客户详情" className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-5 md:p-6 w-full max-w-2xl my-8 shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-xl font-bold text-gray-800">客户详情</h3>
              <button
                onClick={() => setViewingCustomer(null)}
                aria-label="关闭详情"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex flex-wrap gap-3 mb-4">
              {canEditCustomer(userRole) && <button disabled={accountBusy || !!error || loading} className="rounded-lg bg-blue-50 text-blue-700 px-3 py-2 disabled:opacity-50" onClick={()=>{if(window.confirm('确认重置此顾客密码为手机号后六位？请可靠告知本人。')) void runAccountAction(()=>customerApi.resetPassword(viewingCustomer.id));}}>重置顾客密码</button>}
              <button disabled={accountBusy || !!error || loading || viewingCustomer.identityVerified} className="rounded-lg bg-green-50 text-green-700 px-3 py-2 disabled:opacity-50" onClick={()=>{if(window.confirm('请确认顾客本人已到店，并已人工核实其手机号和档案。确认完成核实？')) void runAccountAction(()=>customerApi.verifyIdentity(viewingCustomer.id));}}>{viewingCustomer.identityVerified?'顾客本人已核实':'确认顾客本人'}</button>
            </div>
            {actionError && <p role="alert" className="text-red-700 mb-4">{actionError}</p>}
            {error && <p role="alert" className="text-red-700 mb-4">同步失败，当前详情为上次快照，暂停修改。请关闭后刷新。</p>}
            {detailLoading && <p role="status" className="text-gray-600 mb-4">正在加载完整档案和到店记录…</p>}
            {detailError && <p role="alert" className="text-red-700 mb-4">{detailError}，请关闭后重试。</p>}
            {/* 头部信息 */}
            <div className="flex flex-col items-center mb-5 pb-5 border-b border-gray-100">
              <div className="w-20 h-20 rounded-full bg-orange-100 flex items-center justify-center mb-3">
                <UserCircle size={64} className="text-orange-500" />
              </div>
              <h4 className="text-xl font-bold text-gray-800">{viewingCustomer.name}</h4>
              <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
                {(viewingCustomer.purchaseVIPLevel || PurchaseVIPLevel.REGULAR) !== PurchaseVIPLevel.REGULAR && (
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${purchaseVIPColors[viewingCustomer.purchaseVIPLevel]}`}>
                    {purchaseVIPLabels[viewingCustomer.purchaseVIPLevel]}
                  </span>
                )}
                {(viewingCustomer.storedValueLevel || StoredValueLevel.NONE) !== StoredValueLevel.NONE && (
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
                  {viewingCustomer.age == null ? '年龄未记录' : viewingCustomer.age+'岁'}
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
                {(viewingCustomer.tags || []).map((tag) => (
                  <span key={tag} className={`px-3 py-1 rounded-full text-sm ${tagColors[tag]}`}>
                    {tagLabels[tag]}
                  </span>
                ))}
              </div>
            </div>

            {/* 会员权益 - 双轨体系 */}
            {((viewingCustomer.purchaseVIPLevel || PurchaseVIPLevel.REGULAR) !== PurchaseVIPLevel.REGULAR ||
              (viewingCustomer.storedValueLevel || StoredValueLevel.NONE) !== StoredValueLevel.NONE) && (
              <div className="mb-5">
                <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2 text-sm">
                  <Gift size={16} className="text-orange-500" />
                  会员权益
                </h4>
                <div className="space-y-3">
                  {(viewingCustomer.purchaseVIPLevel || PurchaseVIPLevel.REGULAR) !== PurchaseVIPLevel.REGULAR && (
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
                  {(viewingCustomer.storedValueLevel || StoredValueLevel.NONE) !== StoredValueLevel.NONE && (
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
            {detailReady && viewingCustomer.profile && (
              <div className="mb-5 border border-gray-200 rounded-xl p-4 bg-gray-50">
                <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2 text-sm">
                  <UserCircle size={16} className="text-orange-500" />
                  客户画像
                  <span className="text-xs text-gray-400 font-normal">
                    (由 {viewingCustomer.profile.updatedByName} 更新)
                  </span>
                </h4>
                <div className="space-y-3 text-sm">
                  {(viewingCustomer.profile.haircutStyles || []).length > 0 && (
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
                  {(viewingCustomer.profile.hairColors || []).length > 0 && (
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
                  {(viewingCustomer.profile.permColors || []).length > 0 && (
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
                  {(viewingCustomer.profile.treatments || []).length > 0 && (
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
                  {(viewingCustomer.profile.extraServices || []).length > 0 && (
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
                  {(viewingCustomer.profile.visitTimes || []).length > 0 && (
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
            {detailReady && viewingCustomer.visitRecords && viewingCustomer.visitRecords.length > 0 && (
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

            <details className="mb-5"><summary className="cursor-pointer font-bold text-gray-700">完整档案与转介绍资料</summary><dl className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-sm">{customerColumns.map(column=><div key={column.label}><dt className="text-gray-500">{column.label}</dt><dd className="break-words">{column.value(viewingCustomer)}</dd></div>)}<div><dt className="text-gray-500">身份证号</dt><dd>{viewingCustomer.idCardNumber || '—'}</dd></div></dl></details>
            {canDeleteCustomer(userRole) && <button disabled={accountBusy || !!error || loading} className="text-red-600 mb-4 disabled:opacity-50" onClick={()=>{if(window.confirm('确定删除此客户档案吗？关联历史数据可能受影响，请谨慎确认。')) void runAccountAction(async()=>{await customerApi.delete(viewingCustomer.id);setViewingId(null);});}}>删除客户</button>}
            {/* 底部按钮 */}
            <div className="flex gap-3 justify-end pt-4 border-t border-gray-100">
              <button
                onClick={() => setViewingCustomer(null)}
                className="flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors text-sm font-medium"
              >
                关闭
              </button>
              {canEditCustomer(userRole) && !error && !loading && (
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
              )}
              {canEditCustomer(userRole) && !error && !loading && (
                <button
                  onClick={() => {
                    navigate(`/shop/customer-profile/${viewingCustomer.id}`);
                    setViewingCustomer(null);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-colors text-sm font-medium"
                >
                  <UserCircle size={16} />
                  {detailReady ? (viewingCustomer.profile ? '编辑画像' : '新建画像') : '查看画像'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 添加/编辑客户表单弹窗 */}
      {(showEdit || showAdd) && <CustomerEditor key={(showEdit?.id || 'add')+':'+editorVersion} customer={showEdit || undefined}
        latest={customers.find(customer=>customer.id===showEdit?.id)} enabled={!error && !loading && (!showEdit || customers.some(customer=>customer.id===showEdit.id))}
        onClose={()=>{setShowEdit(null);setShowAdd(false);}}
        onReload={()=>{const latest=customers.find(customer=>customer.id===showEdit?.id);if(latest){setShowEdit(latest);setEditorVersion(value=>value+1);}}}
        onSave={handleSave} />}
    </ShopLayout>
  );
};

export default CustomerManagement;
