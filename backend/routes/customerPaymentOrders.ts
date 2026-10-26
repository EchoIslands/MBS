import { Router } from 'express';
import { supabase } from '../db/index.js';
import { customerSession } from '../middleware/resourceAccess.js';
import type { CustomerWechatPaymentOrder } from '../../shared/types.js';

const router = Router();

// 微信订单中心传入的是 out_trade_no，不能当成商品ID、结算ID或顾客身份。
router.get('/:outTradeNo', customerSession, async (req, res) => {
  const outTradeNo = req.params.outTradeNo;
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(outTradeNo)) {
    res.status(400).json({ success: false, error: '微信商户支付单号无效' }); return;
  }
  try {
    const { data: attempt, error: attemptError } = await supabase.from('wechat_payment_attempts')
      .select('payment_id,state').eq('gateway_order_no', outTradeNo).maybeSingle();
    if (attemptError) throw new Error('attempt');
    const { data: payment, error: paymentError } = await supabase.from('payments')
      .select('id,settlement_id,amount,status,channel,transaction_id,paid_at,paid_at_source,created_at')
      .eq('id', attempt?.payment_id || outTradeNo).eq('customer_id', req.customer!.id)
      .eq('shop_id', req.customer!.shopId).eq('channel', 'wechat_native').maybeSingle();
    if (paymentError) throw new Error('payment');
    if (!payment?.settlement_id) { res.status(404).json({ success: false, error: '订单不存在或不属于当前账号' }); return; }
    const { data: settlement, error: settlementError } = await supabase.from('settlements')
      .select('id,shop_id,items,total,payment_method,payment_status,created_at')
      .eq('id', payment.settlement_id).eq('customer_id', req.customer!.id).eq('shop_id', req.customer!.shopId).maybeSingle();
    if (settlementError) throw new Error('settlement');
    if (!settlement || settlement.payment_method !== 'wechat') {
      res.status(404).json({ success: false, error: '订单不存在或不属于当前账号' }); return;
    }
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount !== Number(settlement.total)) throw new Error('amount');
    let items = settlement.items;
    if (!Array.isArray(items) || !items.length) {
      const legacy = await supabase.from('settlement_items').select('id,name,quantity,total')
        .eq('settlement_id', settlement.id).order('id').limit(501);
      if (legacy.error || (legacy.data || []).length > 500) throw new Error('items');
      items = legacy.data || [];
    }
    const closed = attempt?.state === 'closed';
    const verified = !closed && settlement.payment_status === 'completed' && payment.status === 'paid' &&
      payment.paid_at_source === 'wechat_success_time' && /^\d{1,64}$/.test(payment.transaction_id || '') &&
      typeof payment.paid_at === 'string' && Number.isFinite(Date.parse(payment.paid_at));
    const data: CustomerWechatPaymentOrder = {
      settlementId: settlement.id, shopId: settlement.shop_id, outTradeNo, amount,
      status: closed ? 'closed' : verified ? 'paid' : payment.status === 'paid' ? 'review' : 'pending',
      createdAt: settlement.created_at, paymentCreatedAt: payment.created_at,
      paidAt: verified ? payment.paid_at : null, transactionId: verified ? payment.transaction_id : null,
      items: items.map((item: Record<string, unknown>) => ({
        name: typeof item.name === 'string' ? item.name : '明细未记录',
        quantity: Number(item.quantity) || 0, total: Number(item.total) || 0,
      })),
    };
    res.json({ success: true, data });
  } catch {
    console.error('[customer-payment-order] 订单读取未完成；未输出单号或顾客资料');
    res.status(503).json({ success: false, error: '订单信息暂不可用，请稍后重试或联系门店' });
  }
});

export default router;
