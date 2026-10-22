import type { Response } from 'express';

export function operationError(res: Response, error: { code?: string; message?: string }, fallback: string) {
  if (['PGRST202','42883','42501'].includes(error.code || '')) {
    return res.status(503).json({ success: false, code: 'OPERATION_MIGRATION_REQUIRED', error: '操作组件暂不可用，请联系管理员核对033–036数据库升级' });
  }
  const messages: Record<string,string> = {
    BATCH_NOT_FOUND:'团购批次不存在或不属于本店', INVALID_VOUCHER_CODES:'券码为空或格式不正确',
    COUPON_UNAVAILABLE:'优惠券不可用', COUPON_EXPIRED:'优惠券不在有效期内', COUPON_EXHAUSTED:'优惠券已领完',
    COUPON_LIMIT_REACHED:'您已达到领取上限', REFERRAL_UNAVAILABLE:'邀请已被领取或不可用',
    ORDER_NOT_FOUND:'订单不存在或无权访问', ORDER_NOT_REFUNDABLE:'当前订单不可申请退款', ORDER_NOT_SHIPPED:'订单尚未发货或状态已变化',
    INVALID_REFUND_REASON:'请填写退款原因（最多2000字）',
    ENROLLMENT_NOT_FOUND:'没有可撤销的有效入会记录，请刷新核对',
    PACKAGE_SERVICE_NOT_FOUND:'次卡服务不属于本店，请重新选择', INVALID_PACKAGE:'次卡次数、金额或有效期不正确',
    MEMBERSHIP_CONFLICT:'客户余额或会员状态已变化，请刷新核对后重新办理', CUSTOMER_NOT_FOUND:'客户不存在或无权访问',
    ORDER_NOT_SHIPPABLE:'订单未付款或当前状态不可发货', INVALID_SHIPPING:'物流信息不正确',
    PRODUCT_NOT_FOUND:'商品不存在或不属于本店', INVALID_INVENTORY_ADJUSTMENT:'库存和调整原因不正确',
  };
  const message = Object.entries(messages).find(([code]) => error.message?.includes(code))?.[1];
  return res.status(message ? 409 : 503).json({ success: false, error: message || fallback });
}
