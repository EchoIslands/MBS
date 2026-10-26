import { randomUUID } from 'crypto';
import { supabase } from '../db/index.js';
import { nativePaymentRequest, createNativePayment, closeNativePayment, queryPaymentStatus, type PaymentResult } from './paymentService.js';
import { recordWechatReceipt } from './settlementReceipt.js';
import { wechatPaymentDescription } from '../lib/wechatDescription.js';

export const recoveryDependencies = {
  rpc: (name:string,args:Record<string,unknown>) => supabase.rpc(name,args),
  query: queryPaymentStatus, close: closeNativePayment, create: createNativePayment,
  request: nativePaymentRequest, receipt: recordWechatReceipt,
  orderNo: () => randomUUID().replace(/-/g,''), now: () => Date.now(),
};

/** Lease + immutable gateway request + confirmed closure before rotating a gateway ID. */
export async function recoverWechatPayment(
  settlementId:string, shopId:string, employeeId:string, employeeName:string,
  initial=false, deps=recoveryDependencies,
):Promise<PaymentResult> {
  const token=randomUUID();
  const claim=await deps.rpc('claim_wechat_recovery',{p_settlement_id:settlementId,p_shop_id:shopId,p_token:token});
  if(claim.error || !claim.data) {
    const busy=String(claim.error?.message || '').includes('RECOVERY_BUSY');
    if(String(claim.error?.message || '').includes('LEGACY_SETTLEMENT')) throw new Error('旧版结算未经服务端核价，需门店先核对原单；尚未发起收款');
    throw new Error(busy?'其他员工正在核对本单，请稍后重试':'原支付恢复组件未就绪或原单状态不匹配，请核对038迁移和原订单');
  }
  const {settlement,payment}=claim.data;
  let attempt=claim.data.attempt;
  async function mutate(action:string,data:Record<string,unknown>={}) {
    const result=await deps.rpc('mutate_wechat_recovery',{
      p_payment_id:payment.id,p_shop_id:shopId,p_token:token,p_action:action,p_data:data,
    });
    if(result.error) throw new Error('支付恢复状态已变化，请刷新后核对原单，勿重新收款');
    return result.data;
  }
  async function paid(gateway:Awaited<ReturnType<typeof queryPaymentStatus>>) {
    if(gateway.amount!==Number(payment.amount) || !gateway.transactionId || !gateway.paidAt) throw new Error('微信支付证明与原结算不匹配，请人工核对');
    await deps.receipt({paymentId:attempt.gateway_order_no,amount:gateway.amount,transactionId:gateway.transactionId,paidAt:gateway.paidAt},shopId,employeeId,employeeName);
    return {paymentId:attempt.gateway_order_no,status:'paid' as const,amount:gateway.amount,message:'微信已收款，原结算已同步'};
  }
  try {
    // Only the create-settlement handler may use initial=true immediately after inserting its mapping.
    // All later retries query the SAME gateway ID, even when the preceding POST timed out.
    if(!initial) {
      let gateway=await deps.query(attempt.gateway_order_no);
      if(gateway.status==='paid') return await paid(gateway);
      if(gateway.tradeState!=='NOT_FOUND' && gateway.amount!==Number(payment.amount)) throw new Error(gateway.message || '微信原单金额或状态尚未核对');
      if(!['NOTPAY','CLOSED','NOT_FOUND'].includes(gateway.tradeState || '')) throw new Error(gateway.message || '微信原单状态不明确，请稍后核对');
      if(payment.status==='paid' || settlement.payment_status==='completed') throw new Error('本地已记收款但微信证明不一致，请人工核对，禁止重新收款');
      if(gateway.tradeState==='NOTPAY' && attempt.request_body && payment.code_url &&
        attempt.qr_updated_at && deps.now()>=Date.parse(attempt.qr_updated_at) && deps.now()-Date.parse(attempt.qr_updated_at)<110*60*1000) {
        return {paymentId:attempt.gateway_order_no,status:'pending',amount:Number(payment.amount),codeUrl:payment.code_url,message:'已核对原单，继续使用原二维码'};
      }
      // Legacy requests have no immutable snapshot. Closing the old ID avoids changing
      // parameters on an existing gateway order. 204/timeout alone NEVER permits rotation.
      if(gateway.tradeState==='NOTPAY' && !attempt.request_body) {
        try { await deps.close(attempt.gateway_order_no); } catch { /* Query resolves paid/closed/unknown races. */ }
        gateway=await deps.query(attempt.gateway_order_no);
        if(gateway.status==='paid') return await paid(gateway);
        if(gateway.tradeState!=='CLOSED' || gateway.amount!==Number(payment.amount)) throw new Error('微信尚未确认原单关闭，请稍后核对；未另建收款单');
      }
      if(gateway.tradeState==='CLOSED') {
        attempt=await mutate('rotate',{closed_order_no:attempt.gateway_order_no,gateway_state:'CLOSED',gateway_order_no:deps.orderNo()});
      }
    }
    const request=attempt.request_body || deps.request(attempt.gateway_order_no,Number(payment.amount),wechatPaymentDescription(settlement.items));
    if(request.out_trade_no!==attempt.gateway_order_no || request.amount?.total!==Math.round(Number(payment.amount)*100)) throw new Error('原支付请求快照与金额不一致');
    attempt=await mutate('request',request);
    const result=await deps.create(request);
    if(result.paymentId!==attempt.gateway_order_no || result.amount!==Number(payment.amount) || !result.codeUrl) throw new Error('微信二维码与原单不匹配');
    await mutate('qr',{gateway_order_no:attempt.gateway_order_no,code_url:result.codeUrl});
    return {...result,message:'请按原结算金额扫码；关闭窗口后可从原单继续恢复'};
  } finally {
    try { await mutate('release'); } catch { console.error('[wechat-recovery] 互斥释放未完成，将自动过期；未输出订单或客户资料'); }
  }
}

export async function activeWechatOrder(paymentId:string):Promise<string> {
  const {data,error}=await supabase.from('wechat_payment_attempts').select('gateway_order_no').eq('payment_id',paymentId).eq('state','active').maybeSingle();
  if(error) throw new Error('支付恢复结构未就绪，请检查038迁移');
  return data?.gateway_order_no || paymentId;
}

export async function ledgerPaymentId(orderNo:string):Promise<string> {
  const {data,error}=await supabase.from('wechat_payment_attempts').select('payment_id').eq('gateway_order_no',orderNo).maybeSingle();
  if(error) throw new Error('支付恢复结构未就绪，请检查038迁移');
  return data?.payment_id || orderNo;
}
