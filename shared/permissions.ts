import { UserRole } from './types';

/**
 * 集中式角色权限配置
 *
 * 规则先按当前已明确的实现沉淀；等和使用方讨论确定后，
 * 只需修改这里的返回值，业务页面无需改动。
 */

// ==================== 客户管理 ====================

/** 能否查看客户管理菜单 */
export const canViewCustomerManagement = (role?: UserRole | null): boolean =>
  !!role &&
  [
    UserRole.CEO,
    UserRole.CUSTOMER_SERVICE,
    UserRole.SHOP_MANAGER,
    UserRole.STYLIST,
  ].includes(role);

/** 能否添加新客户 */
export const canCreateCustomer = (role?: UserRole | null): boolean =>
  !!role && [UserRole.CEO, UserRole.CUSTOMER_SERVICE].includes(role);

/** 能否编辑客户信息 */
export const canEditCustomer = (role?: UserRole | null): boolean =>
  !!role && [UserRole.CEO, UserRole.CUSTOMER_SERVICE].includes(role);

/** 能否导出客户数据 */
export const canExportCustomers = (role?: UserRole | null): boolean =>
  role === UserRole.CEO;

/** 能否删除客户 */
export const canDeleteCustomer = (role?: UserRole | null): boolean =>
  role === UserRole.CEO;

/** 客户数据可见范围 */
export type CustomerDataScope = 'all' | 'own';

export const getCustomerDataScope = (
  role?: UserRole | null,
): CustomerDataScope => {
  if (role === UserRole.STYLIST) return 'own';
  return 'all';
};

/** 筛选出当前角色可见的客户列表 */
export const filterCustomersByRole = <T extends { servedByStylistIds?: string[] }>(
  customers: T[],
  role?: UserRole | null,
  currentEmployeeId?: string,
): T[] => {
  if (getCustomerDataScope(role) === 'own' && currentEmployeeId) {
    return customers.filter(
      (c) => c.servedByStylistIds?.includes(currentEmployeeId),
    );
  }
  return customers;
};

// ==================== 预约管理 ====================

/** 能否查看预约管理菜单 */
export const canViewBookingManagement = (role?: UserRole | null): boolean =>
  !!role && [UserRole.CEO, UserRole.SHOP_MANAGER].includes(role);

// ==================== 发型师看板 ====================

/** 能否查看发型师看板 */
export const canViewStylistDashboard = (role?: UserRole | null): boolean =>
  !!role &&
  [UserRole.CEO, UserRole.SHOP_MANAGER, UserRole.STYLIST].includes(role);

// ==================== 财务报表 ====================

/** 能否查看财务报表 */
export const canViewFinancialReport = (role?: UserRole | null): boolean =>
  role === UserRole.CEO;

// ==================== 店铺设置 ====================

/** 能否查看店铺设置 */
export const canViewShopSettings = (role?: UserRole | null): boolean =>
  !!role && [UserRole.CEO, UserRole.SHOP_MANAGER].includes(role);
