import assert from 'node:assert/strict';
import { test } from 'node:test';
import { customerLoginRedirect } from '../src/lib/customerLoginRedirect';

test('顾客登录后可返回原页面，但不能跳往外站或循环登录', () => {
  assert.equal(customerLoginRedirect('/customer/products/shop1?tab=service'), '/customer/products/shop1?tab=service');
  assert.equal(customerLoginRedirect('/customer/product-orders/shop1'), '/customer/product-orders/shop1');
  for (const value of ['//evil.example/customer/profile', 'https://evil.example', '/shop/manage', '/customer/login', '/customer/change-password', '/customer/profile\\evil']) {
    assert.equal(customerLoginRedirect(value), null, value);
  }
});
