import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serviceWithStylistRequirements, stylistCanPerformService } from '../shared/lib/serviceEligibility.js';

const ordinary = { id: '1790409482516', name: '设计师洗剪吹' };
const gold = { id: '1790409501872', name: '金牌发型师洗剪吹' };
const manager = { id: '1790409553164', name: '店长/总监发型设计（含洗剪吹）' };
const stylist = { role: 'stylist', isGoldStylist: false };
const goldStylist = { role: 'stylist', isGoldStylist: true };
const shopManager = { role: 'shop_manager', isGoldStylist: false };

test('既有门店的三种服务按级别匹配，店长能服务金牌项目', () => {
  const standardService = serviceWithStylistRequirements('shop1', ordinary);
  const goldService = serviceWithStylistRequirements('shop1', gold);
  const managerService = serviceWithStylistRequirements('shop1', manager);
  assert.equal(stylistCanPerformService(standardService, stylist), true);
  assert.equal(stylistCanPerformService(goldService, stylist), false);
  assert.equal(stylistCanPerformService(goldService, goldStylist), true);
  assert.equal(stylistCanPerformService(goldService, shopManager), true);
  assert.equal(stylistCanPerformService(managerService, goldStylist), false);
  assert.equal(stylistCanPerformService(managerService, shopManager), true);
  assert.equal(stylistCanPerformService(managerService, { role: 'ceo' }), false);
});

test('显式管理配置优先；相同名称的其他门店或新服务不被误判', () => {
  assert.equal(serviceWithStylistRequirements('shop1', { ...gold, requiresGoldStylist: false }).requiresGoldStylist, false);
  assert.equal(serviceWithStylistRequirements('shop2', gold).requiresGoldStylist, undefined);
  assert.equal(serviceWithStylistRequirements('shop1', { ...gold, id: 'new' }).requiresGoldStylist, undefined);
});
