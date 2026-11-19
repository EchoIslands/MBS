import assert from 'node:assert/strict';
import { test } from 'node:test';
import { customerLoginRedirect, customerPasswordChangePath } from '../src/lib/customerLoginRedirect';

test('顾客登录后可返回原页面，但不能跳往外站或循环登录', () => {
  assert.equal(customerLoginRedirect('/customer/products/shop1?tab=service'), '/customer/products/shop1?tab=service');
  assert.equal(customerLoginRedirect('/customer/product-orders/shop1'), '/customer/product-orders/shop1');
  assert.equal(customerLoginRedirect('/invite?ref=ref_test'), '/invite?ref=ref_test');
  assert.equal(customerPasswordChangePath('/customer/payment-order?outTradeNo=order_TEST'), '/customer/change-password?redirect=%2Fcustomer%2Fpayment-order%3FoutTradeNo%3Dorder_TEST');
  for (const value of ['//evil.example/customer/profile', 'https://evil.example', '/shop/manage', '/customer/login', '/customer/LOGIN/', '/customer/%6cogin', '/customer/change-password', '/customer/../shop/manage', '/customer/profile\\evil', '/invite?ref=ref_test&next=/shop']) {
    assert.equal(customerLoginRedirect(value), null, value);
  }
});
