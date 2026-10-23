import type {SetupConnection} from '../setup-db.js';
import {checkPaymentSchema} from './payment-schema.js';
export async function checkPaymentRecoverySchema(connection:SetupConnection) {
  await checkPaymentSchema(connection);
  const result=await connection.query("SELECT to_regprocedure('public.finalize_verified_wechat_payment(text,text,text,timestamptz,numeric,text,text)') AS receipt");
  if(!result.rows[0]?.receipt) throw new Error('缺少037微信凭据迁移，未安装038');
  const fields=await connection.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='wechat_payment_attempts'");
  if(fields.rows.length) for(const [name,type] of Object.entries({
    gateway_order_no:'text',payment_id:'text',state:'text',request_body:'jsonb',qr_updated_at:'timestamp with time zone',
    closed_at:'timestamp with time zone',recovery_token:'text',recovery_started_at:'timestamp with time zone',created_at:'timestamp with time zone',
  })) if(!fields.rows.some(row=>row.column_name===name && row.data_type===type)) throw new Error('038支付恢复表结构不兼容，停止安装');
}
