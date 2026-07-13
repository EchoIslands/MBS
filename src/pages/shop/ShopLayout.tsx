import React, { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  Users,
  Calendar,
  BarChart3,
  MessageSquare,
  FileSpreadsheet,
  FileText,
  CreditCard,
  Crown,
  LogOut,
  Scissors,
  UserCircle,
  Wallet,
  Settings,
  Building2,
  AlertTriangle,
  Package,
  Bell,
  ArrowLeft,
  Camera,
  Check,
  X,
  Lock,
  Edit3,
} from 'lucide-react';
import { useAppStore } from '../../store';
import { employeeApi } from '../../api';
import { getAvatarUrl } from '../../lib/avatar';
import { UserRole, Employee } from '../../../shared/types';

interface ShopLayoutProps {
  children: React.ReactNode;
  title?: string;
}

interface MenuItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  roles: UserRole[];
}

// 统一的导航菜单配置
const menuItems: MenuItem[] = [
  {
    label: '首页概览',
    path: '/shop',
    icon: <Home size={18} />,
    roles: [UserRole.CEO, UserRole.CUSTOMER_SERVICE, UserRole.SHOP_MANAGER, UserRole.STYLIST],
  },
  {
    label: '预约管理',
    path: '/shop/bookings',
    icon: <Calendar size={18} />,
    roles: [UserRole.CEO, UserRole.SHOP_MANAGER],
  },
  {
    label: '客户管理',
    path: '/shop/customers',
    icon: <Users size={18} />,
    roles: [UserRole.CEO, UserRole.CUSTOMER_SERVICE, UserRole.SHOP_MANAGER, UserRole.STYLIST],
  },
  {
    label: '客户表格管理',
    path: '/shop/customers-table',
    icon: <FileText size={18} />,
    roles: [UserRole.CEO, UserRole.CUSTOMER_SERVICE, UserRole.SHOP_MANAGER],
  },
  {
    label: '客户智能召回',
    path: '/shop/customer-recall',
    icon: <Bell size={18} />,
    roles: [UserRole.CEO, UserRole.CUSTOMER_SERVICE, UserRole.SHOP_MANAGER],
  },
  {
    label: '客户画像',
    path: '/shop/customer-profile',
    icon: <UserCircle size={18} />,
    roles: [UserRole.CEO, UserRole.CUSTOMER_SERVICE, UserRole.SHOP_MANAGER],
  },
  {
    label: '评价管理',
    path: '/shop/reviews',
    icon: <MessageSquare size={18} />,
    roles: [UserRole.CEO, UserRole.CUSTOMER_SERVICE, UserRole.SHOP_MANAGER],
  },
  {
    label: '发型师看板',
    path: '/shop/stylist',
    icon: <Scissors size={18} />,
    roles: [UserRole.CEO, UserRole.SHOP_MANAGER, UserRole.STYLIST],
  },
  {
    label: '财务报表',
    path: '/shop/financial',
    icon: <BarChart3 size={18} />,
    roles: [UserRole.CEO],
  },
  {
    label: '会员管理',
    path: '/shop/membership',
    icon: <Crown size={18} />,
    roles: [UserRole.CEO, UserRole.CUSTOMER_SERVICE, UserRole.SHOP_MANAGER],
  },
  {
    label: '退款管理',
    path: '/shop/refunds',
    icon: <AlertTriangle size={18} />,
    roles: [UserRole.CEO, UserRole.SHOP_MANAGER],
  },
  {
    label: '商品管理',
    path: '/shop/products',
    icon: <Package size={18} />,
    roles: [UserRole.CEO, UserRole.SHOP_MANAGER],
  },
  {
    label: '开单结算',
    path: '/shop/checkout',
    icon: <CreditCard size={18} />,
    roles: [UserRole.CEO, UserRole.CUSTOMER_SERVICE, UserRole.SHOP_MANAGER, UserRole.STYLIST],
  },
  {
    label: '结算管理',
    path: '/shop/settlement',
    icon: <CreditCard size={18} />,
    roles: [UserRole.CEO, UserRole.SHOP_MANAGER],
  },
  {
    label: '满意度回访',
    path: '/shop/survey',
    icon: <FileSpreadsheet size={18} />,
    roles: [UserRole.CEO, UserRole.CUSTOMER_SERVICE],
  },
  {
    label: '店铺设置',
    path: '/shop/manage',
    icon: <Settings size={18} />,
    roles: [UserRole.CEO, UserRole.SHOP_MANAGER],
  },
  {
    label: '老板视图',
    path: '/shop/owner',
    icon: <Building2 size={18} />,
    roles: [UserRole.CEO],
  },
];

const roleLabels: Record<string, string> = {
  [UserRole.CEO]: 'CEO',
  [UserRole.CUSTOMER_SERVICE]: '客服专员',
  [UserRole.SHOP_MANAGER]: '店长',
  [UserRole.STYLIST]: '发型师',
  [UserRole.SHOP_OWNER]: '老板',
};

const ShopLayout: React.FC<ShopLayoutProps> = ({ children, title }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentShop, currentEmployee, userRole, logout } = useAppStore();

  // 未登录 → 回到登录页
  if (!currentEmployee) {
    navigate('/shop/login');
    return null;
  }

  // 根据角色筛选菜单项
  const visibleMenus = menuItems.filter((item) =>
    userRole ? item.roles.includes(userRole) : true,
  );

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleBack = () => {
    navigate(-1);
  };

  const isHomePage = location.pathname === '/shop';

  const displayTitle =
    title ||
    visibleMenus.find((m) => location.pathname.startsWith(m.path) && m.path !== '/shop')
      ?.label ||
    visibleMenus.find((m) => m.path === location.pathname)?.label ||
    '首页概览';

  const employeeName = currentEmployee?.name || currentShop?.name || '管理后台';
  const roleLabel = roleLabels[userRole || ''] || '管理员';

  // 个人资料弹窗状态
  const [profileOpen, setProfileOpen] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: currentEmployee?.name || '',
    phone: currentEmployee?.phone || '',
    title: currentEmployee?.title || '',
    specialty: currentEmployee?.specialty || '',
    avatar: currentEmployee?.avatar || '',
    password: '',
  });
  const updateCurrentEmployee = useAppStore((state) => state.updateCurrentEmployee);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const handleOpenProfile = () => {
    setProfileForm({
      name: currentEmployee?.name || '',
      phone: currentEmployee?.phone || '',
      title: currentEmployee?.title || '',
      specialty: currentEmployee?.specialty || '',
      avatar: currentEmployee?.avatar || '',
      password: '',
    });
    setProfileOpen(true);
  };

  const handleAvatarFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('请选择图片文件');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('图片大小不能超过 2MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        setProfileForm((prev) => ({ ...prev, avatar: base64 }));
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    if (!currentEmployee) return;
    setSavingProfile(true);
    try {
      const payload: Partial<Employee> & { password?: string } = {
        name: profileForm.name.trim() || undefined,
        phone: profileForm.phone.trim() || undefined,
        title: profileForm.title.trim() || undefined,
        specialty: profileForm.specialty.trim() || undefined,
        avatar: profileForm.avatar.trim() || undefined,
      };
      if (profileForm.password.trim()) {
        payload.password = profileForm.password.trim();
      }
      const updated = await employeeApi.updateMe(payload);
      if (updated) {
        updateCurrentEmployee({
          name: updated.name,
          phone: updated.phone,
          title: updated.title,
          avatar: updated.avatar,
          specialty: updated.specialty,
        });
        setProfileOpen(false);
      } else {
        alert('保存失败，请重试');
      }
    } catch (err: unknown) {
      console.error('[ShopLayout] 保存个人资料失败:', err);
      alert('保存失败');
    } finally {
      setSavingProfile(false);
    }
  };

  // 手机端只显示前 5 个菜单（避免底部导航过密）
  const bottomMenus = visibleMenus.slice(0, 5);
  const moreMenus = visibleMenus.slice(5);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部栏 */}
      <header className="bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow sticky top-0 z-50">
        <div className="px-3 sm:px-4 py-2.5 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* 返回按钮 - 非首页显示 */}
            {!isHomePage && (
              <button
                onClick={handleBack}
                className="flex items-center gap-1 px-2 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-sm flex-shrink-0"
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">返回</span>
              </button>
            )}
            <Scissors size={20} className="sm:hidden flex-shrink-0" />
            <Scissors size={24} className="hidden sm:inline flex-shrink-0" />
            <div className="min-w-0">
              <div className="font-bold text-sm sm:text-base truncate">{currentShop?.name || '皓诗形象设计'}</div>
              <div className="text-xs text-orange-100 truncate">{displayTitle}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <button
              onClick={handleOpenProfile}
              className="flex items-center gap-2 text-sm bg-white/10 hover:bg-white/20 px-2 sm:px-3 py-1.5 rounded-lg transition-colors"
            >
              <img
                src={currentEmployee?.avatar || getAvatarUrl(employeeName)}
                alt={employeeName}
                className="w-7 h-7 rounded-full object-cover border border-white/30"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = getAvatarUrl(employeeName);
                }}
              />
              <div className="hidden sm:block text-left">
                <div className="font-medium">{employeeName}</div>
                <div className="text-xs text-orange-100">{roleLabel}</div>
              </div>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-sm"
            >
              <LogOut size={16} />
              <span className="hidden sm:inline">退出</span>
            </button>
          </div>
        </div>
      </header>

      {/* 主体区 */}
      <div className="flex flex-1">
        {/* 左侧导航 —— 桌面端显示 */}
        <aside className="shop-side-nav w-48 md:w-56 bg-white border-r border-gray-200 min-h-[calc(100vh-56px)] py-3 flex-shrink-0">
          <nav className="space-y-1 px-2">
            {visibleMenus.map((item) => {
              const isActive =
                item.path === '/shop'
                  ? location.pathname === '/shop'
                  : location.pathname.startsWith(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'text-gray-700 hover:bg-orange-50 hover:text-orange-700'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* 底部提示 */}
          <div className="mt-6 px-3 text-xs text-gray-400 border-t border-gray-100 pt-3">
            <div className="flex items-center gap-2">
              <Wallet size={14} />
              <span>已登录：{roleLabel}</span>
            </div>
          </div>
        </aside>

        {/* 右侧内容 */}
        <main className="shop-main-content flex-1 px-3 sm:px-4 md:px-6 py-4 sm:py-6 overflow-x-hidden w-full">
          <div className="max-w-5xl mx-auto pb-24">{children}</div>
        </main>
      </div>

      {/* 手机端底部导航栏 */}
      <nav className="shop-bottom-nav fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-40 mobile-safe-bottom">
        <div className="flex justify-around items-stretch">
          {bottomMenus.map((item) => {
            const isActive =
              item.path === '/shop'
                ? location.pathname === '/shop'
                : location.pathname.startsWith(item.path);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs transition-colors min-h-[56px] ${
                  isActive ? 'text-orange-600' : 'text-gray-500'
                } ${isActive ? 'bg-orange-50' : 'hover:bg-gray-50'}`}
              >
                <div className={isActive ? 'text-orange-600' : 'text-gray-500'}>
                  {item.icon}
                </div>
                <span className="truncate max-w-full px-1 text-[11px] font-medium">
                  {item.label}
                </span>
              </button>
            );
          })}
          {moreMenus.length > 0 && (
            <button
              onClick={() => navigate(moreMenus[0].path)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-xs text-gray-500 hover:bg-gray-50 min-h-[56px]"
            >
              <Crown size={18} />
              <span className="truncate max-w-full px-1 text-[11px] font-medium">
                {moreMenus[0].label}
              </span>
            </button>
          )}
        </div>
      </nav>

      {/* 个人资料编辑弹窗 */}
      {profileOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <Edit3 size={20} className="text-orange-500" />
                个人资料
              </h3>
              <button
                onClick={() => setProfileOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="relative group cursor-pointer"
                >
                  <img
                    src={profileForm.avatar || getAvatarUrl(profileForm.name || employeeName)}
                    alt={profileForm.name || employeeName}
                    className="w-20 h-20 rounded-full object-cover border-4 border-orange-100 group-hover:opacity-80 transition-opacity"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = getAvatarUrl(profileForm.name || employeeName);
                    }}
                  />
                  <div className="absolute -bottom-1 -right-1 bg-orange-500 text-white p-1.5 rounded-full">
                    <Camera size={14} />
                  </div>
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarFileChange}
                  className="hidden"
                />
              </div>
              <p className="text-center text-xs text-gray-400 -mt-2">点击头像拍照或从相册选择（同时支持电脑文件）</p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">或填写头像图片地址</label>
                <input
                  type="text"
                  value={profileForm.avatar}
                  onChange={(e) => setProfileForm({ ...profileForm, avatar: e.target.value })}
                  placeholder="https://example.com/avatar.jpg"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">姓名</label>
                <input
                  type="text"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">手机号</label>
                <input
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  placeholder="登录手机号"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">职位</label>
                <input
                  type="text"
                  value={profileForm.title}
                  onChange={(e) => setProfileForm({ ...profileForm, title: e.target.value })}
                  placeholder="如：首席发型师"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">专长</label>
                <input
                  type="text"
                  value={profileForm.specialty}
                  onChange={(e) => setProfileForm({ ...profileForm, specialty: e.target.value })}
                  placeholder="如：精剪、烫染"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                  <Lock size={14} />
                  新密码（留空则不修改）
                </label>
                <input
                  type="password"
                  value={profileForm.password}
                  onChange={(e) => setProfileForm({ ...profileForm, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setProfileOpen(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className="flex-1 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {savingProfile ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Check size={18} />
                )}
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShopLayout;
