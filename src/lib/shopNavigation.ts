import { UserRole } from '../../shared/types';

export type ShopNavigationIcon =
  | 'home'
  | 'calendar'
  | 'users'
  | 'credit-card'
  | 'package'
  | 'bar-chart'
  | 'settings';

export interface ShopNavigationTab {
  label: string;
  path: string;
  roles: UserRole[];
  aliases?: string[];
}

export interface ShopNavigationSection {
  label: string;
  icon: ShopNavigationIcon;
  tabs: ShopNavigationTab[];
}

const ALL_STAFF = [UserRole.CEO, UserRole.CUSTOMER_SERVICE, UserRole.SHOP_MANAGER, UserRole.STYLIST];
const OPERATIONS = [UserRole.CEO, UserRole.SHOP_MANAGER, UserRole.STYLIST];
const CUSTOMER_TEAM = [UserRole.CEO, UserRole.CUSTOMER_SERVICE, UserRole.SHOP_MANAGER];
const MANAGEMENT = [UserRole.CEO, UserRole.SHOP_MANAGER];

/**
 * The sidebar exposes business modules. Tabs keep the existing page routes and
 * permission boundaries so bookmarks and deep links continue to work.
 */
export const SHOP_NAVIGATION: ShopNavigationSection[] = [
  {
    label: '首页概览',
    icon: 'home',
    tabs: [{ label: '首页概览', path: '/shop', roles: ALL_STAFF }],
  },
  {
    label: '预约服务',
    icon: 'calendar',
    tabs: [
      { label: '预约管理', path: '/shop/bookings', roles: OPERATIONS },
      { label: '发型师看板', path: '/shop/stylist', roles: OPERATIONS },
    ],
  },
  {
    label: '客户运营',
    icon: 'users',
    tabs: [
      {
        label: '客户管理',
        path: '/shop/customers',
        roles: ALL_STAFF,
        aliases: ['/shop/customers-table', '/shop/customer-profile'],
      },
      { label: '会员管理', path: '/shop/membership', roles: CUSTOMER_TEAM },
      { label: '智能召回', path: '/shop/customer-recall', roles: CUSTOMER_TEAM },
      {
        label: '评价管理',
        path: '/shop/reviews',
        roles: CUSTOMER_TEAM,
        aliases: ['/shop/review-management'],
      },
      { label: '满意度回访', path: '/shop/survey', roles: [UserRole.CEO, UserRole.CUSTOMER_SERVICE] },
    ],
  },
  {
    label: '收银与售后',
    icon: 'credit-card',
    tabs: [
      { label: '开单结算', path: '/shop/checkout', roles: ALL_STAFF },
      { label: '结算管理', path: '/shop/settlement', roles: MANAGEMENT },
      { label: '退款管理', path: '/shop/refunds', roles: MANAGEMENT },
    ],
  },
  {
    label: '商品营销',
    icon: 'package',
    tabs: [
      { label: '商品管理', path: '/shop/products', roles: MANAGEMENT },
      { label: '商品订单', path: '/shop/product-orders', roles: MANAGEMENT },
      { label: '次卡管理', path: '/shop/packages', roles: MANAGEMENT },
      { label: '优惠券管理', path: '/shop/coupons', roles: MANAGEMENT },
      { label: '外部团购券', path: '/shop/group-buy', roles: MANAGEMENT },
    ],
  },
  {
    label: '经营分析',
    icon: 'bar-chart',
    tabs: [
      { label: '老板视图', path: '/shop/owner', roles: [UserRole.CEO] },
      { label: '财务报表', path: '/shop/financial', roles: [UserRole.CEO] },
      { label: '客户洞察', path: '/shop/customer-insights', roles: [UserRole.CEO, UserRole.CUSTOMER_SERVICE] },
    ],
  },
  {
    label: '店铺设置',
    icon: 'settings',
    tabs: [
      { label: '店铺与员工', path: '/shop/manage', roles: MANAGEMENT },
      { label: '会员权益配置', path: '/shop/vip-configs', roles: [UserRole.CEO] },
    ],
  },
];

export function pathMatchesShopTab(pathname: string, tab: ShopNavigationTab): boolean {
  const candidates = [tab.path, ...(tab.aliases || [])];
  return candidates.some((path) =>
    path === '/shop'
      ? pathname === path
      : pathname === path || pathname.startsWith(path + '/'),
  );
}

export function visibleShopSections(role: UserRole | null | undefined): ShopNavigationSection[] {
  if (!role) return [];
  return SHOP_NAVIGATION.map((section) => ({
    ...section,
    tabs: section.tabs.filter((tab) => tab.roles.includes(role)),
  })).filter((section) => section.tabs.length > 0);
}

export function activeShopSection(
  sections: ShopNavigationSection[],
  pathname: string,
): ShopNavigationSection | undefined {
  return sections.find((section) => section.tabs.some((tab) => pathMatchesShopTab(pathname, tab)));
}
