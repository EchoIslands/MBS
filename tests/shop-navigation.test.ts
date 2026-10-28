import test from 'node:test';
import assert from 'node:assert/strict';
import { UserRole } from '../shared/types.js';
import { activeShopSection, pathMatchesShopTab, visibleShopSections } from '../src/lib/shopNavigation.js';

test('CEO sidebar is reduced to seven business modules', () => {
  const sections = visibleShopSections(UserRole.CEO);
  assert.deepEqual(sections.map((section) => section.label), [
    '首页概览',
    '预约服务',
    '客户运营',
    '收银与售后',
    '商品营销',
    '经营分析',
    '店铺设置',
  ]);
  assert.equal(sections.length, 7);
});

test('grouping preserves each role permission boundary', () => {
  const customerService = visibleShopSections(UserRole.CUSTOMER_SERVICE);
  assert.deepEqual(customerService.map((section) => section.label), [
    '首页概览', '客户运营', '收银与售后', '经营分析',
  ]);
  assert.deepEqual(
    customerService.find((section) => section.label === '收银与售后')?.tabs.map((tab) => tab.label),
    ['开单结算'],
  );
  assert.deepEqual(
    customerService.find((section) => section.label === '经营分析')?.tabs.map((tab) => tab.label),
    ['客户洞察'],
  );

  const stylist = visibleShopSections(UserRole.STYLIST);
  assert.deepEqual(stylist.map((section) => section.label), [
    '首页概览', '预约服务', '客户运营', '收银与售后',
  ]);
  assert.deepEqual(
    stylist.find((section) => section.label === '客户运营')?.tabs.map((tab) => tab.label),
    ['客户管理'],
  );
});

test('existing deep links and compatibility aliases select the correct module and tab', () => {
  const sections = visibleShopSections(UserRole.CEO);
  const customerSection = activeShopSection(sections, '/shop/customer-profile/customer-1');
  assert.equal(customerSection?.label, '客户运营');
  assert.equal(pathMatchesShopTab('/shop/customers-table', customerSection!.tabs[0]), true);
  assert.equal(pathMatchesShopTab('/shop/customer-profile/customer-1', customerSection!.tabs[0]), true);

  assert.equal(activeShopSection(sections, '/shop/refunds')?.label, '收银与售后');
  assert.equal(activeShopSection(sections, '/shop/product-orders')?.label, '商品营销');
  assert.equal(activeShopSection(sections, '/shop/customer-insights')?.label, '经营分析');
});
