import React, { useState, useMemo } from 'react';
import {
  User,
  Search,
  Plus,
  Edit,
  Eye,
  Trash2,
  Download,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Calendar,
  Phone,
  MapPin,
  CreditCard,
  Crown,
  Star,
  Wallet,
  Gift,
  Check,
  X,
  FileText,
  Users,
  TrendingUp,
  AlertTriangle,
  Bell,
} from 'lucide-react';
import { Customer, MembershipLevel, CustomerTag } from '../../../shared/types';
import { mockCustomers } from '../../../shared/mockData';
import ShopLayout from './ShopLayout';

// 扩展客户数据，添加表格需要的字段
const customersWithExtendedFields: Customer[] = mockCustomers.map((c, index) => ({
  ...c,
  wechat: `wechat_${c.id}`,
  idCardNumber: `110101${1990 + index}0101${1000 + index}`,
  hobbies: index % 2 === 0 ? '喜欢时尚造型、关注发型趋势' : '偏好自然风格',
  lastServiceItems: c.visitRecords?.[0]?.serviceNames || ['精剪'],
  lastServiceAmount: c.visitRecords?.[0]?.totalAmount || 0,
  hasBooking: index % 3 === 0,
  lastStylist: c.visitRecords?.[0]?.stylistName || '李明',
  isMember: c.membershipLevel !== MembershipLevel.REGULAR,
  hasRecharged: c.balance > 0,
  rechargeLevel: c.balance > 1000 ? '金卡' : c.balance > 0 ? '银卡' : '',
  isReferred: !!c.source && c.source.includes('推荐'),
  referrerName: index % 4 === 0 ? '王美丽' : '',
  referrerPhone: index % 4 === 0 ? '13900001234' : '',
  referralConsumption: index % 4 === 0 ? 2580 : 0,
  sharedFund: c.isStockholder ? (c.totalSpent * 0.05) : 0,
  totalSharedFund: c.isStockholder ? (c.totalSpent * 0.1) : 0,
  withdrawableAmount: c.isStockholder ? (c.totalSpent * 0.08) : 0,
}));

const CustomerTableManagement: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [customers, setCustomers] = useState<Customer[]>(customersWithExtendedFields);
  const [showDetail, setShowDetail] = useState<Customer | null>(null);
  const [showEdit, setShowEdit] = useState<Customer | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterMember, setFilterMember] = useState<string>('all');
  const [filterBooking, setFilterBooking] = useState<string>('all');

  // 计算统计数据
  const stats = useMemo(() => {
    const totalCustomers = customers.length;
    const totalMembers = customers.filter(c => c.isMember).length;
    const totalStockholders = customers.filter(c => c.isStockholder).length;
    const totalRevenue = customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0);
    const totalBalance = customers.reduce((sum, c) => sum + (c.balance || 0), 0);
    const totalSharedFund = customers.reduce((sum, c) => sum + (c.totalSharedFund || 0), 0);
    const totalWithdrawable = customers.reduce((sum, c) => sum + (c.withdrawableAmount || 0), 0);
    const withBooking = customers.filter(c => c.hasBooking).length;
    const referredCount = customers.filter(c => c.isReferred).length;
    const rechargedCount = customers.filter(c => c.hasRecharged).length;
    
    return {
      totalCustomers,
      totalMembers,
      totalStockholders,
      totalRevenue,
      totalBalance,
      totalSharedFund,
      totalWithdrawable,
      withBooking,
      referredCount,
      rechargedCount,
    };
  }, [customers]);

  // 筛选客户列表
  const filteredCustomers = useMemo(() => {
    return customers.filter(customer => {
      const matchesSearch = 
        searchTerm === '' ||
        customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.phone.includes(searchTerm) ||
        customer.wechat?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.idCardNumber?.includes(searchTerm) ||
        customer.lastStylist?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesLevel = 
        filterLevel === 'all' || 
        (filterLevel === 'stockholder' && customer.isStockholder) ||
        (filterLevel === 'premium' && customer.membershipLevel === MembershipLevel.PREMIUM) ||
        (filterLevel === 'regular' && customer.membershipLevel === MembershipLevel.REGULAR);

      const matchesMember = 
        filterMember === 'all' ||
        (filterMember === 'member' && customer.isMember) ||
        (filterMember === 'non-member' && !customer.isMember) ||
        (filterMember === 'recharged' && customer.hasRecharged);

      const matchesBooking = 
        filterBooking === 'all' ||
        (filterBooking === 'with-booking' && customer.hasBooking) ||
        (filterBooking === 'without-booking' && !customer.hasBooking) ||
        (filterBooking === 'referred' && customer.isReferred);

      return matchesSearch && matchesLevel && matchesMember && matchesBooking;
    });
  }, [customers, searchTerm, filterLevel, filterMember, filterBooking]);

  // 导出CSV - 完整24个字段
  const handleExportCSV = () => {
    const headers = [
      '序号',          // 1
      '入店日期',      // 2
      '客户称呼',      // 3
      '联系方式',      // 4
      '微信',          // 5
      '性别',          // 6
      '年龄',          // 7
      '生日',          // 8
      '爱好',          // 9
      '消费项目',      // 10
      '消费金额',      // 11
      '是否预约',      // 12
      '设计师',        // 13
      '是否会员',      // 14
      '会员级别',      // 15
      '是否充值',      // 16
      '充值级别',      // 17
      '余额',          // 18
      '是否转介绍',    // 19
      '转介绍人员',    // 20
      '转介绍消费',    // 21 - 这里之前是错误的"消费金额"
      '共享基金',      // 22
      '合计共享基金',  // 23
      '可取现金额'     // 24
    ];

    const rows = filteredCustomers.map((c, idx) => [
      idx + 1,                                                  // 1. 序号
      c.lastVisitAt ? new Date(c.lastVisitAt).toLocaleDateString('zh-CN') : '',  // 2. 入店日期
      c.name,                                                   // 3. 客户称呼
      c.phone,                                                  // 4. 联系方式
      c.wechat || '',                                           // 5. 微信
      c.gender === 'male' ? '男' : c.gender === 'female' ? '女' : '其他',  // 6. 性别
      c.age || '',                                              // 7. 年龄
      c.birthday ? new Date(c.birthday).toLocaleDateString('zh-CN') : '',  // 8. 生日
      c.hobbies || '',                                          // 9. 爱好
      c.lastServiceItems?.join('/') || '',                      // 10. 消费项目
      `¥${c.totalSpent.toLocaleString()}`,                      // 11. 消费金额
      c.hasBooking ? '是' : '否',                               // 12. 是否预约
      c.lastStylist || '',                                      // 13. 设计师
      c.isMember ? '是' : '否',                                 // 14. 是否会员
      c.isStockholder ? '股东会员' : c.membershipLevel === MembershipLevel.PREMIUM ? '高级会员' : '普通',  // 15. 会员级别
      c.hasRecharged ? '是' : '否',                             // 16. 是否充值
      c.rechargeLevel || '',                                    // 17. 充值级别
      `¥${c.balance.toLocaleString()}`,                         // 18. 余额
      c.isReferred ? '是' : '否',                               // 19. 是否转介绍
      c.referrerName || '',                                     // 20. 转介绍人员
      c.referralConsumption ? `¥${c.referralConsumption.toLocaleString()}` : '',  // 21. 转介绍消费
      c.sharedFund ? `¥${c.sharedFund.toFixed(2)}` : '',        // 22. 共享基金
      c.totalSharedFund ? `¥${c.totalSharedFund.toFixed(2)}` : '',  // 23. 合计共享基金
      c.withdrawableAmount ? `¥${c.withdrawableAmount.toFixed(2)}` : '',  // 24. 可取现金额
    ]);

    const csvContent = '\uFEFF' + [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `客户管理表_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 添加新客户
  const handleAddCustomer = (newCustomer: Partial<Customer>) => {
    const customer: Customer = {
      id: `cust${Date.now()}`,
      name: newCustomer.name || '',
      phone: newCustomer.phone || '',
      wechat: newCustomer.wechat || '',
      avatar: '',
      gender: newCustomer.gender || 'other',
      age: newCustomer.age,
      birthday: newCustomer.birthday,
      idCardNumber: newCustomer.idCardNumber,
      hobbies: newCustomer.hobbies,
      tags: [],
      visitCount: 0,
      totalSpent: 0,
      lastServiceItems: [],
      lastServiceAmount: 0,
      hasBooking: false,
      lastStylist: '',
      membershipLevel: MembershipLevel.REGULAR,
      isMember: false,
      hasRecharged: false,
      rechargeLevel: '',
      balance: 0,
      points: 0,
      isReferred: !!newCustomer.referrerName,
      referrerName: newCustomer.referrerName,
      referrerPhone: newCustomer.referrerPhone,
      referralConsumption: 0,
      sharedFund: 0,
      totalSharedFund: 0,
      withdrawableAmount: 0,
      joinedAt: new Date(),
      isStockholder: false,
    };
    setCustomers([customer, ...customers]);
    setShowAdd(false);
  };

  // 更新客户
  const handleUpdateCustomer = (updatedCustomer: Customer) => {
    setCustomers(customers.map(c => 
      c.id === updatedCustomer.id ? updatedCustomer : c
    ));
    setShowEdit(null);
  };

  // 删除客户
  const handleDeleteCustomer = (id: string) => {
    if (window.confirm('确定要删除该客户吗？')) {
      setCustomers(customers.filter(c => c.id !== id));
    }
  };

  return (
    <ShopLayout title="客户管理">
      {/* 顶部统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl shadow-sm p-4 md:p-5 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <User size={20} className="text-blue-600" />
            <span className="text-xs text-blue-500 font-medium">总客户数</span>
          </div>
          <div className="text-2xl md:text-3xl font-bold text-blue-800">{stats.totalCustomers}</div>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-2xl shadow-sm p-4 md:p-5 border border-green-200">
          <div className="flex items-center justify-between mb-2">
            <Crown size={20} className="text-green-600" />
            <span className="text-xs text-green-500 font-medium">会员数</span>
          </div>
          <div className="text-2xl md:text-3xl font-bold text-green-800">
            {stats.totalMembers} <span className="text-sm text-green-600">({stats.totalStockholders}股东)</span>
          </div>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-2xl shadow-sm p-4 md:p-5 border border-orange-200">
          <div className="flex items-center justify-between mb-2">
            <CreditCard size={20} className="text-orange-600" />
            <span className="text-xs text-orange-500 font-medium">累计消费</span>
          </div>
          <div className="text-2xl md:text-3xl font-bold text-orange-800">¥{stats.totalRevenue.toLocaleString()}</div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-2xl shadow-sm p-4 md:p-5 border border-purple-200">
          <div className="flex items-center justify-between mb-2">
            <Wallet size={20} className="text-purple-600" />
            <span className="text-xs text-purple-500 font-medium">会员余额</span>
          </div>
          <div className="text-2xl md:text-3xl font-bold text-purple-800">¥{stats.totalBalance.toLocaleString()}</div>
        </div>
      </div>

      {/* 第二行统计卡片 */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 md:gap-4 mb-6">
        <div className="bg-white rounded-xl shadow-sm p-3 md:p-4 border border-gray-100 text-center">
          <div className="text-xs text-gray-500 mb-1">有预约</div>
          <div className="text-lg md:text-xl font-bold text-yellow-600">{stats.withBooking}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-3 md:p-4 border border-gray-100 text-center">
          <div className="text-xs text-gray-500 mb-1">已充值</div>
          <div className="text-lg md:text-xl font-bold text-blue-600">{stats.rechargedCount}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-3 md:p-4 border border-gray-100 text-center">
          <div className="text-xs text-gray-500 mb-1">转介绍</div>
          <div className="text-lg md:text-xl font-bold text-green-600">{stats.referredCount}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-3 md:p-4 border border-gray-100 text-center">
          <div className="text-xs text-gray-500 mb-1">共享基金</div>
          <div className="text-lg md:text-xl font-bold text-orange-600">¥{stats.totalSharedFund.toFixed(0)}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-3 md:p-4 border border-gray-100 text-center">
          <div className="text-xs text-gray-500 mb-1">可取现</div>
          <div className="text-lg md:text-xl font-bold text-red-600">¥{stats.totalWithdrawable.toFixed(0)}</div>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-3 md:p-4 border border-gray-100 text-center">
          <div className="text-xs text-gray-500 mb-1">筛选结果</div>
          <div className="text-lg md:text-xl font-bold text-gray-800">{filteredCustomers.length}</div>
        </div>
      </div>

      {/* 操作栏 */}
      <div className="bg-white rounded-2xl shadow-sm p-4 md:p-5 mb-5 border border-gray-100">
        <div className="flex flex-col md:flex-row gap-3 mb-4">
          {/* 搜索框 */}
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="搜索客户姓名、电话、微信、身份证、设计师..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
            />
          </div>

          {/* 按钮组 */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl transition-all text-sm font-medium shadow-md"
            >
              <Plus size={16} />
              添加客户
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-xl transition-all text-sm font-medium shadow-md"
            >
              <Download size={16} />
              导出CSV
            </button>
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterLevel('all');
                setFilterMember('all');
                setFilterBooking('all');
              }}
              className="flex items-center gap-2 px-4 py-3 border border-gray-200 text-gray-600 hover:bg-gray-50 rounded-xl transition-colors text-sm font-medium"
            >
              <RefreshCw size={16} />
              重置筛选
            </button>
          </div>
        </div>

        {/* 筛选标签 */}
        <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Filter size={14} />
            快速筛选：
          </div>
          
          {/* 会员级别筛选 */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-gray-400">会员级别：</span>
            {['all', 'stockholder', 'premium', 'regular'].map((level) => (
              <button
                key={level}
                onClick={() => setFilterLevel(level)}
                className={`px-3 py-1 rounded-full text-xs transition-all ${
                  filterLevel === level
                    ? 'bg-orange-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-orange-50 hover:text-orange-600'
                }`}
              >
                {level === 'all' ? '全部' : level === 'stockholder' ? '股东会员' : level === 'premium' ? '高级会员' : '普通客户'}
              </button>
            ))}
          </div>

          {/* 会员状态筛选 */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-gray-400">会员状态：</span>
            {['all', 'member', 'non-member', 'recharged'].map((m) => (
              <button
                key={m}
                onClick={() => setFilterMember(m)}
                className={`px-3 py-1 rounded-full text-xs transition-all ${
                  filterMember === m
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                }`}
              >
                {m === 'all' ? '全部' : m === 'member' ? '会员' : m === 'non-member' ? '非会员' : '已充值'}
              </button>
            ))}
          </div>

          {/* 其他筛选 */}
          <div className="flex items-center gap-1 flex-wrap">
            <span className="text-xs text-gray-400">其他：</span>
            {['all', 'with-booking', 'without-booking', 'referred'].map((b) => (
              <button
                key={b}
                onClick={() => setFilterBooking(b)}
                className={`px-3 py-1 rounded-full text-xs transition-all ${
                  filterBooking === b
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-green-50 hover:text-green-600'
                }`}
              >
                {b === 'all' ? '全部' : b === 'with-booking' ? '有预约' : b === 'without-booking' ? '无预约' : '转介绍'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 客户表格 */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 md:p-5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Users size={20} className="text-orange-500" />
            客户列表
            <span className="text-sm font-normal text-gray-500">({filteredCustomers.length}位客户)</span>
          </h2>
        </div>

        {/* 表格容器 - 支持横向滚动 */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[2000px]">
            {/* 表头 */}
            <thead className="bg-gradient-to-r from-gray-50 to-gray-100">
              <tr>
                {[
                  { label: '序号', width: 'w-16' },
                  { label: '入店日期', width: 'w-28' },
                  { label: '客户称呼', width: 'w-28' },
                  { label: '联系方式', width: 'w-32' },
                  { label: '微信', width: 'w-28' },
                  { label: '性别', width: 'w-16' },
                  { label: '年龄', width: 'w-16' },
                  { label: '生日', width: 'w-24' },
                  { label: '爱好', width: 'w-40' },
                  { label: '消费项目', width: 'w-40' },
                  { label: '消费金额', width: 'w-24' },
                  { label: '是否预约', width: 'w-20' },
                  { label: '设计师', width: 'w-24' },
                  { label: '是否会员', width: 'w-20' },
                  { label: '会员级别', width: 'w-24' },
                  { label: '是否充值', width: 'w-20' },
                  { label: '充值级别', width: 'w-20' },
                  { label: '余额', width: 'w-24' },
                  { label: '是否转介绍', width: 'w-24' },
                  { label: '转介绍人员', width: 'w-28' },
                  { label: '转介绍消费', width: 'w-24' },
                  { label: '共享基金', width: 'w-24' },
                  { label: '合计共享基金', width: 'w-28' },
                  { label: '可取现金额', width: 'w-28' },
                  { label: '操作', width: 'w-32' },
                ].map((col, idx) => (
                  <th key={idx} className={`${col.width} px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider whitespace-nowrap`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>

            {/* 表格内容 */}
            <tbody className="divide-y divide-gray-100">
              {filteredCustomers.map((customer, idx) => (
                <tr 
                  key={customer.id}
                  className={`hover:bg-orange-50 transition-colors ${
                    customer.isStockholder ? 'bg-purple-50/30' : 
                    customer.isMember ? 'bg-blue-50/30' : ''
                  }`}
                >
                  <td className="px-4 py-3 text-sm text-gray-600">{idx + 1}</td>
                  <td className="px-4 py-3 text-sm text-gray-800">
                    {customer.lastVisitAt ? new Date(customer.lastVisitAt).toLocaleDateString('zh-CN') : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-orange-400 to-orange-500 rounded-full flex items-center justify-center text-white text-xs font-medium flex-shrink-0">
                        {customer.name.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-gray-800 whitespace-nowrap">{customer.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{customer.phone}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{customer.wechat || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      customer.gender === 'male' ? 'bg-blue-100 text-blue-700' : 
                      customer.gender === 'female' ? 'bg-pink-100 text-pink-700' : 
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {customer.gender === 'male' ? '男' : customer.gender === 'female' ? '女' : '其他'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{customer.age || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {customer.birthday ? new Date(customer.birthday).toLocaleDateString('zh-CN') : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-[160px] truncate" title={customer.hobbies}>
                    {customer.hobbies || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 max-w-[160px] truncate" title={customer.lastServiceItems?.join('、')}>
                    {customer.lastServiceItems?.join('、') || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-semibold text-orange-600">¥{customer.totalSpent.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      customer.hasBooking ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {customer.hasBooking ? '是' : '否'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{customer.lastStylist || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      customer.isMember ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {customer.isMember ? '是' : '否'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      customer.isStockholder ? 'bg-purple-100 text-purple-700' :
                      customer.membershipLevel === MembershipLevel.PREMIUM ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {customer.isStockholder ? '股东会员' : 
                       customer.membershipLevel === MembershipLevel.PREMIUM ? '高级会员' : '普通'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      customer.hasRecharged ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {customer.hasRecharged ? '是' : '否'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{customer.rechargeLevel || '-'}</td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-semibold text-green-600">¥{customer.balance.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      customer.isReferred ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {customer.isReferred ? '是' : '否'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{customer.referrerName || '-'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {customer.referralConsumption ? `¥${customer.referralConsumption.toLocaleString()}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-orange-600 font-medium">
                    {customer.sharedFund ? `¥${customer.sharedFund.toFixed(2)}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-orange-700 font-semibold">
                    {customer.totalSharedFund ? `¥${customer.totalSharedFund.toFixed(2)}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-sm text-red-600 font-bold">
                    {customer.withdrawableAmount ? `¥${customer.withdrawableAmount.toFixed(2)}` : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setShowDetail(customer)}
                        className="p-1.5 hover:bg-blue-50 rounded-lg transition-colors text-blue-500"
                        title="查看详情"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => setShowEdit(customer)}
                        className="p-1.5 hover:bg-orange-50 rounded-lg transition-colors text-orange-500"
                        title="编辑"
                      >
                        <Edit size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteCustomer(customer.id)}
                        className="p-1.5 hover:bg-red-50 rounded-lg transition-colors text-red-500"
                        title="删除"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 空状态 */}
        {filteredCustomers.length === 0 && (
          <div className="text-center py-16 px-4">
            <Users size={64} className="mx-auto mb-4 text-gray-200" />
            <p className="text-gray-500 text-lg">暂无匹配的客户数据</p>
            <button
              onClick={() => {
                setSearchTerm('');
                setFilterLevel('all');
                setFilterMember('all');
                setFilterBooking('all');
              }}
              className="mt-4 px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-colors text-sm font-medium"
            >
              重置筛选条件
            </button>
          </div>
        )}
      </div>

      {/* 客户详情弹窗 */}
      {showDetail && (
        <div className="fixed inset-0 bg-black/50 flex items-start md:items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 w-full max-w-4xl my-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <User size={24} className="text-orange-500" />
                客户详情
              </h3>
              <button
                onClick={() => setShowDetail(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>

            {/* 头部信息 */}
            <div className="flex flex-col md:flex-row items-start gap-6 mb-6 pb-6 border-b border-gray-100">
              <div className="w-24 h-24 bg-gradient-to-br from-orange-400 to-orange-500 rounded-2xl flex items-center justify-center text-white text-3xl font-bold shadow-lg flex-shrink-0">
                {showDetail.name.charAt(0)}
              </div>
              <div className="flex-1 w-full">
                <div className="flex items-center gap-3 mb-2 flex-wrap">
                  <h4 className="text-2xl font-bold text-gray-800">{showDetail.name}</h4>
                  {showDetail.isStockholder && (
                    <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold flex items-center gap-1">
                      <Crown size={12} /> 股东会员
                    </span>
                  )}
                  {showDetail.isMember && !showDetail.isStockholder && (
                    <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                      高级会员
                    </span>
                  )}
                  {showDetail.hasBooking && (
                    <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold">
                      有预约
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">电话：</span>
                    <span className="text-gray-800 font-medium">{showDetail.phone}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">微信：</span>
                    <span className="text-gray-800 font-medium">{showDetail.wechat || '-'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">性别：</span>
                    <span className="text-gray-800 font-medium">
                      {showDetail.gender === 'male' ? '男' : showDetail.gender === 'female' ? '女' : '其他'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">年龄：</span>
                    <span className="text-gray-800 font-medium">{showDetail.age || '-'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 详细信息网格 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {/* 基本信息 */}
              <div className="bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl p-4">
                <h5 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
                  <FileText size={16} className="text-gray-500" />
                  基本信息
                </h5>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">生日：</span>
                    <span className="text-gray-800 font-medium">
                      {showDetail.birthday ? new Date(showDetail.birthday).toLocaleDateString('zh-CN') : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">身份证：</span>
                    <span className="text-gray-800 font-medium">{showDetail.idCardNumber || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">爱好：</span>
                    <span className="text-gray-800 font-medium text-right max-w-[60%]">{showDetail.hobbies || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">入店日期：</span>
                    <span className="text-gray-800 font-medium">
                      {showDetail.lastVisitAt ? new Date(showDetail.lastVisitAt).toLocaleDateString('zh-CN') : '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 消费信息 */}
              <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4">
                <h5 className="text-sm font-bold text-orange-700 mb-3 flex items-center gap-2">
                  <CreditCard size={16} className="text-orange-500" />
                  消费信息
                </h5>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-orange-600">累计消费：</span>
                    <span className="text-orange-800 font-bold text-lg">¥{showDetail.totalSpent.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-orange-600">上次消费：</span>
                    <span className="text-orange-800 font-medium">
                      {showDetail.lastServiceAmount ? `¥${showDetail.lastServiceAmount}` : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-orange-600">消费项目：</span>
                    <span className="text-orange-800 font-medium text-right max-w-[60%]">
                      {showDetail.lastServiceItems?.join('、') || '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-orange-600">服务技师：</span>
                    <span className="text-orange-800 font-medium">{showDetail.lastStylist || '-'}</span>
                  </div>
                </div>
              </div>

              {/* 会员信息 */}
              <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4">
                <h5 className="text-sm font-bold text-blue-700 mb-3 flex items-center gap-2">
                  <Crown size={16} className="text-blue-500" />
                  会员信息
                </h5>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-blue-600">是否会员：</span>
                    <span className="text-blue-800 font-bold">{showDetail.isMember ? '是' : '否'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">会员级别：</span>
                    <span className="text-blue-800 font-bold">
                      {showDetail.isStockholder ? '股东会员' : 
                       showDetail.membershipLevel === MembershipLevel.PREMIUM ? '高级会员' : '普通客户'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">是否充值：</span>
                    <span className="text-blue-800 font-medium">{showDetail.hasRecharged ? '是' : '否'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">充值级别：</span>
                    <span className="text-blue-800 font-medium">{showDetail.rechargeLevel || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">当前余额：</span>
                    <span className="text-green-700 font-bold text-lg">¥{showDetail.balance.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-600">积分：</span>
                    <span className="text-blue-800 font-medium">{showDetail.points}分</span>
                  </div>
                </div>
              </div>

              {/* 转介绍信息 */}
              <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4">
                <h5 className="text-sm font-bold text-green-700 mb-3 flex items-center gap-2">
                  <Users size={16} className="text-green-500" />
                  转介绍信息
                </h5>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-green-600">是否转介绍：</span>
                    <span className="text-green-800 font-bold">{showDetail.isReferred ? '是' : '否'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-600">转介绍人：</span>
                    <span className="text-green-800 font-medium">{showDetail.referrerName || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-600">介绍人电话：</span>
                    <span className="text-green-800 font-medium">{showDetail.referrerPhone || '-'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-600">转介绍消费：</span>
                    <span className="text-green-800 font-medium">
                      {showDetail.referralConsumption ? `¥${showDetail.referralConsumption.toLocaleString()}` : '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 共享基金 */}
              <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4">
                <h5 className="text-sm font-bold text-purple-700 mb-3 flex items-center gap-2">
                  <Gift size={16} className="text-purple-500" />
                  共享基金
                </h5>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-purple-600">共享基金：</span>
                    <span className="text-purple-800 font-bold">
                      {showDetail.sharedFund ? `¥${showDetail.sharedFund.toFixed(2)}` : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-purple-600">合计共享基金：</span>
                    <span className="text-purple-800 font-bold">
                      {showDetail.totalSharedFund ? `¥${showDetail.totalSharedFund.toFixed(2)}` : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-purple-600">可取现金额：</span>
                    <span className="text-red-700 font-bold text-lg">
                      {showDetail.withdrawableAmount ? `¥${showDetail.withdrawableAmount.toFixed(2)}` : '-'}
                    </span>
                  </div>
                </div>
              </div>

              {/* 预约状态 */}
              <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-4">
                <h5 className="text-sm font-bold text-yellow-700 mb-3 flex items-center gap-2">
                  <Calendar size={16} className="text-yellow-500" />
                  到店记录
                </h5>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-yellow-600">到店次数：</span>
                    <span className="text-yellow-800 font-bold">{showDetail.visitCount}次</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-yellow-600">上次到店：</span>
                    <span className="text-yellow-800 font-medium">
                      {showDetail.lastVisitAt ? new Date(showDetail.lastVisitAt).toLocaleDateString('zh-CN') : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-yellow-600">当前预约：</span>
                    <span className={`font-bold ${showDetail.hasBooking ? 'text-yellow-800' : 'text-gray-500'}`}>
                      {showDetail.hasBooking ? '有预约' : '无预约'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-yellow-600">距上次到店：</span>
                    <span className="text-yellow-800 font-medium">
                      {showDetail.daysSinceLastVisit ? `${showDetail.daysSinceLastVisit}天前` : '-'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                onClick={() => setShowDetail(null)}
                className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors text-sm font-medium"
              >
                关闭
              </button>
              <button
                onClick={() => {
                  setShowEdit(showDetail);
                  setShowDetail(null);
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl transition-colors text-sm font-medium"
              >
                <Edit size={16} />
                编辑客户
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑/添加客户表单弹窗 */}
      {(showEdit || showAdd) && (
        <div className="fixed inset-0 bg-black/50 flex items-start md:items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-6 w-full max-w-3xl my-8 shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Edit size={24} className="text-orange-500" />
                {showAdd ? '添加新客户' : '编辑客户信息'}
              </h3>
              <button
                onClick={() => {
                  showEdit ? setShowEdit(null) : setShowAdd(false);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} className="text-gray-600" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* 基本信息 */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-gray-700 pb-2 border-b border-gray-100 flex items-center gap-2">
                  <User size={16} className="text-orange-500" />
                  基本信息
                </h4>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">客户称呼 *</label>
                  <input
                    type="text"
                    defaultValue={showEdit?.name || ''}
                    id="edit-name"
                    placeholder="请输入客户姓名"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">联系方式 *</label>
                  <input
                    type="text"
                    defaultValue={showEdit?.phone || ''}
                    id="edit-phone"
                    placeholder="请输入手机号"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">微信</label>
                  <input
                    type="text"
                    defaultValue={showEdit?.wechat || ''}
                    id="edit-wechat"
                    placeholder="请输入微信号"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">性别</label>
                    <select
                      id="edit-gender"
                      defaultValue={showEdit?.gender || 'other'}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm bg-white"
                    >
                      <option value="male">男</option>
                      <option value="female">女</option>
                      <option value="other">其他</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">年龄</label>
                    <input
                      type="number"
                      defaultValue={showEdit?.age || ''}
                      id="edit-age"
                      placeholder="请输入年龄"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">身份证号</label>
                  <input
                    type="text"
                    defaultValue={showEdit?.idCardNumber || ''}
                    id="edit-idcard"
                    placeholder="请输入身份证号"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">生日</label>
                  <input
                    type="date"
                    defaultValue={showEdit?.birthday ? new Date(showEdit.birthday).toISOString().split('T')[0] : ''}
                    id="edit-birthday"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">爱好及其他</label>
                  <textarea
                    id="edit-hobbies"
                    defaultValue={showEdit?.hobbies || ''}
                    placeholder="请输入客户爱好、发型偏好等信息"
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm resize-none"
                  />
                </div>
              </div>

              {/* 会员及消费信息 */}
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-gray-700 pb-2 border-b border-gray-100 flex items-center gap-2">
                  <Crown size={16} className="text-orange-500" />
                  会员及消费
                </h4>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">会员级别</label>
                  <select
                    id="edit-membership"
                    defaultValue={showEdit?.membershipLevel || MembershipLevel.REGULAR}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm bg-white"
                  >
                    <option value={MembershipLevel.REGULAR}>普通客户</option>
                    <option value={MembershipLevel.PREMIUM}>高级会员</option>
                    <option value={MembershipLevel.STOCKHOLDER}>股东会员</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">会员余额 (¥)</label>
                    <input
                      type="number"
                      defaultValue={showEdit?.balance || 0}
                      id="edit-balance"
                      placeholder="请输入余额"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">积分</label>
                    <input
                      type="number"
                      defaultValue={showEdit?.points || 0}
                      id="edit-points"
                      placeholder="请输入积分"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">上次服务设计师</label>
                  <input
                    type="text"
                    defaultValue={showEdit?.lastStylist || ''}
                    id="edit-stylist"
                    placeholder="请输入设计师姓名"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">上次消费项目</label>
                  <input
                    type="text"
                    defaultValue={showEdit?.lastServiceItems?.join('、') || ''}
                    id="edit-service-items"
                    placeholder="请输入消费项目，用、分隔"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">累计消费金额 (¥)</label>
                  <input
                    type="number"
                    defaultValue={showEdit?.totalSpent || 0}
                    id="edit-total"
                    placeholder="请输入累计消费金额"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">入店日期</label>
                  <input
                    type="date"
                    defaultValue={showEdit?.lastVisitAt ? new Date(showEdit.lastVisitAt).toISOString().split('T')[0] : ''}
                    id="edit-visit-date"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">充值级别</label>
                  <select
                    id="edit-recharge-level"
                    defaultValue={showEdit?.rechargeLevel || ''}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm bg-white"
                  >
                    <option value="">未设置</option>
                    <option value="银卡">银卡</option>
                    <option value="金卡">金卡</option>
                    <option value="钻石卡">钻石卡</option>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <label className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                    <input
                      type="checkbox"
                      defaultChecked={showEdit?.hasBooking || false}
                      id="edit-booking"
                      className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                    />
                    <span className="text-sm text-gray-700">是否有预约</span>
                  </label>
                  <label className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors">
                    <input
                      type="checkbox"
                      defaultChecked={showEdit?.hasRecharged || false}
                      id="edit-recharged"
                      className="w-4 h-4 text-orange-500 rounded focus:ring-orange-500"
                    />
                    <span className="text-sm text-gray-700">是否已充值</span>
                  </label>
                </div>
              </div>

              {/* 转介绍及基金信息 */}
              <div className="md:col-span-2 space-y-3">
                <h4 className="text-sm font-bold text-gray-700 pb-2 border-b border-gray-100 flex items-center gap-2">
                  <Users size={16} className="text-orange-500" />
                  转介绍及共享基金
                </h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">是否转介绍</label>
                    <select
                      id="edit-is-referred"
                      defaultValue={showEdit?.isReferred ? 'yes' : 'no'}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm bg-white"
                    >
                      <option value="no">否</option>
                      <option value="yes">是</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">转介绍人员姓名</label>
                    <input
                      type="text"
                      defaultValue={showEdit?.referrerName || ''}
                      id="edit-referrer-name"
                      placeholder="请输入介绍人"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">转介绍人员电话</label>
                    <input
                      type="text"
                      defaultValue={showEdit?.referrerPhone || ''}
                      id="edit-referrer-phone"
                      placeholder="请输入介绍人电话"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">转介绍带来的消费 (¥)</label>
                    <input
                      type="number"
                      defaultValue={showEdit?.referralConsumption || 0}
                      id="edit-referral-consumption"
                      placeholder="请输入金额"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">共享基金 (¥)</label>
                    <input
                      type="number"
                      defaultValue={showEdit?.sharedFund || 0}
                      id="edit-shared-fund"
                      step="0.01"
                      placeholder="请输入共享基金"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">合计共享基金 (¥)</label>
                    <input
                      type="number"
                      defaultValue={showEdit?.totalSharedFund || 0}
                      id="edit-total-shared"
                      step="0.01"
                      placeholder="请输入合计共享基金"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">可取现金额 (¥)</label>
                    <input
                      type="number"
                      defaultValue={showEdit?.withdrawableAmount || 0}
                      id="edit-withdrawable"
                      step="0.01"
                      placeholder="请输入可取现金额"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 表单按钮 */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                onClick={() => {
                  showEdit ? setShowEdit(null) : setShowAdd(false);
                }}
                className="flex items-center gap-2 px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl transition-colors text-sm font-medium"
              >
                取消
              </button>
              <button
                onClick={() => {
                  // 获取表单数据
                  const nameInput = document.getElementById('edit-name') as HTMLInputElement;
                  const phoneInput = document.getElementById('edit-phone') as HTMLInputElement;
                  const wechatInput = document.getElementById('edit-wechat') as HTMLInputElement;
                  const genderInput = document.getElementById('edit-gender') as HTMLSelectElement;
                  const ageInput = document.getElementById('edit-age') as HTMLInputElement;
                  const idCardInput = document.getElementById('edit-idcard') as HTMLInputElement;
                  const birthdayInput = document.getElementById('edit-birthday') as HTMLInputElement;
                  const hobbiesInput = document.getElementById('edit-hobbies') as HTMLTextAreaElement;
                  const membershipInput = document.getElementById('edit-membership') as HTMLSelectElement;
                  const balanceInput = document.getElementById('edit-balance') as HTMLInputElement;
                  const pointsInput = document.getElementById('edit-points') as HTMLInputElement;
                  const stylistInput = document.getElementById('edit-stylist') as HTMLInputElement;
                  const serviceItemsInput = document.getElementById('edit-service-items') as HTMLInputElement;
                  const totalInput = document.getElementById('edit-total') as HTMLInputElement;
                  const visitDateInput = document.getElementById('edit-visit-date') as HTMLInputElement;
                  const rechargeLevelInput = document.getElementById('edit-recharge-level') as HTMLSelectElement;
                  const bookingInput = document.getElementById('edit-booking') as HTMLInputElement;
                  const rechargedInput = document.getElementById('edit-recharged') as HTMLInputElement;
                  const referredInput = document.getElementById('edit-is-referred') as HTMLSelectElement;
                  const referrerNameInput = document.getElementById('edit-referrer-name') as HTMLInputElement;
                  const referrerPhoneInput = document.getElementById('edit-referrer-phone') as HTMLInputElement;
                  const referralConsumptionInput = document.getElementById('edit-referral-consumption') as HTMLInputElement;
                  const sharedFundInput = document.getElementById('edit-shared-fund') as HTMLInputElement;
                  const totalSharedFundInput = document.getElementById('edit-total-shared') as HTMLInputElement;
                  const withdrawableInput = document.getElementById('edit-withdrawable') as HTMLInputElement;

                  if (!nameInput.value || !phoneInput.value) {
                    alert('请填写客户姓名和电话！');
                    return;
                  }

                  if (showEdit) {
                    // 更新客户
                    const updated: Customer = {
                      ...showEdit,
                      name: nameInput.value,
                      phone: phoneInput.value,
                      wechat: wechatInput.value,
                      gender: genderInput.value as 'male' | 'female' | 'other',
                      age: ageInput.value ? parseInt(ageInput.value) : undefined,
                      idCardNumber: idCardInput.value,
                      birthday: birthdayInput.value ? new Date(birthdayInput.value) : undefined,
                      hobbies: hobbiesInput.value,
                      membershipLevel: membershipInput.value as MembershipLevel,
                      isMember: membershipInput.value !== MembershipLevel.REGULAR,
                      isStockholder: membershipInput.value === MembershipLevel.STOCKHOLDER,
                      balance: parseFloat(balanceInput.value) || 0,
                      points: parseInt(pointsInput.value) || 0,
                      lastStylist: stylistInput.value,
                      lastServiceItems: serviceItemsInput.value ? serviceItemsInput.value.split(/[、,，]/).map(s => s.trim()).filter(Boolean) : [],
                      totalSpent: parseFloat(totalInput.value) || 0,
                      lastVisitAt: visitDateInput.value ? new Date(visitDateInput.value) : undefined,
                      hasBooking: bookingInput.checked,
                      hasRecharged: rechargedInput.checked,
                      rechargeLevel: rechargeLevelInput.value || (parseFloat(balanceInput.value) > 1000 ? '金卡' : parseFloat(balanceInput.value) > 0 ? '银卡' : ''),
                      isReferred: referredInput.value === 'yes',
                      referrerName: referrerNameInput.value,
                      referrerPhone: referrerPhoneInput.value,
                      referralConsumption: parseFloat(referralConsumptionInput.value) || 0,
                      sharedFund: parseFloat(sharedFundInput.value) || 0,
                      totalSharedFund: parseFloat(totalSharedFundInput.value) || 0,
                      withdrawableAmount: parseFloat(withdrawableInput.value) || 0,
                    };
                    handleUpdateCustomer(updated);
                  } else {
                    // 添加新客户
                    handleAddCustomer({
                      name: nameInput.value,
                      phone: phoneInput.value,
                      wechat: wechatInput.value,
                      gender: genderInput.value as 'male' | 'female' | 'other',
                      age: ageInput.value ? parseInt(ageInput.value) : undefined,
                      idCardNumber: idCardInput.value,
                      birthday: birthdayInput.value ? new Date(birthdayInput.value) : undefined,
                      hobbies: hobbiesInput.value,
                      membershipLevel: membershipInput.value as MembershipLevel,
                      balance: parseFloat(balanceInput.value) || 0,
                      points: parseInt(pointsInput.value) || 0,
                      lastStylist: stylistInput.value,
                      lastServiceItems: serviceItemsInput.value ? serviceItemsInput.value.split(/[、,，]/).map(s => s.trim()).filter(Boolean) : [],
                      totalSpent: parseFloat(totalInput.value) || 0,
                      lastVisitAt: visitDateInput.value ? new Date(visitDateInput.value) : undefined,
                      hasBooking: bookingInput.checked,
                      hasRecharged: rechargedInput.checked,
                      rechargeLevel: rechargeLevelInput.value || (parseFloat(balanceInput.value) > 1000 ? '金卡' : parseFloat(balanceInput.value) > 0 ? '银卡' : ''),
                      isReferred: referredInput.value === 'yes',
                      referrerName: referrerNameInput.value,
                      referrerPhone: referrerPhoneInput.value,
                      referralConsumption: parseFloat(referralConsumptionInput.value) || 0,
                      sharedFund: parseFloat(sharedFundInput.value) || 0,
                      totalSharedFund: parseFloat(totalSharedFundInput.value) || 0,
                      withdrawableAmount: parseFloat(withdrawableInput.value) || 0,
                    });
                  }
                }}
                className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl transition-all text-sm font-medium shadow-md"
              >
                <Check size={16} />
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </ShopLayout>
  );
};

export default CustomerTableManagement;