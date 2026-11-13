export type BookableService = {
  id?: string | number;
  name?: string;
  requiresGoldStylist?: boolean;
  requiresShopManager?: boolean;
};

export type BookableStylist = { role?: string; isGoldStylist?: boolean; is_gold_stylist?: boolean };

// 旧目录中这两项已出售的服务缺少级别字段；只为已确认的门店、ID 和名称补默认值。
// 管理端显式保存 true/false 时始终以门店配置为准。
export function serviceWithStylistRequirements<T extends BookableService>(shopId: unknown, service: T): T & BookableService {
  if (String(shopId) !== 'shop1') return service;
  const gold = String(service.id) === '1790409501872' && service.name === '金牌发型师洗剪吹';
  const manager = String(service.id) === '1790409553164' && service.name === '店长/总监发型设计（含洗剪吹）';
  if (!gold && !manager) return service;
  return {
    ...service,
    ...(gold && service.requiresGoldStylist === undefined ? { requiresGoldStylist: true } : {}),
    ...(manager && service.requiresShopManager === undefined ? { requiresShopManager: true } : {}),
  };
}

export function stylistCanPerformService(service: BookableService, stylist: BookableStylist): boolean {
  if (stylist.role !== 'stylist' && stylist.role !== 'shop_manager') return false;
  if (service.requiresShopManager === true) return stylist.role === 'shop_manager';
  if (service.requiresGoldStylist === true) return stylist.role === 'shop_manager' || stylist.isGoldStylist === true || stylist.is_gold_stylist === true;
  return true;
}
