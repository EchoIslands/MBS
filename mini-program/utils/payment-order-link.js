// 只允许本项目微信订单页的商户单号透传，不能传入任意 URL。
export function paymentOrderNumber(options = {}) {
  const value = options.outTradeNo || options.returnOrderNo;
  return typeof value === 'string' && /^[A-Za-z0-9_-]{6,32}$/.test(value) ? value : '';
}

export function paymentOrderPath(orderNo) {
  const valid = paymentOrderNumber({ outTradeNo: orderNo });
  return valid ? '/pages/payment-order/payment-order?outTradeNo=' + valid : '';
}

export function currentPaymentOrderNumber() {
  const page = getCurrentPages().slice(-1)[0];
  if (!page || !['pages/payment-order/payment-order', 'pages/login/login', 'pages/change-password/change-password'].includes(page.route)) return '';
  return paymentOrderNumber(page.options);
}
