/** 微信描述只取已核价的原单快照，不包含顾客/员工身份或内部单号。 */
export function wechatPaymentDescription(items: unknown): string {
  if (!Array.isArray(items) || !items.length) throw new Error('原结算缺少商品或服务明细，请先核对原单');
  const names = items.map(item => {
    const name = typeof item?.name === 'string' ? item.name.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
    const quantity = Number(item?.quantity);
    if (!name || !Number.isSafeInteger(quantity) || quantity < 1) throw new Error('原结算明细不完整，请先核对原单');
    return `${name}×${quantity}`;
  });
  const full = names.join('、');
  // 按 UTF-8 字节限制更保守，避免截断汉字或代理对。
  if (Buffer.byteLength(full, 'utf8') <= 127) return full;
  let result = '';
  for (const character of full) {
    if (Buffer.byteLength(result + character + '…', 'utf8') > 127) break;
    result += character;
  }
  return result + '…';
}
