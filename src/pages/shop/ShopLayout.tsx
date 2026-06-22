import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  Users,
  Calendar,
  BarChart3,
  MessageSquare,
  FileSpreadsheet,
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
} from 'lucide-react';
import { useAppStore } from '../../store';
import { UserRole } from '../../../shared/types';

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
            <div className="hidden sm:flex items-center gap-2 text-sm bg-white/10 px-3 py-1.5 rounded-lg">
              <UserCircle size={18} />
              <div>
                <div className="font-medium">{employeeName}</div>
                <div className="text-xs text-orange-100">{roleLabel}</div>
              </div>
            </div>
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
    </div>
  );
};

export default ShopLayout;
